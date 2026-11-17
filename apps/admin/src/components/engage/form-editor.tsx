"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { FormEditorState } from "@/app/(admin)/marketing/forms/actions";
import { Icon, type IconName } from "@/components/shell/icon";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CheckField,
  Field,
  FormAlert,
  SelectField,
  TextareaField,
  useSubmit,
} from "@/components/ui/form";
import { pickText } from "@/lib/engage";
import {
  CHOICE_TYPES,
  emptyField,
  errorPlaces,
  FIELD_TYPES,
  type FieldDraft,
  type FieldType,
  fieldErrors,
  LENGTH_TYPES,
  moveItem,
  suggestFormKey,
  suggestKey,
} from "@/lib/forms";
import { useHydrated } from "@/lib/hydrated";
import { FormPreview, type PreviewLang } from "./form-preview";

type Action = (state: FormEditorState, formData: FormData) => Promise<FormEditorState>;

export interface FormInitial {
  id?: string;
  /** `updated_at` lúc mở trang (kiểm phiên bản khi lưu). */
  expect?: string;
  name: string;
  key: string;
  status: "open" | "closed";
  retentionDays: string;
  successVi: string;
  successEn: string;
  notifyEmails: string;
  replyTo: string;
  origins: string;
  ipLimit: string;
  emailLimit: string;
  fields: FieldDraft[];
}

type Card = FieldDraft & { uid: number };
type Tab = "fields" | "settings";
const TABS: Tab[] = ["fields", "settings"];

/** Biểu tượng của từng loại trường (nút thêm trường, đầu thẻ). */
const TYPE_ICON: Record<FieldType, IconName> = {
  text: "page",
  email: "mail",
  phone: "phone",
  textarea: "file",
  number: "percent",
  select: "down",
  radio: "check",
  checkbox: "task",
  date: "calendar",
  hidden: "lock",
  consent: "shield",
};

/**
 * Trình sửa một form, bố cục hai cột như các trình dựng form lớn (Typeform, Tally): trái là tên /
 * mã và hai tab — "Trường" (thẻ gập được, thêm theo loại, kéo thả hoặc nút ↑↓, bỏ) và "Cài đặt"
 * (nhận bài, thông báo, chống spam); phải là bản xem trước sống; thanh nút dính dưới đáy.
 *
 * Dữ liệu gửi đi không đổi: các ô cài đặt có `name` và gửi theo form (tab ẩn bằng `hidden`, ô vẫn
 * nằm trong form); trường giữ trong state và gửi một lần dạng JSON. Lỗi của core theo đường dẫn
 * (`fields[2].options`) mở đúng tab, mở đúng thẻ rồi đưa con trỏ tới ô sai đầu tiên. Gửi qua
 * `onSubmit` để React không đặt lại các ô khi core báo lỗi.
 */
