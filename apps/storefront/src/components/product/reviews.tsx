"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatRating } from "@/lib/format";
import {
  filterReviews,
  NO_REVIEW_FILTER,
  REVIEW_SORTS,
  type ReviewFilter,
  type ReviewItem,
  type ReviewSort,
} from "@/lib/reviews";
import { ART, type ArtName, Icon, type Tone } from "../icon";

export interface ReviewView extends ReviewItem {
  /** Tên rút gọn ("Hoài Thương N."), ngày đã định dạng, nhãn biến thể đã mua. */
  shown: string;
  dateText: string;
  variantLabel: string | null;
  photoArts: { art: ArtName; tone: Tone }[];
  reply: string | null;
}

const PAGE = 5;

/**
 * Đánh giá của người đã mua (bản thiết kế `Product`): tóm tắt số sao (bấm một dòng để lọc), tóm tắt
 * AI đã duyệt kèm chủ đề hay nhắc, lọc có ảnh / theo biến thể, sắp xếp, "Hữu ích" và "Báo vi phạm".
 * Dữ liệu mẫu: lọc trên các đánh giá đã tải; khi có API bước 45 thì mỗi lần lọc gọi lại core.
 */
export function Reviews({
  rating,
  total,
  distribution,
  reviews,
  summary,
  topics,
  variants,
  shopName,
  locale,
}: {
  rating: number;
  total: number;
  distribution: number[];
  reviews: ReviewView[];
  summary: string | null;
  topics: { label: string; count: number; keyword: string }[];
  variants: { sku: string; label: string }[];
  shopName: string;
  locale: string;
}) {
  const t = useTranslations("pdp.reviews");
  const [filter, setFilter] = useState<ReviewFilter>(NO_REVIEW_FILTER);
  const [shown, setShown] = useState(PAGE);
  const [helped, setHelped] = useState<Record<string, boolean>>({});
  const [reporting, setReporting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const list = filterReviews(reviews, filter);
  const set = (change: Partial<ReviewFilter>) => {
    setFilter({ ...filter, ...change });
    setShown(PAGE);
  };
  const topic = topics.find((x) => x.keyword === filter.topic);
  const active = [
    filter.stars !== null ? t("filterStars", { stars: filter.stars }) : null,
    filter.photos ? t("filterPhotos") : null,
    filter.sku ? (variants.find((v) => v.sku === filter.sku)?.label ?? filter.sku) : null,
    topic ? `“${topic.label}”` : null,
  ].filter((x): x is string => x !== null);
  const say = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2800);
  };

  return (
    <div className="pp-rev">
      <div className="rev-side">
        <span className="pp-rev-score">
          <span className="dsp num">{formatRating(rating, locale)}</span>
          <span className="muted">{t("outOf", { count: total })}</span>
        </span>
        {distribution.map((n, i) => {
          const stars = 5 - i;
          const on = filter.stars === stars;
          return (
            <button
              key={stars}
              type="button"
              className={`rev-bar pp-revbar${on ? " on" : ""}`}
              aria-pressed={on}
              aria-label={t("barLabel", { stars, count: n })}
              onClick={() => set({ stars: on ? null : stars })}
            >
              <span className="num">{stars} ★</span>
              <span className="pp-revtrack">
                <span style={{ width: `${total > 0 ? Math.round((n / total) * 100) : 0}%` }} />
              </span>
              <span className="num muted">{n}</span>
            </button>
          );
        })}
        <span className="muted pp-small">{t("barHint")}</span>
        <button type="button" className="btn pp-write" onClick={() => say(t("writeNeedsPurchase"))}>
          {t("write")}
        </button>
        <span className="muted pp-small">{t("policy")}</span>
      </div>
      <div className="pp-rev-main">
        {summary ? (
          <div className="pp-aisum">
            <span className="pp-aisum-h">
              <b>{t("summary")}</b>
              <span className="badge b-brand">
                <Icon name="sparkles" small />
                {t("aiBadge")}
              </span>
            </span>
            <p>{summary}</p>
            {topics.length > 0 ? (
              <span className="pp-topics">
                <span className="muted pp-small">{t("topics")}</span>
                {topics.map((x) => (
                  <button
                    key={x.keyword}
                    type="button"
                    className={`chip sm${filter.topic === x.keyword ? " on" : ""}`}
                    aria-pressed={filter.topic === x.keyword}
                    onClick={() => set({ topic: filter.topic === x.keyword ? null : x.keyword })}
                  >
                    {x.label} <span className="num">{x.count}</span>
                  </button>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="rev-tools pp-revtools">
          <button
            type="button"
            className={`chip${filter.photos ? " on" : ""}`}
            aria-pressed={filter.photos}
            onClick={() => set({ photos: !filter.photos })}
          >
            {t("withPhotos")}
          </button>
          {variants.length > 1 ? (
            <select
              className="sel"
              aria-label={t("byVariant")}
              value={filter.sku ?? ""}
              onChange={(event) => set({ sku: event.target.value || null })}
            >
              <option value="">{t("allVariants")}</option>
              {variants.map((v) => (
                <option key={v.sku} value={v.sku}>
                  {v.label}
                </option>
              ))}
            </select>
          ) : null}
          <span className="cat-gap" />
          <label className="pp-sortl">
            <span className="muted">{t("sort")}</span>
            <select
              className="sel"
              value={filter.sort}
              onChange={(event) => set({ sort: event.target.value as ReviewSort })}
            >
              {REVIEW_SORTS.map((key) => (
                <option key={key} value={key}>
                  {t(`sort_${key}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {active.length > 0 ? (
          <p className="pp-revfilter" aria-live="polite">
            <span className="muted">
              {t("filtering", { filters: active.join(", "), count: list.length })}
            </span>{" "}
            <button type="button" className="lnk" onClick={() => set(NO_REVIEW_FILTER)}>
              {t("clear")}
            </button>
          </p>
        ) : null}
        {list.slice(0, shown).map((review) => {
          const on = Boolean(helped[review.id]);
          return (
            <article className="pp-review" key={review.id} lang="vi">
              <span className="pp-review-h">
                <span
                  className="stars"
                  role="img"
                  aria-label={t("starsLabel", { stars: review.stars })}
                >
                  {"★".repeat(review.stars)}
                  {"☆".repeat(5 - review.stars)}
                </span>
                <b>{review.shown}</b>
                <span className="badge b-ok">
                  {review.variantLabel
                    ? t("boughtVariant", { variant: review.variantLabel })
                    : t("bought")}
                </span>
                <span className="muted pp-small">{review.dateText}</span>
              </span>
              <p>{review.body}</p>
              {review.photoArts.length > 0 ? (
                <span className="pp-review-ph">
                  {review.photoArts.map((photo, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: ảnh của một đánh giá không đổi thứ tự
                    <span className={`thumb ${photo.tone}`} key={`${review.id}-${i}`}>
                      <svg viewBox="0 0 24 24" role="img" aria-label={t("photo", { index: i + 1 })}>
                        <path d={ART[photo.art]} />
                      </svg>
                    </span>
                  ))}
                </span>
              ) : null}
              {review.reply ? (
                <div className="pp-reply">
                  <b>{t("reply", { shop: shopName })}</b> {review.reply}
                </div>
              ) : null}
              <span className="pp-review-f">
                <button
                  type="button"
                  className={`btn sm pp-help${on ? " on" : ""}`}
                  aria-pressed={on}
                  onClick={() => setHelped({ ...helped, [review.id]: !on })}
                >
                  <Icon name="thumb" small />
                  {t("helpful", { count: review.helpful + (on ? 1 : 0) })}
                </button>
                <button
                  type="button"
                  className="lnk pp-report"
                  aria-expanded={reporting === review.id}
                  onClick={() => setReporting(reporting === review.id ? null : review.id)}
                >
                  {t("report")}
                </button>
              </span>
              {reporting === review.id ? (
                <form
                  className="pp-reportf"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setReporting(null);
                    say(t("reported"));
                  }}
                >
                  <fieldset>
                    <legend className="lab">{t("reportWhy")}</legend>
                    {(["false", "abuse", "personal", "spam"] as const).map((reason, i) => (
                      <label key={reason} className="cat-check">
                        <input type="radio" name="reason" value={reason} defaultChecked={i === 0} />
                        <span>{t(`reason_${reason}`)}</span>
                      </label>
                    ))}
                  </fieldset>
                  <button type="submit" className="btn sm pri">
                    {t("reportSend")}
                  </button>
                </form>
              ) : null}
            </article>
          );
        })}
        {list.length === 0 ? <p className="muted pp-empty">{t("none")}</p> : null}
        <span className="pp-revmore">
          {shown < list.length ? (
            <button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>
              {t("more")}
            </button>
          ) : null}
          <span className="muted pp-small">
            {t("showing", { shown: Math.min(shown, list.length), loaded: list.length, total })}
          </span>
        </span>
      </div>
      {notice ? (
        <div className="toast" role="status">
          <Icon name="info" />
          {notice}
        </div>
      ) : null}
    </div>
  );
}
