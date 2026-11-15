"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { makeMediaPublic, pickerImages, suggestAlt } from "@/app/(admin)/content/media/actions";
import { Icon } from "@/components/shell/icon";
import { isRaster, type MediaItem, mediaSrc } from "@/lib/media";
import { MediaThumb } from "./media-list";
import { UploadList, useUploader } from "./uploader";

/** Ảnh người dùng chọn, kèm alt (theo ngôn ngữ của bài) và chú thích. */
export interface PickedImage {
  item: MediaItem;
  alt: string;
  caption: string;
}

/**
 * Bộ chọn ảnh dùng lại ở trình soạn bài (ảnh đại diện, ảnh chia sẻ, ảnh trong thân bài): tìm ảnh
 * trong thư viện, tải ảnh mới lên ngay tại chỗ, rồi điền alt theo ngôn ngữ của bài (gợi ý bằng AI
 * khi AI bật, chỉ điền vào ô). Bài đăng chỉ nhận ảnh công khai, nên ảnh riêng tư có ô "đặt công
 * khai" bật sẵn. Mở bằng `open`; đóng (Esc, Huỷ) gọi `onClose`.
 */
export function MediaPicker({
  title,
  locale,
  context,
  withCaption = false,
  aiEnabled,
  canUpload,
  onPick,
  onClose,
}: {
  title: string;
  /** Ngôn ngữ của bài: alt viết bằng ngôn ngữ này. */
  locale: string;
  /** Tiêu đề bài, gửi kèm khi nhờ AI gợi ý alt. */
  context: string;
  withCaption?: boolean;
  aiEnabled: boolean;
  canUpload: boolean;
  onPick: (picked: PickedImage) => void;
  onClose: () => void;
}) {
  const t = useTranslations("media.picker");
  const form = useTranslations("form");
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, startLoading] = useTransition();
  const [chosen, setChosen] = useState<MediaItem | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [publish, setPublish] = useState(true);
  const [aiNote, setAiNote] = useState("");
  const [working, startWorking] = useTransition();
  const inputId = useId();
  const { uploads, upload, dismiss } = useUploader({
    onUploaded: (uploaded) => {
      const images = uploaded.filter((item) => item.content_type.startsWith("image/"));
      setItems((list) => [...images, ...list.filter((i) => !images.some((u) => u.id === i.id))]);
      const first = images[0];
      if (first) choose(first);
    },
  });

  const search = (q: string, cursor: string | null) =>
    startLoading(async () => {
      const result = await pickerImages(q, cursor);
      if (!result.ok) {
        setError(result.problem.detail);
        return;
      }
      setError("");
      setItems((list) => (cursor ? [...list, ...result.data.items] : result.data.items));
      setNext(result.data.next);
    });

  // Mở thì nạp trang ảnh đầu tiên (một lần).
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    search("", null);
  });

  function choose(item: MediaItem) {
    setChosen(item);
    setAlt(item.alt);
    setCaption(item.caption);
    setPublish(item.visibility === "private");
    setAiNote("");
  }

  return (
    <dialog
      ref={(node) => {
        ref.current = node;
        if (node && !node.open) node.showModal();
      }}
      className="axdlg md-pickdlg"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="dlg-head">
        <h2 id={titleId} className="h2">
          {title}
        </h2>
        <button
          type="button"
          className="btn ghost sq"
          aria-label={t("close")}
          onClick={() => ref.current?.close()}
        >
          <Icon name="x" />
        </button>
      </div>
      {chosen ? (
        <form
          className="dlg-form md-picker"
          onSubmit={(event) => {
            event.preventDefault();
            startWorking(async () => {
              let item = chosen;
              if (publish && chosen.visibility === "private") {
                const result = await makeMediaPublic(chosen.id);
                if (!result.ok) {
                  setError(result.problem.detail);
                  return;
                }
                item = result.data;
              }
              onPick({ item, alt: alt.trim(), caption: caption.trim() });
              ref.current?.close();
            });
          }}
        >
          <div className="md-chosen">
            {isRaster(chosen.content_type) ? (
              // biome-ignore lint/performance/noImgElement: ảnh đi qua route `/media/…` của giao diện (kèm phiên)
              <img src={mediaSrc(chosen, 320)} alt="" />
            ) : (
              <MediaThumb item={chosen} />
            )}
            <span className="md-id">
              <span className="mono md-filename">{chosen.name}</span>
              <button type="button" className="btn ghost sm" onClick={() => setChosen(null)}>
                {t("other")}
              </button>
            </span>
          </div>
          <div className="fld">
            <span className="ce-labrow">
              <label className="lab" htmlFor={`${titleId}-alt`}>
                {t("alt", { locale: locale.toUpperCase() })}
              </label>
              <button
                type="button"
                className="btn ghost sm"
                disabled={!aiEnabled || working || !isRaster(chosen.content_type)}
                title={aiEnabled ? undefined : t("aiOff")}
                onClick={() =>
                  startWorking(async () => {
                    const result = await suggestAlt(chosen.id, locale, context);
                    if (result.ok) {
                      setAlt(result.data.alt);
                      setAiNote(result.data.decorative ? t("aiDecorative") : t("aiFresh"));
                    } else {
                      setError(result.problem.detail);
                    }
                  })
                }
              >
                <Icon name="spark" small />
                {t("suggest")}
              </button>
            </span>
            <textarea
              id={`${titleId}-alt`}
              className="inp area"
              rows={2}
              maxLength={1000}
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              aria-describedby={`${titleId}-alth`}
            />
            <span id={`${titleId}-alth`} className="fhint">
              {aiNote || (aiEnabled ? t("altHint") : `${t("altHint")} ${t("aiOff")}`)}
            </span>
          </div>
          {withCaption ? (
            <label className="fld">
              <span className="lab">{t("caption")}</span>
              <input
                className="inp"
                value={caption}
                maxLength={2000}
                onChange={(event) => setCaption(event.target.value)}
              />
            </label>
          ) : null}
          {chosen.visibility === "private" ? (
            <label className="check">
              <input
                type="checkbox"
                checked={publish}
                onChange={(event) => setPublish(event.target.checked)}
              />
              <span className="check-main">
                <span className="check-name">{t("makePublic")}</span>
                <span className="check-desc">{t("makePublicHint")}</span>
              </span>
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="falert">
              {error}
            </p>
          ) : null}
          <div className="dlg-acts">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              {form("cancel")}
            </button>
            <button type="submit" className="btn pri" disabled={working}>
              {t("use")}
            </button>
          </div>
        </form>
      ) : (
        <div className="dlg-form md-picker">
          <form
            className="md-filters"
            onSubmit={(event) => {
              event.preventDefault();
              search(query, null);
            }}
          >
            <input
              className="inp md-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
            />
            <button type="submit" className="btn">
              {t("find")}
            </button>
            {canUpload ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => document.getElementById(inputId)?.click()}
                >
                  <Icon name="upload" small />
                  {t("upload")}
                </button>
                <input
                  id={inputId}
                  className="vh"
                  type="file"
                  accept="image/*"
                  tabIndex={-1}
                  aria-label={t("upload")}
                  onChange={(event) => {
                    const files = [...(event.target.files ?? [])];
                    event.target.value = "";
                    if (files.length > 0) void upload(files);
                  }}
                />
              </>
            ) : null}
          </form>
          <UploadList uploads={uploads} dismiss={dismiss} />
          {error ? (
            <p role="alert" className="falert">
              {error}
            </p>
          ) : null}
          {items.length === 0 && !loading ? <p className="empty">{t("empty")}</p> : null}
          <ul className="md-grid" aria-label={t("list")}>
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="md-tile" onClick={() => choose(item)}>
                  <MediaThumb item={item} width={320} />
                  <span className="md-tile-body">
                    <span className="ell md-name">{item.name}</span>
                    <span className="md-badges">
                      {item.visibility === "private" ? (
                        <span className="badge b-draft">{t("private")}</span>
                      ) : null}
                      {item.alt ? null : <span className="badge b-warn">{t("noAlt")}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {next ? (
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => search(query, next)}
            >
              {t("more")}
            </button>
          ) : null}
        </div>
      )}
    </dialog>
  );
}
