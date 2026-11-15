"use client";

import type { Problem } from "@autoxide/sdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import {
  type MediaChanges,
  purgeMedia,
  restoreMedia,
  setMediaAlt,
  setMediaDecorative,
  suggestAlt,
  trashMedia,
  updateMedia,
} from "@/app/(admin)/content/media/actions";
import { SampleBadge } from "@/components/sample-badge";
import { Icon } from "@/components/shell/icon";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Labelled } from "@/components/ui/form";
import { CopyButton } from "@/components/ui/secret-once";
import { Time } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import {
  formatBytes,
  isImage,
  isRaster,
  kindOf,
  type MediaFolder,
  type MediaItem,
  mediaSrc,
} from "@/lib/media";
import { folderPath } from "./folders";
import { sendFile } from "./uploader";

export interface MediaAi {
  /** AI bật và mô hình đọc được ảnh. */
  enabled: boolean;
  /** Vì sao tắt: `off` (máy chủ chưa bật AI), `images` (mô hình không đọc ảnh), `forbidden`. */
  reason: "off" | "images" | "forbidden";
}

/** Ảnh AI gợi ý alt được: JPEG, PNG, GIF, WebP (không AVIF, SVG). */
function aiReadable(item: MediaItem): boolean {
  return isRaster(item.content_type) && item.content_type !== "image/avif";
}

/**
 * Khung chi tiết của một tệp: xem trước, thông tin, alt theo ngôn ngữ (gợi ý bằng AI chỉ điền bản
 * nháp), tên, thư mục, thẻ, biến thể, địa chỉ, thay nội dung, công khai / riêng tư, tải xuống, thùng
 * rác. Mọi lệnh sửa gửi `If-Match` với phiên bản đang giữ; core trả 412 thì báo, không ghi đè.
 */
