"use client";

// Biểu mẫu của màn Khách hàng (dữ liệu mẫu, W-006 / W-019, chờ module `customers` của bước 47). Cùng cách
// làm với phần gọi core thật: Server Action, lỗi theo ô, gom mọi lỗi một lần, mã lỗi `customers.*`.
// Điều chỉnh điểm là việc về tiền (nghĩa vụ trong sổ cái), không hoàn tác được: hộp thoại nêu rõ hệ quả,
// mã tham chiếu chống ghi hai lần.
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { saveRegistration } from "@/app/(admin)/customers/account-actions";
import {
  addCustomerAction,
  adjustPointsAction,
  blockAction,
  codRuleAction,
  groupAction,
  type LookupState,
  lookupAction,
  loyaltyRuleAction,
  noteAction,
  type PreviewState,
  previewRuleAction,
  referralRuleAction,
  reminderRuleAction,
  tagsAction,
} from "@/app/(admin)/customers/actions";
import { ActionDialog, ActionForm } from "@/components/catalog/action-dialog";
import type { Option } from "@/components/catalog/forms";
import {
  CheckField,
  Field,
  FormAlert,
  SelectField,
  TextareaField,
  useFocusInvalid,
} from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { formatCount, formatMoney } from "@/lib/format";

const value = (state: FormState, name: string, fallback = "") => state.values?.[name] ?? fallback;

/** Ngày mai theo giờ Việt Nam (`YYYY-MM-DD`), giá trị gợi ý cho ô "Hiệu lực từ". */
function tomorrow(): string {
  return new Date(Date.now() + 7 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
}

export function AddCustomerDialog({ stores }: { stores: Option[] }) {
  const t = useTranslations("customers.add");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn pri"
      action={addCustomerAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <Field
            label={t("phone")}
            name="phone"
            inputMode="tel"
            autoComplete="off"
            mono
            required
            hint={t("phoneHint")}
            defaultValue={value(state, "phone")}
            error={state.fields?.phone}
          />
          <Field
            label={t("name")}
            name="name"
            autoComplete="off"
            hint={t("nameHint")}
            defaultValue={value(state, "name")}
            error={state.fields?.name}
          />
          <SelectField
            label={t("store")}
            name="org_id"
            options={stores}
            defaultValue={value(state, "org_id", stores[0]?.value ?? "")}
            error={state.fields?.org_id}
          />
        </>
      )}
    </ActionDialog>
  );
}

export function NoteDialog({ id, name }: { id: string; name: string }) {
  const t = useTranslations("customers.note");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { name })}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={noteAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <TextareaField
          label={t("body")}
          name="body"
          required
          maxLength={1000}
          defaultValue={value(state, "body")}
          error={state.fields?.body}
        />
      )}
    </ActionDialog>
  );
}

export function TagsDialog({ id, name, tags }: { id: string; name: string; tags: string }) {
  const t = useTranslations("customers.tags");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { name })}
      triggerClass="btn sm"
      action={tagsAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <Field
          label={t("tags")}
          name="tags"
          hint={t("hint")}
          defaultValue={value(state, "tags", tags)}
          error={state.fields?.tags}
        />
      )}
    </ActionDialog>
  );
}

/**
 * Điều chỉnh điểm tay (`customers.loyalty.adjust`): ghi sổ điểm chỉ thêm và bút toán nghĩa vụ, không sửa
 * được; cùng mã tham chiếu gửi lại không cộng hai lần.
 */
