import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { bulkDeleteGroupsAction, deleteGroupAction } from "@/app/(admin)/customers/actions";
import { GroupDialog, PreviewRuleForm } from "@/components/customers/forms";
import { ConfirmButton } from "@/components/engage/actions";
import { BlockHead, DetailRow, hrefWith, KV, OpenLink, param } from "@/components/growth/blocks";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CUSTOMERS_SEGMENTS_MANAGE } from "@/lib/customers";
import { formatCount, formatMoney } from "@/lib/format";
import { readPage, readSort, slicePage, sortRows } from "@/lib/table";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { type CustomerGroup, type GroupRule, listGroups } from "@/sample/customers";
import { CUSTOMER_TABS, regionOptions } from "../shared";

// Tab "Nhóm khách": nhóm làm tay hoặc theo quy tắc (dữ liệu JSON có kiểm). Số thành viên là số đánh giá
// lại lúc đọc; bảng giá (bước 41) và khuyến mại (bước 43) dùng nhóm qua mã nhóm, không đọc dữ liệu khách.
// Bộ bảng (W-058): sắp theo tên / số hồ sơ, phân trang có tổng (hàm mẫu trả đủ danh sách), chọn nhiều để
// xoá (lặp từng nhóm), "⋯" trên dòng (mở, sửa, xoá).
const BASE = "/customers/segments";
const SORTS = ["name", "members"] as const;

