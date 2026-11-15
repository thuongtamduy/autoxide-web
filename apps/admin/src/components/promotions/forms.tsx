"use client";

// Biểu mẫu của màn "Khuyến mại" (dữ liệu mẫu, W-006 / W-015, chờ module `promotions` của bước 43):
// tạo chương trình, kéo dài / tăng lượt, sửa giá sốc, ghi số tiếp nhận hồ sơ, sinh lô mã, thử giỏ
// hàng. Cùng cách làm với phần gọi core thật: Server Action, lỗi theo ô, gom mọi lỗi một lần, mã lỗi
// `promotions.*`.
import { useLocale, useTranslations } from "next-intl";
import {
  createPromotionAction,
  type EvaluateState,
  evaluateAction,
  extendAction,
  flashPriceAction,
  type GenerateState,
  generateCodesAction,
  recordNoticeAction,
} from "@/app/(admin)/marketing/promotions/actions";
import { ActionDialog, ActionForm } from "@/components/catalog/action-dialog";
import type { Option } from "@/components/catalog/forms";
import { CheckField, Field, SelectField, TextareaField } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type { CartView, Reason } from "@/sample/promotions";

const value = (state: FormState, name: string, fallback = "") => state.values?.[name] ?? fallback;

const KINDS = [
  "percent_off",
  "amount_off",
  "fixed_price",
  "buy_x_get_y",
  "free_shipping",
  "flash_sale",
];

/** "Tạo chương trình": bản nháp; bật là bước riêng (kiểm trần pháp luật, thông báo, mục tiêu). */
export function CreatePromotionDialog({
  orgs,
  starts,
  ends,
}: {
  orgs: Option[];
  /** Gợi ý giờ bắt đầu / kết thúc (`YYYY-MM-DDTHH:mm`, giờ Việt Nam). */
  starts: string;
  ends: string;
}) {
  const t = useTranslations("promotions.create");
  const kinds = useTranslations("promotions.kinds");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn pri"
      action={createPromotionAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <Field
            label={t("name")}
            name="title"
            required
            maxLength={120}
            defaultValue={value(state, "title")}
            hint={t("nameHint")}
            error={state.fields?.title}
          />
          <div className="fld-row">
            <SelectField
              label={t("kind")}
              name="kind"
              defaultValue={value(state, "kind", "percent_off")}
              options={KINDS.map((k) => ({ value: k, label: kinds(k) }))}
              error={state.fields?.kind}
            />
            <SelectField
              label={t("trigger")}
              name="trigger"
              defaultValue={value(state, "trigger", "automatic")}
              options={[
                { value: "automatic", label: t("automatic") },
                { value: "code", label: t("withCode") },
              ]}
              error={state.fields?.trigger}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("value")}
              name="value"
              mono
              defaultValue={value(state, "value")}
              hint={t("valueHint")}
              error={state.fields?.value}
            />
            <Field
              label={t("code")}
              name="code"
              mono
              defaultValue={value(state, "code")}
              hint={t("codeHint")}
              error={state.fields?.code}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("starts")}
              name="starts_at"
              type="datetime-local"
              required
              defaultValue={value(state, "starts_at", starts)}
              error={state.fields?.starts_at}
            />
            <Field
              label={t("ends")}
              name="ends_at"
              type="datetime-local"
              required
              defaultValue={value(state, "ends_at", ends)}
              hint={t("timeHint")}
              error={state.fields?.ends_at}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("minOrder")}
              name="min_order"
              mono
              inputMode="numeric"
              defaultValue={value(state, "min_order")}
              hint={t("minOrderHint")}
              error={state.fields?.min_order}
            />
            <SelectField
              label={t("org")}
              name="org_id"
              defaultValue={value(state, "org_id", orgs[0]?.value ?? "")}
              options={orgs}
              error={state.fields?.org_id}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("limit")}
              name="usage_limit"
              mono
              inputMode="numeric"
              defaultValue={value(state, "usage_limit")}
              error={state.fields?.usage_limit}
            />
            <Field
              label={t("perCustomer")}
              name="per_customer_limit"
              mono
              inputMode="numeric"
              defaultValue={value(state, "per_customer_limit")}
              error={state.fields?.per_customer_limit}
            />
          </div>
          <Field
            label={t("targets")}
            name="targets"
            mono
            defaultValue={value(state, "targets")}
            hint={t("targetsHint")}
            error={state.fields?.targets}
          />
          <CheckField
            label={t("exclusive")}
            name="exclusive"
            hint={t("exclusiveHint")}
            defaultChecked={value(state, "exclusive") === "on"}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** "Kéo dài": chương trình đã chạy chỉ được kéo dài và tăng lượt; mỗi lần đổi là một phiên bản. */
