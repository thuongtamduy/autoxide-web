"use client";

// Biểu mẫu của màn Tiếp thị liên kết (dữ liệu mẫu, W-006 / W-019, chờ module `affiliate` của bước 49).
// Đánh dấu đã chi là việc về tiền: hộp thoại nêu số tiền trước thuế, thuế khấu trừ, thực nhận và "không
// hoàn tác được"; mã giao dịch ngân hàng chống ghi hai lần.
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  createLinkAction,
  markPaidAction,
  type PreviewState,
  pinAction,
  previewAction,
  programAction,
  ruleAction,
  scheduleAction,
  suspendAction,
  terminateAction,
} from "@/app/(admin)/marketing/affiliate/actions";
import { ActionDialog, ActionForm } from "@/components/catalog/action-dialog";
import type { Option } from "@/components/catalog/forms";
import { CheckField, Field, SelectField, TextareaField } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { formatMoney } from "@/lib/format";

const value = (state: FormState, name: string, fallback = "") => state.values?.[name] ?? fallback;

function tomorrow(): string {
  return new Date(Date.now() + 7 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
}

function RuleFields({
  state,
  categories,
  products,
  partners,
}: {
  state: FormState;
  categories: Option[];
  products: Option[];
  partners: Option[];
}) {
  const t = useTranslations("affiliate.rule");
  const [scope, setScope] = useState(value(state, "scope", "category"));
  return (
    <>
      <SelectField
        label={t("scope")}
        name="scope"
        options={[
          { value: "product", label: t("scopes.product") },
          { value: "category", label: t("scopes.category") },
          { value: "default", label: t("scopes.default") },
        ]}
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        error={state.fields?.scope}
      />
      {scope === "product" ? (
        <SelectField
          label={t("product")}
          name="product"
          options={[{ value: "", label: t("pick") }, ...products]}
          defaultValue={value(state, "product")}
          error={state.fields?.product}
        />
      ) : null}
      {scope === "category" ? (
        <SelectField
          label={t("category")}
          name="category"
          options={[{ value: "", label: t("pick") }, ...categories]}
          defaultValue={value(state, "category")}
          error={state.fields?.category}
        />
      ) : null}
      <SelectField
        label={t("partner")}
        name="partner"
        options={[{ value: "", label: t("everyone") }, ...partners]}
        defaultValue={value(state, "partner")}
        error={state.fields?.partner}
      />
      <div className="gr-two">
        <Field
          label={t("rate")}
          name="rate"
          mono
          required
          placeholder="8"
          defaultValue={value(state, "rate")}
          error={state.fields?.rate}
        />
        <Field
          label={t("cap")}
          name="cap"
          inputMode="numeric"
          mono
          hint={t("capHint")}
          defaultValue={value(state, "cap")}
          error={state.fields?.cap}
        />
        <Field
          label={t("priority")}
          name="priority"
          inputMode="numeric"
          mono
          hint={t("priorityHint")}
          defaultValue={value(state, "priority", "10")}
          error={state.fields?.priority}
        />
        <Field
          label={t("from")}
          name="from"
          type="date"
          required
          defaultValue={value(state, "from", tomorrow())}
          error={state.fields?.from}
        />
      </div>
    </>
  );
}

export function RuleDialog({
  categories,
  products,
  partners,
}: {
  categories: Option[];
  products: Option[];
  partners: Option[];
}) {
  const t = useTranslations("affiliate.rule");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn pri"
      action={ruleAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <RuleFields state={state} categories={categories} products={products} partners={partners} />
      )}
    </ActionDialog>
  );
}

export function ScheduleDialog({ hosts, platforms }: { hosts: Option[]; platforms: Option[] }) {
  const t = useTranslations("affiliate.schedule");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn"
      action={scheduleAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <Field
            label={t("titleField")}
            name="title"
            required
            maxLength={120}
            defaultValue={value(state, "title")}
            error={state.fields?.title}
          />
          <SelectField
            label={t("host")}
            name="host"
            options={hosts}
            defaultValue={value(state, "host", hosts[0]?.value ?? "")}
            error={state.fields?.host}
          />
          <SelectField
            label={t("platform")}
            name="platform"
            options={platforms}
            defaultValue={value(state, "platform", "tiktok")}
            error={state.fields?.platform}
          />
          <Field
            label={t("at")}
            name="at"
            type="datetime-local"
            required
            hint={t("atHint")}
            defaultValue={value(state, "at")}
            error={state.fields?.at}
          />
        </>
      )}
    </ActionDialog>
  );
}

