"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";
import {
  movePage,
  saveAuthor,
  saveRedirect,
  saveTerm,
} from "@/app/(admin)/content/structure/actions";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  TextareaField,
  useFocusInvalid,
  useSubmit,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { type Author, CONTENT_LOCALES, type Term } from "@/lib/content";
import type { FormState } from "@/lib/form";
import type { Redirect } from "@/lib/structure";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Hộp thoại có một form gửi bằng Server Action: gom mọi lỗi, lỗi dưới ô, con trỏ về ô sai đầu
 * tiên; xong thì đóng và báo. Gửi qua `onSubmit` để React không đặt lại ô đã chọn khi core báo lỗi.
 */
function FormDialog({
  label,
  title,
  intro,
  submit,
  done,
  action,
  hidden,
  triggerClass = "btn sm",
  children,
}: {
  label: string;
  title: string;
  intro?: string;
  submit: string;
  done: string;
  action: Action;
  hidden: Record<string, string>;
  triggerClass?: string;
  children: (state: FormState) => ReactNode;
}) {
  return (
    <Dialog label={label} title={title} intro={intro} triggerClass={triggerClass}>
      {(close) => (
        <DialogForm action={action} hidden={hidden} submit={submit} done={done} close={close}>
          {children}
        </DialogForm>
      )}
    </Dialog>
  );
}

function DialogForm({
  action,
  hidden,
  submit,
  done,
  close,
  children,
}: {
  action: Action;
  hidden: Record<string, string>;
  submit: string;
  done: string;
  close: () => void;
  children: (state: FormState) => ReactNode;
}) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit(action, () => {
    close();
    toast(done);
  });
  useFocusInvalid(form, state);
  return (
    <form
      ref={form}
      className="dlg-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        run(new FormData(event.currentTarget));
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FormAlert state={state} />
      {children(state)}
      <DialogButtons submit={submit} pending={pending} close={close} />
    </form>
  );
}

// ---------------------------------------------------------------- Trang

/** "Chuyển trang cha": chọn trang cha mới (cùng ngôn ngữ) hay cấp cao nhất. */
export function MovePageDialog({
  page,
  choices,
}: {
  /** `version` là `ETag` của trang trong danh sách: gửi thẳng trong `If-Match`, không đọc lại. */
  page: { id: string; title: string; parent_id?: string | null; version: string };
  choices: { id: string; label: string }[];
}) {
  const t = useTranslations("structure.pages");
  return (
    <FormDialog
      label={t("move")}
      title={t("moveTitle", { title: page.title })}
      intro={t("moveIntro")}
      submit={t("move")}
      done={t("moved")}
      action={movePage}
      hidden={{ id: page.id, version: page.version }}
    >
      {(state) => (
        <SelectField
          label={t("parent")}
          name="parent_id"
          defaultValue={page.parent_id ?? ""}
          error={state.fields?.parent_id}
          options={[
            { value: "", label: t("topLevel") },
            ...choices.map((c) => ({ value: c.id, label: c.label })),
          ]}
        />
      )}
    </FormDialog>
  );
}

// ---------------------------------------------------------------- Danh mục và thẻ

/** Thêm (không có `term`) hay sửa một danh mục / thẻ, ở ngôn ngữ chọn trong hộp thoại. */
export function TermDialog({
  taxonomy,
  term,
  parents,
  defaultLocale,
}: {
  taxonomy: "category" | "tag";
  term?: Term;
  /** Danh mục có thể làm cha (đã bỏ chính nó và con cháu). */
  parents: { id: string; label: string }[];
  defaultLocale: string;
}) {
  const t = useTranslations("structure.terms");
  const kind = taxonomy === "category" ? "category" : "tag";
  return (
    <FormDialog
      label={term ? t("edit") : t(`add.${kind}`)}
      title={term ? t(`editTitle.${kind}`) : t(`add.${kind}`)}
      intro={t("intro")}
      submit={term ? t("save") : t("create")}
      done={term ? t("saved") : t("created")}
      action={saveTerm}
      hidden={{ taxonomy, ...(term ? { id: term.id, updated_at: term.updated_at } : {}) }}
      triggerClass={term ? "btn sm" : "btn sm"}
    >
      {(state) => (
        <TermFields
          term={term}
          state={state}
          parents={parents}
          taxonomy={taxonomy}
          defaultLocale={defaultLocale}
        />
      )}
    </FormDialog>
  );
}

