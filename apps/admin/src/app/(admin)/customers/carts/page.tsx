import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ReminderRuleForm } from "@/components/customers/forms";
import { BlockHead, Kpis, Status } from "@/components/growth/blocks";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { CUSTOMERS_ENGAGEMENT_MANAGE } from "@/lib/customers";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { listReminderRules, ruleState } from "@/sample/customers";
import { listCarts } from "@/sample/orders";
import { CUSTOMER_TABS } from "../shared";

const STATE_TONE = { active: "b-ok", scheduled: "b-sched", closed: "b-arch" } as const;

// Tab "Giỏ bỏ dở": danh sách giỏ và nút nhắc là của màn Đơn hàng (không làm lại ở đây). Màn này giữ quy tắc
// nhắc (`customers_reminder_rules`): mốc nhắc, kênh, bật / tắt — chỉ nhắc người đã đồng ý nhận tin quảng
// cáo (NĐ 91/2020), kiểm lại lúc gửi.
export default async function CartsPage() {
  // Tab dữ liệu mẫu (bước 47): tắt dữ liệu mẫu thì không có.
  if (!sampleDataEnabled()) notFound();
  if (!(await can(CUSTOMER_TABS.carts))) notFound();
  const [t, locale, carts, rules, manage] = await Promise.all([
    getTranslations("customers"),
    getLocale(),
    listCarts(),
    listReminderRules(),
    can(CUSTOMERS_ENGAGEMENT_MANAGE),
  ]);
  const consented = carts.data.filter((c) => c.consent);
  const current =
    rules.data.find((r) => ruleState(r.effective_from, r.effective_to) === "active") ??
    rules.data[0];
  return (
    <div className="blocks">
      <Kpis
        label={t("carts.kpis")}
        items={[
          {
            label: t("carts.kpiCarts"),
            value: formatCount(carts.data.length, locale),
            sub: formatMoney(
              carts.data.reduce((s, c) => s + Number(c.value.amount), 0),
              "VND",
              locale,
            ),
          },
          {
            label: t("carts.kpiConsent"),
            value: formatCount(consented.length, locale),
            sub: t("carts.kpiConsentSub"),
          },
          {
            label: t("carts.kpiSkipped"),
            value: formatCount(carts.data.length - consented.length, locale),
            sub: t("carts.kpiSkippedSub"),
          },
          {
            label: t("carts.kpiSent"),
            value: formatCount(
              carts.data.reduce((s, c) => s + c.reminders_sent, 0),
              locale,
            ),
            sub: t("carts.kpiSentSub"),
          },
        ]}
      />
      <section className="block" aria-labelledby="carts-h">
        <BlockHead
          id="carts-h"
          title={t("carts.title")}
          about={t("carts.about")}
          actions={
            <Link className="btn sm pri" href="/sales/orders/carts">
              {t("carts.open")}
            </Link>
          }
        />
      </section>
      <section className="block half" aria-labelledby="rules-h">
        <BlockHead id="rules-h" title={t("reminder.title")} about={t("reminder.about")} />
        {manage && current ? (
          <ReminderRuleForm
            enabled={current.enabled}
            delays={current.delays_minutes.join(", ")}
            channel={current.channel}
          />
        ) : null}
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("reminder.delaysCol")}</Th>
                <Th>{t("reminder.channel")}</Th>
                <Th>{t("reminder.from")}</Th>
                <Th>{t("loyalty.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {rules.data.map((r) => {
                const state = ruleState(r.effective_from, r.effective_to);
                return (
                  <tr key={r.id}>
                    <Td className="rt-title">
                      {r.enabled
                        ? r.delays_minutes.map((m) => t("reminder.minutes", { n: m })).join(", ")
                        : t("reminder.off")}
                    </Td>
                    <Td label={t("reminder.channel")}>{t(`reminder.channels.${r.channel}`)}</Td>
                    <Td label={t("reminder.from")}>{formatDay(r.effective_from, locale)}</Td>
                    <Td label={t("loyalty.state")}>
                      <Status tone={STATE_TONE[state]}>{t(`ruleState.${state}`)}</Status>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>
      <section className="block half" aria-label={t("carts.legalTitle")}>
        <p className="note warn">
          <b>{t("carts.legalTitle")}</b> {t("carts.legalText")}
        </p>
      </section>
    </div>
  );
}
