"use client";

import { useRouter } from "next/navigation";
// Biểu mẫu của hai màn Đơn hàng và Cửa hàng (dữ liệu mẫu, W-006 / W-017, chờ module `orders` của bước
// 45). Cùng cách làm với phần gọi core thật: Server Action, lỗi theo ô, gom mọi lỗi một lần, mã lỗi
// `orders.*`. Thao tác về tiền (hoàn tiền) luôn qua hộp xác nhận nêu số tiền, nơi tiền về và "không
// hoàn tác được"; nút an toàn (Huỷ) nhận con trỏ khi hộp mở.
import { useLocale, useTranslations } from "next-intl";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  type AskState,
  approveProposalAction,
  askAction,
  type BulkState,
  bulkAcceptAction,
  countAction,
  manualPaymentAction,
  noteAction,
  receiveReturnAction,
  refundAction,
  rejectReturnAction,
  saveViewAction,
  undoBulkAction,
} from "@/app/(admin)/sales/orders/actions";
import {
  closeShiftAction,
  handOverAction,
  hideAction,
  openShiftAction,
  replyAction,
  storeReturnAction,
} from "@/app/(admin)/sales/stores/actions";
import { ActionDialog, ActionForm } from "@/components/catalog/action-dialog";
import type { Option } from "@/components/catalog/forms";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, SelectField, TextareaField, useSubmit } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import { CHANNELS, FLOWS, ORDER_STATUSES, parseDong } from "@/lib/orders";

const value = (state: FormState, name: string, fallback = "") => state.values?.[name] ?? fallback;
type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Mã tham chiếu chống làm hai lần khi bấm lại / gửi lại (idempotency), mỗi lần mở hộp một mã. */
function useReference(): string {
  const [ref] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );
  return ref;
}

// ---------------------------------------------------------------- Hộp xác nhận về tiền

/**
 * Hộp xác nhận thao tác về tiền, không hoàn tác được: bảng nêu số tiền, đơn, người mua, nơi tiền về,
 * permission cần; câu cảnh báo; nút Huỷ nhận con trỏ khi mở (lỡ bấm Enter cũng không chuyển tiền).
 */
export function MoneyConfirm({
  action,
  fields,
  label,
  title,
  rows,
  body,
  warn,
  submit,
  done,
  triggerClass = "btn sm pri",
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  title: string;
  rows: readonly (readonly [string, ReactNode])[];
  body?: string;
  warn: string;
  submit: string;
  done: string;
  triggerClass?: string;
}) {
  return (
    <Dialog label={label} title={title} triggerClass={triggerClass}>
      {(close) => (
        <MoneyConfirmForm
          action={action}
          fields={fields}
          rows={rows}
          body={body}
          warn={warn}
          submit={submit}
          done={done}
          close={close}
        />
      )}
    </Dialog>
  );
}

