import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { deleteGroupAction } from "@/app/(admin)/customers/actions";
import { GroupDialog, PreviewRuleForm } from "@/components/customers/forms";
import { ConfirmButton } from "@/components/engage/actions";
import { BlockHead, DetailRow, hrefWith, KV, OpenLink, param } from "@/components/growth/blocks";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CUSTOMERS_SEGMENTS_MANAGE } from "@/lib/customers";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { type GroupRule, listGroups } from "@/sample/customers";
import { CUSTOMER_TABS, regionOptions } from "../shared";

// Tab "Nhóm khách": nhóm làm tay hoặc theo quy tắc (dữ liệu JSON có kiểm). Số thành viên là số đánh giá
// lại lúc đọc; bảng giá (bước 41) và khuyến mại (bước 43) dùng nhóm qua mã nhóm, không đọc dữ liệu khách.
export default async function SegmentsPage(props: PageProps<"/customers/segments">) {
  if (!(await can(CUSTOMER_TABS.segments))) notFound();
  const [t, locale, params, groups, orgs, manage] = await Promise.all([
    getTranslations("customers"),
    getLocale(),
    props.searchParams,
    listGroups(),
    regionOptions(),
    can(CUSTOMERS_SEGMENTS_MANAGE),
  ]);
  const open = param(params, "open");
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
          <Table cards>
            <thead>
              <tr>
                <Th>{t("segments.group")}</Th>
                <Th>{t("segments.how")}</Th>
                <Th className="text-right">{t("segments.members")}</Th>
                <Th>{t("segments.usedIn")}</Th>
              </tr>
            </thead>
            <tbody>
              {groups.data.map((g) => {
                const isOpen = open === g.id;
                return [
                  <tr key={g.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <OpenLink
                          open={isOpen}
                          href={hrefWith("/customers/segments", {}, { open: g.id }, "#segments-h")}
                          closeHref="/customers/segments"
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
                  </tr>,
                  isOpen ? (
                    <DetailRow key={`${g.id}-open`} cols={4}>
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
                          <GroupDialog
                            orgs={orgs}
                            group={{
                              id: g.id,
                              name: g.name,
                              kind: g.kind,
                              spent:
                                g.rule?.total_spent_min !== undefined
                                  ? String(g.rule.total_spent_min)
                                  : "",
                              orders:
                                g.rule?.orders_count_min !== undefined
                                  ? String(g.rule.orders_count_min)
                                  : "",
                              days:
                                g.rule?.last_order_within_days !== undefined
                                  ? String(g.rule.last_order_within_days)
                                  : "",
                              tier: g.rule?.tier_in?.[0] ?? "",
                              org: g.rule?.org_in?.[0] ?? "",
                            }}
                          />
                          <ConfirmButton
                            action={deleteGroupAction}
                            fields={{ id: g.id }}
                            label={t("segments.delete")}
                            title={t("segments.deleteTitle", { name: g.name })}
                            points={[t("segments.deletePoint1"), t("segments.deletePoint2")]}
                            submit={t("segments.deleteSubmit")}
                            done={t("segments.deleted")}
                          />
                        </span>
                      ) : null}
                    </DetailRow>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
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