export function AdjustPointsDialog({
  id,
  name,
  balance,
  pointValue,
}: {
  id: string;
  name: string;
  balance: number;
  pointValue: number;
}) {
  const t = useTranslations("customers.points");
  const locale = useLocale();
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { name })}
      intro={
        <ul className="dlg-list">
          <li>{t("balance", { points: formatCount(balance, locale) })}</li>
          <li>{t("ledger", { value: formatMoney(pointValue, "VND", locale) })}</li>
          <li>{t("final")}</li>
        </ul>
      }
      triggerClass="btn sm"
      action={adjustPointsAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <Field
            label={t("points")}
            name="points"
            inputMode="numeric"
            mono
            required
            placeholder="+200"
            hint={t("pointsHint")}
            defaultValue={value(state, "points")}
            error={state.fields?.points}
          />
          <Field
            label={t("reference")}
            name="reference"
            mono
            required
            autoComplete="off"
            placeholder="CSKH-2611-015"
            hint={t("referenceHint")}
            defaultValue={value(state, "reference")}
            error={state.fields?.reference}
          />
          <TextareaField
            label={t("reason")}
            name="reason"
            required
            maxLength={300}
            defaultValue={value(state, "reason")}
            error={state.fields?.reason}
          />
        </>
      )}
    </ActionDialog>
  );
}

export interface GroupInput {
  id: string;
  name: string;
  kind: "manual" | "rule";
  spent: string;
  orders: string;
  days: string;
  tier: string;
  org: string;
}

function RuleFields({
  state,
  orgs,
  initial,
}: {
  state: FormState;
  orgs: Option[];
  initial?: Partial<GroupInput>;
}) {
  const t = useTranslations("customers.rule");
  return (
    <div className="gr-two">
      <Field
        money
        label={t("spent")}
        name="spent"
        inputMode="numeric"
        mono
        hint={t("empty")}
        defaultValue={value(state, "spent", initial?.spent ?? "")}
        error={state.fields?.spent}
      />
      <Field
        label={t("orders")}
        name="orders"
        inputMode="numeric"
        mono
        hint={t("empty")}
        defaultValue={value(state, "orders", initial?.orders ?? "")}
        error={state.fields?.orders}
      />
      <Field
        label={t("days")}
        name="days"
        inputMode="numeric"
        mono
        hint={t("empty")}
        defaultValue={value(state, "days", initial?.days ?? "")}
        error={state.fields?.days}
      />
      <SelectField
        label={t("tier")}
        name="tier"
        options={[
          { value: "", label: t("any") },
          { value: "member", label: t("tiers.member") },
          { value: "silver", label: t("tiers.silver") },
          { value: "gold", label: t("tiers.gold") },
        ]}
        defaultValue={value(state, "tier", initial?.tier ?? "")}
        error={state.fields?.tier}
      />
      <SelectField
        label={t("org")}
        name="org"
        options={[{ value: "", label: t("allOrgs") }, ...orgs]}
        defaultValue={value(state, "org", initial?.org ?? "")}
        error={state.fields?.org}
      />
    </div>
  );
}

/** Tạo / sửa nhóm khách: tên, cách vào nhóm, quy tắc (ô trống = không xét). */
export function GroupDialog({ orgs, group }: { orgs: Option[]; group?: GroupInput }) {
  const t = useTranslations("customers.group");
  return (
    <ActionDialog<FormState>
      label={group ? t("edit") : t("button")}
      title={group ? t("editTitle", { name: group.name }) : t("title")}
      intro={t("intro")}
      triggerClass={group ? "btn sm" : "btn sm pri"}
      action={groupAction}
      hidden={group ? { id: group.id } : {}}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <Field
            label={t("name")}
            name="name"
            required
            maxLength={60}
            defaultValue={value(state, "name", group?.name ?? "")}
            error={state.fields?.name}
          />
          <SelectField
            label={t("kind")}
            name="kind"
            options={[
              { value: "rule", label: t("kinds.rule") },
              { value: "manual", label: t("kinds.manual") },
            ]}
            defaultValue={value(state, "kind", group?.kind ?? "rule")}
            error={state.fields?.kind}
          />
          <RuleFields state={state} orgs={orgs} {...(group ? { initial: group } : {})} />
        </>
      )}
    </ActionDialog>
  );
}

