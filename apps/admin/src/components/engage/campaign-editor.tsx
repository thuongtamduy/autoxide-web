"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useDeferredValue, useId, useRef, useState } from "react";
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
import { useHydrated } from "@/lib/hydrated";
import { inboxSnippet, subjectAsSent, textPreviewDoc } from "@/lib/newsletter";

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

type Tab = "text" | "html";
type Device = "desktop" | "phone";

/**
 * Soạn chiến dịch theo đúng định dạng core nhận: bản chữ (bắt buộc, cho mọi hộp thư) và bản HTML
 * (tuỳ chọn, gửi nguyên văn) — core không nhận JSON khối như thân bài của Nội dung, nên giữ hai ô,
 * mỗi ô một tab. Bố cục như Mailchimp / Klaviyo: trái là các trường chia nhóm, phải là bản xem
 * trước hộp thư cập nhật khi gõ (máy tính / điện thoại), thanh nút dính ở đáy.
 *
 * Core không lọc HTML, nên HTML của người dùng chỉ hiện trong `<iframe sandbox srcdoc>` (không chạy
 * script, không gửi cookie); bản chữ được thoát hết ký tự HTML trước khi vào iframe. Chân thư (link
 * huỷ, địa chỉ người gửi) do core thêm; thư đúng như khi gửi xem ở trang chiến dịch sau khi lưu.
 */
