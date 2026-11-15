"use client";

import type { Problem } from "@autoxide/sdk";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { changeState, type EntryFields, saveEntry } from "@/app/(admin)/content/actions";
import { Icon } from "@/components/shell/icon";
import { Time } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import {
  type AiState,
  type Author,
  type ContentAbilities,
  type Entry,
  type EntryErrors,
  entryErrors,
  type Revision,
  type Schedule,
  type SeoFinding,
  type Term,
  type TranslationRequest,
} from "@/lib/content";
import type { Website } from "@/sample/content";
import { BodyEditor, type BodyEditorHandle } from "./body-editor";
import { type EditorApi, EditorContext } from "./context";
import { PreviewDialog, PublishDialog } from "./entry-dialogs";
import { TextField } from "./fields";
import { EntryPanel } from "./panel";
import { EntryStatusBadges } from "./status";

/** Ô của bản nháp mà trình soạn sửa (thân bài nằm trong Tiptap). */
export interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  meta_title: string;
  meta_description: string;
  canonical_url: string;
  noindex: boolean;
}

function draftOf(entry: Entry): Draft {
  return {
    title: entry.title,
    slug: entry.slug,
    excerpt: entry.excerpt,
    meta_title: entry.meta_title,
    meta_description: entry.meta_description,
    canonical_url: entry.canonical_url,
    noindex: entry.noindex,
  };
}

export interface EditorData {
  entry: Entry;
  version: string;
  can: ContentAbilities;
  ai: AiState;
  authors: Author[];
  terms: Term[];
  schedules: Schedule[];
  revisions: Revision[];
  findings: SeoFinding[] | null;
  translations: Entry[];
  requests: TranslationRequest[];
  /** Đầu đường dẫn của bài viết (`/blog/`); trang thì theo trang cha. */
  pathPrefix: string;
  /** Website của bài (dữ liệu mẫu, W-006); `null` khi tắt dữ liệu mẫu. */
  sample: { websites: Website[]; current: string } | null;
}

