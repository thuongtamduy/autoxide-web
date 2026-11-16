"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import type { FormEditorState } from "@/app/(admin)/marketing/forms/actions";
import {
  CheckField,
  Field,
  FormAlert,
  SelectField,
  TextareaField,
  useFocusInvalid,
  useSubmit,
} from "@/components/ui/form";
import {
  CHOICE_TYPES,
  emptyField,
  FIELD_TYPES,
  type FieldDraft,
  type FieldType,
  fieldErrors,
  LENGTH_TYPES,
  suggestFormKey,
  suggestKey,
} from "@/lib/forms";
import { useHydrated } from "@/lib/hydrated";

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

/**
 * Trình sửa một form: thông tin chung, danh sách trường (thêm, sửa, đổi chỗ, bỏ), thông báo và
 * chống spam. Trường giữ trong state và gửi một lần dưới dạng JSON; lỗi của core theo đường dẫn
 * (`fields[2].options`) hiện ngay dưới ô của đúng thẻ. Gửi qua `onSubmit` để React không đặt lại
 * các ô khi core báo lỗi.
 */
export function FormEditor({
  action,
  initial,
  submit,
}: {
  action: Action;
  initial: FormInitial;
  submit: string;
}) {
  const t = useTranslations("engage.forms.editor");
  const hydrated = useHydrated();
  const types = useTranslations("engage.forms.types");
  const form = useRef<HTMLFormElement>(null);
  const uid = useRef(initial.fields.length);
  const [cards, setCards] = useState<Card[]>(() =>
    initial.fields.map((field, index) => ({ ...field, uid: index })),
  );
  const [name, setName] = useState(initial.name);
  const [key, setKey] = useState(initial.key);
  const [keyTouched, setKeyTouched] = useState(Boolean(initial.id));
  const [adding, setAdding] = useState<FieldType>("text");
  const [state, send, pending] = useSubmit(action, () => {});
  useFocusInvalid(form, state);

  const update = (index: number, patch: Partial<FieldDraft>) =>
    setCards((all) => all.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  const move = (index: number, by: number) =>
    setCards((all) => {
      const next = [...all];
      const [card] = next.splice(index, 1);
      if (card) next.splice(Math.max(0, Math.min(next.length, index + by)), 0, card);
      return next;
    });
  const add = () => {
    uid.current += 1;
    setCards((all) => [...all, { ...emptyField(adding), uid: uid.current }]);
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("fields", JSON.stringify(cards.map(({ uid: _uid, ...draft }) => draft)));
    send(data);
  };
  const emailKeys = cards.filter((c) => c.type === "email" && c.key.trim()).map((c) => c.key);
  const errors = state.fields ?? {};

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="eg-editor">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial.expect ? <input type="hidden" name="expect" value={initial.expect} /> : null}

      <section className="block" aria-labelledby="fe-general">
        <h2 id="fe-general" className="h2">
          {t("general")}
        </h2>
        <div className="card padded eg-stack">
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
          <div className="fld-row">
            <SelectField
              label={t("status")}
              name="status"
              defaultValue={initial.status}
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
              defaultValue={initial.successVi}
              rows={2}
              error={errors.success_message}
            />
            <TextareaField
              label={t("successEn")}
              name="success_en"
              defaultValue={initial.successEn}
              rows={2}
            />
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="fe-fields">
        <div className="block-head">
          <h2 id="fe-fields" className="h2">
            {t("fields", { count: cards.length })}
          </h2>
        </div>
        <p className="fhint">{initial.id ? t("fieldsVersioned") : t("fieldsAbout")}</p>
        {errors.fields ? <p className="ferr">{errors.fields}</p> : null}
        <ol className="eg-fields">
          {cards.map((card, index) => (
            <FieldCard
              key={card.uid}
              card={card}
              index={index}
              total={cards.length}
              errors={fieldErrors(errors, index)}
              onChange={(patch) => update(index, patch)}
              onMove={(by) => move(index, by)}
              onRemove={() => setCards((all) => all.filter((_, i) => i !== index))}
            />
          ))}
        </ol>
        <div className="eg-add card padded">
          <label className="fld">
            <span className="lab">{t("addType")}</span>
            <select
              className="inp"
              value={adding}
              onChange={(event) => setAdding(event.target.value as FieldType)}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {types(type)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={add}>
            {t("add")}
          </button>
        </div>
      </section>

      <section className="block" aria-labelledby="fe-notify">
        <h2 id="fe-notify" className="h2">
          {t("notifyTitle")}
        </h2>
        <div className="card padded eg-stack">
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
        </div>
      </section>

      <div className="eg-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending || !hydrated}>
          {submit}
        </button>
      </div>
    </form>
  );
}

function FieldCard({
  card,
  index,
  total,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  card: Card;
  index: number;
  total: number;
  errors: Record<string, string>;
  onChange: (patch: Partial<FieldDraft>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("engage.forms.editor");
  const types = useTranslations("engage.forms.types");
  const n = index + 1;
  const title = card.labelVi || card.labelEn || card.key || t("untitled");
  const extraOpen = Boolean(
    errors.help || errors.placeholder || card.helpVi || card.helpEn || card.placeholderEn,
  );
  return (
    <li className="card eg-fieldcard" aria-label={t("fieldN", { n, title })}>
      <div className="eg-fieldhead">
        <span className="eg-fieldno">{n}</span>
        <b className="ell">{title}</b>
        <span className="tag">{types(card.type)}</span>
        <span className="eg-grow" />
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
          className="btn ghost sm danger"
          aria-label={t("remove", { n })}
          onClick={onRemove}
        >
          {t("removeShort")}
        </button>
      </div>
      {errors._ ? <p className="ferr">{errors._}</p> : null}
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
          onBlur={() => {
            if (!card.key.trim()) onChange({ key: suggestKey(card.labelVi || card.labelEn) });
          }}
          hint={t("fieldKeyHint")}
          error={errors.key}
        />
      </div>
      <div className="fld-row">
        <Field
          label={card.type === "consent" ? t("consentVi") : t("labelVi")}
          name={`f${card.uid}-label-vi`}
          value={card.labelVi}
          onChange={(event) => onChange({ labelVi: event.target.value })}
          error={errors.label}
        />
        <Field
          label={card.type === "consent" ? t("consentEn") : t("labelEn")}
          name={`f${card.uid}-label-en`}
          value={card.labelEn}
          onChange={(event) => onChange({ labelEn: event.target.value })}
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
    </li>
  );
}
