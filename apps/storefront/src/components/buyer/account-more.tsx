import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icon";
import { SampleMark } from "@/components/sample-mark";
import type { Locale } from "@/i18n/routing";
import { formatMoney, keepUnits } from "@/lib/format";
import { text } from "@/sample";
import {
  DISPUTE,
  DISPUTE_MESSAGES,
  DOWNLOAD_ORDER,
  DOWNLOAD_UNTIL,
  disputeActions,
  disputeOpen,
  downloadsLeft,
  platformNote,
  SAMPLE_DOWNLOADS,
  SAMPLE_WARRANTIES,
  warrantyActive,
} from "@/sample/account-more";
import {
  disputeStep,
  downloadFile,
  readAccountMore,
  resendDownload,
  signOutOthers,
} from "@/sample/account-more-actions";
import { EvidenceForm, WarrantyClaim } from "./account-more-forms";
import { formatDateTime } from "./day-range";

// Bốn mục của tài khoản người mua theo bản thiết kế `Account`: Tải hàng số, Bảo hành, Tranh chấp, Đăng
// nhập và bảo mật. Toàn bộ là mẫu (`src/sample/account-more.ts` ghi endpoint thay thế). Nút là form
// thật (Server Action), bấm được cả khi trang chưa chạy JavaScript.

