"use server";

// Server Action của màn "Kênh bán": gọi hàm mẫu của `src/sample/channels.ts` (module `channels` của core
// chưa có, bước 48; W-006, W-019). Lỗi dịch theo `channels.codes.*` / `channels.fields.*`. Khoá kết nối
// của kênh không bao giờ được điền lại vào form hay ghi ra đâu.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { CHANNELS_FINANCE_MANAGE, CHANNELS_MANAGE, CHANNELS_ORDERS_MANAGE } from "@/lib/channels";
import { commerceGuard, finishCommerce, translateCommerce, typed } from "@/lib/commerce-action";
import type { ChangeState } from "@/lib/engage";
import { type FormState, problemState } from "@/lib/form";
import { type BulkInput, type BulkResult, bulkBlocked, cleanIds, eachId } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  changeListing,
  connectAccount,
  disconnectAccount,
  linkListing,
  listAccounts,
  listInbound,
  listSettlements,
  mapInbound,
  postSettlement,
  reconnectAccount,
  resolveInbound,
  resolveSettlementLine,
  retryInbound,
  type SampleOutcome,
  saveAllocation,
  setAccountRunning,
  settlementLines,
  syncAll,
} from "@/sample/channels";

async function guard(permission: string | readonly string[]): Promise<FormState | null> {
  const off = await commerceGuard();
  if (off) return off;
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  const name = typeof permission === "string" ? permission : permission.join(", ");
  return { error: t("forbidden", { permission: name }), code: "forbidden" };
}

const idOf = (formData: FormData) => String(formData.get("id") ?? "");

// ---- Tài khoản kênh

const CONNECT_FIELDS = ["kind", "name", "org_id", "token"] as const;

export async function connectAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, CONNECT_FIELDS);
  const outcome = await connectAccount({
    kind: values.kind ?? "",
    name: values.name ?? "",
    org_id: values.org_id ?? "",
    token: values.token ?? "",
  });
  // Không điền lại khoá kết nối (secret).
  return finishCommerce("channels", state, outcome, CONNECT_FIELDS, { ...values, token: "" });
}

export async function syncAction(state: FormState): Promise<FormState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("channels", state, await syncAll(), []);
}

/** Tạm dừng / chạy lại (đảo được: `status` = `paused` hoặc `active`). */
export async function runningAction(_state: ChangeState, formData: FormData): Promise<ChangeState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  const running = formData.get("status") === "active";
  const outcome = await setAccountRunning(idOf(formData), running);
  if (!outcome.ok) return problemState(await translateCommerce(outcome.problem, "channels"), []);
  refresh();
  return { done: 1, previous: running ? "paused" : "active", updated: outcome.data.updated_at };
}

export async function reconnectAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  const outcome = await reconnectAccount(idOf(formData), String(formData.get("token") ?? ""));
  return finishCommerce("channels", state, outcome, ["token"], { token: "" });
}

export async function disconnectAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("channels", state, await disconnectAccount(idOf(formData)), []);
}

// ---- Liên kết sản phẩm

const LINK_FIELDS = ["account_id", "sku", "external_sku", "mode", "value", "from"] as const;

export async function linkAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, LINK_FIELDS);
  const outcome = await linkListing({
    account_id: values.account_id ?? "",
    sku: values.sku ?? "",
    external_sku: values.external_sku ?? "",
    mode: values.mode ?? "",
    value: values.value ?? "",
    from: values.from ?? "",
  });
  return finishCommerce("channels", state, outcome, LINK_FIELDS, values);
}

export async function publishAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("channels", state, await changeListing(idOf(formData), "publish"), []);
}

export async function retryListingAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("channels", state, await changeListing(idOf(formData), "retry"), []);
}

export async function delistAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("channels", state, await changeListing(idOf(formData), "delist"), []);
}

// ---- Phân bổ tồn

const ALLOC_FIELDS = ["mode", "share", "reserved", "buffer"] as const;

export async function allocationAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ALLOC_FIELDS);
  const outcome = await saveAllocation({
    id: idOf(formData),
    mode: values.mode ?? "",
    share: values.share ?? "",
    reserved: values.reserved ?? "",
    buffer: values.buffer ?? "",
  });
  return finishCommerce("channels", state, outcome, ALLOC_FIELDS, values);
}

// ---- Đơn từ kênh

export async function mapAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_ORDERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["external_sku", "sku"]);
  const outcome = await mapInbound(idOf(formData), {
    external_sku: values.external_sku ?? "",
    sku: values.sku ?? "",
  });
  return finishCommerce("channels", state, outcome, ["sku"], values);
}

