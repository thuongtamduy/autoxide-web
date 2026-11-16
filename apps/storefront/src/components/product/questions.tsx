"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { matchQuestion } from "@/lib/reviews";
import { Icon } from "../icon";

export interface QuestionView {
  id: string;
  body: string;
  /** Tên rút gọn, ngày đã định dạng. */
  who: string;
  when: string;
  answers: {
    name: string;
    role: "shop" | "buyer";
    when: string;
    body: string;
    helpful: number;
  }[];
  helpfulTotal: number;
  /** Số ngày trước (để sắp "Mới nhất"). */
  age: number;
}

const MIN_LENGTH = 8;

/**
 * Hỏi đáp (bản thiết kế `Product`): ô tìm trong câu đã có trả lời cạnh nút "Đặt câu hỏi" mở form tại
 * chỗ; câu trả lời ghi vai trò ("Cửa hàng", "Đã mua"). Câu vừa hỏi hiện "Chờ duyệt · chỉ bạn thấy".
 * Thay bằng `comments` với đối tượng `catalog.product` (bước 41, D-202): gửi cần tài khoản đã xác thực
 * số điện thoại, nên bản mẫu chỉ giữ câu hỏi trong trang.
 */
export function Questions({ product, questions }: { product: string; questions: QuestionView[] }) {
  const t = useTranslations("pdp.qa");
  const formId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"helpful" | "newest">("helpful");
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [mine, setMine] = useState<string[]>([]);
  const [helped, setHelped] = useState<Record<string, boolean>>({});
  const q = query.trim();
  const list = questions
    .filter((x) =>
      matchQuestion(
        x.body,
        x.answers.map((a) => a.body),
        q,
      ),
    )
    .sort((a, b) => (sort === "helpful" ? b.helpfulTotal - a.helpfulTotal : a.age - b.age));
  const ownQuestions = mine.filter((body) => matchQuestion(body, [], q));

  return (
    <div className="pp-qa">
      <div className="pp-qabar">
        <label className="hs-field pp-qasearch">
          <Icon name="search" className="hs-ic" />
          <input
            className="inp"
            type="search"
            value={query}
            placeholder={t("searchPlaceholder", { count: questions.length })}
            aria-label={t("search")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={`btn${asking ? "" : " pri"}`}
          aria-expanded={asking}
          aria-controls={formId}
          onClick={() => {
            setAsking(!asking);
            setError("");
          }}
        >
          {asking ? t("close") : t("ask")}
        </button>
      </div>
      {asking ? (
        <form
          id={formId}
          className="pp-askf"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const body = draft.trim();
            if (body.length < MIN_LENGTH) {
              setError(t("tooShort", { min: MIN_LENGTH }));
              return;
            }
            setMine([body, ...mine]);
            setDraft("");
            setAsking(false);
          }}
        >
          <label className="lab" htmlFor={`${formId}-q`}>
            {t("yourQuestion", { product })}
          </label>
          <textarea
            id={`${formId}-q`}
            className="inp"
            rows={3}
            value={draft}
            placeholder={t("example")}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${formId}-e` : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
          />
          {error ? (
            <span id={`${formId}-e`} className="errtxt" role="alert">
              {error}
            </span>
          ) : null}
          <span className="pp-askf-f">
            <button type="submit" className="btn pri">
              {t("send")}
            </button>
            <span className="muted pp-small">{t("rules")}</span>
          </span>
        </form>
      ) : null}
      <div className="pp-qatools">
        <span className="muted" aria-live="polite">
          {q
            ? t("matching", { count: list.length + ownQuestions.length, q })
            : t("count", { count: questions.length + mine.length })}
        </span>
        <label>
          <span className="muted">{t("sort")}</span>
          <select
            className="sel"
            value={sort}
            onChange={(event) => setSort(event.target.value as "helpful" | "newest")}
          >
            <option value="helpful">{t("sort_helpful")}</option>
            <option value="newest">{t("sort_newest")}</option>
          </select>
        </label>
      </div>
      {ownQuestions.map((body) => (
        <article className="pp-q" key={body}>
          <span className="pp-q-h">
            <b>{t("question", { body })}</b>
            <span className="muted pp-small">{t("you")}</span>
            <span className="badge b-warn">{t("pending")}</span>
          </span>
        </article>
      ))}
      {list.map((x) => (
        <article className="pp-q" key={x.id} lang="vi">
          <span className="pp-q-h">
            <b>{t("question", { body: x.body })}</b>
            <span className="muted pp-small">
              {x.who} · {x.when}
            </span>
          </span>
          {x.answers.map((answer, i) => {
            const key = `${x.id}-${i}`;
            const on = Boolean(helped[key]);
            return (
              <div className="pp-a" key={key}>
                <span className="pp-a-h">
                  <b>{answer.name}</b>
                  <span className={`badge ${answer.role === "shop" ? "b-brand" : "b-ok"}`}>
                    {t(answer.role === "shop" ? "roleShop" : "roleBuyer")}
                  </span>
                  <span className="muted pp-small">{answer.when}</span>
                </span>
                <span>{answer.body}</span>
                <button
                  type="button"
                  className={`btn sm pp-help${on ? " on" : ""}`}
                  aria-pressed={on}
                  onClick={() => setHelped({ ...helped, [key]: !on })}
                >
                  <Icon name="thumb" small />
                  {t("helpful", { count: answer.helpful + (on ? 1 : 0) })}
                </button>
              </div>
            );
          })}
        </article>
      ))}
      {q && list.length === 0 && ownQuestions.length === 0 ? (
        <div className="pp-qaempty">
          <span className="muted">{t("none", { q })}</span>
          <button
            type="button"
            className="btn sm pri"
            onClick={() => {
              setDraft(q);
              setAsking(true);
            }}
          >
            {t("askThis")}
          </button>
        </div>
      ) : null}
      {!q && questions.length === 0 && mine.length === 0 ? (
        <p className="muted">{t("empty")}</p>
      ) : null}
    </div>
  );
}
