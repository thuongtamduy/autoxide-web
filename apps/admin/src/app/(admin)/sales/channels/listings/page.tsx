import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  delistAction,
  publishAction,
  retryListingAction,
} from "@/app/(admin)/sales/channels/actions";
import { LinkDialog } from "@/components/channels/forms";
import { ConfirmButton } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import {
  BlockHead,
  Cell2,
  DetailRow,
  hrefWith,
  KV,
  OpenLink,
  param,
  Status,
} from "@/components/growth/blocks";
import { InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CHANNELS_MANAGE, percentText } from "@/lib/channels";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import type { ListingStatus, PriceRule } from "@/sample/channel-accounts";
import { type ListingChip, listListings } from "@/sample/channels";
import { accountOptions, CHANNEL_TABS, variantOptions } from "../shared";

const CHIPS: readonly ListingChip[] = ["live", "pending", "error", "draft"];
const TONE: Record<ListingStatus, string> = {
  draft: "b-draft",
  pending: "b-sched",
  live: "b-ok",
  rejected: "b-bad",
  delisted: "b-arch",
  error: "b-bad",
};

// Tab "Liên kết sản phẩm": gắn biến thể với mã trên từng kênh. Không đặt giá riêng thì kênh dùng giá bảng
// giá của cửa hàng; có thể tăng / giảm theo % (làm tròn lên 1.000 ₫) hay đặt giá cố định có ngày hiệu lực.
// Giá kênh đã gồm thuế; khi nhập đơn, thuế tính lại ở Autoxide.
export default async function ListingsPage(props: PageProps<"/sales/channels/listings">) {
  if (!(await can(CHANNEL_TABS.listings))) notFound();
  const [t, locale, params, all, manage, accounts, variants] = await Promise.all([
    getTranslations("channels"),
    getLocale(),
    props.searchParams,
    listListings(),
    can(CHANNELS_MANAGE),
    accountOptions(),
    variantOptions(),
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const open = param(params, "open");
  const base = { chip: chip ?? "" };
  const rows = all.data.filter(
    (l) =>
      !chip ||
      (chip === "error" ? l.status === "error" || l.status === "rejected" : l.status === chip),
  );
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const rule = (r: PriceRule): string =>
    r.kind === "price_list"
      ? t("listings.rulePriceList")
      : r.kind === "markup"
        ? t("listings.ruleMarkup", { pct: percentText(r.markup_bp, locale) })
        : t("listings.ruleFixed", { date: r.effective_from });
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="listings-h">
        <BlockHead
          id="listings-h"
          title={t("listings.title")}
          about={t("listings.about")}
          actions={manage ? <LinkDialog accounts={accounts} variants={variants} /> : null}
        />
        <Chips
          label={t("listings.filter")}
          chips={[
            {
              href: "/sales/channels/listings",
              label: t("listings.all"),
              on: !chip,
              count: all.data.length,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/sales/channels/listings", {}, { chip: c }),
              label: t(`listingState.${c}`),
              on: chip === c,
              count: all.data.filter((l) =>
                c === "error" ? l.status === "error" || l.status === "rejected" : l.status === c,
              ).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("listings.product")}</Th>
                <Th>{t("listings.account")}</Th>
                <Th>{t("listings.code")}</Th>
                <Th className="text-right">{t("listings.webPrice")}</Th>
                <Th className="text-right">{t("listings.channelPrice")}</Th>
                <Th>{t("listings.state")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const isOpen = open === l.id;
                return [
                  <tr key={l.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <OpenLink
                          open={isOpen}
                          href={hrefWith(
                            "/sales/channels/listings",
                            base,
                            { open: l.id },
                            "#listings-h",
                          )}
                          closeHref={hrefWith("/sales/channels/listings", base, {})}
                        >
                          {l.name}
                        </OpenLink>
                        <span className="sub mono">{l.sku}</span>
                      </span>
                    </Td>
                    <Td label={t("listings.account")}>
                      <Cell2 main={l.account_name} sub={t(`kinds.${l.kind}`)} />
                    </Td>
                    <Td label={t("listings.code")} className="mono">
                      {l.external_sku}
                    </Td>
                    <Td label={t("listings.webPrice")} className="text-right num">
                      {l.web_price ? money(l.web_price.amount) : "—"}
                    </Td>
                    <Td label={t("listings.channelPrice")} className="text-right">
                      <Cell2
                        main={
                          <span className="num">
                            {l.channel_price ? money(l.channel_price.amount) : "—"}
                          </span>
                        }
                        sub={rule(l.price_rule)}
                      />
                    </Td>
                    <Td label={t("listings.state")}>
                      <Status tone={TONE[l.status]}>{t(`listingState.${l.status}`)}</Status>
                    </Td>
                    <Td className="rt-acts">
                      {manage && l.status === "draft" ? (
                        <InlineAction
                          action={publishAction}
                          id={l.id}
                          label={t("listings.publish")}
                          ariaLabel={`${t("listings.publish")} ${l.external_sku}`}
                          done={t("listings.published")}
                        />
                      ) : null}
                      {manage && (l.status === "error" || l.status === "rejected") ? (
                        <InlineAction
                          action={retryListingAction}
                          id={l.id}
                          label={t("listings.retry")}
                          ariaLabel={`${t("listings.retry")} ${l.external_sku}`}
                          done={t("listings.retried")}
                        />
                      ) : null}
                      {manage && l.status === "live" ? (
                        <ConfirmButton
                          action={delistAction}
                          fields={{ id: l.id }}
                          label={t("listings.delist")}
                          title={t("listings.delistTitle", {
                            name: l.name,
                            account: l.account_name,
                          })}
                          points={[t("listings.delist1"), t("listings.delist2")]}
                          submit={t("listings.delistSubmit")}
                          done={t("listings.delisted")}
                        />
                      ) : null}
                    </Td>
                  </tr>,
                  isOpen ? (
                    <DetailRow key={`${l.id}-open`} cols={7}>
                      <h3 className="h2">
                        {l.name} · {l.account_name}
                      </h3>
                      <KV
                        items={[
                          [t("listings.priceRule"), rule(l.price_rule)],
                          l.price_rule.kind === "markup" && l.web_price && l.channel_price
                            ? [
                                t("listings.howCalc"),
                                t("listings.calc", {
                                  web: money(l.web_price.amount),
                                  pct: percentText(l.price_rule.markup_bp, locale),
                                  raw: money(
                                    Math.round(
                                      (Number(l.web_price.amount) *
                                        (10_000 + l.price_rule.markup_bp)) /
                                        10_000,
                                    ),
                                  ),
                                  price: money(l.channel_price.amount),
                                }),
                              ]
                            : null,
                          l.price_rule.kind === "fixed"
                            ? [t("listings.fixedAmount"), money(l.price_rule.amount)]
                            : null,
                          l.last_pushed_at
                            ? [t("listings.pushed"), <Time key="p" value={l.last_pushed_at} />]
                            : null,
                          l.last_error
                            ? [
                                t("listings.error"),
                                t(`codes.${l.last_error.replaceAll(".", "_")}`, {
                                  detail: t("listings.missingAttr"),
                                }),
                              ]
                            : null,
                        ]}
                      />
                      <p className="fhint">{t("listings.taxNote")}</p>
                    </DetailRow>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
