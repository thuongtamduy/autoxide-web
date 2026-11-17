import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { bulkAddTagAction, bulkAddToGroupAction } from "@/app/(admin)/customers/actions";
import { AdjustPointsDialog, NoteDialog, TagsDialog } from "@/components/customers/forms";
import { Chips } from "@/components/engage/common";
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
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
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
import { readPage, readSort, slicePage } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  type CustomerProfile,
  customerStats,
  getProfile,
  listGroups,
  listProfiles,
  loyaltyStats,
  PROFILE_SORTS,
  type ProfileChip,
  profileNames,
} from "@/sample/customers";
import { CUSTOMER_TABS } from "./shared";

const CHIPS: readonly ProfileChip[] = ["account", "phone", "gold"];
const TIER_TONE = { member: "b-arch", silver: "b-info", gold: "b-warn" } as const;

// Tab "Hồ sơ khách": mỗi người mua một hồ sơ (theo tài khoản hoặc số điện thoại), lịch sử mua dựng từ đơn
// thật của bộ mẫu. Dữ liệu cá nhân (SĐT, email, ngày sinh) luôn che bớt trên màn (Luật BVDLCN 91/2025).
// Sắp theo tên / số đơn / đã chi; chọn nhiều để thêm vào nhóm thủ công hay gắn nhãn; menu "⋯" trên dòng.
export default async function ProfilesPage(props: PageProps<"/customers">) {
  if (!(await can(CUSTOMER_TABS.profiles))) notFound();
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("customers"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const q = param(params, "q").slice(0, 60);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const sort = readSort(params, PROFILE_SORTS, { field: "spent", dir: "desc" });
  const paging = readPage(params);
  const open = param(params, "open");
  const [stats, listed, groups, loyalty, names, manage, adjust, detail] = await Promise.all([
    customerStats(),
    listProfiles({ q, chip, sort, limit: 1000 }),
    listGroups(),
    loyaltyStats(),
    profileNames(),
    can(CUSTOMERS_MANAGE),
    can(CUSTOMERS_LOYALTY_ADJUST),
    open ? getProfile(open) : Promise.resolve(null),
  ]);
  const page = slicePage(listed.data, paging.page, paging.per);
  // Tham số giữ khi sắp, đổi trang, mở một dòng.
  const keep = {
    q,
    chip: chip ?? "",
    ...(param(params, "sort") ? { sort: sort.field, dir: sort.dir } : {}),
  };
  const base = {
    ...keep,
    ...(paging.page > 1 ? { page: String(paging.page) } : {}),
    ...(paging.per !== 25 ? { per: String(paging.per) } : {}),
  };
  const manual = groups.data.filter((g) => g.kind === "manual");
  const bulk: BulkActionSpec[] = manage
    ? [
        ...(manual.length > 0
          ? [
              {
                key: "group",
                label: t("bulk.addToGroup"),
                run: bulkAddToGroupAction,
                field: {
                  label: t("bulk.group"),
                  options: manual.map((g) => ({ value: g.id, label: g.name })),
                },
              },
            ]
          : []),
        {
          key: "tag",
          label: t("bulk.addTag"),
          run: bulkAddTagAction,
          field: { label: t("bulk.tag") },
        },
      ]
    : [];
  const menu = (p: CustomerProfile): RowMenuItem[] => [
    {
      label: t("profiles.openDetail"),
      href: hrefWith("/customers", base, { open: p.id }, "#profiles-h"),
    },
    ...(manage
      ? [
          { label: t("note.button"), dialog: <NoteDialog id={p.id} name={p.full_name} /> },
          {
            label: t("tags.button"),
            dialog: <TagsDialog id={p.id} name={p.full_name} tags={p.tags.join(", ")} />,
          },
        ]
      : []),
  ];
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const cols = manage ? 8 : 7;
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
          <BulkTable ids={page.data.map((p) => p.id)} actions={bulk}>
            <Table cards>
              <thead>
                <tr>
                  {manage ? <SelectAllTh /> : null}
                  <SortTh field="name" sort={sort} base="/customers" keep={keep}>
                    {t("profiles.customer")}
                  </SortTh>
                  <Th>{t("profiles.node")}</Th>
                  <Th>{t("profiles.tier")}</Th>
                  <SortTh
                    field="orders"
                    sort={sort}
                    base="/customers"
                    keep={keep}
                    first="desc"
                    className="text-right"
                  >
                    {t("profiles.orders")}
                  </SortTh>
                  <SortTh
                    field="spent"
                    sort={sort}
                    base="/customers"
                    keep={keep}
                    first="desc"
                    className="text-right"
                  >
                    {t("profiles.spent")}
                  </SortTh>
                  <Th>{t("profiles.tags")}</Th>
                  <Th>
                    <span className="vh">{t("profiles.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.length === 0 ? (
                  <tr>
                    <Td colSpan={cols}>{t("profiles.empty")}</Td>
                  </tr>
                ) : null}
                {page.data.map((p) => {
                  const isOpen = open === p.id && detail !== null;
                  const d = isOpen ? detail?.data : null;
                  return [
                    <tr key={p.id} data-current={isOpen ? "" : undefined}>
                      {manage ? <SelectTd id={p.id} name={p.full_name} /> : null}
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
                      <Td className="rt-acts">
                        <RowMenu label={tt("moreFor", { name: p.full_name })} items={menu(p)} />
                      </Td>
                    </tr>,
                    d ? (
                      <DetailRow key={`${p.id}-open`} cols={cols}>
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
                              ? [
                                  [
                                    t("profiles.moreOrders", { n: d.orders.length - 6 }),
                                    "…",
                                  ] as const,
                                ]
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
          </BulkTable>
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base="/customers" keep={keep} />
        <p className="gr-legal">{t("profiles.legal")}</p>
      </section>
    </div>
  );
}
