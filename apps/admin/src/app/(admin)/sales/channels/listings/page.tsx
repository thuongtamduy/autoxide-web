import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  delistAction,
  publishAction,
  retryListingAction,
} from "@/app/(admin)/sales/channels/actions";
import { LinkDialog } from "@/components/channels/forms";
import { ChannelChips } from "@/components/channels/listing-chips";
import { ConfirmButton } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import {
  BlockHead,
  DetailRow,
  hrefWith,
  OpenLink,
  param,
  Status,
} from "@/components/growth/blocks";
import { AutoFilter } from "@/components/ui/auto-filter";
import { InlineAction } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import {
  CHANNEL_STATES,
  CHANNELS_MANAGE,
  groupListings,
  listingCounts,
  matchesListing,
  pageOf,
  percentText,
} from "@/lib/channels";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import type { ListingStatus, PriceRule } from "@/sample/channel-accounts";
import { type Listing, listAccounts, listListings } from "@/sample/channels";
import { accountOptions, CHANNEL_TABS, variantOptions } from "../shared";

const BASE = "/sales/channels/listings";
/** Số sản phẩm một trang. */
const PAGE_SIZE = 20;
const TONE: Record<ListingStatus, string> = {
  draft: "b-draft",
  pending: "b-sched",
  live: "b-ok",
  rejected: "b-bad",
  delisted: "b-arch",
  error: "b-bad",
};

