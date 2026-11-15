"use client";

// Nút "?" ở đầu mọi trang quản trị và bảng "Trợ giúp" của trang đang mở (thiết kế mục 6): bài hướng dẫn
// của trang, tìm trong mọi bài, phím tắt, "Có gì mới", tài liệu API cho màn kỹ thuật. Trang đang mở lấy
// từ địa chỉ (usePathname) nên chạy ở trình duyệt; chữ lấy từ `messages/`, không có token.
//
// Popover của HTML: Esc và bấm ra ngoài tự đóng; trên điện thoại CSS biến bảng thành tấm trượt từ đáy.
// Chấm trên nút "?" hiện khi còn tin chưa xem; mở bảng là đã xem (ghi cờ `whatsnew.seen` ở core).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import { markNewsSeen } from "@/help/actions";
import {
  type ArticleText,
  HELP_ID,
  HELP_PAGES,
  helpPageOf,
  OPENAPI_DOWNLOAD,
  searchArticles,
} from "@/help/pages";
import { type NewsItem, unseenNews, WHATS_NEW } from "@/help/whats-new";

/** Phím đang gõ vào ô nhập: "?" khi đó là chữ, không phải phím tắt. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Nút "?" của khung. Máy chủ gửi một promise cho phiên bản "Có gì mới" đã xem (cờ `whatsnew.seen`):
 * khung không chờ lời gọi cờ, nút hiện ngay (chưa có chấm), có cờ thì hiện chấm. Đọc promise trong
 * effect chứ không qua `Suspense`: đổi từ phần chờ sang phần thật sẽ dựng lại nút và bảng, đóng bảng
 * người dùng vừa mở.
 */
export function Help({ seen }: { seen: Promise<string | null> }) {
  const [known, setKnown] = useState<{ seen: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    seen.then(
      (value) => live && setKnown({ seen: value }),
      () => live && setKnown({ seen: null }),
    );
    return () => {
      live = false;
    };
  }, [seen]);
  return <HelpView seen={known ? known.seen : undefined} />;
}

/**
 * Nút "?" và bảng của nó (hai phần tử anh em: popover không được nằm trong nút). `seen`: phiên bản
 * đã xem, `null` khi chưa xem lần nào, `undefined` khi chưa biết (chưa có chấm, mở bảng không ghi gì).
 */
export function HelpView({ seen }: { seen: string | null | undefined }) {
  const t = useTranslations("help");
  // Đã ghi "đã xem" trong lần mở trang này: chấm mất ngay, không chờ core trả lời.
  const [marked, setMarked] = useState(false);
  const unseen = seen === undefined ? [] : unseenNews(WHATS_NEW, seen);
  const fresh = !marked && unseen.length > 0;
  return (
    <>
      <button
        type="button"
        className="btn ghost sq helpbtn"
        popoverTarget={HELP_ID}
        aria-label={fresh ? t("buttonNews") : t("button")}
        data-tip={t("tooltip")}
        data-tip-end=""
      >
        <Icon name="help" />
        {fresh ? <span className="help-dot" aria-hidden="true" data-testid="help-dot" /> : null}
      </button>
      <HelpPanel unseen={unseen} pending={fresh} onSeen={() => setMarked(true)} />
    </>
  );
}

