import { getLocale, getTranslations } from "next-intl/server";
import { EXPORT_BADGE, StatusBadge } from "@/components/finance/badges";
import { TaxBasis } from "@/components/finance/basis";
import { SampleBadge } from "@/components/sample-badge";
import { InlineAction } from "@/components/ui/confirm";
import { InlineForm } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatDay } from "@/lib/catalog";
import { INVOICES_EXPORT } from "@/lib/finance";
import { formatCount } from "@/lib/format";
import { monthBounds, monthOf, VN_ACCOUNT_MAP } from "@/sample/finance";
import { listExports } from "@/sample/finance-invoices";
import { listTaxRules, taxRuleOn, vietnamDay } from "@/sample/tax";
import { createExportAction, retryExportAction } from "../actions";
import { tabGate } from "../gate";
import { ENDPOINTS, purposeKey } from "../shared";

// Tab "Xuất kế toán": sổ nhật ký chung hay danh sách chứng từ của một khoảng ngày, lập bằng job rồi
// tải về. CSV mở được bằng Excel (UTF-8 có BOM, ô bắt đầu bằng = + - @ thêm dấu nháy); số hiệu tài
// khoản theo ánh xạ của sổ.
export default async function ExportPage() {
  const gate = await tabGate(INVOICES_EXPORT);
  if (gate) return gate;
  const [t, locale] = await Promise.all([getTranslations("finance.export"), getLocale()]);
  const [{ data: exports }, { data: rules }, purposes] = await Promise.all([
    listExports(),
    listTaxRules(),
    getTranslations("finance.purposes"),
  ]);
  const today = vietnamDay();
  // Mặc định tháng trước (kỳ hay xuất nhất sau khi khoá sổ).
  const previous = monthBounds(
    monthOf(vietnamDay(Date.parse(`${monthOf(today)}-01T00:00:00Z`) - 86_400_000)),
  );
  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="fin-exp-h">
        <div className="block-head">
          <h2 id="fin-exp-h" className="h2">
            {t("form.title")}
          </h2>
          <SampleBadge step="36" endpoint={ENDPOINTS.export} />
        </div>
        <InlineForm
          action={createExportAction}
          submit={t("submit")}
          done={t("done")}
          fields={[
            {
              kind: "select",
              name: "profile",
              label: t("profile"),
              options: [
                { value: "generic_journal", label: t("profiles.generic_journal") },
                { value: "generic_documents", label: t("profiles.generic_documents") },
              ],
            },
            {
              kind: "select",
              name: "format",
              label: t("format"),
              hint: t("formatHint"),
              options: [
                { value: "csv", label: "CSV" },
                { value: "xlsx", label: "XLSX" },
              ],
            },
            {
              kind: "date",
              name: "period_from",
              label: t("from"),
              defaultValue: previous.starts_on,
            },
            { kind: "date", name: "period_to", label: t("to"), defaultValue: previous.ends_on },
          ]}
        />
      </section>
      <section className="block half" aria-labelledby="fin-excel-h">
        <h2 id="fin-excel-h" className="h2">
          {t("excel.title")}
        </h2>
        <p className="note">
          <b>{t("excel.strong")}</b> {t("excel.text")}
        </p>
        <TaxBasis
          rule={taxRuleOn(rules, "accounting.chart_mapping", today)}
          lead={t("excel.mapping")}
        />
      </section>

      <section className="block" aria-labelledby="fin-exports-h">
        <h2 id="fin-exports-h" className="h2">
          {t("list.title")}
        </h2>
        <div className="card tcard">
          {exports.length === 0 ? (
            <p className="empty">{t("list.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("list.export")}</Th>
                  <Th>{t("list.period")}</Th>
                  <Th>{t("list.by")}</Th>
                  <Th>{t("list.state")}</Th>
                  <Th>
                    <span className="vh">{t("list.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {exports.map((x) => (
                  <tr key={x.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{t(`profiles.${x.profile}`)}</b>
                        <span className="sub">
                          {x.format.toUpperCase()}
                          {x.row_count !== null && x.status === "ready"
                            ? ` · ${t("list.rows", { count: formatCount(x.row_count, locale) })}`
                            : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("list.period")}>
                      {formatDay(x.period_from, locale)} – {formatDay(x.period_to, locale)}
                    </Td>
                    <Td label={t("list.by")}>
                      <span className="cell2">
                        {x.created_by}
                        <span className="sub">
                          <Time value={x.created_at} />
                        </span>
                      </span>
                    </Td>
                    <Td label={t("list.state")}>
                      <span className="cell2">
                        <StatusBadge className={EXPORT_BADGE[x.status]}>
                          {t(`status.${x.status}`)}
                        </StatusBadge>
                        {x.status === "failed" ? (
                          <span className="sub">
                            {t(`errors.${x.error ?? "timeout"}`, { attempts: x.attempts })}
                          </span>
                        ) : null}
                        {x.status === "ready" && x.expires_on ? (
                          <span className="sub">
                            {t("list.expires", { date: formatDay(x.expires_on, locale) })}
                            {x.matches_trial_balance ? ` · ${t("list.matches")}` : ""}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      {x.status === "ready" && x.format === "csv" ? (
                        <a
                          className="btn sm pri"
                          href={`/finance/export/${x.id}/download`}
                          download
                        >
                          {t("list.download")}
                        </a>
                      ) : x.status === "ready" ? (
                        <span className="fhint">{t("list.xlsxWaiting")}</span>
                      ) : null}
                      {x.status === "failed" ? (
                        <InlineAction
                          action={retryExportAction}
                          id={x.id}
                          label={t("list.retry")}
                          done={t("list.retried")}
                        />
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </section>

      <section className="block" aria-labelledby="fin-map-h">
        <h2 id="fin-map-h" className="h2">
          {t("map.title")}
        </h2>
        <p className="fhint">{t("map.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("map.purpose")}</Th>
                <Th>{t("map.code")}</Th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(VN_ACCOUNT_MAP).map(([purpose, code]) => (
                <tr key={purpose}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <b>
                        {purposes.has(purposeKey(purpose))
                          ? purposes(purposeKey(purpose))
                          : purpose}
                      </b>
                      <span className="sub mono">{purpose}</span>
                    </span>
                  </Td>
                  <Td label={t("map.code")} className="mono">
                    {code}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
