import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AddToCart } from "@/components/add-to-cart";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Countdown } from "@/components/deals/countdown";
import { Art, Icon } from "@/components/icon";
import { Price } from "@/components/price";
import { SampleAction } from "@/components/sample-action";
import { SampleMark } from "@/components/sample-mark";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { vietnamTime } from "@/lib/countdown";
import { vietnamDay } from "@/lib/delivery";
import { initials, keepUnits } from "@/lib/format";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled, text } from "@/sample";
import { couponPrice, productBySku, storeByCode, variantBySku } from "@/sample/catalog";
import { featuredSession, liveSessions, liveStatus } from "@/sample/live";

// Trang livestream (bản thiết kế `Live`): phiên đang phát (hoặc sắp phát / đã kết thúc), sản phẩm
// đang ghim kèm giá đọc lại từ catalog lúc mở trang, ai bán / ai giao / ai được hưởng (Luật Thương
// mại điện tử 2025: người dẫn là người tiếp thị liên kết, không phải người bán), lịch phát. Dữ liệu
// mẫu tới khi core có bước 49 (`GET /api/v1/affiliate/public/live-sessions/{id}`).

export async function generateMetadata(
  props: PageProps<"/[locale]/livestream">,
): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "live" });
  const { session } = await props.searchParams;
  return pageMetadata({
    locale,
    path: routes.live(),
    title: t("title"),
    description: t("lead"),
    // Mỗi phiên cụ thể (`?session=`) là một bản của cùng trang: chỉ trang chung vào chỉ mục.
    noindex: typeof session === "string",
  });
}

