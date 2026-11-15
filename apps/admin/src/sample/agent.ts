// Dữ liệu mẫu của màn "API key và AI agent" cho phần core chưa có API (bước 51, P12 "Agent là người
// dùng, lệnh cần duyệt"): yêu cầu duyệt lệnh rủi ro do agent gọi, nhật ký gọi tool MCP. Hình dạng
// theo `docs/steps/51-ui-contracts.md` của core; nội dung lấy từ bản thiết kế (Bếp Mộc).
//
// Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { SampleOutcome } from "./settings";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function at(offset: number): string {
  return new Date(Date.now() + offset).toISOString();
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/**
 * Một yêu cầu duyệt (`GET /api/v1/kernel/approvals`): agent gọi lệnh rủi ro thì nhận `202
 * approval_required`; người có cùng permission duyệt thì lệnh chạy với `Idempotency-Key` gốc.
 */
export interface ApprovalRequest {
  id: string;
  /** Câu tóm tắt do module viết. */
  summary: string;
  /** Lý do agent đưa ra và các chi tiết phụ. */
  context: string;
  /** Tool MCP (hay lệnh REST) đã gọi và tham số của nó. */
  tool: string;
  arguments: Record<string, unknown>;
  /** Permission người duyệt phải có (giống permission của lệnh). */
  permission: string;
  agent: { api_key_id: string; name: string };
  /** Hệ quả nếu duyệt, do module viết, để hộp xác nhận nêu rõ. */
  consequence: string;
  /** `high`: không đảo được (xoá dữ liệu), hộp xác nhận dùng nút đỏ. */
  risk: "normal" | "high";
  status: ApprovalStatus;
  expires_at: string;
  created_at: string;
  decided_by: { id: string; name: string } | null;
  decided_at: string | null;
}

export type ToolCallResult = "ok" | "approval_required" | "forbidden" | "error";

/** Một lần agent gọi tool MCP (nhật ký của bàn kỹ thuật, bước 51/52). */
export interface ToolCall {
  id: string;
  at: string;
  tool: string;
  api_key: { id: string; name: string };
  /** Tham số tóm tắt, không có dữ liệu cá nhân. */
  summary: string;
  result: ToolCallResult;
  /** `code` lỗi khi không `ok`. */
  code: string | null;
  duration_ms: number;
}

interface Store {
  approvals: ApprovalRequest[];
  calls: ToolCall[];
}

const id = (n: string) => `01a1e000-0000-7000-8000-0000000a${n}`;
const CSKH = { api_key_id: id("k002"), name: "cskh-bot" };
const FINANCE = { api_key_id: id("k003"), name: "tro-ly-tai-chinh" };

function seed(): Store {
  return {
    approvals: [
      {
        id: id("0001"),
        summary: "Hoàn 690.000 ₫ cho BM-2611-0409",
        context: "Lý do: chảo nứt khi nhận, 2 ảnh",
        tool: "orders.refund",
        arguments: { order: "BM-2611-0409", amount_minor: 690000, currency: "VND" },
        permission: "orders.refund",
        agent: CSKH,
        consequence:
          "Hoàn 690.000 ₫ cho đơn BM-2611-0409 qua cổng thanh toán, về đúng phương thức người mua đã trả. Hệ thống ghi bút toán đảo và lập hoá đơn điều chỉnh.",
        risk: "normal",
        status: "pending",
        expires_at: at(23 * HOUR),
        created_at: at(-HOUR),
        decided_by: null,
        decided_at: null,
      },
      {
        id: id("0002"),
        summary: "Chi trả 22.755.000 ₫ cho Gia Dụng Nhà Na",
        context: "Đợt chi 18/11",
        tool: "marketplace.approve_payout",
        arguments: { seller: "gia-dung-nha-na", batch: "2026-11-18" },
        permission: "marketplace.finance.manage",
        agent: FINANCE,
        consequence:
          "Gửi lệnh chi 22.755.000 ₫ cho Gia Dụng Nhà Na (đợt 18/11) tới đối tác thu hộ có giấy phép; đối tác chuyển tiền, Bếp Mộc không giữ tiền.",
        risk: "normal",
        status: "pending",
        expires_at: at(20 * HOUR),
        created_at: at(-4 * HOUR),
        decided_by: null,
        decided_at: null,
      },
      {
        id: id("0003"),
        summary: "Xoá dữ liệu cá nhân theo yêu cầu gửi qua email",
        context: "Yêu cầu nhận 11/11 qua email, chưa có tài khoản",
        tool: "compliance.fulfil_subject_request",
        arguments: { request: "DSR-2611-0007", kind: "erase" },
        permission: "compliance.privacy.manage",
        agent: CSKH,
        consequence:
          "Xoá dữ liệu cá nhân của người gửi yêu cầu DSR-2611-0007. Dữ liệu luật buộc phải giữ (hoá đơn, sổ kế toán) được giữ lại và che danh tính. Hãy chắc người gửi đúng là chủ dữ liệu.",
        risk: "high",
        status: "pending",
        expires_at: at(3 * HOUR),
        created_at: at(-21 * HOUR),
        decided_by: null,
        decided_at: null,
      },
    ],
    calls: [
      call(
        "05",
        -9 * MINUTE,
        "orders.refund",
        CSKH,
        "order BM-2611-0409, 690.000 ₫",
        "approval_required",
        41,
      ),
      call("04", -10 * MINUTE, "orders.get", CSKH, "BM-2611-0409", "ok", 18),
      call("03", -11 * MINUTE, "kernel.work", CSKH, "org: CN Cầu Giấy", "ok", 88),
      call(
        "02",
        -19 * MINUTE,
        "content.publish",
        { api_key_id: id("k005"), name: "tro-ly-noi-dung" },
        "entry 0193…",
        "forbidden",
        9,
      ),
      call("01", -24 * MINUTE, "catalog.search", CSKH, 'q: "chao gang"', "ok", 32),
    ],
  };
}

