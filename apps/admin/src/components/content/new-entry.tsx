"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { createEntry } from "@/app/(admin)/content/actions";
import { useContentLocales } from "@/components/content/locales";
import { SelectField } from "@/components/ui/form";
import { type EntryErrors, type EntryKind, entryErrors } from "@/lib/content";
import { BodyEditor, type BodyEditorHandle } from "./body-editor";
import { TextField } from "./fields";

/** Biểu mẫu tạo bản nháp: tiêu đề, ngôn ngữ, (trang cha), tóm tắt, thân bài. */
export function NewEntryForm({
  kind,
  defaultLocale,
  parents,
}: {
  kind: EntryKind;
  defaultLocale: string;
  parents: { id: string; title: string; locale: string }[];
}) {
  const t = useTranslations("content.editor");
  const n = useTranslations("content.new");
  const locales = useTranslations("content.locales");
  const { content: localeList } = useContentLocales();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [locale, setLocale] = useState(defaultLocale);
  const [parent, setParent] = useState("");
  const [errors, setErrors] = useState<EntryErrors | null>(null);
  const [pending, startTransition] = useTransition();
  const body = useRef<BodyEditorHandle>(null);
  const sameLocale = parents.filter((p) => p.locale === locale);

  return (
    <div className="page">
      <section className="phead">
        <div className="phead-main">
          <Link href="/content" className="crumb ce-back">
            {t("back")}
          </Link>
          <h1 className="h1">{kind === "page" ? n("titlePage") : n("titlePost")}</h1>
          <p className="pdesc">{n("description")}</p>
        </div>
      </section>
      <form
        className="ce-grid"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) {
            setErrors({ fields: { title: n("titleRequired") }, body: [], code: "required" });
            return;
          }
          startTransition(async () => {
            const result = await createEntry({
              kind,
              locale: locale as string,
              parent_id: kind === "page" && parent ? parent : null,
              title: title.trim(),
              slug: slug.trim(),
              excerpt,
              body: body.current?.getBody(),
              meta_title: "",
              meta_description: "",
              canonical_url: "",
              noindex: false,
            });
            // Thành công thì Server Action chuyển sang trình soạn của bài mới.
            if (result?.problem) setErrors(entryErrors(result.problem));
          });
        }}
      >
        <section className="card ce-main" aria-label={t("contentLabel")}>
          {errors?.message ? (
            <p role="alert" className="falert" data-code={errors.code}>
              {errors.message}
            </p>
          ) : null}
          <TextField
            label={t("title")}
            name="title"
            value={title}
            onChange={setTitle}
            error={errors?.fields.title}
            limit={300}
            big
            required
          />
          <TextField
            label={t("excerpt")}
            name="excerpt"
            value={excerpt}
            onChange={setExcerpt}
            error={errors?.fields.excerpt}
            hint={t("excerptHint")}
            limit={1000}
            multiline
            rows={2}
          />
          <div className="fld">
            <span className="lab">{t("body")}</span>
            <BodyEditor
              ref={body}
              initial={{ type: "doc", content: [] }}
              label={t("body")}
              invalid={(errors?.body.length ?? 0) > 0}
              onChange={() => {}}
            />
            <span className="fhint">{t("bodyHint")}</span>
            {errors && errors.body.length > 0 ? (
              <ul className="ferr ce-bodyerr">
                {errors.body.map((item) => (
                  <li key={`${item.field}-${item.detail}`}>
                    <span className="mono">{item.field}</span>: {item.detail}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
        <aside className="card ce-side" aria-label={t("settingsLabel")}>
          <div className="ce-sections">
            <SelectField
              label={n("locale")}
              name="locale"
              hint={n("localeHint")}
              value={locale}
              onChange={(event) => {
                setLocale(event.target.value);
                setParent("");
              }}
              options={localeList.map((code) => ({
                value: code,
                label: locales.has(code) ? locales(code) : code,
              }))}
            />
            {kind === "page" ? (
              <SelectField
                label={n("parent")}
                name="parent_id"
                value={parent}
                onChange={(event) => setParent(event.target.value)}
                options={[
                  { value: "", label: n("root") },
                  ...sameLocale.map((page) => ({ value: page.id, label: page.title })),
                ]}
              />
            ) : null}
            <TextField
              label={n("slug")}
              name="slug"
              value={slug}
              onChange={setSlug}
              error={errors?.fields.slug}
              hint={n("slugHint")}
              prefix={kind === "post" ? "/blog/" : "/…/"}
              mono
            />
            <div className="ce-acts">
              <button type="submit" className="btn pri" disabled={pending}>
                {n("create")}
              </button>
              <Link className="btn" href="/content">
                {n("cancel")}
              </Link>
            </div>
            <p className="fhint">{n("draftNote")}</p>
          </div>
        </aside>
      </form>
    </div>
  );
}