function MoneyConfirmForm({
  action,
  fields,
  rows,
  body,
  warn,
  submit,
  done,
  close,
}: {
  action: Action;
  fields: Record<string, string>;
  rows: readonly (readonly [string, ReactNode])[];
  body: string | undefined;
  warn: string;
  submit: string;
  done: string;
  close: () => void;
}) {
  const toast = useToast();
  const t = useTranslations("form");
  const cancel = useRef<HTMLButtonElement>(null);
  const [state, run, pending] = useSubmit(action, () => {
    close();
    toast(done);
  });
  useEffect(() => cancel.current?.focus(), []);
  return (
    <form action={run} className="dlg-form">
      {Object.entries(fields).map(([name, v]) => (
        <input key={name} type="hidden" name={name} value={v} />
      ))}
      {body ? <p className="fhint">{body}</p> : null}
      <dl className="ord-confirm">
        {rows.map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
      </dl>
      <p className="ord-warn" role="note">
        {warn}
      </p>
      <FormAlert state={state} />
      <div className="dlg-acts">
        <button ref={cancel} type="button" className="btn" onClick={close}>
          {t("cancel")}
        </button>
        <button type="submit" className="btn pri" disabled={pending}>
          {submit}
        </button>
      </div>
    </form>
  );
}

/**
 * Hoàn một phần hay toàn bộ: bước 1 nhập số tiền và lý do; bước 2 xác nhận nêu rõ số tiền, tiền về đâu,
 * không hoàn tác được. Mỗi lần mở hộp một mã tham chiếu: bấm lại không hoàn hai lần.
 */
export function RefundDialog({
  id,
  number,
  buyer,
  remaining,
  destination,
}: {
  id: string;
  number: string;
  buyer: string;
  /** Số còn hoàn được (đồng). */
  remaining: number;
  /** Câu "tiền về đâu" đã dịch. */
  destination: string;
}) {
  const t = useTranslations("orders.refund");
  return (
    <Dialog label={t("button")} title={t("title", { order: number })} triggerClass="btn sm">
      {(close) => (
        <RefundSteps
          id={id}
          number={number}
          buyer={buyer}
          remaining={remaining}
          destination={destination}
          close={close}
        />
      )}
    </Dialog>
  );
}

function RefundSteps({
  id,
  number,
  buyer,
  remaining,
  destination,
  close,
}: {
  id: string;
  number: string;
  buyer: string;
  remaining: number;
  destination: string;
  close: () => void;
}) {
  const t = useTranslations("orders.refund");
  const tf = useTranslations("form");
  const locale = useLocale();
  const toast = useToast();
  const reference = useReference();
  const [amount, setAmount] = useState(String(remaining));
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [local, setLocal] = useState<Record<string, string>>({});
  const cancel = useRef<HTMLButtonElement>(null);
  const parsed = parseDong(amount);
  const money = (n: number) => formatMoney(n, "VND", locale);
  const [state, run, pending] = useSubmit(refundAction, () => {
    close();
    toast(t("done", { amount: money(parsed ?? 0), order: number }));
  });
  useEffect(() => {
    if (step === "confirm") cancel.current?.focus();
  }, [step]);
  useEffect(() => {
    // Lỗi của máy chủ gắn với ô (số tiền vượt phần còn lại…): quay về bước nhập để sửa.
    if (state.fields) setStep("edit");
  }, [state]);
  const next = () => {
    const errors: Record<string, string> = {};
    if (parsed === null || parsed <= 0) errors.amount = t("amountInvalid");
    else if (parsed > remaining) errors.amount = t("amountTooBig", { max: money(remaining) });
    if (!reason.trim()) errors.reason = tf("required");
    setLocal(errors);
    if (Object.keys(errors).length === 0) setStep("confirm");
  };
  const errorOf = (name: string) => local[name] ?? state.fields?.[name];
  return (
    <form action={run} className="dlg-form" noValidate>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="amount" value={parsed === null ? amount : String(parsed)} />
      <input type="hidden" name="reason" value={reason} />
      {step === "edit" ? (
        <>
          <Field
            label={t("amount")}
            name="amount_text"
            mono
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={t("amountHint", { max: money(remaining) })}
            error={errorOf("amount")}
          />
          <TextareaField
            label={t("reason")}
            name="reason_text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={errorOf("reason")}
          />
          <FormAlert state={state.fields ? {} : state} />
          <div className="dlg-acts">
            <button type="button" className="btn" onClick={close}>
              {tf("cancel")}
            </button>
            <button type="button" className="btn pri" onClick={next}>
              {t("next")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="fhint">{t("body", { buyer })}</p>
          <dl className="ord-confirm">
            <dt>{t("order")}</dt>
            <dd className="mono">{number}</dd>
            <dt>{t("buyer")}</dt>
            <dd>{buyer}</dd>
            <dt>{t("amount")}</dt>
            <dd className="big">{money(parsed ?? 0)}</dd>
            <dt>{t("to")}</dt>
            <dd>{destination}</dd>
            <dt>{t("reason")}</dt>
            <dd>{reason}</dd>
            <dt>{t("permission")}</dt>
            <dd className="mono">orders.refund</dd>
          </dl>
          <p className="ord-warn" role="note">
            {t("warn")}
          </p>
          <FormAlert state={state} />
          <div className="dlg-acts">
            <button ref={cancel} type="button" className="btn" onClick={() => setStep("edit")}>
              {t("back")}
            </button>
            <button type="submit" className="btn pri" disabled={pending}>
              {t("submit", { amount: money(parsed ?? 0) })}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

/** Duyệt đề xuất hoàn tiền của agent (không hoàn tác được). */
export function ApproveProposal(props: {
  returnId: string;
  rows: readonly (readonly [string, ReactNode])[];
  amount: string;
  order: string;
  body: string;
}) {
  const t = useTranslations("orders.proposal");
  return (
    <MoneyConfirm
      action={approveProposalAction}
      fields={{ id: props.returnId }}
      label={t("approve")}
      title={t("confirmTitle", { amount: props.amount, order: props.order })}
      rows={props.rows}
      body={props.body}
      warn={t("warn")}
      submit={t("confirmSubmit", { amount: props.amount })}
      done={t("approved", { amount: props.amount, order: props.order })}
    />
  );
}

// ---------------------------------------------------------------- Danh sách đơn

/** Lưu bộ lọc đang dùng thành view (của tôi, hoặc chia sẻ cho cả nút). */
export function SaveViewDialog({ query }: { query: string }) {
  const t = useTranslations("orders.views");
  return (
    <ActionDialog<FormState>
      label={t("save")}
      title={t("saveTitle")}
      intro={t("saveIntro")}
      action={saveViewAction}
      hidden={{ query }}
      submit={t("saveSubmit")}
      done={t("saved")}
    >
      {(state) => (
        <>
          <Field
            label={t("name")}
            name="name"
            required
            maxLength={40}
            defaultValue={value(state, "name")}
            error={state.fields?.name}
          />
          <SelectField
            label={t("scope")}
            name="scope"
            defaultValue={value(state, "scope", "personal")}
            options={[
              { value: "personal", label: t("scopes.personal") },
              { value: "node", label: t("scopes.node") },
            ]}
            error={state.fields?.scope}
          />
        </>
      )}
    </ActionDialog>
  );
}

/**
 * Bảng đơn có ô chọn: đếm ô đã chọn, hiện thanh thao tác hàng loạt (xác nhận có Hoàn tác, in phiếu giao,
 * chọn cả mọi đơn khớp bộ lọc). Bảng do máy chủ dựng; ở đây chỉ nghe sự kiện đổi của ô chọn.
 */
export function BulkForm({
  query,
  matching,
  children,
}: {
  query: string;
  matching: number;
  children: ReactNode;
}) {
  const t = useTranslations("orders.bulk");
  const toast = useToast();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(0);
  const [pageAll, setPageAll] = useState(false);
  const [all, setAll] = useState(false);
  const [pending, start] = useTransition();
  const boxes = () => [
    ...(form.current?.querySelectorAll<HTMLInputElement>("input[name=ids]") ?? []),
  ];
  const sync = () => {
    const list = boxes();
    for (const box of list) {
      const row = box.closest("tr");
      if (row) row.toggleAttribute("data-checked", box.checked);
    }
    const n = list.filter((b) => b.checked).length;
    setCount(n);
    setPageAll(n > 0 && n === list.length);
    if (n < list.length) setAll(false);
    const head = form.current?.querySelector<HTMLInputElement>("input[data-all]");
    if (head) {
      head.checked = n > 0 && n === list.length;
      head.indeterminate = n > 0 && n < list.length;
    }
  };
  const clear = () => {
    for (const b of boxes()) b.checked = false;
    setAll(false);
    sync();
  };
  const ids = () =>
    boxes()
      .filter((b) => b.checked)
      .map((b) => b.value);
  const accept = () =>
    start(async () => {
      const data = new FormData();
      if (all) {
        data.set("all", "1");
        data.set("query", query);
      } else for (const id of ids()) data.append("ids", id);
      const out: BulkState = await bulkAcceptAction({}, data);
      if (out.error) {
        toast(out.error);
        return;
      }
      const changed = out.changed ?? [];
      clear();
      if (changed.length === 0) {
        toast(t("noneAwaiting"));
        return;
      }
      toast(t("accepted", { count: changed.length, skipped: out.skipped ?? 0 }), {
        label: t("undo"),
        run: async () => {
          const n = await undoBulkAction(changed);
          toast(t("undone", { count: n }));
        },
      });
    });
  const print = () => {
    const target = all
      ? `/sales/orders/print?${query}${query ? "&" : ""}all=1`
      : `/sales/orders/print?ids=${ids().join(",")}`;
    router.push(target);
  };
  return (
    <form
      ref={form}
      onChange={(e) => {
        const target = e.target as unknown as HTMLInputElement;
        if (target.dataset.all !== undefined) {
          for (const b of boxes()) b.checked = target.checked;
        }
        sync();
      }}
      onSubmit={(e) => e.preventDefault()}
    >
      {children}
      {count > 0 ? (
        <section className="ord-bulk" aria-label={t("label")}>
          <span>{all ? t("allSelected", { count: matching }) : t("selected", { count })}</span>
          {pageAll && !all && matching > count ? (
            <button type="button" className="linkish" onClick={() => setAll(true)}>
              {t("selectAll", { count: matching })}
            </button>
          ) : null}
          <button type="button" className="btn sm pri" disabled={pending} onClick={accept}>
            {t("accept")}
          </button>
          <button type="button" className="btn sm" onClick={print}>
            {t("print")}
          </button>
          <button type="button" className="linkish" onClick={clear}>
            {t("clear")}
          </button>
        </section>
      ) : null}
    </form>
  );
}

const STATUS_GROUPS = (t: (key: string) => string) => [
  { value: "awaiting_acceptance,confirmed,preparing", label: t("groups.pending") },
  { value: "confirmed,preparing,shipping,delivery_failed", label: t("groups.undelivered") },
  { value: "delivered,completed", label: t("groups.delivered") },
  ...ORDER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
];

/**
 * "Hỏi bằng lời": gõ một câu, máy hiểu thành bộ lọc (chip sửa được, bỏ được), bấm Áp dụng mới đổi danh
 * sách. Chỉ dùng được khi core báo AI bật; AI chỉ đề xuất bộ lọc, không làm gì khác.
 */
export function AskFilter({ enabled, orgs }: { enabled: boolean; orgs: Option[] }) {
  const t = useTranslations("orders");
  const router = useRouter();
  const [state, run, pending] = useActionState<AskState, FormData>(askAction, {});
  const [params, setParams] = useState<URLSearchParams | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [counting, start] = useTransition();
  const lastDone = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state.done && state.done !== lastDone.current) {
      lastDone.current = state.done;
      setParams(new URLSearchParams(state.query ?? ""));
      setCount(state.count ?? 0);
    }
  }, [state]);
  const groups = useMemo(() => STATUS_GROUPS((k) => t(k)), [t]);
  const edit = (key: string, v: string | null) => {
    if (!params) return;
    const next = new URLSearchParams(params);
    if (v) next.set(key, v);
    else next.delete(key);
    setParams(next);
    start(async () => setCount(await countAction(next.toString())));
  };
  const options: Record<string, Option[]> = {
    status: groups.some((g) => g.value === params?.get("status"))
      ? groups
      : [
          {
            value: params?.get("status") ?? "",
            label: labelOfStatus(params?.get("status") ?? "", t),
          },
          ...groups,
        ],
    channel: CHANNELS.map((c) => ({ value: c, label: t(`channel.${c}`) })),
    org: orgs,
    flow: FLOWS.map((f) => ({ value: f, label: t(`flow.${f}`) })),
  };
  const keys = params ? [...params.keys()] : [];
  return (
    <section className="card padded ord-ask" aria-labelledby="ask-h">
      <h2 id="ask-h" className="h2">
        {t("ask.title")}
      </h2>
      <form action={run} className="ord-ask-row" noValidate>
        <Field
          label={t("ask.label")}
          name="text"
          placeholder={t("ask.placeholder")}
          disabled={!enabled}
          maxLength={200}
          error={state.fields?.text}
          hint={enabled ? t("ask.hint") : t("ask.off")}
        />
        <button type="submit" className="btn" disabled={!enabled || pending}>
          {t("ask.submit")}
        </button>
      </form>
      <FormAlert state={state.fields ? {} : state} />
      {params ? (
        <div className="pm-result" aria-live="polite">
          <p>{t("ask.understood", { text: state.asked ?? "" })}</p>
          {keys.length === 0 ? <p className="fhint">{t("ask.none")}</p> : null}
          <ul className="ord-parsed">
            {keys.map((key) => (
              <li key={key}>
                <span className="muted">{t(`ask.params.${key}`)}</span>
                {key === "from" ? (
                  <input
                    type="date"
                    aria-label={t("ask.params.from")}
                    value={params.get("from") ?? ""}
                    onChange={(e) => edit("from", e.target.value || null)}
                  />
                ) : (
                  <select
                    aria-label={t(`ask.params.${key}`)}
                    value={params.get(key) ?? ""}
                    onChange={(e) => edit(key, e.target.value)}
                  >
                    {(options[key] ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={t("ask.remove", { name: t(`ask.params.${key}`) })}
                  onClick={() => edit(key, null)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {state.unknown ? (
            <p className="fhint">{t("ask.unknown", { text: state.unknown })}</p>
          ) : null}
          <p className="fhint">{t("ask.note")}</p>
          <div className="row-acts">
            <button type="button" className="btn" onClick={() => setParams(null)}>
              {t("ask.dismiss")}
            </button>
            <button
              type="button"
              className="btn pri"
              disabled={counting}
              onClick={() => {
                const q = params.toString();
                setParams(null);
                router.push(q ? `/sales/orders?${q}` : "/sales/orders");
              }}
            >
              {t("ask.apply", { count: count ?? 0 })}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function labelOfStatus(value: string, t: (key: string) => string): string {
  return value
    .split(",")
    .filter(Boolean)
    .map((s) => t(`status.${s}`))
    .join(", ");
}

// ---------------------------------------------------------------- Chi tiết đơn

export function NoteForm({ id }: { id: string }) {
  const t = useTranslations("orders.notes");
  return (
    <ActionForm<FormState>
      action={noteAction}
      hidden={{ id }}
      submit={t("add")}
      done={t("added")}
      className="dlg-form"
    >
      {(state) => (
        <TextareaField
          label={t("label")}
          name="text"
          hint={t("hint")}
          maxLength={1000}
          error={state.fields?.text}
        />
      )}
    </ActionForm>
  );
}

export function ManualPaymentDialog({ id, total }: { id: string; total: string }) {
  const t = useTranslations("orders.manual");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro", { total })}
      action={manualPaymentAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <Field
          label={t("reference")}
          name="reference"
          mono
          required
          defaultValue={value(state, "reference")}
          hint={t("referenceHint")}
          error={state.fields?.reference}
        />
      )}
    </ActionDialog>
  );
}

// ---------------------------------------------------------------- Đổi trả

export function RejectReturnDialog({ id, number }: { id: string; number: string }) {
  const t = useTranslations("orders.returns");
  return (
    <ActionDialog<FormState>
      label={t("reject")}
      title={t("rejectTitle", { number })}
      intro={t("rejectIntro")}
      triggerClass="btn sm danger"
      action={rejectReturnAction}
      hidden={{ id }}
      submit={t("rejectSubmit")}
      done={t("rejected")}
      danger
    >
      {(state) => (
        <>
          <SelectField
            label={t("rejectReason")}
            name="code"
            defaultValue={value(state, "code", "window_closed")}
            options={["window_closed", "used", "not_covered"].map((c) => ({
              value: c,
              label: t(`rejectReasons.${c}`),
            }))}
            error={state.fields?.code}
          />
          <TextareaField
            label={t("rejectNote")}
            name="note"
            defaultValue={value(state, "note")}
            error={state.fields?.note}
          />
        </>
      )}
    </ActionDialog>
  );
}

export function ReceiveReturnDialog({
  id,
  number,
  inStore,
}: {
  id: string;
  number: string;
  inStore: boolean;
}) {
  const t = useTranslations("orders.returns");
  return (
    <ActionDialog<FormState>
      label={inStore ? t("receiveInStore") : t("receive")}
      title={t("receiveTitle", { number })}
      intro={t("receiveIntro")}
      triggerClass="btn sm pri"
      action={receiveReturnAction}
      hidden={{ id }}
      submit={t("receiveSubmit")}
      done={t("received")}
    >
      {(state) => (
        <SelectField
          label={t("condition")}
          name="condition"
          defaultValue={value(state, "condition", "restock")}
          options={[
            { value: "restock", label: t("conditions.restock") },
            { value: "damaged", label: t("conditions.damaged") },
          ]}
          error={state.fields?.condition}
        />
      )}
    </ActionDialog>
  );
}

// ---------------------------------------------------------------- Cửa hàng

export function HandoverDialog({
  id,
  number,
  proxy,
}: {
  id: string;
  number: string;
  proxy: string | null;
}) {
  const t = useTranslations("stores.pickup");
  return (
    <ActionDialog<FormState>
      label={t("handOver")}
      title={t("handOverTitle", { number })}
      intro={t("handOverIntro")}
      triggerClass="btn sm pri"
      action={handOverAction}
      hidden={{ id }}
      submit={t("handOverSubmit")}
      done={t("handedOver")}
    >
      {(state) => (
        <>
          <SelectField
            label={t("who")}
            name="who"
            defaultValue={value(state, "who", "buyer")}
            options={[
              { value: "buyer", label: t("whoBuyer") },
              { value: "proxy", label: t("whoProxy") },
            ]}
            error={state.fields?.who}
          />
          <Field
            label={t("code")}
            name="code"
            mono
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            required
            hint={t("codeHint")}
            error={state.fields?.code}
          />
          <Field
            label={t("proxyName")}
            name="proxy_name"
            defaultValue={value(state, "proxy_name")}
            hint={proxy ? t("proxyHint") : t("noProxy")}
            error={state.fields?.proxy_name}
          />
        </>
      )}
    </ActionDialog>
  );
}

export function OpenShiftDialog({ stores }: { stores: Option[] }) {
  const t = useTranslations("stores.shifts");
  return (
    <ActionDialog<FormState>
      label={t("open")}
      title={t("openTitle")}
      intro={t("openIntro")}
      triggerClass="btn pri"
      action={openShiftAction}
      submit={t("openSubmit")}
      done={t("opened")}
    >
      {(state) => (
        <>
          <SelectField
            label={t("store")}
            name="org_id"
            defaultValue={value(state, "org_id", stores[0]?.value ?? "")}
            options={stores}
            error={state.fields?.org_id}
          />
          <Field
            label={t("register")}
            name="register"
            required
            defaultValue={value(state, "register", "Quầy 2")}
            error={state.fields?.register}
          />
          <Field
            money
            label={t("opening")}
            name="opening"
            mono
            inputMode="numeric"
            required
            placeholder="2000000"
            defaultValue={value(state, "opening")}
            error={state.fields?.opening}
          />
        </>
      )}
    </ActionDialog>
  );
}

export function CloseShiftDialog({ id, expected }: { id: string; expected: string }) {
  const t = useTranslations("stores.shifts");
  return (
    <ActionDialog<FormState>
      label={t("close")}
      title={t("closeTitle")}
      intro={t("closeIntro", { expected })}
      triggerClass="btn sm pri"
      action={closeShiftAction}
      hidden={{ id }}
      submit={t("closeSubmit")}
      done={t("closed")}
    >
      {(state) => (
        <>
          <Field
            money
            label={t("counted")}
            name="counted"
            mono
            inputMode="numeric"
            required
            defaultValue={value(state, "counted")}
            error={state.fields?.counted}
          />
          <TextareaField
            label={t("reason")}
            name="reason"
            hint={t("reasonHint")}
            defaultValue={value(state, "reason")}
            error={state.fields?.reason}
          />
        </>
      )}
    </ActionDialog>
  );
}

export function StoreReturnDialog() {
  const t = useTranslations("stores.returns");
  const tr = useTranslations("orders.returns");
  return (
    <ActionDialog<FormState>
      label={t("new")}
      title={t("newTitle")}
      intro={t("newIntro")}
      triggerClass="btn pri"
      action={storeReturnAction}
      submit={t("newSubmit")}
      done={t("created")}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <Field
              label={t("order")}
              name="order_number"
              mono
              required
              placeholder="BM-2611-0398"
              defaultValue={value(state, "order_number")}
              error={state.fields?.order_number}
            />
            <Field
              label={t("sku")}
              name="sku"
              mono
              required
              placeholder="TG35"
              defaultValue={value(state, "sku")}
              error={state.fields?.sku}
            />
            <Field
              label={t("quantity")}
              name="quantity"
              inputMode="numeric"
              required
              defaultValue={value(state, "quantity", "1")}
              error={state.fields?.quantity}
            />
          </div>
          <SelectField
            label={t("reason")}
            name="reason_code"
            defaultValue={value(state, "reason_code", "defective")}
            options={[
              "damaged_on_arrival",
              "wrong_item",
              "defective",
              "not_as_described",
              "changed_mind",
              "near_expiry",
            ].map((r) => ({ value: r, label: tr(`reasons.${r}`) }))}
            error={state.fields?.reason_code}
          />
          <div className="fld-row">
            <SelectField
              label={tr("condition")}
              name="condition"
              defaultValue={value(state, "condition", "restock")}
              options={[
                { value: "restock", label: tr("conditions.restock") },
                { value: "damaged", label: tr("conditions.damaged") },
              ]}
              error={state.fields?.condition}
            />
            <SelectField
              label={t("resolution")}
              name="resolution"
              defaultValue={value(state, "resolution", "refund")}
              options={[
                { value: "refund", label: tr("resolutions.refund") },
                { value: "exchange", label: tr("resolutions.exchange") },
              ]}
              error={state.fields?.resolution}
            />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

export function ReplyDialog({ id }: { id: string }) {
  const t = useTranslations("stores.reviews");
  return (
    <ActionDialog<FormState>
      label={t("reply")}
      title={t("replyTitle")}
      intro={t("replyIntro")}
      triggerClass="btn sm pri"
      action={replyAction}
      hidden={{ id }}
      submit={t("replySubmit")}
      done={t("replied")}
    >
      {(state) => (
        <TextareaField
          label={t("replyText")}
          name="text"
          maxLength={1000}
          defaultValue={value(state, "text")}
          error={state.fields?.text}
        />
      )}
    </ActionDialog>
  );
}

export function HideDialog({ id }: { id: string }) {
  const t = useTranslations("stores.reviews");
  return (
    <ActionDialog<FormState>
      label={t("hide")}
      title={t("hideTitle")}
      intro={t("hideIntro")}
      triggerClass="btn sm danger"
      action={hideAction}
      hidden={{ id }}
      submit={t("hideSubmit")}
      done={t("hidden")}
      danger
    >
      {(state) => (
        <>
          <SelectField
            label={t("hideReason")}
            name="reason"
            defaultValue={value(state, "reason", "contact_info")}
            options={["contact_info", "advertising", "abusive", "off_topic"].map((r) => ({
              value: r,
              label: t(`reasons.${r}`),
            }))}
            error={state.fields?.reason}
          />
          <TextareaField
            label={t("hideNote")}
            name="note"
            defaultValue={value(state, "note")}
            error={state.fields?.note}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** Nút in của bản xem trước (hoá đơn, phiếu giao). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn pri no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