function TermFields({
  term,
  state,
  parents,
  taxonomy,
  defaultLocale,
}: {
  term: Term | undefined;
  state: FormState;
  parents: { id: string; label: string }[];
  taxonomy: "category" | "tag";
  defaultLocale: string;
}) {
  const t = useTranslations("structure.terms");
  const locales = useTranslations("content.locales");
  const [locale, setLocale] = useState(state.values?.locale ?? defaultLocale);
  const name = term?.names.find((n) => n.locale === locale);
  return (
    <>
      <SelectField
        label={t("locale")}
        name="locale"
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        error={state.fields?.locale}
        options={CONTENT_LOCALES.map((code) => ({ value: code, label: locales(code) }))}
        hint={term ? t("localeHint") : undefined}
      />
      {/* `key` theo ngôn ngữ: đổi ngôn ngữ thì điền lại tên, slug của ngôn ngữ đó. */}
      <Field
        key={`name-${locale}`}
        label={t("name")}
        name="name"
        defaultValue={state.values?.name ?? name?.name ?? ""}
        error={state.fields?.name}
        maxLength={200}
        required
        autoComplete="off"
      />
      <Field
        key={`slug-${locale}`}
        label={t("slug")}
        name="slug"
        mono
        defaultValue={state.values?.slug ?? name?.slug ?? ""}
        error={state.fields?.slug}
        hint={t("slugHint")}
        autoComplete="off"
      />
      <TextareaField
        key={`desc-${locale}`}
        label={t("description")}
        name="description"
        defaultValue={state.values?.description ?? name?.description ?? ""}
        error={state.fields?.description}
      />
      {taxonomy === "category" ? (
        <SelectField
          label={t("parent")}
          name="parent_id"
          defaultValue={state.values?.parent_id ?? term?.parent_id ?? ""}
          error={state.fields?.parent_id}
          options={[
            { value: "", label: t("topLevel") },
            ...parents.map((p) => ({ value: p.id, label: p.label })),
          ]}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Tác giả

export function AuthorDialog({ author }: { author?: Author }) {
  const t = useTranslations("structure.authors");
  return (
    <FormDialog
      label={author ? t("edit") : t("add")}
      title={author ? t("editTitle") : t("add")}
      intro={t("intro")}
      submit={author ? t("save") : t("create")}
      done={author ? t("saved") : t("created")}
      action={saveAuthor}
      hidden={author ? { id: author.id, updated_at: author.updated_at } : {}}
    >
      {(state) => (
        <>
          <Field
            label={t("name")}
            name="display_name"
            defaultValue={state.values?.display_name ?? author?.display_name ?? ""}
            error={state.fields?.display_name}
            maxLength={200}
            required
            autoComplete="off"
          />
          <Field
            label={t("slug")}
            name="slug"
            mono
            defaultValue={state.values?.slug ?? author?.slug ?? ""}
            error={state.fields?.slug}
            hint={t("slugHint")}
            autoComplete="off"
          />
          <TextareaField
            label={t("bio")}
            name="bio"
            defaultValue={state.values?.bio ?? author?.bio ?? ""}
            error={state.fields?.bio}
          />
          <Field
            label={t("website")}
            name="website_url"
            mono
            inputMode="url"
            placeholder="https://"
            defaultValue={state.values?.website_url ?? author?.website_url ?? ""}
            error={state.fields?.website_url}
          />
        </>
      )}
    </FormDialog>
  );
}

// ---------------------------------------------------------------- Chuyển hướng

/** Thêm hay sửa một chuyển hướng. Đích: đường dẫn / URL, một bài, hoặc 410 (đã gỡ hẳn). */
export function RedirectDialog({
  redirect,
  entries,
  defaultLocale,
}: {
  redirect?: Redirect;
  entries: { id: string; label: string }[];
  defaultLocale: string;
}) {
  const t = useTranslations("structure.redirects");
  return (
    <FormDialog
      label={redirect ? t("edit") : t("add")}
      title={redirect ? t("editTitle") : t("add")}
      intro={t("intro")}
      submit={redirect ? t("save") : t("create")}
      done={redirect ? t("saved") : t("created")}
      action={saveRedirect}
      hidden={redirect ? { id: redirect.id, updated_at: redirect.updated_at } : {}}
    >
      {(state) => (
        <RedirectFields
          redirect={redirect}
          state={state}
          entries={entries}
          defaultLocale={defaultLocale}
        />
      )}
    </FormDialog>
  );
}

function RedirectFields({
  redirect,
  state,
  entries,
  defaultLocale,
}: {
  redirect: Redirect | undefined;
  state: FormState;
  entries: { id: string; label: string }[];
  defaultLocale: string;
}) {
  const t = useTranslations("structure.redirects");
  const locales = useTranslations("content.locales");
  const initialTarget = redirect
    ? redirect.status_code === 410
      ? "gone"
      : redirect.to_entry_id
        ? "entry"
        : "url"
    : "url";
  const [target, setTarget] = useState(state.values?.target ?? initialTarget);
  return (
    <>
      <Field
        label={t("from")}
        name="from_path"
        mono
        placeholder="/duong-dan-cu"
        defaultValue={state.values?.from_path ?? redirect?.from_path ?? ""}
        error={state.fields?.from_path}
        hint={t("fromHint")}
        required
        autoComplete="off"
      />
      <fieldset className="st-choice">
        <legend className="lab">{t("target")}</legend>
        {(["url", "entry", "gone"] as const).map((value) => (
          <label key={value} className="check">
            <input
              type="radio"
              name="target"
              value={value}
              checked={target === value}
              onChange={() => setTarget(value)}
            />
            <span className="check-main">
              <span className="check-name">{t(`targets.${value}`)}</span>
              <span className="check-desc">{t(`targetsHint.${value}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {target === "url" ? (
        <Field
          label={t("to")}
          name="to_url"
          mono
          placeholder="/duong-dan-moi"
          defaultValue={state.values?.to_url ?? redirect?.to_url ?? ""}
          error={state.fields?.to_url}
          hint={t("toHint")}
          autoComplete="off"
        />
      ) : null}
      {target === "entry" ? (
        <SelectField
          label={t("toEntry")}
          name="to_entry_id"
          defaultValue={state.values?.to_entry_id ?? redirect?.to_entry_id ?? ""}
          error={state.fields?.to_entry_id}
          options={[
            { value: "", label: t("chooseEntry") },
            ...entries.map((e) => ({ value: e.id, label: e.label })),
          ]}
        />
      ) : null}
      {target === "gone" ? null : (
        <SelectField
          label={t("code")}
          name="status_code"
          defaultValue={
            state.values?.status_code ??
            (redirect && redirect.status_code !== 410 ? String(redirect.status_code) : "301")
          }
          error={state.fields?.status_code}
          options={["301", "302", "307", "308"].map((code) => ({
            value: code,
            label: t(`codes.${code}`),
          }))}
        />
      )}
      <SelectField
        label={t("locale")}
        name="locale"
        defaultValue={state.values?.locale ?? redirect?.locale ?? defaultLocale}
        error={state.fields?.locale}
        options={CONTENT_LOCALES.map((code) => ({ value: code, label: locales(code) }))}
      />
    </>
  );
}
