"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ART, type ArtName, Icon, type Tone } from "../icon";

export interface Shot {
  art: ArtName;
  tone: Tone;
  /** Chú thích của ảnh ("Mặt trên", "Đáy chảo"). */
  label: string;
}

/**
 * Bộ ảnh sản phẩm: ảnh lớn, hàng ảnh nhỏ (máy tính), nút trước / sau và vuốt ngang (điện thoại).
 * Ảnh là hình minh hoạ của bản thiết kế tới khi core có ảnh sản phẩm (`media`, bước 41).
 */
export function Gallery({ shots, badge }: { shots: Shot[]; badge: string | null }) {
  const t = useTranslations("pdp.gallery");
  const [index, setIndex] = useState(0);
  const touch = useRef<number | null>(null);
  const shot = shots[index] ?? shots[0];
  if (!shot) return null;
  const step = (delta: number) => setIndex((index + delta + shots.length) % shots.length);
  return (
    <section className="rise pp-gal" aria-label={t("label")}>
      <div
        className={`thumb pp-main ${shot.tone}`}
        onTouchStart={(event) => {
          touch.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          const end = event.changedTouches[0]?.clientX;
          if (start === null || end === undefined) return;
          if (Math.abs(end - start) > 40) step(end < start ? 1 : -1);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={ART[shot.art]} />
        </svg>
        {badge ? (
          <span className="flag">
            <span className="badge b-sale">{badge}</span>
          </span>
        ) : null}
        <span className="badge b-plain pp-shotlab" aria-live="polite">
          {t("position", { label: shot.label, index: index + 1, total: shots.length })}
        </span>
        {shots.length > 1 ? (
          <>
            <button
              type="button"
              className="pp-nav prev"
              aria-label={t("prev")}
              onClick={() => step(-1)}
            >
              <Icon name="left" />
            </button>
            <button
              type="button"
              className="pp-nav next"
              aria-label={t("next")}
              onClick={() => step(1)}
            >
              <Icon name="right" />
            </button>
            <span className="pp-dots" aria-hidden="true">
              {shots.map((s, i) => (
                <i key={s.label} className={i === index ? "on" : ""} />
              ))}
            </span>
          </>
        ) : null}
      </div>
      {shots.length > 1 ? (
        <div className="pp-thumbs">
          {shots.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={`thumb pp-th ${s.tone}${i === index ? " on" : ""}`}
              aria-label={s.label}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={ART[s.art]} />
              </svg>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
