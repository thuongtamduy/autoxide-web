import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AdjustPointsDialog, NoteDialog, TagsDialog } from "@/components/customers/forms";
import { Chips, Pager } from "@/components/engage/common";
import {
  BlockHead,
  DetailRow,
  hrefWith,
  Kpis,
  KV,
  Lines,
  OpenLink,
  param,
  Status,
  Timeline,
} from "@/components/growth/blocks";
import { AutoFilter } from "@/components/ui/auto-filter";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import {
  CUSTOMERS_LOYALTY_ADJUST,
  CUSTOMERS_MANAGE,
  maskBirthday,
  maskEmail,
  maskPhone,
} from "@/lib/customers";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  customerStats,
  getProfile,
  listGroups,
  listProfiles,
  loyaltyStats,
  type ProfileChip,
  profileNames,
} from "@/sample/customers";
import { CUSTOMER_TABS } from "./shared";

const CHIPS: readonly ProfileChip[] = ["account", "phone", "gold"];
const TIER_TONE = { member: "b-arch", silver: "b-info", gold: "b-warn" } as const;

// Tab "Hồ sơ khách": mỗi người mua một hồ sơ (theo tài khoản hoặc số điện thoại), lịch sử mua dựng từ đơn
// thật của bộ mẫu. Dữ liệu cá nhân (SĐT, email, ngày sinh) luôn che bớt trên màn (Luật BVDLCN 91/2025).
export default async function ProfilesPage(props: PageProps<"/customers">) {
  if (!(await can(CUSTOMER_TABS.profiles))) notFound();
  const [t, locale, params] = await Promise.all([
    getTranslations("customers"),
    getLocale(),
    props.searchParams,
  ]);
  const q = param(params, "q").slice(0, 60);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const cursor = param(params, "cursor") || null;
  const open = param(params, "open");
  const [stats, page, groups, loyalty, names, manage, adjust, detail] = await Promise.all([
    customerStats(),
    listProfiles({ q, chip, cursor, limit: 20 }),
    listGroups(),
    loyaltyStats(),
    profileNames(),
    can(CUSTOMERS_MANAGE),
    can(CUSTOMERS_LOYALTY_ADJUST),
    open ? getProfile(open) : Promise.resolve(null),
  ]);
  const base = { q, chip: chip ?? "", cursor: cursor ?? "" };
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const groupName = (id: string) => groups.data.find((g) => g.id === id)?.name ?? id;
  const value = Number(loyalty.point_value.amount);
  const counts = {
    account: stats.with_account,
    phone: stats.phone_only,
    gold: stats.gold,
  };
  return (
    <div className="blocks">
      <Kpis
        label={t("profiles.kpis")}
        items={[
          {
            label: t("profiles.kpiProfiles"),
            value: formatCount(stats.profiles, locale),
            sub: t("profiles.kpiProfilesSub"),
          },
          {
            label: t("profiles.kpiAccount"),
            value: formatCount(stats.with_account, locale),
            sub: t("profiles.kpiAccountSub"),
          },
          {
            label: t("profiles.kpiPhone"),
            value: formatCount(stats.phone_only, locale),
            sub: t("profiles.kpiPhoneSub"),
          },
          {
            label: t("profiles.kpiRepeat"),
            value: `${stats.repeat_rate_pct}%`,
            sub: t("profiles.kpiRepeatSub"),
          },
        ]}
      />
      <section className="block" aria-labelledby="profiles-h">
        <BlockHead id="profiles-h" title={t("profiles.title")} about={t("profiles.about")} />
        <form className="filters" action="/customers">
          <AutoFilter />
          <div className="fld grow">
            <label className="lab" htmlFor="profiles-q">
              {t("profiles.search")}
            </label>
            <input
              id="profiles-q"
              className="inp"
              name="q"
              defaultValue={q}
              placeholder={t("profiles.searchHint")}
            />
          </div>
          {chip ? <input type="hidden" name="chip" value={chip} /> : null}
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("profiles.find")}
            </button>
          </div>
        </form>
        <Chips
          label={t("profiles.filter")}
          chips={[
            {
              href: hrefWith("/customers", { q }, {}),
              label: t("profiles.all"),
              on: !chip,
              count: stats.profiles,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/customers", { q }, { chip: c }),
              label: t(`profiles.chips.${c}`),
              on: chip === c,
              count: counts[c],
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("profiles.customer")}</Th>
                <Th>{t("profiles.node")}</Th>
                <Th>{t("profiles.tier")}</Th>
                <Th className="text-right">{t("profiles.orders")}</Th>
                <Th className="text-right">{t("profiles.spent")}</Th>
                <Th>{t("profiles.tags")}</Th>
              </tr>
            </thead>
            <tbody>
              {page.data.length === 0 ? (
                <tr>
                  <Td colSpan={6}>{t("profiles.empty")}</Td>
                </tr>
              ) : null}
              {page.data.map((p) => {
                const isOpen = open === p.id && detail !== null;
                const d = isOpen ? detail?.data : null;
                return [
                  <tr key={p.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <OpenLink
                          open={isOpen}
                          href={hrefWith("/customers", base, { open: p.id }, "#profiles-h")}
                          closeHref={hrefWith("/customers", base, {})}
                        >
                          {p.full_name}
                        </OpenLink>
                        <span className="sub gr-mask">
                          {maskPhone(p.phone)}
                          {p.user_id ? "" : ` · ${t("profiles.phoneOnly")}`}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("profiles.node")}>{p.org_name}</Td>
                    <Td label={t("profiles.tier")}>
                      <Status tone={TIER_TONE[p.tier_code]}>{t(`tiers.${p.tier_code}`)}</Status>
                    </Td>
                    <Td label={t("profiles.orders")} className="text-right num">
                      {formatCount(p.orders_count, locale)}
                    </Td>
                    <Td label={t("profiles.spent")} className="text-right num">
                      {money(p.total_spent.amount)}
                    </Td>
                    <Td label={t("profiles.tags")}>
                      {p.tags.length > 0 ? p.tags.join(", ") : "—"}
                    </Td>
                  </tr>,
                  d ? (
                    <DetailRow key={`${p.id}-open`} cols={6}>
                      <h3 className="h2">{d.full_name}</h3>
                      <KV
                        items={[
                          [
                            t("profiles.account"),
                            d.account
                              ? d.account.phone_verified
                                ? t("profiles.accountVerified")
                                : t("profiles.accountUnverified")
                              : t("profiles.noAccount"),
                          ],
                          [
                            t("profiles.phone"),
                            <span key="p" className="gr-mask">
                              {maskPhone(d.phone)}
                            </span>,
                          ],
                          [
                            t("profiles.email"),
                            <span key="e" className="gr-mask">
                              {maskEmail(d.email)}
                            </span>,
                          ],
                          d.birthday ? [t("profiles.birthday"), maskBirthday(d.birthday)] : null,
                          [
                            t("profiles.groups"),
                            d.group_ids.length > 0 ? d.group_ids.map(groupName).join(" · ") : "—",
                          ],
                          [
                            t("profiles.points"),
                            t("profiles.pointsValue", {
                              points: formatCount(d.points.balance, locale),
                              value: money(d.points.balance * value),
                            }),
                          ],
                          d.points.expiring_30d > 0
                            ? [t("profiles.expiring"), formatCount(d.points.expiring_30d, locale)]
                            : null,
                          [
                            t("profiles.referral"),
                            <span key="r" className="mono">
                              {d.referral_code}
                            </span>,
                          ],
                          d.referred_by
                            ? [t("profiles.referredBy"), names.get(d.referred_by) ?? "—"]
                            : null,
                          [
                            t("profiles.consent"),
                            d.marketing_consent.email
                              ? t("profiles.consentYes")
                              : d.marketing_consent.withdrawn_at
                                ? t("profiles.consentWithdrawn")
                                : t("profiles.consentNo"),
                          ],
                          d.first_order_at
                            ? [
                                t("profiles.firstOrder"),
                                <Time key="f" value={d.first_order_at} date />,
                              ]
                            : null,
                          d.last_order_at
                            ? [
                                t("profiles.lastOrder"),
                                <Time key="l" value={d.last_order_at} date />,
                              ]
                            : null,
                        ]}
                      />
                      <h4 className="h3">{t("profiles.history")}</h4>
                      <Lines
                        total
                        items={[
                          ...d.orders.slice(0, 6).map(
                            (o) =>
                              [
                                <span key={o.order_id}>
                                  <Link href={`/sales/orders/${o.order_id}`} className="mono">
                                    {o.number}
                                  </Link>{" "}
                                  · <Time value={o.placed_at} date /> ·{" "}
                                  {t(`orderStatus.${o.status}`)}
                                </span>,
                                money(o.net.amount),
                              ] as const,
                          ),
                          ...(d.orders.length > 6
                            ? [[t("profiles.moreOrders", { n: d.orders.length - 6 }), "…"] as const]
                            : []),
                          ...(d.earlier
                            ? [
                                [
                                  t("profiles.earlier", { n: d.earlier.count }),
                                  money(d.earlier.amount.amount),
                                ] as const,
                              ]
                            : []),
                          [t("profiles.totalSpent"), money(d.total_spent.amount)] as const,
                        ]}
                      />
                      {d.notes.length > 0 || d.entries.length > 0 ? (
                        <>
                          <h4 className="h3">{t("profiles.activity")}</h4>
                          <Timeline
                            items={[
                              ...d.notes.map(
                                (n) =>
                                  [
                                    <span key={n.id}>
                                      <Time value={n.created_at} /> · {n.author.name}
                                    </span>,
                                    n.body,
                                  ] as const,
                              ),
                              ...d.entries.slice(0, 5).map(
                                (e) =>
                                  [
                                    <span key={e.id}>
                                      <Time value={e.created_at} /> ·{" "}
                                      <span className="mono">{e.reference}</span>
                                    </span>,
                                    t(`entry.${e.kind}`, {
                                      points: `${e.points > 0 ? "+" : ""}${formatCount(e.points, locale)}`,
                                    }) + (e.reason ? ` · ${e.reason}` : ""),
                                  ] as const,
                              ),
                            ]}
                          />
                        </>
                      ) : null}
                      <p className="fhint">
                        {d.user_id ? t("profiles.noteAccount") : t("profiles.notePhone")}
                      </p>
                      <span className="row-acts">
                        {manage ? <NoteDialog id={d.id} name={d.full_name} /> : null}
                        {manage ? (
                          <TagsDialog id={d.id} name={d.full_name} tags={d.tags.join(", ")} />
                        ) : null}
                        {adjust ? (
                          <AdjustPointsDialog
                            id={d.id}
                            name={d.full_name}
                            balance={d.points.balance}
                            pointValue={value}
                          />
                        ) : null}
                      </span>
                    </DetailRow>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
        <Pager
          first={cursor ? hrefWith("/customers", { q, chip: chip ?? "" }, {}) : null}
          next={
            page.pagination.next_cursor
              ? hrefWith(
                  "/customers",
                  { q, chip: chip ?? "" },
                  { cursor: page.pagination.next_cursor },
                )
              : null
          }
        />
        <p className="gr-legal">{t("profiles.legal")}</p>
      </section>
    </div>
  );
}