/** "Thử quy tắc": báo số hồ sơ khớp và số đã đồng ý nhận tin, không lưu gì. */
export function PreviewRuleForm({ orgs }: { orgs: Option[] }) {
  const t = useTranslations("customers.preview");
  const locale = useLocale();
  return (
    <ActionForm<PreviewState>
      action={previewRuleAction}
      submit={t("submit")}
      footer={(state) =>
        state.result ? (
          <p className="gr-result" role="status">
            {t("result", {
              matched: formatCount(state.result.matched, locale),
              consented: formatCount(state.result.consented, locale),
            })}
          </p>
        ) : null
      }
    >
      {(state) => (
        <RuleFields state={state} orgs={orgs} initial={{ spent: "3000000", days: "60" }} />
      )}
    </ActionForm>
  );
}

export function RegistrationForm({ open }: { open: boolean }) {
  const t = useTranslations("customers.accounts");
  return (
    <ActionForm<FormState> action={saveRegistration} submit={t("save")} done={t("saved")}>
      {() => (
        <CheckField
          label={t("selfSignup")}
          name="open"
          defaultChecked={open}
          hint={t("selfSignupHint")}
        />
      )}
    </ActionForm>
  );
}

function DateField({
  state,
  name,
  label,
  hint,
}: {
  state: FormState;
  name: string;
  label: string;
  hint?: string;
}) {
  return (
    <Field
      label={label}
      name={name}
      type="date"
      required
      {...(hint ? { hint } : {})}
      defaultValue={value(state, name, tomorrow())}
      error={state.fields?.[name]}
    />
  );
}

export function LoyaltyRuleDialog() {
  const t = useTranslations("customers.loyaltyRule");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn sm"
      action={loyaltyRuleAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <div className="gr-two">
          <Field
            label={t("earn")}
            name="earn"
            inputMode="numeric"
            mono
            required
            defaultValue={value(state, "earn", "10000")}
            error={state.fields?.earn}
          />
          <Field
            money
            label={t("value")}
            name="value"
            inputMode="numeric"
            mono
            required
            defaultValue={value(state, "value", "100")}
            error={state.fields?.value}
          />
          <Field
            label={t("months")}
            name="months"
            inputMode="numeric"
            mono
            defaultValue={value(state, "months", "12")}
            error={state.fields?.months}
          />
          <Field
            label={t("min")}
            name="min"
            inputMode="numeric"
            mono
            defaultValue={value(state, "min", "100")}
            error={state.fields?.min}
          />
          <Field
            label={t("maxPct")}
            name="max_pct"
            inputMode="numeric"
            mono
            defaultValue={value(state, "max_pct", "30")}
            error={state.fields?.max_pct}
          />
          <DateField state={state} name="from" label={t("from")} hint={t("fromHint")} />
        </div>
      )}
    </ActionDialog>
  );
}

export function ReminderRuleForm({
  enabled,
  delays,
  channel,
}: {
  enabled: boolean;
  delays: string;
  channel: string;
}) {
  const t = useTranslations("customers.reminder");
  return (
    <ActionForm<FormState> action={reminderRuleAction} submit={t("submit")} done={t("done")}>
      {(state) => (
        <>
          <CheckField
            label={t("enabled")}
            name="enabled"
            defaultChecked={enabled}
            hint={t("enabledHint")}
          />
          <Field
            label={t("delays")}
            name="delays"
            mono
            required
            hint={t("delaysHint")}
            defaultValue={value(state, "delays", delays)}
            error={state.fields?.delays}
          />
          <SelectField
            label={t("channel")}
            name="channel"
            options={[
              { value: "email", label: t("channels.email") },
              { value: "sms", label: t("channels.sms") },
            ]}
            defaultValue={value(state, "channel", channel)}
            error={state.fields?.channel}
          />
        </>
      )}
    </ActionForm>
  );
}