export function SuspendDialog({ id, name }: { id: string; name: string }) {
  const t = useTranslations("affiliate.suspend");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { name })}
      intro={t("intro")}
      triggerClass="btn sm"
      action={suspendAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <TextareaField
          label={t("reason")}
          name="reason"
          required
          maxLength={300}
          defaultValue={value(state, "reason")}
          error={state.fields?.reason}
        />
      )}
    </ActionDialog>
  );
}

export function TerminateDialog({ id, name }: { id: string; name: string }) {
  const t = useTranslations("affiliate.terminate");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { name })}
      intro={
        <ul className="dlg-list">
          <li>{t("point1")}</li>
          <li>{t("point2")}</li>
          <li>{t("point3")}</li>
        </ul>
      }
      triggerClass="btn sm danger"
      action={terminateAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
      danger
    >
      {(state) => (
        <TextareaField
          label={t("reason")}
          name="reason"
          required
          maxLength={300}
          defaultValue={value(state, "reason")}
          error={state.fields?.reason}
        />
      )}
    </ActionDialog>
  );
}

/** Xem trước hoa hồng cho một dòng giả định: giá, giảm, thuế như đơn thật, quy tắc hiệu lực ngày đặt. */
export function PreviewForm({ products, partners }: { products: Option[]; partners: Option[] }) {
  const t = useTranslations("affiliate.preview");
  const locale = useLocale();
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  return (
    <ActionForm<PreviewState>
      action={previewAction}
      submit={t("submit")}
      footer={(state) =>
        state.result ? (
          <p className="gr-result" role="status">
            {t("result", {
              name: state.result.name,
              price: money(state.result.unit_price.amount),
              discount: money(state.result.discount.amount),
              net: money(state.result.net.amount),
              base: money(state.result.base.amount),
              rule: state.result.rule
                ? (state.result.rule.target_name ?? state.result.rule.scope)
                : "—",
              rate: state.result.rule ? state.result.rule.rate_bp / 100 : 0,
              amount: money(state.result.amount.amount),
            })}
            {state.result.capped ? ` ${t("capped")}` : ""}
          </p>
        ) : null
      }
    >
      {(state) => (
        <div className="gr-two">
          <SelectField
            label={t("product")}
            name="sku"
            options={products}
            defaultValue={value(state, "sku", "CG26")}
            error={state.fields?.sku}
          />
          <Field
            label={t("code")}
            name="code"
            mono
            defaultValue={value(state, "code", "BEPMOC10")}
            error={state.fields?.code}
          />
          <Field
            label={t("day")}
            name="day"
            type="date"
            required
            defaultValue={value(
              state,
              "day",
              new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10),
            )}
            error={state.fields?.day}
          />
          <SelectField
            label={t("partner")}
            name="partner"
            options={[{ value: "", label: t("everyone") }, ...partners]}
            defaultValue={value(state, "partner")}
            error={state.fields?.partner}
          />
        </div>
      )}
    </ActionForm>
  );
}

export function ProgramForm({
  program,
}: {
  program: {
    days: number;
    precedence: string;
    base: string;
    auto: boolean;
    mode: string;
    min: string;
  };
}) {
  const t = useTranslations("affiliate.program");
  return (
    <ActionForm<FormState> action={programAction} submit={t("submit")} done={t("done")}>
      {(state) => (
        <>
          <div className="gr-two">
            <Field
              label={t("days")}
              name="days"
              inputMode="numeric"
              mono
              required
              defaultValue={value(state, "days", String(program.days))}
              error={state.fields?.days}
            />
            <SelectField
              label={t("precedence")}
              name="precedence"
              options={[
                { value: "live_click_code", label: t("orders.live_click_code") },
                { value: "click_code_live", label: t("orders.click_code_live") },
              ]}
              defaultValue={value(state, "precedence", program.precedence)}
              error={state.fields?.precedence}
            />
            <SelectField
              label={t("base")}
              name="base"
              options={[
                { value: "net_excl_tax", label: t("bases.net_excl_tax") },
                { value: "net_incl_tax", label: t("bases.net_incl_tax") },
              ]}
              defaultValue={value(state, "base", program.base)}
              error={state.fields?.base}
            />
            <SelectField
              label={t("mode")}
              name="mode"
              options={[
                { value: "manual", label: t("modes.manual") },
                { value: "gateway", label: t("modes.gateway") },
              ]}
              defaultValue={value(state, "mode", program.mode)}
              error={state.fields?.mode}
            />
            <Field
              label={t("min")}
              name="min"
              inputMode="numeric"
              mono
              defaultValue={value(state, "min", program.min)}
              error={state.fields?.min}
            />
          </div>
          <CheckField
            label={t("auto")}
            name="auto"
            defaultChecked={program.auto}
            hint={t("autoHint")}
          />
        </>
      )}
    </ActionForm>
  );
}

