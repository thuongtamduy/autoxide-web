import { describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";

// Thao tác hàng loạt trên dữ liệu mẫu (W-006, W-058): hàm mẫu chỉ có lệnh từng cái, Server Action lặp
// từng id; dòng không làm được mang câu đã dịch của mã lỗi mẫu (`sample.codes.*`).
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/viewer", () => ({ getMe: async () => ({ id: "u", name: "Lan", email: "" }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => {
    let base: unknown = en;
    for (const part of namespace.split(".")) base = (base as Record<string, unknown>)[part];
    const find = (key: string) => {
      let at: unknown = base;
      for (const part of key.split(".")) at = (at as Record<string, unknown> | undefined)?.[part];
      return typeof at === "string" ? at : undefined;
    };
    const t = (key: string) => find(key) ?? key;
    t.has = (key: string) => find(key) !== undefined;
    return t;
  },
}));

const { bulkRetryJobsAction } = await import("@/app/(admin)/settings/sample-actions");
const { bulkVerifyRequestsAction } = await import("@/app/(admin)/compliance/actions");
const { listJobs } = await import("@/sample/settings");
const { listSubjectRequests } = await import("@/sample/compliance-records");

describe("hàng loạt trên dữ liệu mẫu", () => {
  it("chạy lại job: job trong dead-letter queue chạy lại, job khác báo lỗi đã dịch", async () => {
    const { data } = await listJobs({ limit: 200 });
    const dead = data.find((j) => j.status === "dead");
    const running = data.find((j) => j.status === "running");
    if (!dead || !running) throw new Error("bộ mẫu thiếu job");
    const result = await bulkRetryJobsAction({ ids: [dead.id, running.id] });
    expect(result.total).toBe(2);
    expect(result.done).toBe(1);
    expect(result.errors).toEqual([
      {
        id: running.id,
        name: running.id,
        detail: "Only a job in the dead-letter queue can be retried.",
      },
    ]);
    const after = await listJobs({ limit: 200 });
    expect(after.data.find((j) => j.id === dead.id)?.status).toBe("running");
  });

  it("yêu cầu chủ thể: chỉ yêu cầu ở đúng bước mới chuyển, còn lại gom lỗi", async () => {
    const { data } = await listSubjectRequests();
    const fresh = data.find((r) => r.status === "new" || r.status === "verifying");
    const closed = data.find((r) => r.status === "done" || r.status === "rejected");
    if (!fresh || !closed) throw new Error("bộ mẫu thiếu yêu cầu");
    const result = await bulkVerifyRequestsAction({ ids: [fresh.id, closed.id] });
    expect(result.done).toBe(1);
    expect(result.errors.map((e) => e.id)).toEqual([closed.id]);
    expect(result.errors[0]?.detail).not.toBe("");
    const after = await listSubjectRequests();
    expect(after.data.find((r) => r.id === fresh.id)?.status).toBe("in_progress");
  });
});
