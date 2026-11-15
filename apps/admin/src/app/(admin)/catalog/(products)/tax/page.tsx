import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { SampleBadge } from "@/components/sample-badge";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { productStats } from "@/sample/catalog";
import { listTaxCategories, listTaxRates, nextRate, rateOn, vietnamDay } from "@/sample/tax";

// Tab "Nhóm thuế": sản phẩm chọn nhóm thuế, không chọn thuế suất. Thuế suất là dữ liệu có ngày hiệu
// lực của module `tax` (bước 36, dữ liệu mẫu): khi Quốc hội đổi mức giảm, nhập gói thuế mới, không
// sửa sản phẩm hay code.
export default async function TaxPage() {
  const [t, locale] = await Promise.all([getTranslations("catalog.tax"), getLocale()]);
  const [{ data: categories }, { data: rates }, { data: stats }] = await Promise.all([
    listTaxCategories(),
    listTaxRates(),
    productStats(),
  ]);
  const today = vietnamDay();
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="tax-h">
        <div className="block-head">
          <h2 id="tax-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge
            step="36"
            endpoint="GET /api/v1/tax/categories, GET /api/v1/tax/rates?jurisdiction=VN&category="
          />
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("category")}</Th>
                <Th className="text-right">{t("now")}</Th>
                <Th>{t("next")}</Th>
                <Th className="text-right">{t("products")}</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const now = rateOn(rates, c.code, today);
                const next = nextRate(rates, c.code, today);
                return (
                  <tr key={c.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{locale === "vi" ? c.name_vi : c.name_en}</b>
                        <span className="sub mono">{c.code}</span>
                      </span>
                    </Td>
                    <Td label={t("now")} className="text-right">
                      {now ? `${now.rate_percent}%` : t("none")}
                    </Td>
                    <Td label={t("next")}>
                      {next ? (
                        <span className="badge b-warn">
                          {t("change", {
                            rate: next.rate_percent,
                            date: formatDay(next.effective_from, locale),
                          })}
                        </span>
                      ) : (
                        <span className="muted">{t("noChange")}</span>
                      )}
                    </Td>
                    <Td label={t("products")} className="text-right">
                      {(stats.by_tax[c.code] ?? 0) > 0 ? (
                        <Link className="open" href="/catalog">
                          {formatCount(stats.by_tax[c.code] ?? 0, locale)}
                        </Link>
                      ) : (
                        "0"
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>

      <section className="block" aria-labelledby="rates-h">
        <div className="block-head">
          <h2 id="rates-h" className="h2">
            {t("ratesTitle")}
          </h2>
        </div>
        <p className="fhint">{t("ratesAbout")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("category")}</Th>
                <Th className="text-right">{t("rate")}</Th>
                <Th>{t("valid")}</Th>
                <Th>{t("basis")}</Th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => {
                const state =
                  r.effective_from > today
                    ? "scheduled"
                    : r.effective_to !== null && r.effective_to <= today
                      ? "past"
                      : "current";
                return (
                  <tr key={r.id}>
                    <Td className="rt-title mono">{r.category_code}</Td>
                    <Td label={t("rate")} className="text-right">
                      {r.rate_percent}%
                    </Td>
                    <Td label={t("valid")}>
                      <span className="cell2">
                        {r.effective_to
                          ? t("range", {
                              from: formatDay(r.effective_from, locale),
                              to: formatDay(r.effective_to, locale),
                            })
                          : t("since", { from: formatDay(r.effective_from, locale) })}
                        <span
                          className={
                            state === "current"
                              ? "badge b-ok"
                              : state === "scheduled"
                                ? "badge b-info"
                                : "badge b-arch"
                          }
                        >
                          {t(`states.${state}`)}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("basis")}>{r.legal_basis}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("pack", { version: rates[0]?.pack_version ?? "—" })}</p>
      </section>
      <p className="note warn" role="note">
        <b>{t("legalStrong")}</b> {t("legal")}
      </p>
    </div>
  );
}
