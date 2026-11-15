"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useRef } from "react";
import {
  addSuppression,
  type ImportState,
  importSubscribers,
  setSubscriberStatus,
  unsubscribeLists,
} from "@/app/(admin)/marketing/newsletter/actions";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogButtons,
  Field,
  FormAlert,
  TextareaField,
  useFocusInvalid,
  useSubmit,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { IMPORT_MAX } from "@/lib/newsletter";

/**
 * "Nhập danh sách": tệp CSV hoặc dán chữ, chọn danh sách nhận, ghi nguồn đồng ý (bắt buộc, core
 * lưu làm bằng chứng). Chỉ nhập người đã đồng ý nhận tin. Xong thì hiện kết quả của core.
 */
export function ImportDialog({ lists }: { lists: readonly { id: string; name: string }[] }) {
  const t = useTranslations("engage.newsletter.import");
  return (
    <Dialog label={t("open")} title={t("title")} intro={t("intro")}>
      {(close) => <ImportForm lists={lists} close={close} />}
    </Dialog>
  );
}

function ImportForm({
  lists,
  close,
}: {
  lists: readonly { id: string; name: string }[];
  close: () => void;
}) {
  const t = useTranslations("engage.newsletter.import");
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit<ImportState>(importSubscribers, () => {});
  useFocusInvalid(form, state);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run(new FormData(event.currentTarget));
  };
  if (state.report) {
    const r = state.report;
    return (
      <div className="dlg-form">
        <p role="status" className="note">
          {t("report", {
            created: r.created,
            subscribed: r.subscribed,
            unchanged: r.unchanged,
            kept: r.kept_unsubscribed,
          })}
        </p>
        {state.skipped && state.skipped.length > 0 ? (
          <p className="fhint">
            {t("skipped", { lines: state.skipped.map((s) => s.line).join(", ") })}
          </p>
        ) : null}
        <div className="dlg-acts">
          <button type="button" className="btn pri" onClick={close}>
            {t("close")}
          </button>
        </div>
      </div>
    );
  }
  const errors = state.fields ?? {};
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="dlg-form">
      <fieldset
        className="card checks"
        aria-describedby={errors.list_ids ? "imp-lists" : undefined}
      >
        <legend className="checks-head">
          <span className="check-group">{t("lists")}</span>
        </legend>
        {lists.map((list) => (
          <label key={list.id} className="check">
            <input
              type="checkbox"
              name="list_id"
              value={list.id}
              defaultChecked={lists.length === 1}
            />
            <span className="check-main">
              <span className="check-name">{list.name}</span>
            </span>
          </label>
        ))}
        {errors.list_ids ? (
          <span id="imp-lists" className="ferr">
            {errors.list_ids}
          </span>
        ) : null}
      </fieldset>
      <label className="fld">
        <span className="lab">{t("file")}</span>
        <input className="inp" type="file" name="file" accept=".csv,text/csv,text/plain" />
        <span className="fhint">{t("fileHint", { max: IMPORT_MAX })}</span>
      </label>
      <TextareaField
        label={t("paste")}
        name="csv"
        rows={5}
        className="inp area mono"
        defaultValue={state.values?.csv ?? ""}
        placeholder={"email,name\nlan@example.com,Lan"}
        error={errors.csv}
      />
      <Field
        label={t("source")}
        name="consent_source"
        defaultValue={state.values?.consent_source ?? ""}
        placeholder="signup-form-2026"
        hint={t("sourceHint")}
        error={errors.consent_source}
      />
      <TextareaField
        label={t("consentText")}
        name="consent_text"
        rows={2}
        defaultValue={state.values?.consent_text ?? ""}
        hint={t("consentTextHint")}
        error={errors.consent_text}
      />
      {state.skipped && state.skipped.length > 0 ? (
        <p className="fhint">
          {t("skipped", { lines: state.skipped.map((s) => s.line).join(", ") })}
        </p>
      ) : null}
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}

/** "Chặn": lý do (tuỳ chọn) lưu cùng người đăng ký. Bỏ chặn là một nút có Hoàn tác. */
export function BlockDialog({ id, expect }: { id: string; expect: string }) {
  const t = useTranslations("engage.newsletter.block");
  return (
    <Dialog
      label={t("open")}
      title={t("title")}
      triggerClass="btn sm danger"
      intro={
        <ul className="dlg-list">
          <li>{t("noMail")}</li>
          <li>{t("keepsSubs")}</li>
        </ul>
      }
    >
      {(close) => <BlockForm id={id} expect={expect} close={close} />}
    </Dialog>
  );
}

function BlockForm({ id, expect, close }: { id: string; expect: string; close: () => void }) {
  const t = useTranslations("engage.newsletter.block");
  const toast = useToast();
  const [state, run, pending] = useSubmit(setSubscriberStatus, () => {
    close();
    toast(t("done"));
  });
  return (
    <form action={run} className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expect" value={expect} />
      <input type="hidden" name="status" value="blocked" />
      <Field label={t("reason")} name="reason" maxLength={255} error={state.fields?.reason} />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} danger />
    </form>
  );
}

/** Huỷ đăng ký người này khỏi các danh sách đã chọn. */
export function UnsubscribeForm({
  id,
  expect,
  lists,
}: {
  id: string;
  expect: string;
  lists: readonly { id: string; name: string }[];
}) {
  const t = useTranslations("engage.newsletter.unsubscribe");
  const toast = useToast();
  const [state, run, pending] = useSubmit(unsubscribeLists, () => toast(t("done")));
  if (lists.length === 0) return null;
  return (
    <form action={run} className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expect" value={expect} />
      <fieldset className="card checks">
        <legend className="checks-head">
          <span className="check-group">{t("title")}</span>
        </legend>
        {lists.map((list) => (
          <label key={list.id} className="check">
            <input type="checkbox" name="list_id" value={list.id} />
            <span className="check-main">
              <span className="check-name">{list.name}</span>
            </span>
          </label>
        ))}
        {state.fields?.list_id ? <span className="ferr">{state.fields.list_id}</span> : null}
      </fieldset>
      <p className="fhint">{t("hint")}</p>
      <FormAlert state={state} />
      <div className="row-acts start">
        <button type="submit" className="btn" disabled={pending}>
          {t("submit")}
        </button>
      </div>
    </form>
  );
}

/** "Thêm địa chỉ" vào danh sách không gửi. */
export function SuppressDialog() {
  const t = useTranslations("engage.newsletter.suppress");
  return (
    <Dialog label={t("open")} title={t("title")} intro={t("intro")}>
      {(close) => <SuppressForm close={close} />}
    </Dialog>
  );
}

function SuppressForm({ close }: { close: () => void }) {
  const t = useTranslations("engage.newsletter.suppress");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit(addSuppression, () => {
    close();
    toast(t("done"));
  });
  useFocusInvalid(form, state);
  return (
    <form ref={form} action={run} noValidate className="dlg-form">
      <Field
        label={t("email")}
        name="email"
        type="email"
        mono
        defaultValue={state.values?.email ?? ""}
        error={state.fields?.email}
        autoFocus
      />
      <TextareaField
        label={t("note")}
        name="note"
        rows={2}
        maxLength={255}
        defaultValue={state.values?.note ?? ""}
        error={state.fields?.note}
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}
