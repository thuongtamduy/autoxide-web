"use server";

import { refresh } from "next/cache";
// Server Action của Trung tâm người bán (W-018): gọi hàm mẫu của `src/sample/market.ts` thay cho API
// `…/sellers/me…` của bước 46 (W-006). Mọi lệnh chỉ chạm gian hàng của người đang xem (`sellerContext`):
// người bán thật, hay gian hàng đang "xem như" của quản trị viên. "Xem như" là lối thử trên dữ liệu
// mẫu, tách khỏi quyền thật: không cấp permission nào, và khi có API thì thành chỉ đọc (W-018).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { DialogState } from "@/components/ui/form-dialog";
import { commerceGuard, finishCommerce, translateCommerce, typed } from "@/lib/commerce-action";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { MARKETPLACE_SELLERS_READ, SELLER_PREVIEW_COOKIE } from "@/lib/market";
import { type SellerContext, sellerContext } from "@/lib/seller";
import { can } from "@/lib/viewer";
import {
  acceptSellerDocument,
  addListing,
  answerDispute,
  appealPenalty,
  getSeller,
  setPayoutAccount,
  submitForReview,
  submitSellerDocument,
  updateShop,
} from "@/sample/market";

/** Bật "Xem như người bán" cho một gian hàng (người xem được hồ sơ người bán), rồi mở trung tâm. */
export async function startPreviewAction(formData: FormData): Promise<void> {
  const orgId = String(formData.get("org_id") ?? "");
  if (!(await can(MARKETPLACE_SELLERS_READ)) || !(await getSeller(orgId))) {
    redirect("/seller");
  }
  (await cookies()).set(SELLER_PREVIEW_COOKIE, orgId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 8 * 60 * 60,
  });
  redirect("/seller");
}

/** Thoát "Xem như người bán", về màn Vận hành sàn. */
export async function stopPreviewAction(): Promise<void> {
  (await cookies()).delete(SELLER_PREVIEW_COOKIE);
  redirect("/market");
}

/** Gian hàng của người đang xem; không có thì trả lỗi như core (403). */
async function mine(): Promise<{ ctx: SellerContext } | { blocked: FormState }> {
  const off = await commerceGuard();
  if (off) return { blocked: off };
  const ctx = await sellerContext();
  if (ctx) return { ctx };
  const t = await getTranslations("errors");
  return {
    blocked: { error: t("forbidden", { permission: "marketplace.sell" }), code: "forbidden" },
  };
}

/** Gửi hồ sơ cho sàn duyệt: thiếu thì liệt kê từng thứ còn thiếu trong một câu. */
export async function submitForReviewAction(state: FormState, _formData: FormData) {
  const who = await mine();
  if ("blocked" in who) return who.blocked;
  const outcome = await submitForReview(who.ctx.seller.org_id);
  if (!outcome.ok && outcome.problem.code === "marketplace.not_ready") {
    const t = await getTranslations("seller");
    const missing = (outcome.problem.errors ?? []).map((e) => t(`missing.${e.field}`));
    return { error: t("notReady", { list: missing.join(", ") }), code: outcome.problem.code };
  }
  return finishCommerce("market", state, outcome, []);
}

export async function acceptDocumentAction(state: FormState, formData: FormData) {
  const who = await mine();
  if ("blocked" in who) return who.blocked;
  const outcome = await acceptSellerDocument(
    who.ctx.seller.org_id,
    String(formData.get("id") ?? ""),
  );
  return finishCommerce("market", state, outcome, []);
}

const SHOP_FIELDS = [
  "display_name",
  "slug",
  "description",
  "pickup_address",
  "fulfillment",
] as const;

export async function updateShopAction(state: DialogState, formData: FormData) {
  const who = await mine();
  if ("blocked" in who) return who.blocked;
  const values = typed(formData, SHOP_FIELDS);
  const outcome = await updateShop(who.ctx.seller.org_id, {
    display_name: values.display_name ?? "",
    slug: values.slug ?? "",
    description: values.description ?? "",
    pickup_address: values.pickup_address ?? "",
    fulfillment: values.fulfillment ?? "",
    cod_enabled: formData.get("cod_enabled") === "on",
  });
  return finishCommerce("market", state, outcome, SHOP_FIELDS, values);
}

/**
 * Tài khoản nhận tiền: số tài khoản chỉ đi qua đây một lần tới kho secret (ở đây: hàm mẫu chỉ giữ 4
 * số cuối) và không bao giờ điền lại vào form khi báo lỗi.
 */
export async function payoutAccountAction(state: DialogState, formData: FormData) {
  const who = await mine();
  if ("blocked" in who) return who.blocked;
  const values = typed(formData, ["bank_name", "holder_name"]);
  const outcome = await setPayoutAccount(who.ctx.seller.org_id, {
    bank_name: values.bank_name ?? "",
    holder_name: values.holder_name ?? "",
    account_number: String(formData.get("account_number") ?? ""),
  });
  return finishCommerce(
    "market",
    state,
    outcome,
    ["bank_name", "holder_name", "account_number"],
    values,
  );
}

const DOC_FIELDS = ["doc_type", "number", "valid_until"] as const;

export async function submitDocumentAction(state: DialogState, formData: FormData) {
  const who = await mine();
  if ("blocked" in who) return who.blocked;
  const values = typed(formData, DOC_FIELDS);
  const outcome = await submitSellerDocument(who.ctx.seller.org_id, {
    doc_type: values.doc_type ?? "",
    number: values.number ?? "",
    valid_until: values.valid_until ?? "",
  });
  return finishCommerce("market", state, outcome, DOC_FIELDS, values);
}

const LISTING_FIELDS = ["name", "category_id", "price"] as const;

export async function addListingAction(state: DialogState, formData: FormData) {
  const who = await mine();
  if ("blocked" in who) return who.blocked;
  const values = typed(formData, LISTING_FIELDS);
  const outcome = await addListing(who.ctx.seller.org_id, {
    name: values.name ?? "",
    category_id: values.category_id ?? "",
    price: values.price ?? "",
  });
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, "market");
    return { ...problemState(problem, LISTING_FIELDS), values };
  }
  refresh();
  return { done: nextDone(state), go: "/seller/products" };
}

export async function replyDisputeAction(state: DialogState, formData: FormData) {
  const who = await mine();
  if ("blocked" in who) return who.blocked;
  const values = typed(formData, ["body"]);
  const outcome = await answerDispute(who.ctx.seller.org_id, String(formData.get("id") ?? ""), {
    answer: "reply",
    body: values.body ?? "",
  });
  return finishCommerce("market", state, outcome, ["body"], values);
}

export async function agreeRefundAction(state: FormState, formData: FormData) {
  const who = await mine();
  if ("blocked" in who) return who.blocked;
  const outcome = await answerDispute(who.ctx.seller.org_id, String(formData.get("id") ?? ""), {
    answer: "agree_refund",
    body: "",
  });
  return finishCommerce("market", state, outcome, []);
}

export async function appealAction(state: DialogState, formData: FormData) {
  const who = await mine();
  if ("blocked" in who) return who.blocked;
  const values = typed(formData, ["reason"]);
  const outcome = await appealPenalty(who.ctx.seller.org_id, String(formData.get("id") ?? ""), {
    reason: values.reason ?? "",
  });
  return finishCommerce("market", state, outcome, ["reason"], values);
}