export async function retryInboundAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_ORDERS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("channels", state, await retryInbound(idOf(formData)), []);
}

export async function resolveAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_ORDERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["note"]);
  const action = String(formData.get("resolution") ?? "");
  const outcome = await resolveInbound(
    idOf(formData),
    action === "keep" || action === "cancel_on_channel" ? action : "close_conflict",
    values.note ?? "",
  );
  return finishCommerce("channels", state, outcome, ["note"], values);
}

// ---- Đối soát

export async function resolveLineAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CHANNELS_FINANCE_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["note"]);
  const outcome = await resolveSettlementLine(idOf(formData), values.note ?? "");
  return finishCommerce("channels", state, outcome, ["note"], values);
}

export async function postSettlementAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(CHANNELS_FINANCE_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("channels", state, await postSettlement(idOf(formData)), []);
}

// ---- Hàng loạt

/**
 * Chạy một lệnh mẫu cho từng id (hàm mẫu, như core bước 48, chỉ có lệnh từng cái; không bịa endpoint
 * hàng loạt), gom lỗi đã dịch theo `channels.codes.*`. `undo`: id đã đổi, cho nút Hoàn tác.
 */
async function eachSample(
  ids: string[],
  permission: string,
  run: (id: string) => Promise<SampleOutcome<unknown>>,
  names: ReadonlyMap<string, string>,
): Promise<BulkResult> {
  const blocked = await guard(permission);
  if (blocked) return bulkBlocked(ids, blocked.error ?? "");
  const result = await eachId(
    ids,
    async (id) => {
      const outcome = await run(id);
      return outcome.ok ? null : (await translateCommerce(outcome.problem, "channels")).detail;
    },
    (id) => names.get(id) ?? id,
  );
  refresh();
  const failed = new Set(result.errors.map((e) => e.id));
  return { ...result, undo: ids.filter((id) => !failed.has(id)) };
}

async function accountNames(): Promise<Map<string, string>> {
  return new Map((await listAccounts()).data.map((a) => [a.id, a.name]));
}

async function accountsTo(ids: string[], running: boolean): Promise<BulkResult> {
  return eachSample(
    ids,
    CHANNELS_MANAGE,
    (id) => setAccountRunning(id, running),
    await accountNames(),
  );
}

/** Tạm dừng nhiều tài khoản đang chạy; tài khoản ở trạng thái khác báo lỗi riêng dòng. */
export async function bulkPauseAction(input: BulkInput): Promise<BulkResult> {
  return accountsTo(cleanIds(input.ids), false);
}
export async function bulkResumeAction(input: BulkInput): Promise<BulkResult> {
  return accountsTo(cleanIds(input.ids), true);
}
export async function undoPauseAction(ids: string[]): Promise<BulkResult> {
  const { total, done, errors } = await accountsTo(cleanIds(ids), true);
  return { total, done, errors };
}
export async function undoResumeAction(ids: string[]): Promise<BulkResult> {
  const { total, done, errors } = await accountsTo(cleanIds(ids), false);
  return { total, done, errors };
}

/** Nhập lại nhiều đơn từ kênh bị lỗi; đơn ở trạng thái khác báo lỗi riêng dòng. */
export async function bulkRetryInboundAction(input: BulkInput): Promise<BulkResult> {
  const { data } = await listInbound();
  return eachSample(
    cleanIds(input.ids),
    CHANNELS_ORDERS_MANAGE,
    (id) => retryInbound(id),
    new Map(data.map((r) => [r.id, r.external_order_id])),
  );
}

/** Ghi sổ nhiều bảng kê đã khớp hết (hỏi lại trước; không đảo được). */
export async function bulkPostSettlementAction(input: BulkInput): Promise<BulkResult> {
  const { data } = await listSettlements();
  const { total, done, errors } = await eachSample(
    cleanIds(input.ids),
    CHANNELS_FINANCE_MANAGE,
    (id) => postSettlement(id),
    new Map(data.map((x) => [x.id, x.external_payout_id])),
  );
  return { total, done, errors };
}

/** Đóng nhiều dòng lệch với cùng một ghi chú (người dùng gõ trong hộp hỏi lại). Không đảo được. */
export async function bulkResolveLinesAction(input: BulkInput): Promise<BulkResult> {
  const { data } = await settlementLines();
  const { total, done, errors } = await eachSample(
    cleanIds(input.ids),
    CHANNELS_FINANCE_MANAGE,
    (id) => resolveSettlementLine(id, input.value ?? ""),
    new Map(data.map((l) => [l.id, l.order_number ?? l.external_order_id])),
  );
  return { total, done, errors };
}
