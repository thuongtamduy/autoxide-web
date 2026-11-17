"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  cancelSchedule,
  changeState,
  createTranslation,
  findAuthors,
  findTerms,
  restoreRevision,
  setAuthors,
  setTerms,
  suggestSeo,
  translateWithAi,
} from "@/app/(admin)/content/actions";
import { useContentLocales } from "@/components/content/locales";
import { CheckField } from "@/components/ui/form";
import { Time } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import type { EntryErrors, SeoSuggestion, Term } from "@/lib/content";
import { useEditorApi } from "./context";
import type { Draft, EditorData } from "./editor";
import { ConfirmDialog, ScheduleDialog } from "./entry-dialogs";
import { TextField } from "./fields";
import { ImageField } from "./media-fields";
import { RevisionDiffButton } from "./revision-diff-button";
import { EntryWebsitePicker } from "./sample-sites";
import { EntryStatusBadges } from "./status";

type Tab = "settings" | "seo" | "languages" | "history";
const TABS: Tab[] = ["settings", "seo", "languages", "history"];

/** Thanh bên của trình soạn: bốn tab, chọn bằng phím mũi tên như tab của ARIA. */
export function EntryPanel({
  data,
  draft,
  edit,
  errors,
}: {
  data: EditorData;
  draft: Draft;
  edit: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  errors: EntryErrors | null;
}) {
  const t = useTranslations("content.panel");
  const [tab, setTab] = useState<Tab>("settings");
  const errorCount = data.findings?.filter((f) => f.level === "error").length ?? 0;
  return (
    <>
      <div
        className="ce-tabs"
        role="tablist"
        aria-label={t("label")}
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          const step = event.key === "ArrowRight" ? 1 : -1;
          const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length] ?? "settings";
          setTab(next);
          document.getElementById(`ce-tab-${next}`)?.focus();
        }}
      >
        {TABS.map((id) => (
          <button
            key={id}
            id={`ce-tab-${id}`}
            type="button"
            role="tab"
            className={tab === id ? "ce-tab on" : "ce-tab"}
            aria-selected={tab === id}
            aria-controls={`ce-pane-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {t(`tabs.${id}`)}
            {id === "seo" && (data.findings?.length ?? 0) > 0 ? (
              <span className={errorCount > 0 ? "cnt hot" : "cnt"}>{data.findings?.length}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        id={`ce-pane-${tab}`}
        role="tabpanel"
        aria-labelledby={`ce-tab-${tab}`}
        className="ce-pane"
      >
        {tab === "settings" ? (
          <SettingsPane data={data} draft={draft} edit={edit} errors={errors} />
        ) : null}
        {tab === "seo" ? <SeoPane data={data} draft={draft} edit={edit} errors={errors} /> : null}
        {tab === "languages" ? <LanguagesPane data={data} /> : null}
        {tab === "history" ? <HistoryPane data={data} /> : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Thiết lập

function SettingsPane({
  data,
  draft,
  edit,
  errors,
}: {
  data: EditorData;
  draft: Draft;
  edit: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  errors: EntryErrors | null;
}) {
  const t = useTranslations("content.panel");
  const api = useEditorApi();
  const toast = useToast();
  const { entry } = api;
  const pending = data.schedules.filter((s) => s.status === "scheduled");
  const failed = data.schedules.filter((s) => s.status === "failed").slice(0, 3);

  const stateChange = (change: "unpublish" | "archive") => async () => {
    const result = await changeState(entry.id, api.version, change);
    if (result.ok) {
      api.accept(result.entry, result.version);
      toast(t(change === "unpublish" ? "unpublished" : "archived"));
      return true;
    }
    api.fail(result.problem);
    return false;
  };

  return (
    <div className="ce-sections">
      <section className="ce-sec" aria-labelledby="ce-status-h">
        <h3 id="ce-status-h" className="cap">
          {t("status")}
        </h3>
        <dl className="ce-facts">
          <div>
            <dt>{t("state")}</dt>
            <dd>
              <EntryStatusBadges entry={entry} />
            </dd>
          </div>
          {entry.review_requested_at ? (
            <div>
              <dt>{t("reviewSince")}</dt>
              <dd>
                <Time value={entry.review_requested_at} />
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{t("createdVia")}</dt>
            <dd>{t(entry.created_via === "api_key" ? "viaApiKey" : "viaSession")}</dd>
          </div>
          <div>
            <dt>{t("created")}</dt>
            <dd>
              <Time value={entry.created_at} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="ce-sec" aria-labelledby="ce-sched-h">
        <h3 id="ce-sched-h" className="cap">
          {t("schedule")}
        </h3>
        {pending.length === 0 ? <p className="ce-muted">{t("noSchedule")}</p> : null}
        {pending.map((schedule) => (
          <div key={schedule.id} className="ce-row">
            <span className="ce-row-main">
              <b>{t(schedule.action === "publish" ? "schedPublish" : "schedUnpublish")}</b>{" "}
              <Time value={schedule.run_at} />
            </span>
            {api.can.publishAll ? (
              <button
                type="button"
                className="btn sm"
                disabled={api.pending}
                onClick={() =>
                  api.run(async () => {
                    const result = await cancelSchedule(schedule.id);
                    if (result.ok) toast(t("scheduleCanceled"));
                    else api.fail(result.problem);
                  })
                }
              >
                {t("cancelSchedule")}
              </button>
            ) : null}
          </div>
        ))}
        {failed.map((schedule) => (
          <p key={schedule.id} className="ce-muted">
            {t("scheduleFailed", { code: schedule.error_code ?? "" })}{" "}
            <Time value={schedule.run_at} />
          </p>
        ))}
        {pending.length > 0 ? <p className="fhint">{t("schedulePinned")}</p> : null}
        {api.can.publishAll && entry.status === "published" ? (
          <ScheduleDialog action="unpublish" />
        ) : null}
      </section>

      <section className="ce-sec" aria-labelledby="ce-addr-h">
        <h3 id="ce-addr-h" className="cap">
          {t("address")}
        </h3>
        <TextField
          label={t("slug")}
          name="slug"
          value={draft.slug}
          onChange={(value) => edit("slug", value)}
          error={errors?.fields.slug}
          hint={t("slugHint")}
          prefix={entry.kind === "post" ? data.pathPrefix : "/…/"}
          mono
          disabled={!api.can.write}
        />
      </section>

      <ImageField
        id="ce-featured"
        label={t("featured")}
        hint={t("featuredHint")}
        mediaId={draft.featured_media_id}
        alt={draft.featured_media_alt}
        altError={errors?.fields.featured_media_alt}
        error={errors?.fields.featured_media_id}
        media={data.media}
        locale={entry.locale}
        context={draft.title}
        disabled={!api.can.write}
        onChange={(mediaId, alt) => {
          edit("featured_media_id", mediaId);
          if (alt !== undefined) edit("featured_media_alt", alt);
        }}
      />

      {data.sample ? (
        <EntryWebsitePicker
          entryId={entry.id}
          websites={data.sample.websites}
          current={data.sample.current}
          disabled={!api.can.write}
        />
      ) : null}

      <AuthorsSection data={data} />
      <TermsSection data={data} />

      <section className="ce-sec" aria-labelledby="ce-ai-h">
        <h3 id="ce-ai-h" className="cap">
          {t("aiLabel")}
        </h3>
        <dl className="ce-facts">
          <div>
            <dt>{t("aiGenerated")}</dt>
            <dd>{entry.ai_generated ? t("yes") : t("no")}</dd>
          </div>
          {entry.translated_from_revision_id ? (
            <div>
              <dt>{t("aiTranslated")}</dt>
              <dd>{entry.translation_outdated ? t("outdated") : t("upToDate")}</dd>
            </div>
          ) : null}
        </dl>
        <p className="fhint">{t("aiNote")}</p>
      </section>

      {api.can.publish && entry.status === "published" ? (
        <section className="ce-sec" aria-labelledby="ce-danger-h">
          <h3 id="ce-danger-h" className="cap">
            {t("takeDown")}
          </h3>
          <div className="ce-acts">
            <ConfirmDialog
              label={t("unpublish")}
              title={t("unpublishTitle")}
              intro={t("unpublishIntro")}
              submit={t("unpublish")}
              run={stateChange("unpublish")}
            />
            {api.can.publishAll ? (
              <ConfirmDialog
                label={t("archive")}
                title={t("archiveTitle")}
                intro={t("archiveIntro")}
                submit={t("archive")}
                run={stateChange("archive")}
                danger
              />
            ) : null}
          </div>
        </section>
      ) : null}
      {api.can.publishAll && entry.status === "draft" ? (
        <section className="ce-sec">
          <ConfirmDialog
            label={t("archive")}
            title={t("archiveTitle")}
            intro={t("archiveDraftIntro")}
            submit={t("archive")}
            run={stateChange("archive")}
            danger
          />
        </section>
      ) : null}
    </div>
  );
}

function termName(term: Term, locale: string): string {
  return (term.names.find((n) => n.locale === locale) ?? term.names[0])?.name ?? term.id;
}

type PickOption = { id: string; label: string; group?: string };

/**
 * Chọn nhiều trong một danh sách rồi bấm lưu (có hiệu lực ngay, cả với bản đã đăng). Khi core còn
 * mục ngoài trang đã đọc (`search`), ô tìm hỏi core theo tên (`q`) và thêm kết quả vào danh sách.
 */
function PickSection({
  id,
  title,
  options: loaded,
  selected,
  empty,
  hint,
  save,
  search,
}: {
  id: string;
  title: string;
  options: PickOption[];
  selected: string[];
  empty: string;
  hint: string;
  save: (ids: string[]) => Promise<boolean>;
  search?: (q: string) => Promise<PickOption[] | null>;
}) {
  const t = useTranslations("content.panel");
  const api = useEditorApi();
  const [chosen, setChosen] = useState(selected);
  const [found, setFound] = useState<PickOption[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState<{ q: string; count: number } | null>(null);
  const changed = chosen.join() !== selected.join();
  const known = new Set(loaded.map((o) => o.id));
  const options = [...loaded, ...found.filter((o) => !known.has(o.id))];
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const find = async () => {
    const q = query.trim();
    if (!search || !q) return;
    setSearching(true);
    const result = await search(q);
    setSearching(false);
    setSearched({ q, count: result?.length ?? 0 });
    if (result) {
      setFound((now) => [...now.filter((o) => !result.some((r) => r.id === o.id)), ...result]);
    }
  };
  return (
    <section className="ce-sec" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="cap">
        {title}
      </h3>
      {search ? (
        <search className="ce-pickfind">
          <label className="vh" htmlFor={`${id}-q`}>
            {t("findLabel", { what: title })}
          </label>
          <input
            id={`${id}-q`}
            className="inp"
            type="search"
            value={query}
            maxLength={200}
            placeholder={t("findHint")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void find();
              }
            }}
          />
          <button type="button" className="btn sm" disabled={searching} onClick={() => void find()}>
            {t("find")}
          </button>
        </search>
      ) : null}
      {searched !== null && !searching ? (
        <p className="fhint" role="status">
          {t("found", searched)}
        </p>
      ) : null}
      {options.length === 0 ? <p className="ce-muted">{empty}</p> : null}
      {groups.map((group) => (
        <fieldset key={group} className="ce-picks">
          {group ? <legend className="lab">{group}</legend> : null}
          {options
            .filter((o) => (o.group ?? "") === group)
            .map((option) => (
              <label key={option.id} className="ce-chip ce-pick">
                <input
                  type="checkbox"
                  checked={chosen.includes(option.id)}
                  disabled={!api.can.write}
                  onChange={(event) =>
                    setChosen((now) =>
                      event.target.checked
                        ? [...now, option.id]
                        : now.filter((x) => x !== option.id),
                    )
                  }
                />
                {option.label}
              </label>
            ))}
        </fieldset>
      ))}
      {options.length > 0 ? <p className="fhint">{hint}</p> : null}
      {changed ? (
        <div className="ce-acts">
          <button
            type="button"
            className="btn sm pri"
            disabled={api.pending}
            onClick={() =>
              api.run(async () => {
                if (!(await save(chosen))) setChosen(selected);
              })
            }
          >
            {t("apply")}
          </button>
          <button type="button" className="btn sm" onClick={() => setChosen(selected)}>
            {t("undo")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function AuthorsSection({ data }: { data: EditorData }) {
  const t = useTranslations("content.panel");
  const api = useEditorApi();
  const toast = useToast();
  return (
    <PickSection
      key={api.entry.author_ids.join()}
      id="ce-authors"
      title={t("authors")}
      options={data.authors.map((a) => ({ id: a.id, label: a.display_name }))}
      selected={api.entry.author_ids}
      empty={t("noAuthors")}
      hint={t("authorsHint")}
      {...(data.more?.authors
        ? {
            search: async (q: string) => {
              const result = await findAuthors(q);
              return result.ok
                ? result.data.map((a) => ({ id: a.id, label: a.display_name }))
                : null;
            },
          }
        : {})}
      save={async (ids) => {
        const result = await setAuthors(api.entry.id, ids);
        if (!result.ok) {
          api.fail(result.problem);
          return false;
        }
        api.accept({ ...api.entry, author_ids: result.data }, api.version, { keepDraft: true });
        toast(t("authorsSaved"));
        return true;
      }}
    />
  );
}

function TermsSection({ data }: { data: EditorData }) {
  const t = useTranslations("content.panel");
  const api = useEditorApi();
  const toast = useToast();
  const locale = api.entry.locale;
  return (
    <PickSection
      key={api.entry.term_ids.join()}
      id="ce-terms"
      title={t("terms")}
      // Danh mục trước, thẻ sau; trong mỗi nhóm theo tên.
      options={[...data.terms]
        .sort(
          (a, b) =>
            a.taxonomy.localeCompare(b.taxonomy) ||
            termName(a, locale).localeCompare(termName(b, locale), locale),
        )
        .map((term) => ({
          id: term.id,
          label: termName(term, locale),
          group: t(term.taxonomy === "category" ? "categories" : "tags"),
        }))}
      selected={api.entry.term_ids}
      empty={t("noTerms")}
      hint={t("termsHint")}
      {...(data.more?.terms
        ? {
            search: async (q: string) => {
              const result = await findTerms(q);
              return result.ok
                ? result.data.map((term) => ({
                    id: term.id,
                    label: termName(term, locale),
                    group: t(term.taxonomy === "category" ? "categories" : "tags"),
                  }))
                : null;
            },
          }
        : {})}
      save={async (ids) => {
        const result = await setTerms(api.entry.id, ids);
        if (!result.ok) {
          api.fail(result.problem);
          return false;
        }
        api.accept({ ...api.entry, term_ids: result.data }, api.version, { keepDraft: true });
        toast(t("termsSaved"));
        return true;
      }}
    />
  );
}

// ---------------------------------------------------------------- SEO

function SeoPane({
  data,
  draft,
  edit,
  errors,
}: {
  data: EditorData;
  draft: Draft;
  edit: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  errors: EntryErrors | null;
}) {
  const t = useTranslations("content.seo");
  const api = useEditorApi();
  const [suggestion, setSuggestion] = useState<SeoSuggestion | null>(null);
  const [aiError, setAiError] = useState("");
  const shownTitle = draft.meta_title || draft.title;
  const suggestedTerms = suggestion
    ? data.terms
        .filter((term) => suggestion.term_ids.includes(term.id))
        .map((term) => termName(term, api.entry.locale))
    : [];

  return (
    <div className="ce-sections">
      <section className="ce-sec" aria-labelledby="ce-check-h">
        <h3 id="ce-check-h" className="cap">
          {t("check")}
        </h3>
        {data.findings === null ? <p className="ce-muted">{t("checkUnavailable")}</p> : null}
        {data.findings?.length === 0 ? <p className="ce-muted">{t("allGood")}</p> : null}
        <ul className="ce-findings">
          {data.findings?.map((finding) => (
            <li
              key={`${finding.code}-${finding.field}`}
              className={finding.level === "error" ? "bad" : "warn"}
            >
              <span className="ce-flevel">{t(finding.level)}</span>
              {/* Câu của core đã theo ngôn ngữ giao diện (`Accept-Language`); `code` chỉ để máy đọc. */}
              <span>{finding.message}</span>
            </li>
          ))}
        </ul>
        {api.dirty ? <p className="fhint">{t("checkSaved")}</p> : null}
      </section>

      <TextField
        label={t("metaTitle")}
        name="meta_title"
        value={draft.meta_title}
        onChange={(value) => edit("meta_title", value)}
        error={errors?.fields.meta_title}
        hint={t("metaTitleHint")}
        limit={60}
        disabled={!api.can.write}
      />
      <TextField
        label={t("metaDescription")}
        name="meta_description"
        value={draft.meta_description}
        onChange={(value) => edit("meta_description", value)}
        error={errors?.fields.meta_description}
        limit={160}
        multiline
        rows={3}
        disabled={!api.can.write}
      />
      <div className="ce-snippet">
        <span className="cap">{t("snippet")}</span>
        <span className="mono ce-snip-url">/{draft.slug}</span>
        <span className="ce-snip-title">{shownTitle || "—"}</span>
        <span className="ce-snip-desc">{draft.meta_description || draft.excerpt || "—"}</span>
      </div>
      <TextField
        label={t("canonical")}
        name="canonical_url"
        value={draft.canonical_url}
        onChange={(value) => edit("canonical_url", value)}
        error={errors?.fields.canonical_url}
        hint={t("canonicalHint")}
        mono
        disabled={!api.can.write}
      />
      <ImageField
        id="ce-og"
        label={t("shareImage")}
        hint={t("shareImageHint")}
        mediaId={draft.og_media_id}
        error={errors?.fields.og_media_id}
        media={data.media}
        locale={api.entry.locale}
        context={draft.title}
        disabled={!api.can.write}
        onChange={(mediaId) => edit("og_media_id", mediaId)}
      />
      <CheckField
        label={t("noindex")}
        hint={t("noindexHint")}
        name="noindex"
        checked={draft.noindex}
        disabled={!api.can.write}
        onChange={(event) => edit("noindex", event.target.checked)}
      />

      {api.can.write ? (
        <section className="ce-sec" aria-labelledby="ce-aiseo-h">
          <h3 id="ce-aiseo-h" className="cap">
            {t("ai")}
          </h3>
          <button
            type="button"
            className="btn"
            disabled={!api.ai.enabled || api.pending}
            aria-describedby="ce-aiseo-why"
            onClick={() =>
              api.run(async () => {
                setAiError("");
                const result = await suggestSeo(api.entry.id);
                if (result.ok) setSuggestion(result.data);
                else setAiError(result.problem.detail);
              })
            }
          >
            {t("suggest")}
          </button>
          <p id="ce-aiseo-why" className="fhint">
            {api.ai.enabled
              ? t("suggestHint")
              : t(
                  api.ai.reason === "forbidden"
                    ? "aiForbidden"
                    : api.ai.reason === "plan"
                      ? "aiPlan"
                      : "aiOff",
                )}
          </p>
          {aiError ? (
            <p role="alert" className="falert">
              {aiError}
            </p>
          ) : null}
          {suggestion ? (
            <div className="ce-suggest" data-testid="seo-suggestion">
              <span className="cap">{t("suggestion", { model: suggestion.model })}</span>
              <b>{suggestion.meta_title}</b>
              <span>{suggestion.meta_description}</span>
              <span className="fhint">
                {t("suggestedExcerpt")}: {suggestion.excerpt}
              </span>
              {suggestedTerms.length > 0 ? (
                <span className="fhint">
                  {t("suggestedTerms")}: {suggestedTerms.join(", ")}
                </span>
              ) : null}
              <span className="ce-acts">
                <button
                  type="button"
                  className="btn sm pri"
                  onClick={() => {
                    api.applySuggestion({
                      meta_title: suggestion.meta_title,
                      meta_description: suggestion.meta_description,
                      excerpt: suggestion.excerpt,
                    });
                    setSuggestion(null);
                  }}
                >
                  {t("apply")}
                </button>
                <button type="button" className="btn sm" onClick={() => setSuggestion(null)}>
                  {t("dismiss")}
                </button>
              </span>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Ngôn ngữ

function LanguagesPane({ data }: { data: EditorData }) {
  const t = useTranslations("content.languages");
  const locales = useTranslations("content.locales");
  const { content: localeList } = useContentLocales();
  const api = useEditorApi();
  const toast = useToast();
  const { entry } = api;
  const others = localeList.filter((code) => code !== entry.locale);
  return (
    <div className="ce-sections">
      <div className="ce-row">
        <span className="loc">{entry.locale.toUpperCase()}</span>
        <span className="ce-row-main">
          <b>{locales(entry.locale)}</b>
          <span className="mono ce-muted">/{entry.slug}</span>
        </span>
        <EntryStatusBadges entry={entry} />
      </div>
      {others.map((code) => {
        const translation = data.translations.find((other) => other.locale === code);
        const request = data.requests.find(
          (r) => r.target_locale === code && (r.status === "queued" || r.status === "running"),
        );
        const lastFailed = data.requests.find(
          (r) => r.target_locale === code && r.status === "failed",
        );
        return (
          <div key={code} className="ce-lang">
            <div className="ce-row">
              <span className={translation ? "loc" : "loc miss"}>{code.toUpperCase()}</span>
              <span className="ce-row-main">
                <b>{locales(code)}</b>
                <span className="ce-muted">
                  {translation
                    ? translation.translation_outdated
                      ? t("outdated")
                      : t("exists")
                    : t("missing")}
                </span>
              </span>
              {translation ? (
                <Link className="btn sm" href={`/content/${translation.id}`}>
                  {t("open")}
                </Link>
              ) : null}
            </div>
            {request ? <p className="ce-muted">{t("translating")}</p> : null}
            {lastFailed && !request ? (
              <p className="ce-muted">{t("failed", { code: lastFailed.error_code ?? "" })}</p>
            ) : null}
            {api.can.write ? (
              <div className="ce-acts">
                {translation ? null : (
                  <button
                    type="button"
                    className="btn sm"
                    disabled={api.pending}
                    onClick={() =>
                      api.run(async () => {
                        // Thành công thì Server Action chuyển sang bản dịch mới (redirect); chỉ còn lỗi để báo.
                        const result = await createTranslation(entry.id, code, entry.title);
                        if (result?.problem) api.fail(result.problem);
                      })
                    }
                  >
                    {t("blank")}
                  </button>
                )}
                <button
                  type="button"
                  className="btn sm"
                  disabled={!api.ai.enabled || api.pending || Boolean(request)}
                  title={
                    api.ai.enabled ? undefined : t(api.ai.reason === "plan" ? "aiPlan" : "aiOff")
                  }
                  onClick={() =>
                    api.run(async () => {
                      const result = await translateWithAi(entry.id, code);
                      if (result.ok) toast(t("queued"));
                      else api.fail(result.problem);
                    })
                  }
                >
                  {translation ? t("retranslate") : t("translate")}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      {!api.ai.enabled ? (
        <p className="fhint">{t(api.ai.reason === "plan" ? "aiPlan" : "aiOff")}</p>
      ) : null}
      <p className="fhint">{t("note")}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Lịch sử

function HistoryPane({ data }: { data: EditorData }) {
  const t = useTranslations("content.history");
  const api = useEditorApi();
  const toast = useToast();
  return (
    <div className="ce-sections">
      {data.revisions.length === 0 ? <p className="ce-muted">{t("none")}</p> : null}
      <ol className="ce-revs">
        {data.revisions.map((revision, index) => (
          <li key={revision.id} className="ce-row">
            <span className="ce-row-main">
              <b>
                {t.has(`reasons.${revision.reason}`)
                  ? t(`reasons.${revision.reason}`)
                  : revision.reason}
              </b>
              <span className="ce-muted">
                <Time value={revision.created_at} />
                {index === 0 ? ` · ${t("latest")}` : ""}
              </span>
            </span>
            <RevisionDiffButton
              entryId={api.entry.id}
              beforeId={revision.id}
              afterId={data.revisions[index - 1]?.id ?? null}
              title={t("diffTitle")}
            />
            {api.can.write ? (
              <ConfirmDialog
                label={t("restore")}
                title={t("restoreTitle")}
                intro={
                  api.dirty ? `${t("restoreIntro")} ${t("restoreUnsaved")}` : t("restoreIntro")
                }
                submit={t("restore")}
                run={async () => {
                  const result = await restoreRevision(api.entry.id, revision.id, api.version);
                  if (result.ok) {
                    api.accept(result.entry, result.version, { reset: true });
                    toast(t("restored"));
                    return true;
                  }
                  api.fail(result.problem);
                  return false;
                }}
              />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="fhint">{t("note")}</p>
      {data.revisions.length > 1 ? (
        <Link className="btn sm" href={`/content/structure/history?entry=${api.entry.id}`}>
          {t("compareAny")}
        </Link>
      ) : null}
    </div>
  );
}