export function ReferralRuleDialog() {
  const t = useTranslations("customers.referralRule");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn sm"
      action={referralRuleAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <div className="gr-two">
          <Field
            label={t("referrer")}
            name="referrer"
            inputMode="numeric"
            mono
            required
            defaultValue={value(state, "referrer", "200")}
            error={state.fields?.referrer}
          />
          <Field
            label={t("referee")}
            name="referee"
            inputMode="numeric"
            mono
            required
            defaultValue={value(state, "referee", "100")}
            error={state.fields?.referee}
          />
          <Field
            money
            label={t("min")}
            name="min"
            inputMode="numeric"
            mono
            defaultValue={value(state, "min", "300000")}
            error={state.fields?.min}
          />
          <DateField state={state} name="from" label={t("from")} />
        </div>
      )}
    </ActionDialog>
  );
}

export function CodRuleDialog() {
  const t = useTranslations("customers.codRule");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn sm"
      action={codRuleAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <div className="gr-two">
          <Field
            label={t("min")}
            name="min"
            inputMode="numeric"
            mono
            required
            defaultValue={value(state, "min", "2")}
            error={state.fields?.min}
          />
          <Field
            label={t("ratio")}
            name="ratio"
            inputMode="numeric"
            mono
            required
            defaultValue={value(state, "ratio", "50")}
            error={state.fields?.ratio}
          />
          <SelectField
            label={t("action")}
            name="action"
            options={[
              { value: "require_prepayment", label: t("actions.require_prepayment") },
              { value: "no_cod", label: t("actions.no_cod") },
            ]}
            defaultValue={value(state, "action", "require_prepayment")}
            error={state.fields?.action}
          />
          <DateField state={state} name="from" label={t("from")} />
        </div>
      )}
    </ActionDialog>
  );
}

/** Tra thống kê COD theo SĐT; kết quả hiện ngay dưới form, số tra không được giữ lại. */
export function LookupForm() {
  const t = useTranslations("customers.lookup");
  const locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<LookupState, FormData>(lookupAction, {});
  useFocusInvalid(form, state);
  const r = state.result;
  return (
    <form ref={form} action={run} noValidate className="card padded dlg-form">
      <Field
        label={t("phone")}
        name="phone"
        inputMode="tel"
        autoComplete="off"
        mono
        required
        hint={t("hint")}
        error={state.fields?.phone}
      />
      <div className="role-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending}>
          {t("submit")}
        </button>
      </div>
      {r ? (
        <p className="gr-result" role="status">
          {r.found
            ? t("found", {
                delivered: r.delivered,
                failed: r.failed,
                refused: r.refused,
                ratio: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                  r.fail_ratio_pct,
                ),
              })
            : t("notFound")}{" "}
          {r.rule ? t(`match.${r.rule.action}`) : t("noMatch")}
          {r.blocked ? ` ${t("blocked", { until: r.blocked.until })}` : ""}
        </p>
      ) : null}
    </form>
  );
}

export function BlockDialog() {
  const t = useTranslations("customers.block");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn sm"
      action={blockAction}
      submit={t("submit")}
      done={t("done")}
      danger
    >
      {(state) => (
        <>
          <Field
            label={t("phone")}
            name="phone"
            inputMode="tel"
            autoComplete="off"
            mono
            required
            defaultValue={value(state, "phone")}
            error={state.fields?.phone}
          />
          <SelectField
            label={t("reason")}
            name="reason"
            options={[
              { value: "repeated_refusal", label: t("reasons.repeated_refusal") },
              { value: "fake_details", label: t("reasons.fake_details") },
              { value: "other", label: t("reasons.other") },
            ]}
            defaultValue={value(state, "reason", "repeated_refusal")}
            error={state.fields?.reason}
          />
          <Field
            label={t("until")}
            name="until"
            type="date"
            required
            hint={t("untilHint")}
            defaultValue={value(state, "until")}
            error={state.fields?.until}
          />
          <TextareaField
            label={t("note")}
            name="note"
            required
            maxLength={300}
            defaultValue={value(state, "note")}
            error={state.fields?.note}
          />
        </>
      )}
    </ActionDialog>
  );
}