/** `YYYY-MM-DD` → `dd/mm/yyyy`. */
function day(value: string): string {
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

export async function DownloadsSection({ locale, owner }: { locale: Locale; owner: boolean }) {
  const t = await getTranslations({ locale, namespace: "account.downloads" });
  if (!owner) return <p className="card acx-card muted">{t("empty")}</p>;
  const state = await readAccountMore();
  return (
    <>
      <div className="card acx-card acx-points">
        <span className="acx-points-head">
          <b className="dsp num">{t("count", { count: SAMPLE_DOWNLOADS.length })}</b>
          <span className="muted">
            {t("from", { order: DOWNLOAD_ORDER })}{" "}
            <SampleMark endpoint="GET /api/v1/orders/me/downloads" step="41, 45" />
          </span>
        </span>
        <span className="muted">{t("note", { until: day(DOWNLOAD_UNTIL) })}</span>
      </div>
      <div className="card acx-card">
        {SAMPLE_DOWNLOADS.map((file) => {
          const left = downloadsLeft(file.id, state.used);
          const resent = state.resent.includes(file.id);
          return (
            <div className="acx-row" key={file.id} data-testid={`dl-${file.id}`}>
              <Icon name={file.kind === "video" ? "play" : "doc"} small />
              <span className="acx-rbody">
                <span>{text(file.title, locale)}</span>
                <span className="muted">
                  {text(file.meta, locale)} ·{" "}
                  {left > 0 ? t("left", { left, until: day(DOWNLOAD_UNTIL) }) : t("usedUp")}
                </span>
                {resent ? (
                  <span className="muted" role="status">
                    {t("resent")}
                  </span>
                ) : null}
              </span>
              <span className="acx-rside">
                <span className={`badge ${left === 0 ? "b-bad" : left === 1 ? "b-warn" : "b-ok"}`}>
                  {left === 0 ? t("badgeNone") : t("badgeLeft", { left })}
                </span>
                <form action={downloadFile}>
                  <input type="hidden" name="file" value={file.id} />
                  <button type="submit" className="btn sm pri" disabled={left === 0}>
                    {t("download")}
                  </button>
                </form>
                <form action={resendDownload}>
                  <input type="hidden" name="file" value={file.id} />
                  <button type="submit" className="btn sm ghost" disabled={left === 0}>
                    {t("resend")}
                  </button>
                </form>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export async function WarrantySection({ locale, owner }: { locale: Locale; owner: boolean }) {
  const t = await getTranslations({ locale, namespace: "account.warranty" });
  if (!owner) return <p className="card acx-card muted">{t("empty")}</p>;
  const state = await readAccountMore();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="card acx-card">
      <p className="muted">
        {t("note")} <SampleMark endpoint="GET /api/v1/orders/me/warranties" step="45" />
      </p>
      {SAMPLE_WARRANTIES.map((item) => {
        const active = warrantyActive(item, today);
        const claimed = state.claims[item.sku];
        return (
          <div className="acx-row" key={item.sku} data-testid={`wr-${item.sku}`}>
            <Icon name="shield" small />
            <span className="acx-rbody">
              <span>
                {keepUnits(text(item.name, locale))} · {t("months", { months: item.months })}
              </span>
              <span className="muted">
                {t("from", { order: item.order })} ·{" "}
                {active
                  ? t("until", { until: day(item.until) })
                  : t("ended", { until: day(item.until) })}
                {item.scope ? ` · ${text(item.scope, locale)}` : ""}
              </span>
              {claimed ? (
                <span className="muted" role="status">
                  {t("claimed", { at: formatDateTime(claimed, locale) })}
                </span>
              ) : null}
            </span>
            <span className="acx-rside">
              <span className={`badge ${active ? "b-ok" : "b-plain"}`}>
                {active ? t("active") : t("expired")}
              </span>
              {active && !claimed ? (
                <WarrantyClaim sku={item.sku} name={text(item.name, locale)} />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export async function DisputesSection({ locale, owner }: { locale: Locale; owner: boolean }) {
  const t = await getTranslations({ locale, namespace: "account.disputes" });
  if (!owner) return <p className="card acx-card muted">{t("empty")}</p>;
  const state = await readAccountMore();
  const { status, refund, added } = state.dispute;
  const open = disputeOpen(status);
  const money = (amount: number) => formatMoney({ amount, currency: "VND" }, locale);
  const steps: { label: string; when: string; done: boolean }[] = [
    { label: t("steps.opened"), when: formatDateTime(DISPUTE.opened, locale), done: true },
    {
      label: t("steps.responded"),
      when: t("steps.respondedWhen", {
        at: formatDateTime(DISPUTE.responded, locale),
        by: formatDateTime(DISPUTE.respondBy, locale),
      }),
      done: true,
    },
    {
      label: t("steps.platform"),
      when:
        status === "seller_responded"
          ? t("steps.platformIfAsked")
          : status === "escalated"
            ? t("steps.platformBy", { by: day(DISPUTE.decideBy) })
            : refund === DISPUTE.asked
              ? t("steps.platformDecided")
              : t("steps.notNeeded"),
      done: !open,
    },
    {
      label: t("steps.result"),
      when:
        status === "resolved"
          ? t("steps.refunded", { amount: money(refund ?? 0) })
          : status === "withdrawn"
            ? t("steps.withdrawn")
            : t("steps.none"),
      done: !open,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  const note = platformNote(status, refund);
  const messages = [
    ...DISPUTE_MESSAGES.map((m) => ({
      key: `seed-${m.at}`,
      who: t(`who.${m.who}`, { seller: DISPUTE.seller }),
      at: formatDateTime(m.at, locale),
      body: typeof m.body === "string" ? m.body : text(m.body, locale),
      photos: m.photos.map((p) => (typeof p === "string" ? p : text(p, locale))),
    })),
    ...(note
      ? [
          {
            key: `platform-${status}`,
            who: t("who.platform"),
            at: "",
            body: text(note, locale),
            photos: [] as string[],
          },
        ]
      : []),
    ...added.map((m) => ({
      key: `added-${m.at}`,
      who: t("who.buyer"),
      at: formatDateTime(m.at, locale),
      body: m.body || t("photosOnly"),
      photos: m.photos,
    })),
  ];
  return (
    <>
      <div className="card acx-card acx-points" data-testid="dispute">
        <span className="acx-points-head">
          <b className="dsp num">{DISPUTE.number}</b>
          <span className="muted">
            {t("about", { order: DISPUTE.order, seller: DISPUTE.seller })}{" "}
            <SampleMark endpoint="GET /api/v1/marketplace/me/disputes/{id}" step="46" />
          </span>
          <span className={`badge ${open ? "b-warn" : "b-ok"}`} data-testid="dispute-status">
            {t(`status.${status}`)}
          </span>
        </span>
        <span className="muted">
          {t(`due.${status}`, { by: day(DISPUTE.decideBy), amount: money(refund ?? 0) })}
        </span>
        <ol className="acx-steps">
          {steps.map((step, i) => (
            <li
              key={step.label}
              data-state={step.done ? "done" : i === current ? "now" : "next"}
              aria-current={i === current ? "step" : undefined}
            >
              <b>{step.label}</b>
              <span className="muted">{step.when}</span>
            </li>
          ))}
        </ol>
        <dl className="acx-facts">
          <dt>{t("facts.reason")}</dt>
          <dd>{t("facts.reasonValue")}</dd>
          <dt>{t("facts.asked")}</dt>
          <dd>{t("facts.askedValue", { amount: money(DISPUTE.asked) })}</dd>
          <dt>{t("facts.offered")}</dt>
          <dd>{t("facts.offeredValue", { amount: money(DISPUTE.offered) })}</dd>
          <dt>{t("facts.money")}</dt>
          <dd>
            {open
              ? t("facts.held", { amount: money(DISPUTE.total) })
              : status === "resolved"
                ? t("facts.split", { amount: money(refund ?? 0) })
                : t("facts.released", { amount: money(DISPUTE.total) })}
          </dd>
        </dl>
        {open ? (
          <div className="acx-acts">
            {disputeActions(status).map((step) => (
              <form action={disputeStep} key={step}>
                <input type="hidden" name="step" value={step} />
                <button
                  type="submit"
                  className={`btn sm${step === "accept_offer" ? " pri" : step === "withdraw" ? " ghost" : ""}`}
                >
                  {t(`actions.${step}`, { amount: money(DISPUTE.offered) })}
                </button>
              </form>
            ))}
          </div>
        ) : null}
        <p className="muted">{t("held")}</p>
      </div>
      <div className="card acx-card">
        <b>{t("thread")}</b>
        <p className="muted">{t("threadNote")}</p>
        <ol className="acx-thread">
          {messages.map((m) => (
            <li key={m.key}>
              <span className="acx-thread-head">
                <b>{m.who}</b>
                {m.at ? <span className="muted">{m.at}</span> : null}
              </span>
              <span>{m.body}</span>
              {m.photos.length > 0 ? (
                <ul className="acx-photos" aria-label={t("photos")}>
                  {m.photos.map((p) => (
                    <li key={p}>
                      <Icon name="doc" small />
                      {p}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
        {open ? <EvidenceForm /> : <p className="muted">{t("closed")}</p>}
      </div>
    </>
  );
}

export async function SecuritySection({
  locale,
  phone,
  owner,
}: {
  locale: Locale;
  phone: string;
  owner: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "account.security" });
  const state = await readAccountMore();
  const others = owner && !state.signedOutOthers ? 1 : 0;
  const masked = `${phone.slice(0, 2)}xx xxx ${phone.slice(-3)}`;
  return (
    <div className="card acx-card">
      <p className="muted">
        {t("note")} <SampleMark endpoint="/api/v1/customers/me (đăng nhập người mua)" step="47" />
      </p>
      <div className="acx-row">
        <Icon name="phone" small />
        <span className="acx-rbody">
          <span>{t("phone", { phone: masked })}</span>
          <span className="muted">{t("phoneWhy")}</span>
        </span>
        <span className="acx-rside">
          <span className="badge b-ok">{t("verified")}</span>
        </span>
      </div>
      <div className="acx-row">
        <Icon name="key" small />
        <span className="acx-rbody">
          <span>{t("passkey")}</span>
          <span className="muted">{t("passkeyWhy")}</span>
        </span>
        <span className="acx-rside">
          <span className="badge b-plain">{t("comingSoon")}</span>
        </span>
      </div>
      <div className="acx-row">
        <Icon name="lock" small />
        <span className="acx-rbody">
          <span>{t("password")}</span>
          <span className="muted">{t("passwordWhy")}</span>
        </span>
        <span className="acx-rside">
          <span className="badge b-plain">{t("none")}</span>
        </span>
      </div>
      <div className="acx-row" data-testid="devices">
        <Icon name="globe" small />
        <span className="acx-rbody">
          <span>{t("devices")}</span>
          <span className="muted">{others > 0 ? t("devicesList") : t("devicesThis")}</span>
        </span>
        <span className="acx-rside">
          <span className="badge b-plain">{t("deviceCount", { count: others + 1 })}</span>
          {others > 0 ? (
            <form action={signOutOthers}>
              <button type="submit" className="btn sm">
                {t("signOutOthers")}
              </button>
            </form>
          ) : null}
        </span>
      </div>
    </div>
  );
}