export function CampaignEditor({
  action,
  lists,
  initial,
  submit,
  ads,
  sender,
  note,
  cancelHref,
}: {
  action: Action;
  lists: readonly { id: string; name: string; confirmed: number }[];
  initial: CampaignInitial;
  submit: string;
  /** Nhãn và giới hạn thư quảng cáo của máy chủ (`GET /newsletter/settings`). */
  ads: { label: string; maxPerDay: number };
  /** Tên người gửi hiện trong bản xem trước (tên của khách, `GET /kernel/tenant`). */
  sender: string;
  /** Một câu cạnh nút lưu: lưu xong thì sao. */
  note: string;
  /** Có thì thanh nút có "Huỷ" về trang này. */
  cancelHref?: string;
}) {
  const t = useTranslations("engage.newsletter.editor");
  const hydrated = useHydrated();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const tabsId = useId();
  const [listId, setListId] = useState(initial.listId);
  const [locale, setLocale] = useState(initial.locale);
  const [subject, setSubject] = useState(initial.subject);
  const [preheader, setPreheader] = useState(initial.preheader);
  const [advertising, setAdvertising] = useState(initial.advertising);
  const [text, setText] = useState(initial.bodyText);
  const [html, setHtml] = useState(initial.bodyHtml);
  const [tab, setTab] = useState<Tab>("text");
  const [device, setDevice] = useState<Device>("desktop");
  const [version, setVersion] = useState<Tab>("html");
  const [state, send, pending] = useSubmit(action, () => toast(t("saved")));
  // Lỗi nằm ở ô của tab đang ẩn thì mở tab đó ngay trong lần vẽ này, để `useFocusInvalid` đưa
  // con trỏ tới được ô sai (ô ẩn không nhận focus).
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.fields?.body_text) setTab("text");
    else if (state.fields?.body_html) setTab("html");
  }
  useFocusInvalid(form, state);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send(new FormData(event.currentTarget));
  };
  const errors = state.fields ?? {};

  // Xem trước theo giá trị trễ một nhịp: gõ nhanh không phải chờ iframe dựng lại.
  const shownText = useDeferredValue(text);
  const shownHtml = useDeferredValue(html);
  const hasHtml = shownHtml.trim() !== "";
  const showHtml = hasHtml && version === "html";
  const list = lists.find((l) => l.id === listId);
  const inboxSubject = subjectAsSent(subject, advertising, ads.label);
  const snippet = inboxSnippet(preheader, shownText);
  const initialLetter = (sender.trim()[0] ?? "?").toUpperCase();
  const empty = !hasHtml && shownText.trim() === "";

  const tabButton = (value: Tab, label: string, invalid: boolean) => (
    <button
      type="button"
      role="tab"
      id={`${tabsId}-${value}`}
      aria-selected={tab === value}
      aria-controls={`${tabsId}-${value}-panel`}
      className={tab === value ? "on" : undefined}
      onClick={() => setTab(value)}
    >
      {label}
      {invalid ? <span className="nlc-dot" aria-hidden="true" /> : null}
    </button>
  );

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="nlc">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial.expect ? <input type="hidden" name="expect" value={initial.expect} /> : null}
      <div className="nlc-grid">
        <div className="nlc-fields">
          <section className="card nlc-group" aria-labelledby={`${tabsId}-who`}>
            <h3 id={`${tabsId}-who`} className="nlc-group-h">
              {t("groupAudience")}
            </h3>
            <div className="fld-row">
              <SelectField
                label={t("list")}
                name="list_id"
                value={listId}
                onChange={(event) => setListId(event.target.value)}
                options={[
                  { value: "", label: t("chooseList") },
                  ...lists.map((l) => ({ value: l.id, label: t("listOption", l) })),
                ]}
                error={errors.list_id}
              />
              <SelectField
                label={t("locale")}
                name="locale"
                value={locale}
                onChange={(event) => setLocale(event.target.value === "en" ? "en" : "vi")}
                hint={t("localeHint")}
                options={[
                  { value: "vi", label: t("vi") },
                  { value: "en", label: t("en") },
                ]}
                error={errors.locale}
              />
            </div>
          </section>

          <section className="card nlc-group" aria-labelledby={`${tabsId}-env`}>
            <h3 id={`${tabsId}-env`} className="nlc-group-h">
              {t("groupMessage")}
            </h3>
            <Field
              label={t("subject")}
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={200}
              error={errors.subject}
              hint={
                advertising
                  ? t("subjectAsSent", { subject: subjectAsSent(subject, true, ads.label) })
                  : undefined
              }
            />
            <Field
              label={t("preheader")}
              name="preheader"
              value={preheader}
              onChange={(event) => setPreheader(event.target.value)}
              maxLength={200}
              hint={t("preheaderHint")}
              error={errors.preheader}
            />
            <CheckField
              label={t("advertising")}
              name="advertising"
              checked={advertising}
              onChange={(event) => setAdvertising(event.target.checked)}
              hint={t("advertisingHint", { label: ads.label, max: ads.maxPerDay })}
            />
            {advertising ? <p className="note warn">{t("advertisingLaw")}</p> : null}
          </section>

          <section className="card nlc-group" aria-labelledby={`${tabsId}-body`}>
            <div className="nlc-group-head">
              <h3 id={`${tabsId}-body`} className="nlc-group-h">
                {t("groupContent")}
              </h3>
              <div className="nlc-seg" role="tablist" aria-label={t("tabsLabel")}>
                {tabButton("text", t("tabCompose"), !!errors.body_text)}
                {tabButton("html", t("tabHtml"), !!errors.body_html)}
              </div>
            </div>
            {/* Cả hai ô luôn nằm trong form (tab ẩn vẫn được gửi), chỉ ẩn khỏi mắt. */}
            <div
              role="tabpanel"
              id={`${tabsId}-text-panel`}
              aria-labelledby={`${tabsId}-text`}
              hidden={tab !== "text"}
            >
              <TextareaField
                label={t("bodyText")}
                name="body_text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={14}
                hint={t("bodyTextHint")}
                error={errors.body_text}
              />
            </div>
            <div
              role="tabpanel"
              id={`${tabsId}-html-panel`}
              aria-labelledby={`${tabsId}-html`}
              hidden={tab !== "html"}
            >
              <TextareaField
                label={t("bodyHtml")}
                name="body_html"
                value={html}
                onChange={(event) => setHtml(event.target.value)}
                rows={14}
                spellCheck={false}
                className="inp area mono"
                hint={t("bodyHtmlHint")}
                error={errors.body_html}
              />
            </div>
            <p className="fhint">{t("footer")}</p>
          </section>
        </div>

        <aside className="nlc-side" aria-labelledby={`${tabsId}-pv`}>
          <div className="nlc-side-head">
            <h3 id={`${tabsId}-pv`} className="nlc-group-h">
              {t("preview")}
            </h3>
            <fieldset className="nlc-seg" aria-label={t("deviceLabel")}>
              {(["desktop", "phone"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  className={device === d ? "on" : undefined}
                  onClick={() => setDevice(d)}
                >
                  {t(d)}
                </button>
              ))}
            </fieldset>
          </div>
          <div
            className={`nlc-device ${device}`}
            data-testid="compose-preview"
            data-device={device}
          >
            <section className="nlc-inbox" aria-label={t("inboxLabel")}>
              <span className="nlc-avatar" aria-hidden="true">
                {initialLetter}
              </span>
              <div className="nlc-inbox-main">
                <div className="nlc-inbox-top">
                  <b className="nlc-ellipsis">{sender}</b>
                  <span className="nlc-time">{t("now")}</span>
                </div>
                <div className="nlc-inbox-subject nlc-ellipsis">
                  {inboxSubject || t("noSubject")}
                </div>
                <div className="nlc-inbox-snippet">{snippet}</div>
              </div>
            </section>
            <div className="nlc-mail">
              <div className="nlc-mail-subject">{inboxSubject || t("noSubject")}</div>
              <div className="nlc-mail-meta">
                <span className="nlc-avatar sm" aria-hidden="true">
                  {initialLetter}
                </span>
                <span className="nlc-mail-who">
                  <b className="nlc-ellipsis">{sender}</b>
                  <span className="nlc-ellipsis">
                    {t("to", { list: list?.name ?? t("noList") })}
                  </span>
                </span>
              </div>
              {hasHtml ? (
                <fieldset className="nlc-seg nlc-version" aria-label={t("versionLabel")}>
                  {(["html", "text"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={version === v}
                      className={version === v ? "on" : undefined}
                      onClick={() => setVersion(v)}
                    >
                      {v === "html" ? t("tabHtml") : t("bodyText")}
                    </button>
                  ))}
                </fieldset>
              ) : null}
              {empty ? (
                <p className="nlc-empty">{t("emptyBody")}</p>
              ) : (
                <iframe
                  className="nlc-frame"
                  sandbox=""
                  srcDoc={showHtml ? shownHtml : textPreviewDoc(shownText, locale)}
                  title={showHtml ? t("previewTitle") : t("previewTextTitle")}
                />
              )}
              <p className="nlc-mail-foot">{t("footerShort")}</p>
            </div>
          </div>
          <p className="fhint">{t("previewAbout")}</p>
        </aside>
      </div>

      <div className="nlc-bar">
        <FormAlert state={state} />
        <span className="nlc-bar-note">{note}</span>
        {cancelHref ? (
          <Link className="btn" href={cancelHref}>
            {t("cancel")}
          </Link>
        ) : null}
        <button type="submit" className="btn pri" disabled={pending || !hydrated}>
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