export default async function SegmentsPage(props: PageProps<"/customers/segments">) {
  // Tab dữ liệu mẫu (bước 47): tắt dữ liệu mẫu thì không có.
  if (!sampleDataEnabled()) notFound();
  if (!(await can(CUSTOMER_TABS.segments))) notFound();
  const [t, tt, locale, params, groups, orgs, manage] = await Promise.all([
    getTranslations("customers"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
    listGroups(),
    regionOptions(),
    can(CUSTOMERS_SEGMENTS_MANAGE),
  ]);
  const open = param(params, "open");
  const sort = readSort(params, SORTS, { field: "name", dir: "asc" });
  const paging = readPage(params);
  const sorted = sortRows(
    groups.data,
    (g) => (sort.field === "members" ? g.member_count : g.name),
    sort.dir,
  );
  const page = slicePage(sorted, paging.page, paging.per);
  const keep = param(params, "sort") ? { sort: sort.field, dir: sort.dir } : {};
  const here = {
    ...keep,
    ...(paging.page > 1 ? { page: String(paging.page) } : {}),
    ...(paging.per !== 25 ? { per: String(paging.per) } : {}),
  };
  const orgName = (id: string) => orgs.find((o) => o.value === id)?.label ?? id;
  const ruleText = (rule: GroupRule | null): string => {
    if (!rule) return t("segments.manualRule");
    const parts = [
      rule.total_spent_min !== undefined
        ? t("segments.ruleSpent", { amount: formatMoney(rule.total_spent_min, "VND", locale) })
        : null,
      rule.orders_count_min !== undefined
        ? t("segments.ruleOrders", { n: rule.orders_count_min })
        : null,
      rule.last_order_within_days !== undefined
        ? t("segments.ruleDays", { n: rule.last_order_within_days })
        : null,
      rule.tier_in?.length
        ? t("segments.ruleTier", { tier: rule.tier_in.map((x) => t(`tiers.${x}`)).join(", ") })
        : null,
      rule.org_in?.length
        ? t("segments.ruleOrg", { org: rule.org_in.map(orgName).join(", ") })
        : null,
    ].filter(Boolean);
    return parts.join(" · ");
  };
  const input = (g: CustomerGroup) => ({
    id: g.id,
    name: g.name,
    kind: g.kind,
    spent: g.rule?.total_spent_min !== undefined ? String(g.rule.total_spent_min) : "",
    orders: g.rule?.orders_count_min !== undefined ? String(g.rule.orders_count_min) : "",
    days: g.rule?.last_order_within_days !== undefined ? String(g.rule.last_order_within_days) : "",
    tier: g.rule?.tier_in?.[0] ?? "",
    org: g.rule?.org_in?.[0] ?? "",
  });
  const remove = (g: CustomerGroup) => (
    <ConfirmButton
      action={deleteGroupAction}
      fields={{ id: g.id }}
      label={t("segments.delete")}
      title={t("segments.deleteTitle", { name: g.name })}
      points={[t("segments.deletePoint1"), t("segments.deletePoint2")]}
      submit={t("segments.deleteSubmit")}
      done={t("segments.deleted")}
    />
  );
  const bulk: BulkActionSpec[] = manage
    ? [
        {
          key: "delete",
          label: t("segments.delete"),
          tone: "danger",
          run: bulkDeleteGroupsAction,
          confirm: {
            title: t("segments.bulkDeleteTitle"),
            points: [t("segments.deletePoint1"), t("segments.deletePoint2")],
            submit: t("segments.deleteSubmit"),
          },
        },
      ]
    : [];
  const menu = (g: CustomerGroup): RowMenuItem[] => [
    {
      label: t("profiles.openDetail"),
      href: hrefWith(BASE, here, { open: g.id }, "#segments-h"),
    },
    ...(manage
      ? [
          { label: t("group.edit"), dialog: <GroupDialog orgs={orgs} group={input(g)} /> },
          { label: t("segments.delete"), danger: true, dialog: remove(g) },
        ]
      : []),
  ];
  const cols = manage ? 6 : 5;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="segments-h">
        <BlockHead
          id="segments-h"
          title={t("segments.title")}
          about={t("segments.about")}
          actions={manage ? <GroupDialog orgs={orgs} /> : null}
        />
        <div className="card tcard">
          <BulkTable ids={page.data.map((g) => g.id)} actions={bulk}>
            <Table cards>
              <thead>
                <tr>
                  {manage ? <SelectAllTh /> : null}
                  <SortTh field="name" sort={sort} base={BASE} keep={keep}>
                    {t("segments.group")}
                  </SortTh>
                  <Th>{t("segments.how")}</Th>
                  <SortTh
                    field="members"
                    sort={sort}
                    base={BASE}
                    keep={keep}
                    first="desc"
                    className="text-right"
                  >
                    {t("segments.members")}
                  </SortTh>
                  <Th>{t("segments.usedIn")}</Th>
                  <Th>
                    <span className="vh">{t("accounts.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((g) => {
                  const isOpen = open === g.id;
                  return [
                    <tr key={g.id} data-current={isOpen ? "" : undefined}>
                      {manage ? <SelectTd id={g.id} name={g.name} /> : null}
                      <Td className="rt-title">
                        <span className="cell2">
                          <OpenLink
                            open={isOpen}
                            href={hrefWith(BASE, here, { open: g.id }, "#segments-h")}
                            closeHref={hrefWith(BASE, here, {})}
                          >
                            {g.name}
                          </OpenLink>
                          <span className="sub">{t(`segments.kinds.${g.kind}`)}</span>
                        </span>
                      </Td>
                      <Td label={t("segments.how")}>{ruleText(g.rule)}</Td>
                      <Td label={t("segments.members")} className="text-right num">
                        {formatCount(g.member_count, locale)}
                      </Td>
                      <Td label={t("segments.usedIn")}>
                        {g.used_in.length > 0 ? g.used_in.join(", ") : "—"}
                      </Td>
                      <Td className="rt-acts">
                        <RowMenu label={tt("moreFor", { name: g.name })} items={menu(g)} />
                      </Td>
                    </tr>,
                    isOpen ? (
                      <DetailRow key={`${g.id}-open`} cols={cols}>
                        <h3 className="h2">{g.name}</h3>
                        <KV
                          items={[
                            [
                              t("segments.rule"),
                              g.rule ? (
                                <code key="r" className="mono">
                                  {JSON.stringify(g.rule)}
                                </code>
                              ) : (
                                t("segments.manualRule")
                              ),
                            ],
                            [t("segments.evaluated"), <Time key="e" value={g.evaluated_at} />],
                            [t("segments.members"), formatCount(g.member_count, locale)],
                            [
                              t("segments.usedIn"),
                              g.used_in.length > 0 ? g.used_in.join(", ") : t("segments.unused"),
                            ],
                          ]}
                        />
                        <p className="fhint">{t("segments.consentNote")}</p>
                        {manage ? (
                          <span className="row-acts">
                            <GroupDialog orgs={orgs} group={input(g)} />
                            {remove(g)}
                          </span>
                        ) : null}
                      </DetailRow>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          </BulkTable>
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
      </section>
      <section className="block half" aria-labelledby="preview-h">
        <BlockHead id="preview-h" title={t("preview.title")} about={t("preview.about")} />
        <PreviewRuleForm orgs={orgs} />
      </section>
      <section className="block half" aria-label={t("segments.legalTitle")}>
        <p className="note">
          <b>{t("segments.legalTitle")}</b> {t("segments.legalText")}
        </p>
      </section>
    </div>
  );
}
