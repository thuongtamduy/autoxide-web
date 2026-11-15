"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import {
  CheckField,
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  TextareaField,
  useFocusInvalid,
  useSubmit,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { isoToLocal, localToIso } from "@/lib/engage";
import type { FormState } from "@/lib/form";
import { DEFAULT_AD_LABEL } from "@/lib/newsletter";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export interface CampaignInitial {
  id?: string;
  expect?: string;
  listId: string;
  subject: string;
  preheader: string;
  locale: "en" | "vi";
  advertising: boolean;
  bodyText: string;
  bodyHtml: string;
}

/**
 * Soạn chiến dịch theo đúng định dạng core nhận: bản chữ (bắt buộc, cho mọi hộp thư) và bản HTML
 * (tuỳ chọn, gửi nguyên văn). Core không lọc HTML, nên bản xem trước nằm trong `<iframe sandbox>`
 * (không chạy script, không gửi cookie). Chân thư (link huỷ, địa chỉ người gửi) do core thêm.
 */
export function CampaignEditor({
  action,
  lists,
  initial,
  submit,
}: {
  action: Action;
  lists: readonly { id: string; name: string; confirmed: number }[];
  initial: CampaignInitial;
  submit: string;
}) {
  const t = useTranslations("engage.newsletter.editor");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [subject, setSubject] = useState(initial.subject);
  const [advertising, setAdvertising] = useState(initial.advertising);
  const [html, setHtml] = useState(initial.bodyHtml);
  const [preview, setPreview] = useState(false);
  const [state, send, pending] = useSubmit(action, () => toast(t("saved")));
  useFocusInvalid(form, state);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send(new FormData(event.currentTarget));
  };
  const errors = state.fields ?? {};
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="eg-editor">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial.expect ? <input type="hidden" name="expect" value={initial.expect} /> : null}
      <div className="card padded eg-stack">
        <div className="fld-row">
          <SelectField
            label={t("list")}
            name="list_id"
            defaultValue={initial.listId}
            options={[
              { value: "", label: t("chooseList") },
              ...lists.map((l) => ({ value: l.id, label: t("listOption", l) })),
            ]}
            error={errors.list_id}
          />
          <SelectField
            label={t("locale")}
            name="locale"
            defaultValue={initial.locale}
            hint={t("localeHint")}
            options={[
              { value: "vi", label: t("vi") },
              { value: "en", label: t("en") },
            ]}
            error={errors.locale}
          />
        </div>
        <Field
          label={t("subject")}
          name="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={200}
          error={errors.subject}
          hint={
            advertising
              ? t("subjectAsSent", { subject: `${DEFAULT_AD_LABEL} ${subject}`.trim() })
              : undefined
          }
        />
        <Field
          label={t("preheader")}
          name="preheader"
          defaultValue={state.values?.preheader ?? initial.preheader}
          maxLength={200}
          hint={t("preheaderHint")}
          error={errors.preheader}
        />
        <CheckField
          label={t("advertising")}
          name="advertising"
          checked={advertising}
          onChange={(event) => setAdvertising(event.target.checked)}
          hint={t("advertisingHint", { label: DEFAULT_AD_LABEL })}
        />
        {advertising ? <p className="note warn">{t("advertisingLaw")}</p> : null}
        <TextareaField
          label={t("bodyText")}
          name="body_text"
          defaultValue={state.values?.body_text ?? initial.bodyText}
          rows={12}
          hint={t("bodyTextHint")}
          error={errors.body_text}
        />
        <TextareaField
          label={t("bodyHtml")}
          name="body_html"
          value={html}
          onChange={(event) => setHtml(event.target.value)}
          rows={8}
          className="inp area mono"
          hint={t("bodyHtmlHint")}
          error={errors.body_html}
        />
        {html.trim() ? (
          <div className="eg-preview">
            <button type="button" className="btn sm" onClick={() => setPreview((on) => !on)}>
              {preview ? t("hidePreview") : t("showPreview")}
            </button>
            {preview ? (
              <iframe className="eg-frame" sandbox="" srcDoc={html} title={t("previewTitle")} />
            ) : null}
          </div>
        ) : null}
        <p className="fhint">{t("footer")}</p>
      </div>
      <div className="eg-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending}>
          {submit}
        </button>
      </div>
    </form>
  );
}

/** "Gửi thử": một địa chỉ nhận thư như người đăng ký sẽ nhận; không tính vào số liệu. */
export function TestDialog({ action, id }: { action: Action; id: string }) {
  const t = useTranslations("engage.newsletter.test");
  return (
    <Dialog label={t("open")} title={t("title")} intro={t("intro")}>
      {(close) => <TestForm action={action} id={id} close={close} />}
    </Dialog>
  );
}

function TestForm({ action, id, close }: { action: Action; id: string; close: () => void }) {
  const t = useTranslations("engage.newsletter.test");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit(action, () => {
    close();
    toast(t("done"));
  });
  useFocusInvalid(form, state);
  return (
    <form ref={form} action={run} noValidate className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <Field
        label={t("email")}
        name="email"
        type="email"
        mono
        autoComplete="email"
        defaultValue={state.values?.email ?? ""}
        error={state.fields?.email}
        autoFocus
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}

/** "Hẹn giờ": giờ theo múi của máy người xem, gửi cho core dạng ISO 8601 (UTC). */
export function ScheduleDialog({
  action,
  id,
  expect,
  current,
}: {
  action: Action;
  id: string;
  expect: string;
  current?: string | null | undefined;
}) {
  const t = useTranslations("engage.newsletter.schedule");
  return (
    <Dialog label={current ? t("again") : t("open")} title={t("title")} intro={t("intro")}>
      {(close) => (
        <ScheduleForm action={action} id={id} expect={expect} current={current} close={close} />
      )}
    </Dialog>
  );
}

function ScheduleForm({
  action,
  id,
  expect,
  current,
  close,
}: {
  action: Action;
  id: string;
  expect: string;
  current?: string | null | undefined;
  close: () => void;
}) {
  const t = useTranslations("engage.newsletter.schedule");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [local, setLocal] = useState(() => isoToLocal(current));
  const [state, run, pending] = useSubmit(action, () => {
    close();
    toast(t("done"));
  });
  useFocusInvalid(form, state);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("at", localToIso(local) ?? "");
    run(data);
  };
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expect" value={expect} />
      <Field
        label={t("at")}
        name="local_at"
        type="datetime-local"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        hint={t("atHint")}
        error={state.fields?.at}
        autoFocus
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}
