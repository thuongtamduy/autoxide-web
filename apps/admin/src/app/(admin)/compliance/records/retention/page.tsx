import { getLocale, getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis } from "@/components/compliance/common";
import { Table, Td, Th } from "@/components/ui/table";
import { PRIVACY_READ } from "@/lib/permissions";
import { getRetention, retentionNeedsReview } from "@/sample/compliance-records";
import { ruleAt } from "@/sample/compliance-rules";

// Tab "Hạn lưu": mỗi module khai dữ liệu nó giữ bao lâu (`Module::retention`), so với giới hạn của
// bộ quy định. "Cần xem" = dữ liệu cá nhân giữ mãi hay vượt giới hạn. Nơi lưu do nhà vận hành đặt.
export default async function RetentionTab() {
  const gate = await sampleGate(PRIVACY_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.records.retention");
  const [{ data: report }, locale] = await Promise.all([getRetention(), getLocale()]);
  const review = report.items.filter(retentionNeedsReview);
  const days = (value: number | null) =>
    value === null
      ? t("forever")
      : value % 365 === 0
        ? t("years", { count: value / 365 })
        : t("days", { count: new Intl.NumberFormat(locale).format(value) });
  return (
    <div className="blocks">
      <div className="kpis">
        <div className="card kpi">
          <span className="kpi-label">{t("residency")}</span>
          <span className="kpi-value">{t(`countries.${report.residency.country}`)}</span>
          <span className="kpi-sub">{t("residencySub")}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">{t("toReview")}</span>
          <span className="kpi-value">{review.length}</span>
          <span className="kpi-sub">{t("toReviewSub")}</span>
        </div>
      </div>
      <section className="block" aria-labelledby="cp-rt-h">
        <h2 id="cp-rt-h" className="h2">
          {t("title")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("data")}</Th>
                <Th>{t("category")}</Th>
                <Th>{t("keep")}</Th>
                <Th>{t("limit")}</Th>
                <Th>{t("state")}</Th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => {
                const bad = retentionNeedsReview(item);
                return (
                  <tr key={item.name}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{t(`items.${item.name.replaceAll(".", "_")}`)}</b>
                        <span className="sub mono">
                          {item.module}
                          {item.setting ? ` · ${item.setting}` : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("category")}>{t(`categories.${item.category}`)}</Td>
                    <Td label={t("keep")}>{days(item.keep_days)}</Td>
                    <Td label={t("limit")}>
                      {item.limit_days === null ? "—" : days(item.limit_days)}
                    </Td>
                    <Td label={t("state")}>
                      <span className={bad ? "badge b-warn" : "badge b-ok"}>
                        <span className="dot" />
                        {bad ? t("review") : t("ok")}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("operator")}</p>
        <Basis rule={ruleAt("privacy.retention_limits")} lead={t("limits")} />
      </section>
    </div>
  );
}
