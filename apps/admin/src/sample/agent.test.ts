import { afterEach, describe, expect, it } from "vitest";
import {
  approvalStatus,
  approveRequest,
  listApprovals,
  listToolCalls,
  rejectRequest,
  resetSampleAgent,
} from "./agent";

afterEach(resetSampleAgent);

const ME = { id: "u1", name: "Người duyệt" };

describe("yêu cầu duyệt mẫu", () => {
  it("chỉ hiện yêu cầu người xem duyệt được; hạn gần nhất trước", async () => {
    const all = await listApprovals({ status: "pending" });
    expect(all.data).toHaveLength(3);
    expect(all.data[0]?.permission).toBe("compliance.privacy.manage");
    const some = await listApprovals({ status: "pending" }, (p) => p === "orders.refund");
    expect(some.data.map((r) => r.tool)).toEqual(["orders.refund"]);
  });

  it("duyệt hay từ chối một lần; quyết lại thì 409", async () => {
    const [first, second] = (await listApprovals()).data;
    const ok = await approveRequest(first?.id ?? "", ME);
    expect(ok.ok && ok.data.status).toBe("approved");
    const again = await rejectRequest(first?.id ?? "", ME);
    expect(!again.ok && again.problem.code).toBe("kernel.approval_not_pending");
    const no = await rejectRequest(second?.id ?? "", ME);
    expect(no.ok && no.data.decided_by?.name).toBe("Người duyệt");
    expect((await listApprovals({ status: "pending" })).data).toHaveLength(1);
    const missing = await approveRequest("nope", ME);
    expect(!missing.ok && missing.problem.status).toBe(404);
  });

  it("yêu cầu chờ quá hạn là hết hạn", async () => {
    const [request] = (await listApprovals()).data;
    if (!request) throw new Error("no request");
    expect(approvalStatus({ ...request, expires_at: "2000-01-01T00:00:00Z" })).toBe("expired");
  });

  it("nhật ký gọi tool có mã lỗi khi không thành", async () => {
    const { data } = await listToolCalls();
    expect(data.find((c) => c.result === "forbidden")?.code).toBe("permission_denied");
  });
});