export default async function LivePage(props: PageProps<"/[locale]/livestream">) {
  if (!sampleDataEnabled()) notFound();
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "live" });
  const tt = await getTranslations({ locale, namespace: "time" });
  const tp = await getTranslations({ locale, namespace: "product" });
  const site = await siteIdentity(locale);
  const now = Date.now();
  const sessions = liveSessions(now);
  const { session: wanted } = await props.searchParams;
  const session =
    sessions.find((s) => s.id === wanted) ?? featuredSession(sessions, now) ?? sessions[0];
  if (!session) notFound();
  const status = liveStatus(session, now);
  const day = (at: number) => {
    const d = vietnamDay(at);
    return `${tt(`l${d.weekday}`)} ${d.dayMonth}`;
  };
  const timeLine = (s: typeof session) => {
    const st = liveStatus(s, now);
    if (st === "scheduled")
      return t("planned", { time: vietnamTime(s.starts_at), day: day(s.starts_at) });
    if (st === "live") return t("since", { time: vietnamTime(s.starts_at), day: day(s.starts_at) });
    return t("ranFrom", {
      start: vietnamTime(s.starts_at),
      end: vietnamTime(s.ends_at ?? s.starts_at),
      day: day(s.starts_at),
    });
  };
  const store = storeByCode(session.store);
  const platform = t(`platform_${session.platform}`);
  const pins = [...session.pins].sort((a, b) => b.pinned_at - a.pinned_at);
  const current = status === "live" ? pins[0] : undefined;
  const title = text(session.title, locale);
  const statusTone = status === "live" ? "b-sale" : status === "scheduled" ? "b-brand" : "b-plain";

  return (
    <main id="main" className="wrap lv-page">
      <Breadcrumbs items={[{ label: t("deals"), href: routes.deals() }, { label: t("title") }]} />
      <div className="rise lv-head">
        <span className="lv-status">
          <span className={`badge ${statusTone}`}>
            <span className="dot" aria-hidden="true" />
            {t(`status_${status}`)}
          </span>
          <span className="muted">{timeLine(session)}</span>
          <SampleMark endpoint="GET /api/v1/affiliate/public/live-sessions/{id}" step="49" />
        </span>
        <h1 className="dsp lv-title">{title}</h1>
      </div>

      <div className="lv-cols">
        <div className="lv-main">
          <div
            className={`lv-frame lv-${status}`}
            role="img"
            aria-label={t(`frame_${status}`, { platform })}
          >
            <div className="lv-art">
              <Art name={productBySku(session.pins[0]?.sku ?? "")?.art ?? "pan"} />
            </div>
            {status === "live" ? (
              <>
                <div className="lv-top">
                  <span className="lv-onair">
                    <i aria-hidden="true" />
                    {t("onAir")}
                  </span>
                  <span className="lv-glass">{t("on", { platform })}</span>
                </div>
                {current ? (
                  <div className="lv-pinned">
                    <span className="lv-pinned-k">{t("presenting")}</span>
                    <b>
                      {(() => {
                        const p = productBySku(current.sku);
                        const v = variantBySku(current.sku);
                        return p
                          ? keepUnits(
                              `${text(p.names, locale)}${v?.labels ? ` ${text(v.labels, locale)}` : ""}`,
                            )
                          : current.sku;
                      })()}
                    </b>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="lv-center">
                <span className="lv-glass">
                  {status === "scheduled"
                    ? t("on", { platform })
                    : t("endedAt", { time: vietnamTime(session.ends_at ?? now) })}
                </span>
                <span className="dsp lv-center-t">
                  {status === "scheduled"
                    ? t("startsAt", {
                        time: vietnamTime(session.starts_at),
                        day: day(session.starts_at),
                      })
                    : t("replay")}
                </span>
                {status === "scheduled" ? (
                  <>
                    <Countdown
                      start={session.starts_at}
                      end={session.starts_at + 3_600_000}
                      now={now}
                    />
                    <SampleAction
                      label={t("remind")}
                      doneLabel={t("reminded")}
                      message={t("remindSample")}
                      icon="clock"
                    />
                  </>
                ) : (
                  <span className="lv-center-s">{t("replayNote", { platform })}</span>
                )}
              </div>
            )}
          </div>

          <div className="lv-who">
            <div className="card lv-person">
              <span className="lv-ava" aria-hidden="true">
                {initials(session.host.name)}
              </span>
              <span className="lv-person-b">
                <span className="kick">{t("host")}</span>
                <b>{session.host.name}</b>
                <span className="lv-badges">
                  {session.host.verified ? (
                    <span className="badge b-ok">
                      <Icon name="check" small />
                      {t("idVerified")}
                    </span>
                  ) : null}
                  {session.host.phone_verified ? (
                    <span className="badge b-plain">{t("phoneVerified")}</span>
                  ) : null}
                </span>
                <span className="muted lv-small">
                  {session.host.kind === "partner"
                    ? t("hostPartner", { shop: site.name })
                    : t("hostStaff", { shop: site.name })}
                </span>
              </span>
            </div>
            <div className="card lv-person">
              <span className="lv-ava lv-ava-shop" aria-hidden="true">
                <Icon name="leaf" />
              </span>
              <span className="lv-person-b">
                <span className="kick">{t("seller")}</span>
                <b>{site.name}</b>
                <span className="lv-badges">
                  <span className="badge b-ok">
                    <Icon name="check" small />
                    {t("verified")}
                  </span>
                </span>
                <span className="muted lv-small">{t("sellerLegal")}</span>
              </span>
            </div>
          </div>

          <details className="lv-legal" open>
            <summary>
              <Icon name="shield" />
              <span className="lv-legal-t">
                <b>{t("whoTitle")}</b>
                <span className="muted">{t("whoSummary", { shop: site.name })}</span>
              </span>
              <Icon name="down" small />
            </summary>
            <ul className="lv-facts">
              <li>
                <Icon name="store" small />
                <span>
                  <b>{t("factSeller")}</b> {t("factSellerText", { shop: site.name })}
                </span>
              </li>
              <li>
                <Icon name="truck" small />
                <span>
                  <b>{t("factShip")}</b>{" "}
                  {t("factShipText", { shop: site.name, store: text(store.name, locale) })}
                </span>
              </li>
              <li>
                <Icon name="user" small />
                <span>
                  <b>{t("factHost")}</b>{" "}
                  {session.host.kind === "partner"
                    ? t("factHostPartner", { host: session.host.name, shop: site.name })
                    : t("factHostStaff", { shop: site.name })}
                </span>
              </li>
              <li>
                <Icon name="card" small />
                <span>
                  <b>{t("factPay")}</b> {t("factPayText", { shop: site.name })}
                </span>
              </li>
            </ul>
            <div className="lv-legal-f">
              <span className="muted lv-small">{t("logNote")}</span>
              <SampleAction
                label={t("report")}
                doneLabel={t("reported")}
                message={t("reportSample")}
                icon="flag"
              />
            </div>
          </details>
        </div>

        <aside className="lv-side" aria-labelledby="lv-side-h">
          <div className="lv-side-h">
            <h2 id="lv-side-h" className="dsp">
              {status === "ended" ? t("productsEnded") : t("productsPinned")}
            </h2>
            <span className="muted">{t("productCount", { count: pins.length })}</span>
          </div>
          {status === "scheduled" ? <p className="card lv-empty">{t("productsSoon")}</p> : null}
          <ul className="lv-list">
            {pins.map((pin) => {
              const product = productBySku(pin.sku);
              const variant = variantBySku(pin.sku);
              if (!product || !variant) return null;
              const name = keepUnits(
                `${text(product.names, locale)}${variant.labels ? ` ${text(variant.labels, locale)}` : ""}`,
              );
              const code = pin.code ? couponPrice(pin.sku) : null;
              const now_ = current?.sku === pin.sku;
              const href = `${routes.product(text(product.slugs, locale))}?sku=${encodeURIComponent(pin.sku)}`;
              return (
                <li className={`lv-row${now_ ? " now" : ""}`} key={pin.sku}>
                  <Link
                    href={href}
                    className={`thumb ${product.tone}`}
                    aria-label={name}
                    tabIndex={-1}
                  >
                    <Art name={product.art} />
                  </Link>
                  <span className="lv-info">
                    {now_ ? <span className="lv-now">{t("presenting")}</span> : null}
                    <Link href={href} className="pc-name">
                      {name}
                    </Link>
                    <Price money={{ amount: variant.price, currency: "VND" }} locale={locale} />
                    {code !== null && pin.code ? (
                      <span className="pc-code">
                        <Price money={{ amount: code, currency: "VND" }} locale={locale} sale />{" "}
                        {tp("withCode", { code: pin.code })}
                      </span>
                    ) : null}
                    <span className="muted lv-small">
                      {t("pinnedAt", { time: vietnamTime(pin.pinned_at) })}
                    </span>
                  </span>
                  {status !== "scheduled" ? (
                    <AddToCart
                      skus={[pin.sku]}
                      className="btn sm pri"
                      label={tp("addNamed", { name })}
                      done={t("addedFromLive", { name })}
                    >
                      {tp("add")}
                    </AddToCart>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="muted lv-small">{t("priceNote")}</p>
        </aside>
      </div>

      <section className="lv-sched" aria-labelledby="lv-sched-h">
        <h2 id="lv-sched-h" className="dsp lv-h2">
          {t("schedule")}
        </h2>
        <ul className="g3 lv-sessions">
          {[...sessions]
            .sort((a, b) => {
              const order = { live: 0, scheduled: 1, ended: 2 } as const;
              return (
                order[liveStatus(a, now)] - order[liveStatus(b, now)] || a.starts_at - b.starts_at
              );
            })
            .map((s) => {
              const st = liveStatus(s, now);
              const first = productBySku(s.pins[0]?.sku ?? "");
              return (
                <li key={s.id}>
                  <Link
                    className={`card lv-card${s.id === session.id ? " on" : ""}`}
                    href={`${routes.live()}?session=${encodeURIComponent(s.id)}`}
                    aria-current={s.id === session.id ? "page" : undefined}
                  >
                    <span className={`thumb ${first?.tone ?? "t1"}`}>
                      <Art name={first?.art ?? "pan"} />
                    </span>
                    <span className="lv-card-b">
                      <span
                        className={`badge ${st === "live" ? "b-sale" : st === "scheduled" ? "b-brand" : "b-plain"}`}
                      >
                        {t(`status_${st}`)}
                      </span>
                      <b>{text(s.title, locale)}</b>
                      <span className="muted lv-small">{timeLine(s)}</span>
                      <span className="muted lv-small">
                        {s.host.name} · {t(`platform_${s.platform}`)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
        </ul>
      </section>
    </main>
  );
}
