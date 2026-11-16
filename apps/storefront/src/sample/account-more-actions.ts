"use server";

import { cookies } from "next/headers";
import {
  type DisputeAction,
  disputeAfter,
  disputeOpen,
  downloadsLeft,
  SAMPLE_DOWNLOADS,
  SAMPLE_WARRANTIES,
  warrantyActive,
} from "./account-more";
import {
  ACCOUNT_MORE_COOKIE,
  type AccountMoreState,
  EVIDENCE_LIMITS,
  parseAccountMore,
  serializeAccountMore,
} from "./account-more-state";
import { readBuyer } from "./buyer-server";
import type { FieldError } from "./checkout";

// Server Action của bốn mục tài khoản mới (mẫu, W-030): chỉ người mua mẫu đang "đăng nhập" trên trình
// duyệt này, chỉ ghi cookie `sf_acct_more`. Không có file nào được tải, ảnh nào được nhận: tranh chấp
// chỉ giữ tên ảnh người mua chọn (trình duyệt không gửi nội dung file). Endpoint thay thế ở
// `account-more.ts`.

const COOKIE = { path: "/", sameSite: "lax", httpOnly: true, maxAge: 30 * 86_400 } as const;

export async function readAccountMore(): Promise<AccountMoreState> {
  return parseAccountMore((await cookies()).get(ACCOUNT_MORE_COOKIE)?.value);
}

async function save(state: AccountMoreState): Promise<void> {
  (await cookies()).set(ACCOUNT_MORE_COOKIE, serializeAccountMore(state), COOKIE);
}

/** Chỉ tài khoản mẫu có hàng số, bảo hành, tranh chấp; tài khoản mới tạo thì không làm gì. */
async function sampleBuyer(): Promise<boolean> {
  return (await readBuyer())?.kind === "sample";
}

/** "Tải xuống": trừ một lượt (link riêng sống 5 phút ở core thật). Hết lượt thì không làm gì. */
export async function downloadFile(form: FormData): Promise<void> {
  const id = String(form.get("file") ?? "");
  if (!(await sampleBuyer()) || !SAMPLE_DOWNLOADS.some((f) => f.id === id)) return;
  const state = await readAccountMore();
  if (downloadsLeft(id, state.used) === 0) return;
  state.used[id] = (state.used[id] ?? 0) + 1;
  await save(state);
}

/** "Gửi lại email": link mới, link cũ hết hiệu lực, số lượt giữ nguyên. Hết lượt thì không gửi. */
export async function resendDownload(form: FormData): Promise<void> {
  const id = String(form.get("file") ?? "");
  if (!(await sampleBuyer()) || !SAMPLE_DOWNLOADS.some((f) => f.id === id)) return;
  const state = await readAccountMore();
  if (downloadsLeft(id, state.used) === 0) return;
  state.resent = [id, ...state.resent.filter((x) => x !== id)];
  await save(state);
}

export interface FormResult {
  status: "idle" | "ok" | "error";
  errors: FieldError[];
}

/** Yêu cầu bảo hành cho món còn hạn: mô tả lỗi (từ 10 ký tự). */
export async function claimWarranty(_: FormResult, form: FormData): Promise<FormResult> {
  const sku = String(form.get("sku") ?? "");
  const item = SAMPLE_WARRANTIES.find((w) => w.sku === sku);
  const today = new Date().toISOString().slice(0, 10);
  if (!(await sampleBuyer()) || !item || !warrantyActive(item, today)) {
    return { status: "error", errors: [{ field: "sku", code: "warranty_not_found" }] };
  }
  const note = String(form.get("note") ?? "").trim();
  if (note.length < 10) {
    return {
      status: "error",
      errors: [{ field: "note", code: "warranty_note_short", params: { min: 10 } }],
    };
  }
  const state = await readAccountMore();
  state.claims[sku] = new Date().toISOString();
  await save(state);
  return { status: "ok", errors: [] };
}

/** Đồng ý đề nghị của người bán, nhờ sàn phân xử, rút tranh chấp. */
export async function disputeStep(form: FormData): Promise<void> {
  if (!(await sampleBuyer())) return;
  const state = await readAccountMore();
  const next = disputeAfter(state.dispute.status, String(form.get("step") ?? "") as DisputeAction);
  if (!next) return;
  state.dispute = { ...state.dispute, ...next };
  await save(state);
}

/** Gửi thêm bằng chứng khi tranh chấp còn mở: lời và / hoặc ảnh (chỉ tên file); gom mọi lỗi một lần. */
export async function addEvidence(_: FormResult, form: FormData): Promise<FormResult> {
  if (!(await sampleBuyer())) return { status: "error", errors: [] };
  const state = await readAccountMore();
  const errors: FieldError[] = [];
  if (!disputeOpen(state.dispute.status)) errors.push({ field: "body", code: "dispute_closed" });
  const body = String(form.get("body") ?? "").trim();
  const photos = form
    .getAll("photo")
    .map((p) => String(p).slice(0, EVIDENCE_LIMITS.photoName))
    .filter(Boolean);
  if (!body && photos.length === 0) errors.push({ field: "body", code: "evidence_required" });
  if (body.length > EVIDENCE_LIMITS.body)
    errors.push({
      field: "body",
      code: "evidence_too_long",
      params: { max: EVIDENCE_LIMITS.body },
    });
  if (photos.length > EVIDENCE_LIMITS.photos)
    errors.push({
      field: "photo",
      code: "evidence_too_many_photos",
      params: { max: EVIDENCE_LIMITS.photos },
    });
  if (errors.length > 0) return { status: "error", errors };
  state.dispute.added = [
    ...state.dispute.added,
    { at: new Date().toISOString(), body, photos },
  ].slice(-EVIDENCE_LIMITS.messages);
  await save(state);
  return { status: "ok", errors: [] };
}

/** Đăng xuất mọi thiết bị khác (giữ trình duyệt này). */
export async function signOutOthers(): Promise<void> {
  if (!(await readBuyer())) return;
  const state = await readAccountMore();
  state.signedOutOthers = true;
  await save(state);
}