export function FormEditor({
  action,
  initial,
  submit,
  cancelHref,
}: {
  action: Action;
  initial: FormInitial;
  submit: string;
  /** Nút Huỷ ở thanh dưới đáy quay về trang này. */
  cancelHref?: string;
}) {
  const t = useTranslations("engage.forms.editor");
  const common = useTranslations("form");
  const locale = useLocale();
  const hydrated = useHydrated();
  const form = useRef<HTMLFormElement>(null);
  const uid = useRef(initial.fields.length);
  const [cards, setCards] = useState<Card[]>(() =>
    initial.fields.map((field, index) => ({ ...field, uid: index })),
  );
  // Thẻ đang mở (theo `uid`); mặc định gập hết cho thấy cả danh sách một lượt.
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const [tab, setTab] = useState<Tab>("fields");
  const [name, setName] = useState(initial.name);
  const [key, setKey] = useState(initial.key);
  const [keyTouched, setKeyTouched] = useState(Boolean(initial.id));
  const [status, setStatus] = useState(initial.status);
  const [successVi, setSuccessVi] = useState(initial.successVi);
  const [successEn, setSuccessEn] = useState(initial.successEn);
  const [lang, setLang] = useState<PreviewLang>(locale === "en" ? "en" : "vi");
  const [adding, setAdding] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const focusCard = useRef<number | null>(null);
  const [state, send, pending] = useSubmit(action, () => {});
  const errors = state.fields ?? {};
  const places = errorPlaces(errors);

  // Core trả lỗi: mở tab và thẻ chứa ô sai ngay trong lần vẽ này (đặt state lúc vẽ khi `state` đổi,
  // cách React khuyên), để effect bên dưới tìm thấy ô sai đang hiện.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (places.fields > 0) setTab("fields");
    else if (places.settings > 0) setTab("settings");
    if (places.cards.length > 0) {
      setOpen((now) => {
        const next = new Set(now);
        for (const index of places.cards) {
          const card = cards[index];
          if (card) next.add(card.uid);
        }
        return next;
      });
    }
  }
  useEffect(() => {
    if (!state.fields) return;
    const invalid = form.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') ?? [];
    [...invalid].find((element) => !element.closest("[hidden]"))?.focus();
  }, [state]);
  // Thẻ vừa thêm: đưa con trỏ vào ô nhãn đầu tiên.
  useEffect(() => {
    if (focusCard.current === null) return;
    const id = focusCard.current;
    focusCard.current = null;
    const card = document.getElementById(`fb-card-${id}`);
    card?.scrollIntoView?.({ block: "nearest" });
    card?.querySelector<HTMLInputElement>("[data-first]")?.focus();
  });

  const update = (index: number, patch: Partial<FieldDraft>) =>
    setCards((all) => all.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  const toggle = (id: number) =>
    setOpen((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const add = (type: FieldType) => {
    uid.current += 1;
    const id = uid.current;
    setCards((all) => [...all, { ...emptyField(type), uid: id }]);
    setOpen((now) => new Set(now).add(id));
    setAdding(false);
    focusCard.current = id;
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("fields", JSON.stringify(cards.map(({ uid: _uid, ...draft }) => draft)));
    send(data);
  };
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length] ?? "fields";
    setTab(next);
    document.getElementById(`fb-tab-${next}`)?.focus();
  };
  const emailKeys = cards.filter((c) => c.type === "email" && c.key.trim()).map((c) => c.key);
  const required = cards.filter((c) => c.required).length;
  const tabErrors: Record<Tab, number> = { fields: places.fields, settings: places.settings };

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="fb">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial.expect ? <input type="hidden" name="expect" value={initial.expect} /> : null}

      <div className="fb-grid">
        <div className="fb-main">
          <section className="card padded eg-stack" aria-labelledby="fe-general">
            <h2 id="fe-general" className="h2">
              {t("general")}
            </h2>
            <div className="fld-row">
              <Field
                label={t("name")}
                name="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!keyTouched) setKey(suggestFormKey(event.target.value));
                }}
                placeholder={t("namePlaceholder")}
                error={errors.name}
                autoFocus={!initial.id}
              />
              <Field
                label={t("key")}
                name="key"
                mono
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                  setKeyTouched(true);
                }}
                hint={t("keyHint")}
                error={errors.key}
              />
            </div>
          </section>

          <div className="card fb-panel">
            <div
              className="fb-tabs"
              role="tablist"
              aria-label={t("tabsLabel")}
              onKeyDown={onTabKey}
            >
              {TABS.map((id) => (
                <button
                  key={id}
                  id={`fb-tab-${id}`}
                  type="button"
                  role="tab"
                  className={tab === id ? "fb-tab on" : "fb-tab"}
                  aria-selected={tab === id}
                  aria-controls={`fb-pane-${id}`}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setTab(id)}
                >
                  {id === "fields" ? t("fields", { count: cards.length }) : t("tabSettings")}
                  {tabErrors[id] > 0 ? (
                    <span className="fb-tab-err" title={t("hasErrors")}>
                      {tabErrors[id]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div
              id="fb-pane-fields"
              role="tabpanel"
              aria-labelledby="fb-tab-fields"
              className="fb-pane"
              hidden={tab !== "fields"}
            >
              <p className="fhint">{initial.id ? t("fieldsVersioned") : t("fieldsAbout")}</p>
              {errors.fields ? <p className="ferr">{errors.fields}</p> : null}
              {cards.length === 0 ? (
                <EmptyState icon="file" title={t("noFields")} className="fb-empty">
                  {t("noFieldsAbout")}
                </EmptyState>
              ) : (
                <ol className="fb-cards">
                  {cards.map((card, index) => (
                    <FieldCard
                      key={card.uid}
                      card={card}
                      index={index}
                      total={cards.length}
                      open={open.has(card.uid)}
                      dropping={dropAt === index}
                      errors={fieldErrors(errors, index)}
                      onToggle={() => toggle(card.uid)}
                      onChange={(patch) => update(index, patch)}
                      onMove={(by) => setCards((all) => moveItem(all, index, index + by))}
                      onRemove={() => setCards((all) => all.filter((_, i) => i !== index))}
                      drag={{
                        start: () => {
                          dragFrom.current = index;
                        },
                        over: () => {
                          if (dragFrom.current === null) return false;
                          if (dropAt !== index) setDropAt(index);
                          return true;
                        },
                        drop: () => {
                          const from = dragFrom.current;
                          dragFrom.current = null;
                          setDropAt(null);
                          if (from !== null) setCards((all) => moveItem(all, from, index));
                        },
                        end: () => {
                          dragFrom.current = null;
                          setDropAt(null);
                        },
                      }}
                    />
                  ))}
                </ol>
              )}
              <div className="fb-add">
                <button
                  type="button"
                  className={adding ? "btn" : "btn fb-add-btn"}
                  aria-expanded={adding}
                  aria-controls="fb-types"
                  onClick={() => setAdding((now) => !now)}
                >
                  <Icon name={adding ? "x" : "plus"} small />
                  {t("add")}
                </button>
                {adding ? (
                  <fieldset
                    id="fb-types"
                    className="fb-types"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setAdding(false);
                    }}
                  >
                    <legend className="lab">{t("addType")}</legend>
                    {FIELD_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="fb-type"
                        onClick={() => add(type)}
                      >
                        <Icon name={TYPE_ICON[type]} small />
                        <TypeName type={type} />
                      </button>
                    ))}
                  </fieldset>
                ) : null}
              </div>
            </div>

            <div
              id="fb-pane-settings"
              role="tabpanel"
              aria-labelledby="fb-tab-settings"
              className="fb-pane"
              hidden={tab !== "settings"}
            >
              <section className="fb-sec" aria-labelledby="fb-sec-submit">
                <h3 id="fb-sec-submit" className="fb-sec-h">
                  {t("secSubmit")}
                </h3>
                <div className="fld-row">
                  <SelectField
                    label={t("status")}
                    name="status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as "open" | "closed")}
                    options={[
                      { value: "open", label: t("statusOpen") },
                      { value: "closed", label: t("statusClosed") },
                    ]}
                    error={errors.status}
                  />
                  <Field
                    label={t("retention")}
                    name="retention_days"
                    inputMode="numeric"
                    mono
                    defaultValue={initial.retentionDays}
                    hint={t("retentionHint")}
                    error={errors.retention_days}
                  />
                </div>
                <div className="fld-row">
                  <TextareaField
                    label={t("successVi")}
                    name="success_vi"
                    value={successVi}
                    onChange={(event) => setSuccessVi(event.target.value)}
                    rows={2}
                    error={errors.success_message}
                  />
                  <TextareaField
                    label={t("successEn")}
                    name="success_en"
                    value={successEn}
                    onChange={(event) => setSuccessEn(event.target.value)}
                    rows={2}
                  />
                </div>
              </section>
              <section className="fb-sec" aria-labelledby="fb-sec-notify">
                <h3 id="fb-sec-notify" className="fb-sec-h">
                  {t("secNotify")}
                </h3>
                <TextareaField
                  label={t("notify")}
                  name="notify_emails"
                  defaultValue={initial.notifyEmails}
                  hint={t("notifyHint")}
                  className="inp area mono"
                  error={errors.notify_emails}
                />
                <SelectField
                  label={t("replyTo")}
                  name="reply_to_field"
                  defaultValue={initial.replyTo}
                  options={[
                    { value: "", label: t("replyToNone") },
                    ...emailKeys.map((value) => ({ value, label: value })),
                  ]}
                  hint={t("replyToHint")}
                  error={errors.reply_to_field}
                />
              </section>
              <section className="fb-sec" aria-labelledby="fb-sec-spam">
                <h3 id="fb-sec-spam" className="fb-sec-h">
                  {t("secSpam")}
                </h3>
                <TextareaField
                  label={t("origins")}
                  name="allowed_origins"
                  defaultValue={initial.origins}
                  hint={t("originsHint")}
                  className="inp area mono"
                  error={errors.allowed_origins}
                />
                <div className="fld-row">
                  <Field
                    label={t("ipLimit")}
                    name="ip_limit_per_hour"
                    inputMode="numeric"
                    mono
                    defaultValue={initial.ipLimit}
                    hint={t("limitHint")}
                    error={errors.ip_limit_per_hour}
                  />
                  <Field
                    label={t("emailLimit")}
                    name="email_limit_per_hour"
                    inputMode="numeric"
                    mono
                    defaultValue={initial.emailLimit}
                    hint={t("limitHint")}
                    error={errors.email_limit_per_hour}
                  />
                </div>
              </section>
            </div>
          </div>
        </div>

        <aside className="fb-side" aria-labelledby="fb-preview-h">
          <div className="fb-side-head">
            <h2 id="fb-preview-h" className="h2">
              {t("preview")}
            </h2>
            <fieldset className="fb-lang">
              <legend className="vh">{t("previewLang")}</legend>
              {(["vi", "en"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={lang === id ? "fb-lang-b on" : "fb-lang-b"}
                  aria-pressed={lang === id}
                  onClick={() => setLang(id)}
                >
                  {id === "vi" ? t("langVi") : t("langEn")}
                </button>
              ))}
            </fieldset>
          </div>
          <p className="fhint">{t("previewAbout")}</p>
          <FormPreview
            name={name}
            fields={cards}
            lang={lang}
            success={pickText({ vi: successVi, en: successEn }, lang)}
            closed={status === "closed"}
          />
        </aside>
      </div>

      <div className="fb-bar">
        <span className="fb-bar-sum">{t("summary", { count: cards.length, required })}</span>
        <FormAlert state={state} />
        <span className="eg-grow" />
        {cancelHref ? (
          <Link className="btn ghost" href={cancelHref}>
            {common("cancel")}
          </Link>
        ) : null}
        <button type="submit" className="btn pri" disabled={pending || !hydrated}>
          {submit}
        </button>
      </div>
    </form>
  );
}