/** Trình soạn một bài: bản nháp ở giữa, thiết lập ở thanh bên, lệnh đăng ở đầu trang. */
export function EntryEditor(data: EditorData) {
  const t = useTranslations("content.editor");
  const kinds = useTranslations("content.kinds");
  const locales = useTranslations("content.locales");
  const toast = useToast();
  const [entry, setEntry] = useState(data.entry);
  const [version, setVersion] = useState(data.version);
  const [draft, setDraft] = useState(() => draftOf(data.entry));
  const [dirty, setDirty] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [errors, setErrors] = useState<EntryErrors | null>(null);
  const [pending, startTransition] = useTransition();
  const body = useRef<BodyEditorHandle>(null);
  const bodyErrId = useId();

  const edit = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }, []);

  const fields = useCallback(
    (): EntryFields => ({
      ...draft,
      body: body.current?.getBody() ?? entry.body,
      ...(aiUsed ? { ai_generated: true } : {}),
    }),
    [draft, entry.body, aiUsed],
  );

  const accept = useCallback(
    (next: Entry, nextVersion: string, options: { reset?: boolean } = {}) => {
      setEntry(next);
      setVersion(nextVersion);
      setDraft(draftOf(next));
      setDirty(false);
      setAiUsed(false);
      setErrors(null);
      if (options.reset) body.current?.setBody(next.body);
    },
    [],
  );

  const fail = useCallback((problem: Problem) => setErrors(entryErrors(problem)), []);

  const run = useCallback((task: () => Promise<void>) => startTransition(task), []);

  const save = useCallback(() => {
    run(async () => {
      const result = await saveEntry(entry.id, version, fields());
      if (result.ok) {
        accept(result.entry, result.version);
        toast(t("saved"));
      } else {
        fail(result.problem);
      }
    });
  }, [run, entry.id, version, fields, accept, fail, toast, t]);

  const api: EditorApi = useMemo(
    () => ({
      entry,
      version,
      dirty,
      pending,
      can: data.can,
      ai: data.ai,
      unsaved: () => (dirty ? fields() : null),
      run,
      accept,
      fail,
      applySuggestion: (suggestion) => {
        setDraft((current) => ({ ...current, ...suggestion }));
        setAiUsed(true);
        setDirty(true);
      },
    }),
    [entry, version, dirty, pending, data.can, data.ai, fields, run, accept, fail],
  );

  // Chưa lưu thì hỏi trước khi rời trang; Ctrl / Cmd + S để lưu.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!data.can.write) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, save, data.can.write]);

  const review = (change: "request-review" | "withdraw-review") =>
    run(async () => {
      const result = await changeState(entry.id, version, change);
      if (result.ok) {
        setEntry(result.entry);
        setVersion(result.version);
        toast(t(change === "request-review" ? "reviewRequested" : "reviewWithdrawn"));
      } else {
        fail(result.problem);
      }
    });

  const readOnly = !data.can.write;
  const conflict = errors?.code === "precondition_failed";

  return (
    <EditorContext value={api}>
      <div className="page">
        <section className="phead">
          <div className="phead-main">
            <Link href="/content" className="crumb ce-back">
              {t("back")}
            </Link>
            <h1 className="h1 ce-h1">{entry.title || t("untitled")}</h1>
            <span className="ce-meta">
              <EntryStatusBadges entry={entry} />
              {entry.ai_generated || aiUsed ? (
                <span className="badge b-info">{t("aiTag")}</span>
              ) : null}
              <span className="ce-saved" data-testid="save-state">
                {dirty ? (
                  t("unsaved")
                ) : (
                  <>
                    {t("savedAt")} <Time value={entry.updated_at} />
                  </>
                )}
              </span>
            </span>
          </div>
          <div className="headacts ce-headacts">
            {data.can.write ? (
              <button type="button" className="btn" onClick={save} disabled={!dirty || pending}>
                {t("save")}
              </button>
            ) : null}
            {data.can.write ? <PreviewDialog /> : null}
            {data.can.write && entry.status !== "archived" ? (
              entry.review_requested_at ? (
                <button
                  type="button"
                  className="btn"
                  disabled={pending}
                  onClick={() => review("withdraw-review")}
                >
                  {t("withdrawReview")}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={pending}
                  onClick={() => review("request-review")}
                >
                  {t("requestReview")}
                </button>
              )
            ) : null}
            {data.can.publish ? (
              <PublishDialog
                pathPrefix={data.pathPrefix}
                slug={draft.slug}
                aiUsed={aiUsed}
                findings={data.findings}
              />
            ) : null}
            <a className="btn only-mobile-ce" href="#entry-settings">
              {t("settingsJump")}
            </a>
          </div>
        </section>

        {errors && (errors.message || conflict) ? (
          <div role="alert" className="falert ce-alert" data-code={errors.code}>
            <span>{conflict ? t("conflict") : errors.message}</span>
            {conflict ? (
              <button type="button" className="btn sm" onClick={() => window.location.reload()}>
                {t("reload")}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="ce-grid">
          <section className="card ce-main" aria-label={t("contentLabel")}>
            <div className="ce-strip">
              <span className="loc">{entry.locale.toUpperCase()}</span>
              <span>
                {locales(entry.locale)} · {kinds(entry.kind)} ·{" "}
                {t("words", { count: entry.word_count, minutes: entry.reading_time_minutes })}
              </span>
            </div>
            <TextField
              label={t("title")}
              name="title"
              value={draft.title}
              onChange={(value) => edit("title", value)}
              error={errors?.fields.title}
              limit={300}
              big
              disabled={readOnly}
              required
            />
            <TextField
              label={t("excerpt")}
              name="excerpt"
              value={draft.excerpt}
              onChange={(value) => edit("excerpt", value)}
              error={errors?.fields.excerpt}
              hint={t("excerptHint")}
              limit={1000}
              multiline
              rows={2}
              disabled={readOnly}
            />
            <div className="fld">
              <span className="lab" id={`${bodyErrId}-l`}>
                {t("body")}
              </span>
              <BodyEditor
                ref={body}
                initial={data.entry.body}
                label={t("body")}
                invalid={(errors?.body.length ?? 0) > 0}
                describedBy={(errors?.body.length ?? 0) > 0 ? bodyErrId : undefined}
                onChange={() => setDirty(true)}
              />
              <span className="fhint">{t("bodyHint")}</span>
              {errors && errors.body.length > 0 ? (
                <ul id={bodyErrId} className="ferr ce-bodyerr">
                  {errors.body.map((item) => (
                    <li key={`${item.field}-${item.detail}`}>
                      <span className="mono">{item.field}</span>: {item.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          <aside className="card ce-side" id="entry-settings" aria-label={t("settingsLabel")}>
            <EntryPanel data={data} draft={draft} edit={edit} errors={errors} />
          </aside>
        </div>
        {readOnly ? (
          <p className="note">
            <Icon name="warn" small /> {t("readOnly")}
          </p>
        ) : null}
      </div>
    </EditorContext>
  );
}
