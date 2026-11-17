"use client";

// Biểu mẫu của màn "Vận chuyển" (dữ liệu mẫu, W-006 / W-015, chờ module `shipping` của bước 44):
// vận đơn tay, tách kiện, phương thức, tính thử phí, lịch giao, ngày nghỉ, bảng kê COD, đóng dòng
// lệch, hãng vận chuyển. Cùng cách làm với phần gọi core thật: Server Action, lỗi theo ô, gom mọi lỗi
// một lần, mã lỗi `shipping.*`. Khoá API của hãng không bao giờ được điền lại.
import { useLocale, useTranslations } from "next-intl";
import {
  calendarAction,
  createCarrierAction,
  createMethodAction,
  createShipmentAction,
  holidayAction,
  type ImportState,
  importStatementAction,
  type QuoteState,
  quoteAction,
  replaceKeyAction,
  resolveAction,
  splitAction,
} from "@/app/(admin)/sales/shipping/actions";
import { ActionDialog, ActionForm } from "@/components/catalog/action-dialog";
import type { Option } from "@/components/catalog/forms";
import { CheckField, Field, SelectField, TextareaField } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import { formatWeight } from "@/lib/shipping";
import type { Quote } from "@/sample/shipping";

const value = (state: FormState, name: string, fallback = "") => state.values?.[name] ?? fallback;

/** "Tạo vận đơn tay": cho đơn bán tại quầy giao sau; đơn từ website tự tạo vận đơn khi xác nhận. */
export function ShipmentDialog({
  origins,
  methods,
  provinces,
}: {
  origins: Option[];
  methods: Option[];
  provinces: Option[];
}) {
  const t = useTranslations("shipping.manual");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn pri"
      action={createShipmentAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <Field
              label={t("order")}
              name="order_number"
              mono
              required
              defaultValue={value(state, "order_number")}
              hint={t("orderHint")}
              error={state.fields?.order_number}
            />
            <SelectField
              label={t("origin")}
              name="origin_org_id"
              defaultValue={value(state, "origin_org_id", origins[0]?.value ?? "")}
              options={origins}
              error={state.fields?.origin_org_id}
            />
          </div>
          <SelectField
            label={t("method")}
            name="method_id"
            defaultValue={value(state, "method_id", methods[0]?.value ?? "")}
            options={methods}
            error={state.fields?.method_id}
          />
          <div className="fld-row">
            <Field
              label={t("name")}
              name="recipient_name"
              required
              autoComplete="off"
              defaultValue={value(state, "recipient_name")}
              error={state.fields?.recipient_name}
            />
            <Field
              label={t("phone")}
              name="recipient_phone"
              type="tel"
              mono
              required
              autoComplete="off"
              defaultValue={value(state, "recipient_phone")}
              hint={t("phoneHint")}
              error={state.fields?.recipient_phone}
            />
          </div>
          <div className="fld-row">
            <SelectField
              label={t("province")}
              name="province_code"
              defaultValue={value(state, "province_code", provinces[0]?.value ?? "")}
              options={provinces}
              error={state.fields?.province_code}
            />
            <Field
              label={t("address")}
              name="address_line"
              required
              defaultValue={value(state, "address_line")}
              hint={t("addressHint")}
              error={state.fields?.address_line}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("weight")}
              name="weight_grams"
              mono
              required
              inputMode="numeric"
              defaultValue={value(state, "weight_grams")}
              error={state.fields?.weight_grams}
            />
            <Field
              money
              label={t("cod")}
              name="cod"
              mono
              inputMode="numeric"
              defaultValue={value(state, "cod")}
              hint={t("codHint")}
              error={state.fields?.cod}
            />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

/** "Tách kiện": chia món vào nhiều kiện trước khi đặt hãng; phí tính lại theo cân từng kiện. */
export function SplitDialog({ id, order }: { id: string; order: string }) {
  const t = useTranslations("shipping.split");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { order })}
      intro={t("intro")}
      action={splitAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <Field
          label={t("weights")}
          name="weights"
          mono
          required
          defaultValue={value(state, "weights")}
          hint={t("weightsHint")}
          error={state.fields?.weights}
        />
      )}
    </ActionDialog>
  );
}