/**
 * Đánh dấu đã chi tay (chế độ `manual`): kế toán đã tự chuyển khoản; ghi sổ cái và lập chứng từ khấu trừ.
 * Không hoàn tác được; cùng mã giao dịch gửi lại không ghi hai lần.
 */
export function MarkPaidDialog({
  id,
  name,
  gross,
  withheld,
  net,
}: {
  id: string;
  name: string;
  gross: string;
  withheld: string;
  net: string;
}) {
  const t = useTranslations("affiliate.paid");
  const locale = useLocale();
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { name })}
      intro={
        <>
          <dl className="ord-confirm">
            <dt>{t("gross")}</dt>
            <dd>{money(gross)}</dd>
            <dt>{t("withheld")}</dt>
            <dd>−{money(withheld)}</dd>
            <dt>{t("net")}</dt>
            <dd className="big">{money(net)}</dd>
          </dl>
          <p className="ord-warn" role="note">
            {t("warn")}
          </p>
        </>
      }
      triggerClass="btn sm pri"
      action={markPaidAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <Field
            label={t("reference")}
            name="bank_reference"
            mono
            required
            autoComplete="off"
            hint={t("referenceHint")}
            defaultValue={value(state, "bank_reference")}
            error={state.fields?.bank_reference}
          />
          <Field
            label={t("date")}
            name="date"
            type="date"
            required
            defaultValue={value(
              state,
              "date",
              new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10),
            )}
            error={state.fields?.date}
          />
        </>
      )}
    </ActionDialog>
  );
}

export function PinDialog({
  id,
  title,
  products,
}: {
  id: string;
  title: string;
  products: Option[];
}) {
  const t = useTranslations("affiliate.pin");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { title })}
      intro={t("intro")}
      triggerClass="btn sm"
      action={pinAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <SelectField
            label={t("product")}
            name="sku"
            options={[{ value: "", label: t("pick") }, ...products]}
            defaultValue={value(state, "sku")}
            error={state.fields?.sku}
          />
          <Field
            label={t("code")}
            name="code"
            mono
            hint={t("codeHint")}
            defaultValue={value(state, "code")}
            error={state.fields?.code}
          />
        </>
      )}
    </ActionDialog>
  );
}

export function LinkCreateDialog({ products, days }: { products: Option[]; days: number }) {
  const t = useTranslations("affiliate.link");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro", { days })}
      triggerClass="btn sm pri"
      action={createLinkAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => <LinkFields state={state} products={products} />}
    </ActionDialog>
  );
}

function LinkFields({ state, products }: { state: FormState; products: Option[] }) {
  const t = useTranslations("affiliate.link");
  const [kind, setKind] = useState(value(state, "target_kind", "product"));
  return (
    <>
      <Field
        label={t("code")}
        name="code"
        mono
        required
        placeholder="hang-noi-inox"
        hint={t("codeHint")}
        defaultValue={value(state, "code")}
        error={state.fields?.code}
      />
      <SelectField
        label={t("to")}
        name="target_kind"
        options={[
          { value: "product", label: t("kinds.product") },
          { value: "store", label: t("kinds.store") },
        ]}
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        error={state.fields?.target_kind}
      />
      {kind === "product" ? (
        <SelectField
          label={t("product")}
          name="sku"
          options={[{ value: "", label: t("pick") }, ...products]}
          defaultValue={value(state, "sku")}
          error={state.fields?.sku}
        />
      ) : null}
    </>
  );
}