function TypeName({ type }: { type: FieldType }) {
  const types = useTranslations("engage.forms.types");
  return <span>{types(type)}</span>;
}

interface Drag {
  start: () => void;
  /** Trả `true` khi đang kéo một thẻ (cho phép thả vào đây). */
  over: () => boolean;
  drop: () => void;
  end: () => void;
}

function FieldCard({
  card,
  index,
  total,
  open,
  dropping,
  errors,
  onToggle,
  onChange,
  onMove,
  onRemove,
  drag,
}: {
  card: Card;
  index: number;
  total: number;
  open: boolean;
  dropping: boolean;
  errors: Record<string, string>;
  onToggle: () => void;
  onChange: (patch: Partial<FieldDraft>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
  drag: Drag;
}) {
  const t = useTranslations("engage.forms.editor");
  const types = useTranslations("engage.forms.types");
  const n = index + 1;
  const title = card.labelVi || card.labelEn || card.key || t("untitled");
  const body = `fb-card-${card.uid}-body`;
  const hasErrors = Object.keys(errors).length > 0;
  const extraOpen = Boolean(
    errors.help || errors.placeholder || card.helpVi || card.helpEn || card.placeholderEn,
  );
  const suggest = () => {
    if (!card.key.trim()) onChange({ key: suggestKey(card.labelVi || card.labelEn) });
  };
  const classes = ["card", "fb-card"];
  if (open) classes.push("open");
  if (dropping) classes.push("drop");
  if (hasErrors) classes.push("bad");
  return (
    <li
      id={`fb-card-${card.uid}`}
      className={classes.join(" ")}
      aria-label={t("fieldN", { n, title })}
      onDragOver={(event) => {
        if (drag.over()) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        drag.drop();
      }}
    >
      <div className="fb-card-head">
        <span
          className="fb-grip"
          draggable
          title={t("dragHint")}
          aria-hidden="true"
          onDragStart={(event) => {
            // Firefox chỉ cho kéo khi có dữ liệu; ảnh kéo là cả thẻ chứ không chỉ tay nắm.
            event.dataTransfer?.setData("text/plain", String(n));
            const item = event.currentTarget.closest("li");
            if (item) event.dataTransfer?.setDragImage(item, 20, 20);
            drag.start();
          }}
          onDragEnd={drag.end}
        >
          <Icon name="menu" small />
        </span>
        <button
          type="button"
          className="fb-card-toggle"
          aria-expanded={open}
          aria-controls={body}
          onClick={onToggle}
        >
          <span className="eg-fieldno">{n}</span>
          <span className="fb-card-title">
            <b className="ell">{title}</b>
            <span className="fb-card-meta ell">
              <Icon name={TYPE_ICON[card.type]} small />
              {types(card.type)}
              {card.key ? <span className="mono">{card.key}</span> : null}
            </span>
          </span>
          {card.required ? <span className="tag">{t("requiredTag")}</span> : null}
          {hasErrors ? <span className="fb-card-err">{t("hasErrors")}</span> : null}
          <span className="fb-chev" aria-hidden="true">
            <Icon name="chev" small />
          </span>
        </button>
        <span className="fb-card-acts">
          <button
            type="button"
            className="btn ghost sm sq"
            aria-label={t("up", { n })}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn ghost sm sq"
            aria-label={t("down", { n })}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="btn ghost sm sq danger"
            aria-label={t("remove", { n })}
            onClick={onRemove}
          >
            <Icon name="trash" small />
          </button>
        </span>
      </div>
      {open ? (
        <div id={body} className="fb-card-body">
          {errors._ ? <p className="ferr">{errors._}</p> : null}
          <div className="fld-row">
            <Field
              label={card.type === "consent" ? t("consentVi") : t("labelVi")}
              name={`f${card.uid}-label-vi`}
              value={card.labelVi}
              onChange={(event) => onChange({ labelVi: event.target.value })}
              onBlur={suggest}
              error={errors.label}
              data-first
            />
            <Field
              label={card.type === "consent" ? t("consentEn") : t("labelEn")}
              name={`f${card.uid}-label-en`}
              value={card.labelEn}
              onChange={(event) => onChange({ labelEn: event.target.value })}
              onBlur={suggest}
            />
          </div>
          <div className="fld-row">
            <SelectField
              label={t("type")}
              name={`f${card.uid}-type`}
              value={card.type}
              onChange={(event) => onChange({ type: event.target.value as FieldType })}
              options={FIELD_TYPES.map((type) => ({ value: type, label: types(type) }))}
              error={errors.type}
            />
            <Field
              label={t("fieldKey")}
              name={`f${card.uid}-key`}
              mono
              value={card.key}
              onChange={(event) => onChange({ key: event.target.value })}
              onBlur={suggest}
              hint={t("fieldKeyHint")}
              error={errors.key}
            />
          </div>
          <CheckField
            label={card.type === "consent" ? t("consentRequired") : t("required")}
            name={`f${card.uid}-required`}
            checked={card.required}
            onChange={(event) => onChange({ required: event.target.checked })}
          />
          {CHOICE_TYPES.includes(card.type) ? (
            <TextareaField
              label={t("options")}
              name={`f${card.uid}-options`}
              value={card.options}
              onChange={(event) => onChange({ options: event.target.value })}
              hint={t("optionsHint")}
              className="inp area mono"
              rows={4}
              error={errors.options}
            />
          ) : null}
          {LENGTH_TYPES.includes(card.type) ? (
            <div className="fld-row">
              <Field
                label={t("minLength")}
                name={`f${card.uid}-minlen`}
                inputMode="numeric"
                value={card.minLength}
                onChange={(event) => onChange({ minLength: event.target.value })}
                error={errors.min_length}
              />
              <Field
                label={t("maxLength")}
                name={`f${card.uid}-maxlen`}
                inputMode="numeric"
                value={card.maxLength}
                onChange={(event) => onChange({ maxLength: event.target.value })}
                error={errors.max_length}
              />
            </div>
          ) : null}
          {card.type === "number" ? (
            <div className="fld-row">
              <Field
                label={t("min")}
                name={`f${card.uid}-min`}
                inputMode="decimal"
                value={card.min}
                onChange={(event) => onChange({ min: event.target.value })}
                error={errors.min}
              />
              <Field
                label={t("max")}
                name={`f${card.uid}-max`}
                inputMode="decimal"
                value={card.max}
                onChange={(event) => onChange({ max: event.target.value })}
                error={errors.max}
              />
            </div>
          ) : null}
          <details className="eg-more" open={extraOpen}>
            <summary>{t("more")}</summary>
            <div className="fld-row">
              <Field
                label={t("helpVi")}
                name={`f${card.uid}-help-vi`}
                value={card.helpVi}
                onChange={(event) => onChange({ helpVi: event.target.value })}
                error={errors.help}
              />
              <Field
                label={t("helpEn")}
                name={`f${card.uid}-help-en`}
                value={card.helpEn}
                onChange={(event) => onChange({ helpEn: event.target.value })}
              />
            </div>
            {card.type !== "consent" && card.type !== "hidden" ? (
              <div className="fld-row">
                <Field
                  label={t("placeholderVi")}
                  name={`f${card.uid}-ph-vi`}
                  value={card.placeholderVi}
                  onChange={(event) => onChange({ placeholderVi: event.target.value })}
                  error={errors.placeholder}
                />
                <Field
                  label={t("placeholderEn")}
                  name={`f${card.uid}-ph-en`}
                  value={card.placeholderEn}
                  onChange={(event) => onChange({ placeholderEn: event.target.value })}
                />
              </div>
            ) : null}
          </details>
        </div>
      ) : null}
    </li>
  );
}