/** "Thêm phương thức": phương thức mới tắt cho tới khi có bảng phí và được bật. */
export function MethodDialog({ orgs, carriers }: { orgs: Option[]; carriers: Option[] }) {
  const t = useTranslations("shipping.method");
  const kinds = useTranslations("shipping.kinds");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      action={createMethodAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <Field
              label={t("name")}
              name="name"
              required
              maxLength={60}
              defaultValue={value(state, "name")}
              error={state.fields?.name}
            />
            <Field
              label={t("code")}
              name="code"
              mono
              required
              defaultValue={value(state, "code")}
              hint={t("codeHint")}
              error={state.fields?.code}
            />
          </div>
          <div className="fld-row">
            <SelectField
              label={t("kind")}
              name="kind"
              defaultValue={value(state, "kind", "table_rate")}
              options={["table_rate", "carrier", "pickup"].map((k) => ({
                value: k,
                label: kinds(k),
              }))}
              error={state.fields?.kind}
            />
            <SelectField
              label={t("org")}
              name="org_id"
              defaultValue={value(state, "org_id", orgs[0]?.value ?? "")}
              options={orgs}
              hint={t("orgHint")}
              error={state.fields?.org_id}
            />
          </div>
          <div className="fld-row">
            <Field
              money
              label={t("free")}
              name="free_over"
              mono
              inputMode="numeric"
              defaultValue={value(state, "free_over")}
              error={state.fields?.free_over}
            />
            <Field
              label={t("days")}
              name="days"
              mono
              defaultValue={value(state, "days")}
              hint={t("daysHint")}
              error={state.fields?.days}
            />
          </div>
          <SelectField
            label={t("carrier")}
            name="carrier_account_id"
            defaultValue={value(state, "carrier_account_id")}
            options={[{ value: "", label: t("noCarrier") }, ...carriers]}
            hint={t("carrierHint")}
            error={state.fields?.carrier_account_id}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** "Tính thử phí": cùng hàm với báo giá cho đơn hàng; không ghi gì. */
export function QuoteForm({ stores, provinces }: { stores: Option[]; provinces: Option[] }) {
  const t = useTranslations("shipping.quote");
  return (
    <ActionForm<QuoteState>
      action={quoteAction}
      submit={t("submit")}
      footer={(state) => (state.result ? <QuoteResult quote={state.result} /> : null)}
    >
      {(state) => (
        <>
          <h3 className="h2">{t("title")}</h3>
          <div className="fld-row">
            <SelectField
              label={t("store")}
              name="org_id"
              defaultValue={value(state, "org_id", stores[0]?.value ?? "")}
              options={stores}
              error={state.fields?.org_id}
            />
            <SelectField
              label={t("province")}
              name="province_code"
              defaultValue={value(state, "province_code", provinces[0]?.value ?? "")}
              options={provinces}
              error={state.fields?.province_code}
            />
          </div>
          <div className="fld-row">
            <Field
              money
              label={t("value")}
              name="order_value"
              mono
              required
              inputMode="numeric"
              defaultValue={value(state, "order_value", "690000")}
              error={state.fields?.order_value}
            />
            <Field
              label={t("weight")}
              name="weight_grams"
              mono
              required
              inputMode="numeric"
              defaultValue={value(state, "weight_grams", "1400")}
              error={state.fields?.weight_grams}
            />
          </div>
        </>
      )}
    </ActionForm>
  );
}

function QuoteResult({ quote }: { quote: Quote }) {
  const t = useTranslations("shipping.quote");
  const reasons = useTranslations("shipping.unavailable");
  const locale = useLocale();
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(iso));
  return (
    <div className="pm-result" aria-live="polite">
      <h3 className="h2">{t("result")}</h3>
      <ul className="cat-lines">
        {quote.options.map((o) => (
          <li key={o.method_id} className="pm-line">
            <span className="cell2">
              <span>
                <b>{o.name}</b>
                {o.pickup_name ? ` · ${o.pickup_name}` : ""}
              </span>
              <span className="sub">
                {o.ready_at
                  ? t("ready", { time: time(o.ready_at), days: o.hold_days ?? 0 })
                  : o.eta_from && o.eta_to
                    ? o.eta_from === o.eta_to
                      ? t("etaOne", { day: day(o.eta_from) })
                      : t("eta", { from: day(o.eta_from), to: day(o.eta_to) })
                    : ""}
                {o.order_by ? ` · ${t("orderBy", { time: time(o.order_by) })}` : ""}
                {` · ${t("chargeable", { weight: formatWeight(o.chargeable_weight_grams, locale) })}`}
              </span>
              {o.free_shipping_applied ? <span className="sub">{t("free")}</span> : null}
              {o.free_shipping_missing ? (
                <span className="sub">
                  {t("freeMissing", { amount: money(o.free_shipping_missing.amount) })}
                </span>
              ) : null}
            </span>
            <b className="num">{money(o.amount.amount)}</b>
          </li>
        ))}
        {quote.unavailable.map((u) => (
          <li key={u.method_code} className="pm-line" data-code={u.reason_code}>
            <span className="cell2">
              <span>
                <b>{u.name}</b>
              </span>
              <span className="sub">
                {reasons.has(u.reason_code.replaceAll(".", "_"))
                  ? reasons(u.reason_code.replaceAll(".", "_"))
                  : u.reason_code}
              </span>
            </span>
            <span className="badge b-arch">
              <span className="dot" />
              {t("notAvailable")}
            </span>
          </li>
        ))}
      </ul>
      <p className="fhint">{t("estimate")}</p>
    </div>
  );
}

/** "Giờ chốt và ngày lấy hàng": thêm một phiên bản lịch có ngày hiệu lực. */
export function CalendarForm({
  cutoff,
  workdays,
  from,
}: {
  cutoff: string;
  workdays: string;
  from: string;
}) {
  const t = useTranslations("shipping.calendar");
  return (
    <ActionForm<FormState> action={calendarAction} submit={t("submit")} done={t("done")}>
      {(state) => (
        <>
          <h3 className="h2">{t("formTitle")}</h3>
          <Field
            label={t("cutoff")}
            name="cutoff"
            type="time"
            required
            defaultValue={value(state, "cutoff", cutoff)}
            hint={t("cutoffHint")}
            error={state.fields?.cutoff}
          />
          <SelectField
            label={t("workdays")}
            name="workdays"
            defaultValue={value(state, "workdays", workdays)}
            options={["mon_sat", "mon_fri", "all"].map((k) => ({
              value: k,
              label: t(`days.${k}`),
            }))}
            error={state.fields?.workdays}
          />
          <Field
            label={t("from")}
            name="effective_from"
            type="date"
            required
            min={from}
            defaultValue={value(state, "effective_from", from)}
            hint={t("fromHint")}
            error={state.fields?.effective_from}
          />
        </>
      )}
    </ActionForm>
  );
}

/** "Thêm ngày nghỉ": cả chuỗi hay một nút; ngày giao dự kiến của đơn mới tính lại. */
export function HolidayDialog({ orgs, label }: { orgs: Option[]; label?: string }) {
  const t = useTranslations("shipping.holiday");
  return (
    <ActionDialog<FormState>
      label={label ?? t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass={label ? "btn sm pri" : "btn sm"}
      action={holidayAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <Field
              label={t("from")}
              name="from"
              type="date"
              required
              defaultValue={value(state, "from")}
              error={state.fields?.from}
            />
            <Field
              label={t("to")}
              name="to"
              type="date"
              required
              defaultValue={value(state, "to")}
              error={state.fields?.to}
            />
          </div>
          <Field
            label={t("name")}
            name="name"
            required
            maxLength={80}
            defaultValue={value(state, "name")}
            hint={t("nameHint")}
            error={state.fields?.name}
          />
          <SelectField
            label={t("scope")}
            name="org_id"
            defaultValue={value(state, "org_id")}
            options={[{ value: "", label: t("allChain") }, ...orgs]}
            error={state.fields?.org_id}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** "Nhập bảng kê COD": tệp CSV hay chữ dán; nhập lại cùng mã và cùng nội dung không cộng hai lần. */
export function ImportDialog({ carriers }: { carriers: Option[] }) {
  const t = useTranslations("shipping.import");
  return (
    <ActionDialog<ImportState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={importStatementAction}
      submit={t("submit")}
      done={(state) => (state.replayed ? t("replayed") : t("done"))}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <SelectField
              label={t("carrier")}
              name="carrier_account_id"
              defaultValue={value(state, "carrier_account_id", carriers[0]?.value ?? "")}
              options={carriers}
              error={state.fields?.carrier_account_id}
            />
            <Field
              label={t("reference")}
              name="reference"
              mono
              required
              defaultValue={value(state, "reference")}
              hint={t("referenceHint")}
              error={state.fields?.reference}
            />
          </div>
          <Field label={t("file")} name="file" type="file" accept=".csv,text/csv" />
          <TextareaField
            label={t("csv")}
            name="csv"
            rows={4}
            className="inp area mono"
            defaultValue={value(state, "csv")}
            hint={t("csvHint")}
            error={state.fields?.csv}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** "Đóng kèm lý do": không đảo được; lý do lưu cùng người xử lý. */
export function ResolveDialog({ id, tracking }: { id: string; tracking: string }) {
  const t = useTranslations("shipping.resolve");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { tracking })}
      intro={t("intro")}
      action={resolveAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
      danger
    >
      {(state) => (
        <TextareaField
          label={t("note")}
          name="note"
          rows={3}
          required
          defaultValue={value(state, "note")}
          hint={t("noteHint")}
          error={state.fields?.note}
        />
      )}
    </ActionDialog>
  );
}

/** "Thay khoá API": khoá lưu ở kho secret, không hiện lại, không điền lại khi báo lỗi. */
export function KeyDialog({
  id,
  name,
  primary = false,
}: {
  id: string;
  name: string;
  primary?: boolean;
}) {
  const t = useTranslations("shipping.key");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { name })}
      intro={t("intro")}
      triggerClass={primary ? "btn sm pri" : "btn sm"}
      action={replaceKeyAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <Field
          label={t("key")}
          name="key"
          type="password"
          mono
          required
          autoComplete="off"
          hint={t("keyHint")}
          error={state.fields?.key}
        />
      )}
    </ActionDialog>
  );
}

/** "Thêm hãng": chỉ các hãng đã cài bộ nối. */
export function CarrierDialog({ codes, orgs }: { codes: Option[]; orgs: Option[] }) {
  const t = useTranslations("shipping.carrier");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={createCarrierAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <SelectField
              label={t("code")}
              name="carrier_code"
              defaultValue={value(state, "carrier_code", codes[0]?.value ?? "")}
              options={codes}
              error={state.fields?.carrier_code}
            />
            <SelectField
              label={t("org")}
              name="org_id"
              defaultValue={value(state, "org_id", orgs[0]?.value ?? "")}
              options={orgs}
              error={state.fields?.org_id}
            />
          </div>
          <Field
            label={t("name")}
            name="name"
            required
            defaultValue={value(state, "name")}
            error={state.fields?.name}
          />
          <Field
            label={t("key")}
            name="key"
            type="password"
            mono
            required
            autoComplete="off"
            hint={t("keyHint")}
            error={state.fields?.key}
          />
          <CheckField label={t("sandbox")} name="sandbox" hint={t("sandboxHint")} />
        </>
      )}
    </ActionDialog>
  );
}
