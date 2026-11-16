"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { MediaPicker } from "@/components/media/media-picker";
import { type MediaItem, mediaIdSrc, mediaSrc } from "@/lib/media";
import type { MediaContext } from "./editor";
import { TextField } from "./fields";

/**
 * Ô ảnh của bài (ảnh đại diện, ảnh chia sẻ): xem ảnh đang gắn, chọn ảnh khác bằng bộ chọn ảnh, bỏ
 * ảnh. Đổi ở đây là đổi bản nháp (lưu cùng nút Lưu của trình soạn). `withAlt`: ô alt theo ngôn ngữ
 * của bài (`featured_media_alt`), điền sẵn từ bộ chọn ảnh.
 */
export function ImageField({
  id,
  label,
  hint,
  mediaId,
  alt,
  altError,
  error,
  media,
  locale,
  context,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  mediaId: string | null;
  /** Có thì hiện ô alt. */
  alt?: string;
  altError?: string | undefined;
  error?: string | undefined;
  media: MediaContext;
  locale: string;
  context: string;
  disabled: boolean;
  onChange: (mediaId: string | null, alt?: string) => void;
}) {
  const t = useTranslations("media.field");
  const [picking, setPicking] = useState(false);
  const [known, setKnown] = useState<MediaItem[]>(media.items);
  const item = mediaId ? known.find((m) => m.id === mediaId) : undefined;
  return (
    <section className="ce-sec md-featured" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="cap">
        {label}
      </h3>
      {mediaId ? (
        // biome-ignore lint/performance/noImgElement: ảnh đi qua route `/media/…` của giao diện (kèm phiên)
        <img
          src={item ? mediaSrc(item, 640) : mediaIdSrc(mediaId)}
          alt={alt ?? ""}
          data-testid={`${id}-img`}
        />
      ) : (
        <p className="ce-muted">{t("none")}</p>
      )}
      {item ? (
        <span className="fhint">
          <span className="mono">{item.name}</span>
          {item.visibility === "private" ? (
            <>
              {" "}
              <span className="badge b-draft">{t("private")}</span> {t("privateHint")}
            </>
          ) : null}
        </span>
      ) : null}
      {error ? (
        <span className="ferr" role="alert">
          {error}
        </span>
      ) : null}
      {mediaId && alt !== undefined ? (
        <TextField
          label={t("alt", { locale: locale.toUpperCase() })}
          name={`${id}-alt`}
          value={alt}
          onChange={(value) => onChange(mediaId, value)}
          error={altError}
          hint={t("altHint")}
          limit={250}
          multiline
          rows={2}
          disabled={disabled}
        />
      ) : null}
      {disabled ? null : (
        <span className="ce-acts">
          {media.available ? (
            <button type="button" className="btn sm" onClick={() => setPicking(true)}>
              {mediaId ? t("change") : t("choose")}
            </button>
          ) : (
            <span className="fhint">{t("unavailable")}</span>
          )}
          {mediaId ? (
            <button type="button" className="btn sm" onClick={() => onChange(null, "")}>
              {t("remove")}
            </button>
          ) : null}
        </span>
      )}
      <p className="fhint">{hint}</p>
      {picking ? (
        <MediaPicker
          title={label}
          locale={locale}
          context={context}
          aiEnabled={media.aiAlt}
          canUpload={media.canUpload}
          onClose={() => setPicking(false)}
          onPick={(picked) => {
            setKnown((list) => [picked.item, ...list.filter((m) => m.id !== picked.item.id)]);
            onChange(picked.item.id, alt === undefined ? undefined : picked.alt);
          }}
        />
      ) : null}
    </section>
  );
}