// Tab "Tin đăng": gắn biến thể với mã trên từng kênh. Gom theo sản phẩm (như "Sales channels" của
// Shopify, Sapo Omni): mỗi sản phẩm một dòng, mỗi tài khoản kênh một chip trạng thái; bấm mở dòng chi
// tiết để xem mã, giá kênh và đăng / thử lại / gỡ bán từng kênh. Không đặt giá riêng thì kênh dùng giá
// bảng giá của cửa hàng; có thể tăng / giảm theo % (làm tròn lên 1.000 ₫) hay đặt giá cố định có ngày
// hiệu lực. Giá kênh đã gồm thuế; khi nhập đơn, thuế tính lại ở Autoxide.
export default async function ListingsPage(props: PageProps<"/sales/channels/listings">) {
  if (!(await can(CHANNEL_TABS.listings))) notFound();
  const [t, locale, params, all, manage, accounts, variants, allAccounts] = await Promise.all([
    getTranslations("channels"),
    getLocale(),
    props.searchParams,
    listListings(),
    can(CHANNELS_MANAGE),
    accountOptions(),
    variantOptions(),
    listAccounts(),
  ]);
  // Ô "chưa đăng" chỉ cho tài khoản còn dùng được (bỏ kênh chưa mở, tài khoản đã ngắt).
  const slotAccounts = allAccounts.data
    .filter((a) => a.status !== "unavailable" && a.status !== "disconnected")
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind }));
  const products = groupListings<Listing>(all.data, slotAccounts);
  const q = param(params, "q").trim();
  const account = slotAccounts.some((a) => a.id === param(params, "account"))
    ? param(params, "account")
    : "";
  const state = CHANNEL_STATES.find((s) => s === param(params, "state")) ?? null;
  const open = param(params, "open");
  const filter = { q, account, state };
  const counts = listingCounts(products, filter);
  const matched = products.filter((p) => matchesListing(p, filter));
  const paged = pageOf(matched, Number(param(params, "page") || "1"), PAGE_SIZE);
  const base = {
    q,
    account,
    state: state ?? "",
    page: paged.page > 1 ? String(paged.page) : "",
  };
  const filtered = Boolean(q || account || state);

  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const rule = (r: PriceRule): string =>
    r.kind === "price_list"
      ? t("listings.rulePriceList")
      : r.kind === "markup"
        ? t("listings.ruleMarkup", { pct: percentText(r.markup_bp, locale) })
        : t("listings.ruleFixed", { date: r.effective_from });
  const actions = (l: Listing) => (
    <>
      {l.status === "draft" ? (
        <InlineAction
          action={publishAction}
          id={l.id}
          label={t("listings.publish")}
          ariaLabel={`${t("listings.publish")} ${l.external_sku}`}
          done={t("listings.published")}
        />
      ) : null}
      {l.status === "error" || l.status === "rejected" ? (
        <InlineAction
          action={retryListingAction}
          id={l.id}
          label={t("listings.retry")}
          ariaLabel={`${t("listings.retry")} ${l.external_sku}`}
          done={t("listings.retried")}
        />
      ) : null}
      {l.status === "live" ? (
        <ConfirmButton
          action={delistAction}
          fields={{ id: l.id }}
          label={t("listings.delist")}
          title={t("listings.delistTitle", { name: l.name, account: l.account_name })}
          points={[t("listings.delist1"), t("listings.delist2")]}
          submit={t("listings.delistSubmit")}
          done={t("listings.delisted")}
        />
      ) : null}
    </>
  );
  const facts = (l: Listing) =>
    [
      l.price_rule.kind === "markup" && l.web_price && l.channel_price
        ? t("listings.calc", {
            web: money(l.web_price.amount),
            pct: percentText(l.price_rule.markup_bp, locale),
            raw: money(
              Math.round((Number(l.web_price.amount) * (10_000 + l.price_rule.markup_bp)) / 10_000),
            ),
            price: money(l.channel_price.amount),
          })
        : null,
      l.price_rule.kind === "fixed"
        ? `${t("listings.fixedAmount")}: ${money(l.price_rule.amount)}`
        : null,
    ].filter((x): x is string => Boolean(x));

  return (
    <div className="blocks">
      <section className="block" aria-labelledby="listings-h">
        <BlockHead
          id="listings-h"
          title={t("listings.title")}
          about={t("listings.about")}
          actions={manage ? <LinkDialog accounts={accounts} variants={variants} /> : null}
        />
        <form className="filters" action={BASE}>
          <AutoFilter />
          <div className="fld grow">
            <label className="lab" htmlFor="listings-q">
              {t("listings.search")}
            </label>
            <input
              id="listings-q"
              className="inp"
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t("listings.searchHint")}
              autoComplete="off"
            />
          </div>
          <div className="fld">
            <label className="lab" htmlFor="listings-account">
              {t("listings.accountFilter")}
            </label>
            <select id="listings-account" className="inp" name="account" defaultValue={account}>
              <option value="">
                {t("listings.allAccounts", { count: listingCounts(products, { q, state }).all })}
              </option>
              {slotAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {t("listings.accountOption", {
                    name: a.name,
                    count: counts.accounts[a.id] ?? 0,
                  })}
                </option>
              ))}
            </select>
          </div>
          {state ? <input type="hidden" name="state" value={state} /> : null}
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("listings.find")}
            </button>
          </div>
        </form>
        <Chips
          label={t("listings.filter")}
          chips={[
            {
              href: hrefWith(BASE, { q, account }, {}),
              label: t("listings.all"),
              on: !state,
              count: counts.all,
            },
            ...CHANNEL_STATES.map((s) => ({
              href: hrefWith(BASE, { q, account }, { state: s }),
              label: t(`listings.states.${s}`),
              on: state === s,
              count: counts.states[s],
            })),
          ]}
        />
        {paged.items.length === 0 ? (
          <EmptyState
            icon="search"
            title={t("listings.empty")}
            actions={
              filtered ? (
                <Link className="btn sm" href={BASE}>
                  {t("listings.clear")}
                </Link>
              ) : null
            }
          >
            {t("listings.emptyHint")}
          </EmptyState>
        ) : (
          <div className="card tcard">
            <Table cards className="cl-table">
              <thead>
                <tr>
                  <Th>{t("listings.product")}</Th>
                  <Th className="text-right">{t("listings.webPrice")}</Th>
                  <Th>{t("listings.channels")}</Th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((p) => {
                  const isOpen = open === p.variant_id;
                  const openHref = hrefWith(BASE, base, { open: p.variant_id });
                  const closeHref = hrefWith(BASE, base, {});
                  const web = p.slots.find((s) => s.listing?.web_price)?.listing?.web_price;
                  return [
                    <tr key={p.variant_id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <OpenLink open={isOpen} href={openHref} closeHref={closeHref}>
                            {p.name}
                          </OpenLink>
                          <span className="sub mono">{p.sku}</span>
                        </span>
                      </Td>
                      <Td label={t("listings.webPrice")} className="text-right num">
                        {web ? money(web.amount) : "—"}
                      </Td>
                      <Td label={t("listings.channels")} className="cl-chips-cell">
                        <ChannelChips slots={p.slots} href={isOpen ? closeHref : openHref} />
                      </Td>
                    </tr>,
                    isOpen ? (
                      <DetailRow key={`${p.variant_id}-open`} cols={3}>
                        <h3 className="h2">{t("listings.channelsOf", { name: p.name })}</h3>
                        <ul className="cl-chans">
                          {p.slots.map(({ account: a, listing: l }) => (
                            <li key={a.id} className="cl-chan">
                              <span className="cell2 cl-chan-acc">
                                <b>{a.name}</b>
                                <span className="sub">{t(`kinds.${a.kind}`)}</span>
                              </span>
                              {l ? (
                                <>
                                  <span className="cell2">
                                    <span className="sub">{t("listings.code")}</span>
                                    <span className="mono">{l.external_sku}</span>
                                  </span>
                                  <span className="cell2">
                                    <span className="sub">{t("listings.channelPrice")}</span>
                                    <span>
                                      <span className="num">
                                        {l.channel_price ? money(l.channel_price.amount) : "—"}
                                      </span>{" "}
                                      <span className="sub">{rule(l.price_rule)}</span>
                                    </span>
                                  </span>
                                  <span className="cl-chan-state">
                                    <Status tone={TONE[l.status]}>
                                      {t(`listingState.${l.status}`)}
                                    </Status>
                                  </span>
                                  <span className="row-acts cl-chan-acts">
                                    {manage ? actions(l) : null}
                                  </span>
                                  {facts(l).length > 0 || l.last_pushed_at || l.last_error ? (
                                    <span className="cl-chan-more">
                                      {facts(l).map((f) => (
                                        <span key={f}>{f}</span>
                                      ))}
                                      {l.last_pushed_at ? (
                                        <span>
                                          {t("listings.pushed")}: <Time value={l.last_pushed_at} />
                                        </span>
                                      ) : null}
                                      {l.last_error ? (
                                        <span className="cl-err">
                                          {t("listings.error")}:{" "}
                                          {t(`codes.${l.last_error.replaceAll(".", "_")}`, {
                                            detail: t("listings.missingAttr"),
                                          })}
                                        </span>
                                      ) : null}
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="cl-chan-none">
                                  <Status tone="b-draft">{t("listings.notLinked")}</Status>
                                  <span className="sub">{t("listings.notLinkedHint")}</span>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="fhint">{t("listings.taxNote")}</p>
                      </DetailRow>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          </div>
        )}
        {matched.length > 0 ? (
          <nav className="cl-pager" aria-label={t("listings.pages")}>
            <span className="sub">
              {t("listings.shown", { from: paged.from, to: paged.to, total: matched.length })}
            </span>
            {paged.pages > 1 ? (
              <span className="pager">
                {paged.page > 1 ? (
                  <Link
                    className="btn sm"
                    rel="prev"
                    href={hrefWith(BASE, base, {
                      page: paged.page - 1 > 1 ? String(paged.page - 1) : null,
                    })}
                  >
                    {t("listings.prev")}
                  </Link>
                ) : null}
                {paged.page < paged.pages ? (
                  <Link
                    className="btn sm"
                    rel="next"
                    href={hrefWith(BASE, base, { page: String(paged.page + 1) })}
                  >
                    {t("listings.next")}
                  </Link>
                ) : null}
              </span>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