function HelpPanel({
  unseen,
  pending,
  onSeen,
}: {
  unseen: readonly NewsItem[];
  /** Còn tin chưa ghi là đã xem: mở bảng thì ghi. */
  pending: boolean;
  onSeen: () => void;
}) {
  const t = useTranslations("help");
  const pathname = usePathname();
  const page = helpPageOf(pathname);
  const panel = useRef<HTMLDivElement>(null);
  const open = useRef(false);
  const [query, setQuery] = useState("");
  const [, start] = useTransition();
  // Tin có nhãn "Mới": giữ theo lần mở bảng đầu tiên, để nhãn còn nguyên lúc đang đọc.
  const [badged, setBadged] = useState<ReadonlySet<string> | null>(null);
  const fresh = badged ?? new Set(unseen.map((n) => n.id));
  // Effect bên dưới gắn một lần; giá trị mới nhất đọc qua ref.
  const latest = useRef({ pending, fresh, onSeen });
  latest.current = { pending, fresh, onSeen };

  const pageName = (id: string) => t(`pages.${id}.name`);
  const articles = useMemo<ArticleText[]>(
    () =>
      HELP_PAGES.flatMap((p) =>
        p.articles.map((a) => ({
          page: p.id,
          id: a.id,
          title: t(`pages.${p.id}.articles.${a.id}.title`),
          summary: t(`pages.${p.id}.articles.${a.id}.summary`),
          href: a.href ?? null,
        })),
      ),
    [t],
  );
  const searching = query.trim() !== "";
  const shown = searching
    ? searchArticles(articles, query, pageName)
    : articles.filter((a) => a.page === page?.id);

  // Phím "?" mở trợ giúp ở mọi màn (trừ khi đang gõ chữ).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (typing(event.target) || open.current) return;
      event.preventDefault();
      panel.current?.showPopover();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const onToggle = (event: Event) => {
      open.current = (event as ToggleEvent).newState === "open";
      if (!open.current) return;
      setQuery("");
      const now = latest.current;
      setBadged((kept) => kept ?? now.fresh);
      if (now.pending) {
        now.onSeen();
        start(async () => {
          // Ghi không được (core không trả lời): lần tải trang sau chấm hiện lại, không sao.
          await markNewsSeen();
        });
      }
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);

  const close = () => panel.current?.hidePopover();

  return (
    <div
      className="helppanel"
      id={HELP_ID}
      popover="auto"
      ref={panel}
      role="dialog"
      aria-label={page ? t("titlePage", { page: pageName(page.id) }) : t("title")}
    >
      <div className="hp-head">
        <b>{page ? t("titlePage", { page: pageName(page.id) }) : t("title")}</b>
        <button
          type="button"
          className="btn ghost sm sq"
          popoverTarget={HELP_ID}
          popoverTargetAction="hide"
          aria-label={t("close")}
        >
          <Icon name="x" />
        </button>
      </div>
      <label className="hp-search">
        <Icon name="search" small />
        <input
          className="inp"
          type="search"
          value={query}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {searching || page ? (
        <>
          <span className="cap">{searching ? t("found") : t("onThisPage")}</span>
          {shown.map((a) =>
            a.href ? (
              <Link key={`${a.page}/${a.id}`} className="hp-art" href={a.href} onClick={close}>
                <b>{a.title}</b>
                <span className="hp-sub">
                  {searching && a.page !== page?.id ? `${pageName(a.page)} · ` : ""}
                  {a.summary}
                </span>
              </Link>
            ) : (
              <div key={`${a.page}/${a.id}`} className="hp-art plain">
                <b>{a.title}</b>
                <span className="hp-sub">{a.summary}</span>
              </div>
            ),
          )}
          {searching && shown.length === 0 ? <p className="hp-none">{t("noMatch")}</p> : null}
        </>
      ) : null}
      {page && !searching ? (
        <p className="hp-hint">
          <Icon name="info" small />
          <span>{t("tipHint")}</span>
        </p>
      ) : null}

      <span className="cap hide-mobile">{t("shortcuts")}</span>
      <div className="hp-keys hide-mobile">
        <span>
          <span className="kbd">Ctrl</span>
          <span className="kbd">K</span>
        </span>
        <span>{t("keys.search")}</span>
        <span>
          <span className="kbd">?</span>
        </span>
        <span>{t("keys.help")}</span>
        <span>
          <span className="kbd">Esc</span>
        </span>
        <span>{t("keys.close")}</span>
      </div>

      <span className="cap">{t("news.title")}</span>
      <ul className="hp-news" aria-label={t("news.title")}>
        {WHATS_NEW.map((item) => (
          <li key={item.id}>
            <b>
              {t(`news.items.${item.id}.title`)}
              {fresh.has(item.id) ? <span className="intro-badge">{t("news.badge")}</span> : null}
            </b>
            <span className="hp-sub">{t(`news.items.${item.id}.body`)}</span>
          </li>
        ))}
      </ul>

      {page?.api ? (
        <>
          <span className="cap">{t("moreHelp")}</span>
          <a className="hp-link" href={OPENAPI_DOWNLOAD} download>
            <Icon name="file" small />
            <span className="hp-link-text">
              <b>{t("api.title")}</b>
              <span className="hp-sub">{t("api.body")}</span>
            </span>
          </a>
        </>
      ) : null}
    </div>
  );
}