function call(
  n: string,
  offset: number,
  tool: string,
  key: { api_key_id: string; name: string },
  summary: string,
  result: ToolCallResult,
  ms: number,
): ToolCall {
  return {
    id: id(`c0${n}`),
    at: at(offset),
    tool,
    api_key: { id: key.api_key_id, name: key.name },
    summary,
    result,
    code:
      result === "approval_required"
        ? "approval_required"
        : result === "forbidden"
          ? "permission_denied"
          : null,
    duration_ms: ms,
  };
}

const KEY = Symbol.for("autoxide.sample.agent");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleAgent(): void {
  (globalThis as Holder)[KEY] = seed();
}

/** Trạng thái lúc đọc: yêu cầu còn chờ mà quá hạn thì là `expired` (lệnh không chạy). */
export function approvalStatus(request: ApprovalRequest, now = Date.now()): ApprovalStatus {
  if (request.status === "pending" && Date.parse(request.expires_at) <= now) return "expired";
  return request.status;
}

/**
 * Thay bằng GET /api/v1/kernel/approvals?status= (bước 51) khi core có. Core chỉ trả yêu cầu người
 * gọi duyệt được (có permission của lệnh); bản mẫu lọc theo `canApprove`. Hạn gần nhất trước.
 */
export async function listApprovals(
  query: { status?: ApprovalStatus } = {},
  canApprove: (permission: string) => boolean = () => true,
): Promise<{ data: ApprovalRequest[] }> {
  const list = store()
    .approvals.map((r) => ({ ...r, status: approvalStatus(r) }))
    .filter((r) => canApprove(r.permission) && (!query.status || r.status === query.status))
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at));
  return { data: structuredClone(list) };
}

function decide(
  requestId: string,
  status: "approved" | "rejected",
  by: { id: string; name: string },
): SampleOutcome<ApprovalRequest> {
  const found = store().approvals.find((r) => r.id === requestId);
  if (!found) {
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        code: "kernel.approval_not_found",
        detail: "This approval request does not exist.",
      },
    };
  }
  if (approvalStatus(found) !== "pending") {
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        code: "kernel.approval_not_pending",
        detail: "This request was already decided or has expired.",
      },
    };
  }
  found.status = status;
  found.decided_by = by;
  found.decided_at = new Date().toISOString();
  return { ok: true, data: { ...found } };
}

/** Thay bằng POST /api/v1/kernel/approvals/{id}/approve (bước 51) khi core có. */
export async function approveRequest(
  requestId: string,
  by: { id: string; name: string },
): Promise<SampleOutcome<ApprovalRequest>> {
  return decide(requestId, "approved", by);
}

/** Thay bằng POST /api/v1/kernel/approvals/{id}/reject (bước 51) khi core có. */
export async function rejectRequest(
  requestId: string,
  by: { id: string; name: string },
): Promise<SampleOutcome<ApprovalRequest>> {
  return decide(requestId, "rejected", by);
}

/** Thay bằng GET /api/v1/kernel/tool-calls (bước 51/52, nhật ký gọi tool MCP) khi core có. */
export async function listToolCalls(): Promise<{ data: ToolCall[] }> {
  return { data: structuredClone(store().calls) };
}