export function MediaDetail({
  item: initial,
  version: initialVersion,
  folders,
  closeHref,
  can,
  ai,
  locales,
  decorative,
}: {
  item: MediaItem;
  version: string;
  folders: MediaFolder[];
  closeHref: string;
  can: { write: boolean; purge: boolean };
  ai: MediaAi;
  locales: string[];
  /** Cờ "ảnh chỉ để trang trí" (dữ liệu mẫu); `null` khi tắt dữ liệu mẫu. */
  decorative: boolean | null;
}) {
  const t = useTranslations("media.detail");
  const uiLocale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [item, setItem] = useState(initial);
  const [version, setVersion] = useState(initialVersion);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, startTransition] = useTransition();
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<number | null>(null);
  const titleId = useId();

  const change = (changes: MediaChanges, done: string) =>
    startTransition(async () => {
      setProblem(null);
      const result = await updateMedia(item.id, version, changes);
      if (result.ok) {
        setItem(result.item);
        setVersion(result.version);
        toast(done);
      } else {
        setProblem(result.problem);
      }
    });

  const folderName =
    folderPath(folders, item.folder_id ?? undefined)
      .map((f) => f.name)
      .join(" › ") || t("root");
  const kind = kindOf(item.content_type);
  const trashed = Boolean(item.trashed_at);
  const readOnly = !can.write || trashed;
  const conflict = problem?.code === "precondition_failed";

  return (
    <aside className="card md-pane" aria-labelledby={titleId}>
      <div className="md-panehead">
        <h2 id={titleId} className="h2">
          {t("title")}
        </h2>
        <Link className="btn ghost sm sq" href={closeHref} aria-label={t("close")} scroll={false}>
          <Icon name="x" />
        </Link>
      </div>

      <div className="md-preview">
        {kind === "image" && isRaster(item.content_type) && !trashed ? (
          // biome-ignore lint/performance/noImgElement: ảnh đi qua route `/media/…` của giao diện (kèm phiên)
          <img src={mediaSrc(item, 640)} alt={item.alt} />
        ) : kind === "video" && !trashed ? (
          // biome-ignore lint/a11y/useMediaCaption: video của người dùng tải lên, chưa có phụ đề
          <video src={mediaSrc(item)} controls preload="metadata" />
        ) : kind === "audio" && !trashed ? (
          // biome-ignore lint/a11y/useMediaCaption: tệp âm thanh của người dùng tải lên
          <audio src={mediaSrc(item)} controls preload="none" />
        ) : (
          <span className="md-ph big" aria-hidden="true">
            <Icon name={kind === "image" ? "image" : "file"} />
            <span className="mono">{item.content_type}</span>
          </span>
        )}
      </div>
      <div className="md-id">
        <span className="mono md-filename">{item.name}</span>
        <span className="fhint">
          {t("uploaded")} <Time value={item.created_at} />
        </span>
      </div>

      {problem ? (
        <div role="alert" className="falert" data-code={problem.code}>
          <span>{conflict ? t("conflict") : problem.detail}</span>
          {conflict ? (
            <button type="button" className="btn sm" onClick={() => router.refresh()}>
              {t("reload")}
            </button>
          ) : null}
        </div>
      ) : null}

      <dl className="md-facts">
        <div>
          <dt>{t("type")}</dt>
          <dd className="mono">{item.content_type}</dd>
        </div>
        <div>
          <dt>{t("dimensions")}</dt>
          <dd className="num">
            {item.width && item.height ? `${item.width} × ${item.height}` : "—"}
          </dd>
        </div>
        <div>
          <dt>{t("size")}</dt>
          <dd className="num">{formatBytes(item.size, uiLocale)}</dd>
        </div>
        <div>
          <dt>{t("folder")}</dt>
          <dd>{folderName}</dd>
        </div>
        <div>
          <dt>{t("visibility")}</dt>
          <dd>{t(item.visibility === "public" ? "public" : "private")}</dd>
        </div>
        <div>
          <dt>{t("tags")}</dt>
          <dd>{item.tags.length > 0 ? item.tags.map((tag) => `#${tag}`).join(" ") : "—"}</dd>
        </div>
        {trashed && item.trashed_at ? (
          <div>
            <dt>{t("trashedAt")}</dt>
            <dd>
              <Time value={item.trashed_at} />
            </dd>
          </div>
        ) : null}
      </dl>

      {isImage(item.content_type) ? (
        <AltSection
          key={item.id}
          item={item}
          locales={locales}
          decorative={decorative}
          ai={ai}
          readOnly={readOnly}
          pending={pending}
          saveAlts={async (main, translations) => {
            // Ghi lần lượt, mỗi lần dùng phiên bản lần trước trả về (`If-Match`): alt mặc định
            // bằng `PATCH`, mỗi ngôn ngữ đổi bằng `PUT` / `DELETE` của `/alts/{locale}`.
            let current = item;
            let tag = version;
            const apply = (result: Awaited<ReturnType<typeof updateMedia>>) => {
              if (!result.ok) {
                setProblem(result.problem);
                return false;
              }
              current = result.item;
              tag = result.version;
              setItem(result.item);
              setVersion(result.version);
              return true;
            };
            if (main !== current.alt && !apply(await updateMedia(item.id, tag, { alt: main }))) {
              return false;
            }
            for (const [language, text] of Object.entries(translations)) {
              if (text.trim() === (current.alts[language] ?? "")) continue;
              if (!apply(await setMediaAlt(item.id, tag, language, text))) return false;
            }
            router.refresh();
            return true;
          }}
          onProblem={setProblem}
        />
      ) : null}

      {readOnly ? null : (
        <DetailsForm
          key={`${item.id}:${version}`}
          item={item}
          folders={folders}
          pending={pending}
          save={(changes) => change(changes, t("saved"))}
        />
      )}

      <section className="md-sec" aria-labelledby={`${titleId}-v`}>
        <h3 id={`${titleId}-v`} className="cap">
          {t("variants")}
        </h3>
        {item.variants.length > 0 ? (
          <table className="md-variants">
            <thead>
              <tr>
                <th>{t("width")}</th>
                <th className="r">
                  {item.variants[0]?.content_type === "image/png" ? "PNG" : "JPEG"}
                </th>
                <th className="r">WebP</th>
              </tr>
            </thead>
            <tbody>
              {item.variants.map((variant) => (
                <tr key={variant.width}>
                  <td className="num">{variant.width} px</td>
                  <td className="num r">{formatBytes(variant.size, uiLocale)}</td>
                  <td className="num r ok">
                    {variant.webp_size ? formatBytes(variant.webp_size, uiLocale) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="fhint">
            {["image/jpeg", "image/png", "image/gif", "image/webp"].includes(item.content_type)
              ? t("variantsPending")
              : t("variantsNone")}
          </p>
        )}
      </section>

      <section className="md-sec" aria-labelledby={`${titleId}-u`}>
        <h3 id={`${titleId}-u`} className="cap">
          {t("address")}
        </h3>
        <span className="md-url">
          <input className="inp mono" readOnly value={item.url} aria-label={t("address")} />
          <CopyButton text={item.url} label={t("copy")} />
        </span>
        <p className="fhint">{t(item.visibility === "public" ? "urlPublic" : "urlPrivate")}</p>
      </section>

      <section className="md-sec" aria-labelledby={`${titleId}-w`}>
        <h3 id={`${titleId}-w`} className="cap">
          {t("usage")}
        </h3>
        <p className="fhint">{t("usageMissing")}</p>
      </section>

      {replacing !== null ? (
        <progress className="bar" max={100} value={replacing} aria-label={t("replace")} />
      ) : null}

      <div className="md-paneacts">
        {can.write && !trashed ? (
          <>
            <button
              type="button"
              className="btn sm"
              disabled={pending || replacing !== null}
              onClick={() => replaceInput.current?.click()}
            >
              <Icon name="swap" small />
              {t("replace")}
            </button>
            <input
              ref={replaceInput}
              className="vh"
              type="file"
              tabIndex={-1}
              aria-label={t("replace")}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setProblem(null);
                setReplacing(0);
                const sent = await sendFile(
                  "PUT",
                  `/media/${item.id}/replace`,
                  file,
                  { "If-Match": version },
                  setReplacing,
                );
                setReplacing(null);
                if (sent.ok) {
                  toast(t("replaced"));
                  router.refresh();
                } else {
                  setProblem(sent.problem);
                }
              }}
            />
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              onClick={() =>
                change(
                  { visibility: item.visibility === "public" ? "private" : "public" },
                  t(item.visibility === "public" ? "madePrivate" : "madePublic"),
                )
              }
            >
              <Icon name="lock" small />
              {t(item.visibility === "public" ? "makePrivate" : "makePublic")}
            </button>
          </>
        ) : null}
        {trashed ? null : (
          <a className="btn sm" href={`${mediaSrc(item)}&download=1`} download={item.name}>
            <Icon name="down" small />
            {t("download")}
          </a>
        )}
        {can.write && !trashed ? (
          <ConfirmAction
            action={trashMedia}
            id={item.id}
            label={t("trash")}
            title={t("trashTitle", { name: item.name })}
            points={[t("trashLink"), t("trashUsage"), t("trashRestore")]}
            submit={t("trash")}
            done={t("trashed")}
          />
        ) : null}
        {can.write && trashed ? (
          <InlineAction
            action={restoreMedia}
            id={item.id}
            label={t("restore")}
            done={t("restored")}
          />
        ) : null}
        {can.purge && trashed ? (
          <ConfirmAction
            action={purgeMedia}
            id={item.id}
            label={t("purge")}
            title={t("purgeTitle", { name: item.name })}
            points={[t("purgeForever"), t("purgeUsage")]}
            submit={t("purge")}
            done={t("purged")}
          />
        ) : null}
      </div>
    </aside>
  );
}

/** Tên, tiêu đề, chú thích, thư mục, thẻ: lưu một lần. */
function DetailsForm({
  item,
  folders,
  pending,
  save,
}: {
  item: MediaItem;
  folders: MediaFolder[];
  pending: boolean;
  save: (changes: MediaChanges) => void;
}) {
  const t = useTranslations("media.detail");
  const id = useId();
  const options = [
    { value: "", label: t("root") },
    ...folders
      .map((f) => ({
        value: f.id,
        label: folderPath(folders, f.id)
          .map((p) => p.name)
          .join(" › "),
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  return (
    <form
      className="md-sec md-form"
      aria-labelledby={`${id}-h`}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const text = (name: string) => String(data.get(name) ?? "");
        const tags = text("tags")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
        save({
          name: text("name").trim(),
          title: text("title"),
          caption: text("caption"),
          folder_id: text("folder_id") || null,
          tags: [...new Set(tags)],
        });
      }}
    >
      <h3 id={`${id}-h`} className="cap">
        {t("details")}
      </h3>
      <label className="fld">
        <span className="lab">{t("name")}</span>
        <input className="inp mono" name="name" defaultValue={item.name} maxLength={255} required />
      </label>
      <label className="fld">
        <span className="lab">{t("titleField")}</span>
        <input className="inp" name="title" defaultValue={item.title} maxLength={255} />
      </label>
      <label className="fld">
        <span className="lab">{t("caption")}</span>
        <textarea className="inp area" name="caption" defaultValue={item.caption} rows={2} />
      </label>
      <label className="fld">
        <span className="lab">{t("folder")}</span>
        <select className="inp" name="folder_id" defaultValue={item.folder_id ?? ""}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <Labelled label={t("tags")} hint={t("tagsHint")}>
        {(id, aria) => (
          <input
            id={id}
            className="inp"
            name="tags"
            defaultValue={item.tags.join(", ")}
            {...aria}
          />
        )}
      </Labelled>
      <div className="ce-acts">
        <button type="submit" className="btn sm pri" disabled={pending}>
          {t("saveDetails")}
        </button>
      </div>
    </form>
  );
}

interface AltRow {
  locale: string;
  text: string;
  /** Câu vừa do AI gợi ý (chưa lưu). */
  fresh: boolean;
  busy: boolean;
}

/**
 * Alt theo ngôn ngữ. Ngôn ngữ đầu (mặc định của nội dung) là `alt` của tệp; các ngôn ngữ khác là
 * `alts[ngôn ngữ]` của core (người đọc ngôn ngữ đó thấy bản này, chưa có thì thấy `alt`). Gợi ý của
 * AI chỉ điền vào ô; bấm "Lưu alt" mới ghi. Cờ "ảnh trang trí" là dữ liệu mẫu (core chưa có).
 */
function AltSection({
  item,
  locales,
  decorative: initialDecorative,
  ai,
  readOnly,
  pending,
  saveAlts,
  onProblem,
}: {
  item: MediaItem;
  locales: string[];
  decorative: boolean | null;
  ai: MediaAi;
  readOnly: boolean;
  pending: boolean;
  saveAlts: (main: string, translations: Record<string, string>) => Promise<boolean>;
  onProblem: (problem: Problem) => void;
}) {
  const t = useTranslations("media.detail");
  const names = useTranslations("content.locales");
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [first] = locales;
  const [rows, setRows] = useState<AltRow[]>(() =>
    locales.map((locale) => ({
      locale,
      text: locale === first ? item.alt : (item.alts[locale] ?? ""),
      fresh: false,
      busy: false,
    })),
  );
  const [decorative, setDecorative] = useState(initialDecorative ?? false);
  const [aiNote, setAiNote] = useState("");
  const set = (locale: string, change: Partial<AltRow>) =>
    setRows((list) => list.map((row) => (row.locale === locale ? { ...row, ...change } : row)));
  const canSuggest = ai.enabled && aiReadable(item) && !readOnly;
  const why = !ai.enabled
    ? t(ai.reason === "forbidden" ? "aiForbidden" : ai.reason === "images" ? "aiNoImages" : "aiOff")
    : !aiReadable(item)
      ? t("aiUnsupported")
      : "";

  return (
    <section className="md-sec" aria-labelledby={`alt-${item.id}`}>
      <span className="md-cap">
        <h3 id={`alt-${item.id}`} className="cap">
          {t("alt")}
        </h3>
      </span>
      <p className="fhint">{t("altHint")}</p>
      {rows.map((row) => (
        <div key={row.locale} className="md-altrow">
          <span className="md-altlab">
            <span className={row.text ? "loc" : "loc miss"}>{row.locale.toUpperCase()}</span>
            <label className="lab" htmlFor={`alt-${item.id}-${row.locale}`}>
              {names.has(row.locale) ? names(row.locale) : row.locale}
              {row.locale === first ? ` · ${t("altDefault")}` : ""}
            </label>
            {readOnly ? null : (
              <button
                type="button"
                className="btn ghost sm"
                disabled={!canSuggest || row.busy || decorative}
                title={why || undefined}
                onClick={() => {
                  set(row.locale, { busy: true });
                  startTransition(async () => {
                    const result = await suggestAlt(item.id, row.locale, "");
                    if (result.ok) {
                      set(row.locale, { busy: false, fresh: true, text: result.data.alt });
                      setAiNote(result.data.decorative ? t("aiDecorative") : "");
                    } else {
                      set(row.locale, { busy: false });
                      onProblem(result.problem);
                    }
                  });
                }}
              >
                <Icon name="spark" small />
                {t("suggest")}
              </button>
            )}
          </span>
          <textarea
            id={`alt-${item.id}-${row.locale}`}
            className="inp area"
            rows={2}
            maxLength={1000}
            value={decorative ? "" : row.text}
            disabled={readOnly || decorative}
            placeholder={row.locale === first ? t("altPlaceholder") : t("altFallback")}
            onChange={(event) => set(row.locale, { text: event.target.value, fresh: false })}
          />
          {row.fresh ? <span className="fhint md-fresh">{t("aiFresh")}</span> : null}
        </div>
      ))}
      {why && !readOnly ? <p className="fhint">{why}</p> : null}
      {aiNote ? <p className="fhint">{aiNote}</p> : null}
      {initialDecorative !== null ? (
        <div className="md-deco">
          <label className="check">
            <input
              type="checkbox"
              checked={decorative}
              disabled={readOnly}
              onChange={(event) => setDecorative(event.target.checked)}
            />
            <span className="check-main">
              <span className="check-name">{t("decorative")}</span>
              <span className="check-desc">{t("decorativeHint")}</span>
            </span>
          </label>
          <SampleBadge step="mới" endpoint="PATCH /api/v1/media/{id} (decorative)" />
        </div>
      ) : null}
      {readOnly ? null : (
        <div className="ce-acts">
          <button
            type="button"
            className="btn sm pri"
            disabled={pending || busy}
            onClick={() =>
              startTransition(async () => {
                const text = (locale: string) =>
                  decorative ? "" : (rows.find((row) => row.locale === locale)?.text.trim() ?? "");
                const translations = Object.fromEntries(
                  locales
                    .filter((locale) => locale !== first)
                    .map((locale) => [locale, text(locale)]),
                );
                const ok = await saveAlts(text(first ?? ""), translations);
                if (!ok) return;
                if (initialDecorative !== null && decorative !== initialDecorative) {
                  const result = await setMediaDecorative(item.id, decorative);
                  if (!result.ok) {
                    onProblem(result.problem);
                    return;
                  }
                }
                setRows((list) => list.map((row) => ({ ...row, fresh: false })));
                toast(t("altSaved"));
              })
            }
          >
            {t("saveAlt")}
          </button>
        </div>
      )}
    </section>
  );
}
