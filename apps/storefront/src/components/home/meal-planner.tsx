"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { vnd } from "@/lib/format";
import { addToCart } from "@/sample/actions";
import { Art, type ArtName, Icon, type Tone } from "../icon";

export interface MealTool {
  sku: string;
  name: string;
  note: string;
  /** Giá VND (số nguyên). */
  price: number;
  art: ArtName;
  tone: Tone;
}

export interface MealData {
  id: string;
  name: string;
  time: string;
  blurb: string;
  art: ArtName;
  tone: Tone;
  postHref: string;
  tools: MealTool[];
}

/**
 * "Hôm nay nấu gì?" (bản thiết kế `Main`): chọn một món, xem cách làm, bỏ chọn dụng cụ đã có, thêm
 * cả nhóm vào giỏ một lần (giỏ mẫu).
 */
export function MealPlanner({ meals }: { meals: MealData[] }) {
  const t = useTranslations("home.meal");
  const locale = useLocale();
  const [current, setCurrent] = useState(meals[0]?.id ?? "");
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Record<string, number>>({});
  const [toast, setToast] = useState("");
  const [pending, start] = useTransition();
  const meal = meals.find((m) => m.id === current) ?? meals[0];
  if (!meal) return null;
  const picked = meal.tools.filter((tool) => !off[`${meal.id}:${tool.sku}`]);
  const total = vnd(
    picked.reduce((sum, tool) => sum + tool.price, 0),
    locale,
  );
  const done = added[meal.id] ?? 0;
  const say = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  };
  const addAll = () => {
    if (done > 0) return;
    if (picked.length === 0) {
      say(t("none"));
      return;
    }
    start(async () => {
      await addToCart(picked.map((tool) => tool.sku));
      setAdded({ ...added, [meal.id]: picked.length });
      say(t("added", { count: picked.length, name: meal.name }));
    });
  };
  return (
    <>
      <fieldset className="meal-pick">
        <legend className="sr-only">{t("pick")}</legend>
        {meals.map((m) => (
          <label key={m.id} className={`meal-opt${m.id === meal.id ? " on" : ""}`}>
            <input
              className="sr-only"
              type="radio"
              name="meal"
              value={m.id}
              checked={m.id === meal.id}
              onChange={() => setCurrent(m.id)}
            />
            <span className={`thumb ${m.tone}`}>
              <Art name={m.art} />
            </span>
            <span className="meal-ot">
              <b>{m.name}</b>
              <span>{m.time}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="meal-panel">
        <span
          className={`thumb meal-img ${meal.tone}`}
          role="img"
          aria-label={t("image", { name: meal.name })}
        >
          <Art name={meal.art} />
          <span className="meal-time">
            <Icon name="clock" />
            {meal.time}
          </span>
        </span>
        <div className="meal-info">
          <div className="meal-text">
            <span className="dsp meal-name">{meal.name}</span>
            <span className="meal-blurb">{meal.blurb}</span>
            <a className="lnk meal-post" href={meal.postHref}>
              {t("postLink")}
              <Icon name="arrow" small />
            </a>
          </div>
          <div className="meal-text">
            <b>{t("tools")}</b>
            <span className="muted meal-hint">{t("toolsHint")}</span>
          </div>
          <ul className="meal-tools">
            {meal.tools.map((tool) => {
              const key = `${meal.id}:${tool.sku}`;
              return (
                <li key={tool.sku}>
                  <label className="meal-tool">
                    <input
                      type="checkbox"
                      className="chk"
                      checked={!off[key]}
                      onChange={() => setOff({ ...off, [key]: !off[key] })}
                      aria-label={t("toolLabel", { name: tool.name })}
                    />
                    <span className={`thumb ${tool.tone}`}>
                      <Art name={tool.art} />
                    </span>
                    <span className="meal-tn">
                      <b>{tool.name}</b>
                      <span>{tool.note}</span>
                    </span>
                    <span className="price num">{vnd(tool.price, locale)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="meal-sum">
            <span className="meal-total">
              <span className="muted">
                {t("count", { picked: picked.length, total: meal.tools.length })}
              </span>
              <b className="num">{total}</b>
            </span>
            <button
              type="button"
              className={`btn ${done > 0 ? "on" : "pri"}`}
              aria-pressed={done > 0}
              disabled={pending}
              onClick={addAll}
            >
              <Icon name={done > 0 ? "check" : "plus"} small />
              {done > 0
                ? t("addedButton", { count: done })
                : t("add", {
                    count: picked.length,
                    all: picked.length === meal.tools.length ? "yes" : "no",
                  })}
            </button>
          </div>
        </div>
      </div>
      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" />
          {toast}
        </div>
      ) : null}
    </>
  );
}
