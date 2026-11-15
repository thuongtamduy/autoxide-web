import { beforeEach, describe, expect, it, vi } from "vitest";

// Sổ nguồn là file server-only và gọi core qua `coreClient`: thay hai thứ đó bằng core giả nhỏ.
vi.mock("server-only", () => ({}));
const core = vi.hoisted(() => ({
  comments: [] as { author_name: string | null; created_at: string }[],
  forms: [] as { id: string; key: string; name: string }[],
  submissions: {} as Record<string, { created_at: string }[]>,
  entries: [] as { id: string; title: string; review_requested_at: string | null }[],
  fail: false,
}));
vi.mock("@/lib/core", () => ({
  coreClient: async () => ({
    GET: async (path: string, init: { params: { path?: { id: string } } }) => {
      const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) });
      if (core.fail) {
        return {
          error: { status: 503, code: "unavailable", detail: "down", title: "x", type: "x" },
          response: new Response(null, { status: 503 }),
        };
      }
      const page = (data: unknown[]) => ok({ data, pagination: { limit: 200, next_cursor: null } });
      if (path === "/api/v1/comments") return page(core.comments);
      if (path === "/api/v1/forms") return page(core.forms);
      if (path === "/api/v1/forms/{id}/submissions")
        return page(core.submissions[init.params.path?.id ?? ""] ?? []);
      if (path === "/api/v1/content/entries") return page(core.entries);
      throw new Error(`unexpected ${path}`);
    },
  }),
}));

const { NAV } = await import("@/nav/nav");
const { collectCounts, collectWork } = await import("./registry");
const { WORK_SOURCES } = await import("./sources");
const { resetSampleOrders } = await import("@/sample/orders");
const { openIncident } = await import("@/sample/compliance");

const NOW = Date.now();
const all = (extra = {}) => ({
  can: () => true,
  modules: ["comments", "forms", "content"],
  sample: true,
  now: NOW,
  ...extra,
});

beforeEach(() => {
  core.comments = [];
  core.forms = [];
  core.submissions = {};
  core.entries = [];
  core.fail = false;
  resetSampleOrders();
});

describe("nguồn việc của các phân hệ", () => {
  it("mọi số đếm khai ở menu đều trỏ tới một nguồn có trong sổ", () => {
    const ids = new Set(WORK_SOURCES.map((s) => s.id));
    const declared = NAV.flatMap((g) => g.pages).flatMap((p) =>
      Array.isArray(p.counter) ? p.counter : [],
    );
    expect(declared.length).toBeGreaterThan(10);
    for (const id of declared) expect(ids.has(id)).toBe(true);
  });

  it("dữ liệu mẫu có việc ở các phân hệ thương mại, tài chính, tuân thủ, agent", async () => {
    const box = await collectWork(WORK_SOURCES, all());
    expect(box.incomplete).toEqual([]);
    const sources = new Set(box.data.map((i) => i.source));
    for (const id of [
      "orders.unconfirmed",
      "inventory.below_minimum",
      "compliance.kyc_pending",
      "compliance.website_dossier",
      "shipping.cod_mismatch",
      "kernel.approvals",
      "tax.rate_expiring",
    ]) {
      expect(sources.has(id), id).toBe(true);
    }
    // Khoá ổn định `<nguồn>:<id>`; việc chặn bán (website chưa nộp hồ sơ) đứng đầu hộp.
    for (const i of box.data) expect(i.key.startsWith(`${i.source}:`)).toBe(true);
    expect(box.data[0]?.severity).toBe("blocking");
  });

  it("đọc API thật cho bình luận, biểu mẫu, bài chờ duyệt", async () => {
    core.comments = [
      { author_name: "Thu Hà", created_at: "2026-11-14T01:00:00Z" },
      { author_name: null, created_at: "2026-11-14T02:00:00Z" },
    ];
    core.forms = [
      { id: "f1", key: "contact", name: "Liên hệ" },
      { id: "f2", key: "empty", name: "Trống" },
    ];
    core.submissions = { f1: [{ created_at: "2026-11-13T00:00:00Z" }] };
    core.entries = [
      { id: "e1", title: "Bản nháp", review_requested_at: null },
      { id: "e2", title: "Chọn chảo gang", review_requested_at: "2026-11-14T00:00:00Z" },
    ];
    const counts = await collectCounts(WORK_SOURCES, all({ sample: false }));
    expect(counts.data).toEqual({
      "comments.pending": 2,
      "forms.new_submissions": 1,
      "content.review": 1,
    });
    const box = await collectWork(WORK_SOURCES, all({ sample: false }));
    const review = box.data.find((i) => i.source === "content.review");
    // Một bài thì mở thẳng bài đó.
    expect(review?.target.href).toBe("/content/e2");
    expect(box.data.find((i) => i.source === "forms.new_submissions")?.target.href).toBe(
      "/marketing/forms/f1?status=new",
    );
  });

  it("core lỗi thì nguồn thật bị bỏ qua, nguồn mẫu vẫn có", async () => {
    core.fail = true;
    const box = await collectWork(WORK_SOURCES, all());
    expect(box.incomplete.sort()).toEqual([
      "comments.pending",
      "content.review",
      "forms.new_submissions",
    ]);
    expect(box.data.length).toBeGreaterThan(0);
  });

  it("chỉ thấy việc theo permission: không có quyền thì hộp trống", async () => {
    const none = { ...all(), can: () => false };
    const box = await collectWork(WORK_SOURCES, none);
    // Lệnh chờ duyệt tự lọc theo permission của từng lệnh: không có quyền nào thì cũng không có.
    expect(box.data).toEqual([]);
  });

  it("việc tính từ dữ liệu: ghi nhận một sự cố thì có việc báo cơ quan, hạn 72 giờ", async () => {
    const opened = await openIncident({
      description: "Lộ danh sách email khách hàng do cấu hình sai",
      severity: "high",
      data_categories: ["contact"],
      affected_count: "120",
    });
    expect(opened.ok).toBe(true);
    const box = await collectWork(WORK_SOURCES, all());
    const incident = box.data.find((i) => i.source === "compliance.incident_deadline");
    expect(incident?.severity).toBe("blocking");
    const due = Date.parse(incident?.due_at ?? "");
    expect(Math.round((due - Date.now()) / 3_600_000)).toBe(72);
  });
});