export function ExtendDialog({
  id,
  title,
  ends,
  limit,
}: {
  id: string;
  title: string;
  ends: string;
  limit: number | null;
}) {
  const t = useTranslations("promotions.extend");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { title })}
      intro={t("intro")}
      action={extendAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <Field
            label={t("ends")}
            name="ends_at"
            type="datetime-local"
            defaultValue={value(state, "ends_at")}
            hint={t("endsHint", { ends })}
            error={state.fields?.ends_at}
          />
          <Field
            label={t("limit")}
            name="usage_limit"
            mono
            inputMode="numeric"
            defaultValue={value(state, "usage_limit")}
            hint={limit === null ? t("noLimit") : t("limitHint", { limit })}
            error={state.fields?.usage_limit}
          />
          <TextareaField
            label={t("reason")}
            name="reason"
            rows={2}
            required
            defaultValue={value(state, "reason")}
            error={state.fields?.reason}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** Sửa giá sốc của một biến thể (thao tác về tiền): hộp thoại nêu giá trước khuyến mại và trần. */
export function FlashPriceDialog({
  id,
  variantId,
  name,
  price,
  quantity,
  reference,
  lowest,
  primary = false,
}: {
  id: string;
  variantId: string;
  name: string;
  price: string;
  quantity: number;
  reference: string;
  lowest: string;
  primary?: boolean;
}) {
  const t = useTranslations("promotions.flash");
  return (
    <ActionDialog<FormState>
      label={primary ? t("fixTo", { price: lowest }) : t("edit")}
      title={t("editTitle", { name })}
      intro={t("editIntro", { reference, lowest })}
      triggerClass={primary ? "btn sm pri" : "btn sm"}
      action={flashPriceAction}
      hidden={{ id, variant_id: variantId }}
      submit={t("save")}
      done={t("saved")}
    >
      {(state) => (
        <div className="fld-row">
          <Field
            label={t("salePrice")}
            name="sale_price"
            mono
            inputMode="numeric"
            required
            defaultValue={value(state, "sale_price", price)}
            hint={t("salePriceHint")}
            error={state.fields?.sale_price}
          />
          <Field
            label={t("quantity")}
            name="quantity_limit"
            mono
            inputMode="numeric"
            defaultValue={value(state, "quantity_limit", String(quantity))}
            error={state.fields?.quantity_limit}
          />
        </div>
      )}
    </ActionDialog>
  );
}

/** "Ghi số tiếp nhận": sau khi người nộp đã nộp qua cổng dịch vụ công. */
export function NoticeDialog({ id, title, today }: { id: string; title: string; today: string }) {
  const t = useTranslations("promotions.notice");
  return (
    <ActionDialog<FormState>
      label={t("record")}
      title={t("recordTitle", { title })}
      intro={t("recordIntro")}
      triggerClass="btn sm pri"
      action={recordNoticeAction}
      hidden={{ id }}
      submit={t("recordSubmit")}
      done={t("recorded")}
    >
      {(state) => (
        <div className="fld-row">
          <Field
            label={t("reference")}
            name="reference"
            mono
            required
            maxLength={64}
            defaultValue={value(state, "reference")}
            hint={t("referenceHint")}
            error={state.fields?.reference}
          />
          <Field
            label={t("submittedOn")}
            name="submitted_on"
            type="date"
            required
            max={today}
            defaultValue={value(state, "submitted_on", today)}
            error={state.fields?.submitted_on}
          />
        </div>
      )}
    </ActionDialog>
  );
}

/** "Sinh lô mã": trên 500 mã thì core chạy bằng job; mã bỏ chữ dễ nhầm. */
export function GenerateCodesForm({ promotions }: { promotions: Option[] }) {
  const t = useTranslations("promotions.generate");
  return (
    <ActionForm<GenerateState>
      action={generateCodesAction}
      submit={t("submit")}
      done={(state) =>
        state.queued
          ? t("queued", { count: state.generated ?? 0 })
          : t("done", { count: state.generated ?? 0 })
      }
    >
      {(state) => (
        <>
          <h3 className="h2">{t("title")}</h3>
          <p className="fhint">{t("about")}</p>
          <SelectField
            label={t("promotion")}
            name="promotion_id"
            defaultValue={value(state, "promotion_id", promotions[0]?.value ?? "")}
            options={promotions}
            error={state.fields?.promotion_id}
          />
          <div className="fld-row">
            <Field
              label={t("count")}
              name="count"
              mono
              inputMode="numeric"
              required
              defaultValue={value(state, "count", "100")}
              hint={t("countHint")}
              error={state.fields?.count}
            />
            <Field
              label={t("prefix")}
              name="prefix"
              mono
              maxLength={8}
              defaultValue={value(state, "prefix")}
              hint={t("prefixHint")}
              error={state.fields?.prefix}
            />
            <Field
              label={t("perCode")}
              name="per_code"
              mono
              inputMode="numeric"
              required
              defaultValue={value(state, "per_code", "1")}
              error={state.fields?.per_code}
            />
          </div>
        </>
      )}
    </ActionForm>
  );
}

const MONEY_PARAMS = new Set(["amount", "min_order", "missing", "price"]);
/** Mọi tham số các câu lý do có thể dùng: thiếu thì để trống thay vì lỗi định dạng. */
const BLANK: Record<string, string> = Object.fromEntries(
  [
    "percent",
    "amount",
    "min_order",
    "missing",
    "price",
    "slots",
    "code",
    "title",
    "buy",
    "have",
    "max",
    "group",
    "sku",
    "condition",
    "starts_at",
  ].map((k) => [k, ""]),
);

/**
 * Câu của một lý do (`Reason` của core: `code` + `params`), theo ngôn ngữ giao diện. Mã chưa đủ điều
 * kiện (`promotions.code_not_applicable`) mang `condition` là một lý do bỏ qua (`promotions.skip.*`),
 * dịch lồng vào câu.
 */
export function useReason(): (reason: Reason) => string {
  const t = useTranslations("promotions.why");
  const locale = useLocale();
  return (reason) => {
    const fmt: Record<string, string> = { ...BLANK };
    for (const [key, raw] of Object.entries(reason.params)) {
      if (MONEY_PARAMS.has(key) && /^\d+$/.test(raw)) fmt[key] = formatMoney(raw, "VND", locale);
      else if (key === "starts_at")
        fmt[key] = new Intl.DateTimeFormat(locale, {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(new Date(raw));
      else fmt[key] = raw;
    }
    const condition = reason.params.condition;
    if (condition && t.has(`promotions_skip_${condition}`)) {
      fmt.condition = t(`promotions_skip_${condition}`, fmt);
    }
    const key = reason.code.replaceAll(".", "_");
    return t.has(key) ? t(key, fmt) : reason.code;
  };
}

/** "Thử giỏ hàng": tính như lúc đặt hàng nhưng không giữ lượt, không ghi gì; nêu vì sao áp hay không. */
export function EvaluateForm({ stores }: { stores: Option[] }) {
  const t = useTranslations("promotions.evaluate");
  return (
    <ActionForm<EvaluateState>
      action={evaluateAction}
      submit={t("submit")}
      className="card padded dlg-form"
      footer={(state) => (state.result ? <EvaluationResult view={state.result} /> : null)}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <SelectField
              label={t("store")}
              name="org_id"
              defaultValue={value(state, "org_id", stores[0]?.value ?? "")}
              options={stores}
              error={state.fields?.org_id}
            />
            <Field
              label={t("group")}
              name="customer_group"
              mono
              defaultValue={value(state, "customer_group")}
              hint={t("groupHint")}
              error={state.fields?.customer_group}
            />
          </div>
          <TextareaField
            label={t("lines")}
            name="lines"
            rows={2}
            required
            className="inp area mono"
            defaultValue={value(state, "lines", "CG26 × 1")}
            hint={t("linesHint")}
            error={state.fields?.lines}
          />
          <div className="fld-row">
            <Field
              label={t("codes")}
              name="codes"
              mono
              defaultValue={value(state, "codes", "BEPMOC10")}
              hint={t("codesHint")}
              error={state.fields?.codes}
            />
            <Field
              label={t("fee")}
              name="shipping_fee"
              mono
              inputMode="numeric"
              defaultValue={value(state, "shipping_fee", "30000")}
              hint={t("feeHint")}
              error={state.fields?.shipping_fee}
            />
          </div>
        </>
      )}
    </ActionForm>
  );
}

function EvaluationResult({ view }: { view: CartView }) {
  const t = useTranslations("promotions.evaluate");
  const locale = useLocale();
  const why = useReason();
  const money = (amount: number | string) => formatMoney(amount, "VND", locale);
  const { cart, evaluation, names } = view;
  const goods = cart.lines.reduce((sum, l) => sum + Number(l.unit_price.amount) * l.quantity, 0);
  const fee = Number(cart.shipping_fee?.amount ?? 0);
  const pay = goods + fee - Number(evaluation.total_discount.amount);
  return (
    <div className="pm-result" aria-live="polite">
      <h3 className="h2">{t("result")}</h3>
      <ul className="cat-lines">
        {cart.lines.map((line) => {
          const name = names[line.variant_id];
          const discounts = evaluation.lines.filter((d) => d.line_key === line.line_key);
          const total = Number(line.unit_price.amount) * line.quantity;
          const off = discounts.reduce((sum, d) => sum + Number(d.amount.amount), 0);
          return (
            <li key={line.line_key} className="pm-line">
              <span className="cell2">
                <span>
                  <b className="mono">{name?.sku}</b> {name?.name} × {line.quantity}
                </span>
                {discounts.map((d) => (
                  <span key={d.promotion_id} className="sub">
                    −{money(d.amount.amount)} · {why(d.reason)}
                    {d.capped_by_law ? (
                      <span className="badge b-warn">
                        <span className="dot" />
                        {t("capped")}
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
              <b className="num">
                {off > 0 ? <s className="pm-was">{money(total)}</s> : null} {money(total - off)}
              </b>
            </li>
          );
        })}
        {evaluation.gifts.map((g) => (
          <li key={`${g.promotion_id}-${g.variant_id}`} className="pm-line">
            <span>
              {t("gift")}: <b className="mono">{names[g.variant_id]?.sku}</b>{" "}
              {names[g.variant_id]?.name} × {g.quantity}
            </span>
            <b className="num">{money(0)}</b>
          </li>
        ))}
        {cart.shipping_fee ? (
          <li className="pm-line">
            <span>{t("shipping")}</span>
            <b className="num">
              {Number(evaluation.shipping_discount.amount) > 0 ? (
                <s className="pm-was">{money(fee)}</s>
              ) : null}{" "}
              {money(fee - Number(evaluation.shipping_discount.amount))}
            </b>
          </li>
        ) : null}
        <li className="pm-line pm-total">
          <span>{t("discount", { amount: money(evaluation.total_discount.amount) })}</span>
          <b className="num">{t("pay", { amount: money(pay) })}</b>
        </li>
      </ul>
      {evaluation.applied.length > 0 ? (
        <>
          <h4 className="pm-h">{t("applied")}</h4>
          <ul className="cat-reqs">
            {evaluation.applied.map((a) => (
              <li key={a.promotion_id}>
                <b>
                  {a.title}
                  {a.code ? ` (${a.code})` : ""}
                </b>
                {a.terms ? <span className="sub"> — {a.terms}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {evaluation.rejected_codes.length > 0 ? (
        <>
          <h4 className="pm-h">{t("rejected")}</h4>
          <ul className="cat-reqs">
            {evaluation.rejected_codes.map((r) => (
              <li key={r.code} data-code={r.reason.code}>
                <b className="mono">{r.code}</b>: {why(r.reason)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {evaluation.skipped.length > 0 ? (
        <>
          <h4 className="pm-h">{t("skipped")}</h4>
          <ul className="cat-reqs">
            {evaluation.skipped.map((s) => (
              <li key={`${s.promotion_id}-${s.reason.code}`} data-code={s.reason.code}>
                <b>{s.title}</b>: {why(s.reason)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="fhint">{t("fingerprint", { value: evaluation.fingerprint })}</p>
    </div>
  );
}
