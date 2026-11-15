import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { runBulkAction } from "@/app/(admin)/work/actions";
import { Chips } from "@/components/engage/common";
import { SampleBadge } from "@/components/sample-badge";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CATALOG_PRODUCTS_WRITE } from "@/lib/catalog";
import { can } from "@/lib/viewer";
import { type BulkOutcome, listBulkRuns, previewTaxChange } from "@/sample/bulk";
import { CATEGORY_ID, listCategories } from "@/sample/catalog";
import { listTaxCategories } from "@/sample/tax";
import { sampleOnly } from "../sample-gate";

const OUTCOMES: readonly BulkOutcome[] = ["ok", "skipped", "failed"];
const BADGE: Record<BulkOutcome, string> = {
  ok: "badge b-ok",
  skipped: "badge b-warn",
  failed: "badge b-bad",
};
const ENDPOINT =
  "POST /api/v1/kernel/bulk/{resource}/{action} (dry_run, filter + expected_count); GET /api/v1/kernel/jobs/{id}";

function one(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  return typeof value === "string" ? value : "";
}

// Tab "Xem trước thao tác": thao tác hàng loạt chạy thử (dry-run) trước — cho biết từng bản ghi sẽ được
// áp dụng, bỏ qua hay lỗi, không ghi gì; đồng ý thì mới chạy thật (bước 51 P8 của core, chạy thử là dự
// kiến). Thao tác mẫu: đổi nhóm thuế của mọi sản phẩm trong một danh mục. Bộ lọc nằm trên địa chỉ
// (`?category=&tax=&show=`): chạy thử là GET, không đổi gì.
export default async function DryRunPage(props: PageProps<"/work/dry-run">) {
  sampleOnly();
  const [t, locale, params, write] = await Promise.all([
    getTranslations("work.dryRun"),
    getLocale(),
    props.searchParams,
    can(CATALOG_PRODUCTS_WRITE),
  ]);
  const [{ data: categories }, { data: taxes }, { data: runs }] = await Promise.all([
    listCategories(locale),
    listTaxCategories(),
    listBulkRuns(),
  ]);
  const category =
    categories.find((c) => c.id === one(params, "category"))?.id ?? CATEGORY_ID.kitchen;
  const tax = taxes.find((x) => x.code === one(params, "tax"))?.code ?? "vat.standard";
  const show = OUTCOMES.find((o) => o === one(params, "show")) ?? null;
  const preview = await previewTaxChange({ category_id: category, tax_category: tax });
  const taxName = (code: string) => {
    const found = taxes.find((x) => x.code === code);
    return found ? (locale === "vi" ? found.name_vi : found.name_en) : code;
  };
  const href = (next: BulkOutcome | null) => {
    const query = new URLSearchParams({ category, tax });
    if (next) query.set("show", next);
    return `/work/dry-run?${query.toString()}`;
  };
  const categoryName = categories.find((c) => c.id === category)?.path ?? "";
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="wk-dry-h">
        <div className="block-head">
          <h2 id="wk-dry-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="51" endpoint={ENDPOINT} />
        </div>
        <p className="fhint">{t("about")}</p>
        <form className="filters" method="get" action="/work/dry-run" aria-label={t("form")}>
          <label className="fld">
            <span className="lab">{t("category")}</span>
            <select className="inp" name="category" defaultValue={category}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.path}
                </option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span className="lab">{t("tax")}</span>
            <select className="inp" name="tax" defaultValue={tax}>
              {taxes.map((x) => (
                <option key={x.code} value={x.code}>
                  {locale === "vi" ? x.name_vi : x.name_en}
                </option>
              ))}
            </select>
          </label>
          <div className="filters-acts">
            <button type="submit" className="btn pri">
              {t("preview")}
            </button>
          </div>
        </form>
      </section>

      {preview.ok ? (
        <section className="block" aria-labelledby="wk-dry-result-h">
          <div className="block-head">
            <h2 id="wk-dry-result-h" className="h2">
              {t("result", { category: categoryName, tax: taxName(tax) })}
            </h2>
            {write && preview.data.counts.ok > 0 ? (
              <FormDialog
                action={runBulkAction}
                label={t("run")}
                title={t("runTitle")}
                triggerClass="btn pri"
                danger
                points={[
                  t("runPoint1", { count: preview.data.counts.ok, tax: taxName(tax) }),
                  t("runPoint2", { count: preview.data.expected_count }),
                  t("runPoint3"),
                ]}
                submit={t("runSubmit")}
                done={t("runDone")}
                fields={[
                  { kind: "hidden", name: "category_id", value: category },
                  { kind: "hidden", name: "tax_category", value: tax },
                  {
                    kind: "hidden",
                    name: "expected_count",
                    value: String(preview.data.expected_count),
                  },
                ]}
              />
            ) : null}
          </div>
          <div className="kpis">
            {OUTCOMES.map((o) => (
              <div key={o} className="card kpi">
                <span className="kpi-label">{t(`outcomes.${o}`)}</span>
                <span className="kpi-value num">{preview.data.counts[o]}</span>
                <span className="kpi-sub">{t(`notes.${o}`, { tax: taxName(tax) })}</span>
              </div>
            ))}
          </div>
          <Chips
            label={t("filter")}
            chips={[
              { href: href(null), label: t("all"), on: !show, count: preview.data.results.length },
              ...OUTCOMES.map((o) => ({
                href: href(o),
                label: t(`outcomes.${o}`),
                on: show === o,
                count: preview.data.counts[o],
              })),
            ]}
          />
          <div className="card tcard">
            {preview.data.results.length === 0 ? (
              <p className="empty">{t("none")}</p>
            ) : (
              <Table cards>
                <thead>
                  <tr>
                    <Th>{t("product")}</Th>
                    <Th>{t("outcome")}</Th>
                    <Th>{t("reason")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.data.results
                    .filter((r) => !show || r.outcome === show)
                    .map((r) => (
                      <tr key={r.id}>
                        <Td className="rt-title">
                          <Link href={`/catalog/products/${r.id}`}>{r.name}</Link>
                        </Td>
                        <Td label={t("outcome")}>
                          <span className={BADGE[r.outcome]}>{t(`outcomes.${r.outcome}`)}</span>
                        </Td>
                        <Td label={t("reason")}>
                          {r.code ? (
                            <span className="cell2">
                              <span>
                                {t.has(`codes.${r.code.replace(".", "_")}`)
                                  ? t(`codes.${r.code.replace(".", "_")}`)
                                  : r.code}
                              </span>
                              <span className="sub mono">{r.code}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </Td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            )}
          </div>
          {!write ? (
            <p className="fhint">{t("noWrite", { permission: CATALOG_PRODUCTS_WRITE })}</p>
          ) : null}
        </section>
      ) : null}

      {runs.length > 0 ? (
        <section className="block" aria-labelledby="wk-runs-h">
          <h2 id="wk-runs-h" className="h2">
            {t("runs")}
          </h2>
          <ul className="card wk-runs">
            {runs.map((run) => (
              <li key={run.id} className="wk-run">
                <span className="wk-main">
                  <span className="wk-title">
                    {t("runLine", { tax: taxName(run.filter.tax_category) })}
                  </span>
                  <span className="wk-meta">
                    <Time value={run.finished_at} />
                    <span>
                      {t("runCounts", {
                        ok: run.counts.ok,
                        skipped: run.counts.skipped,
                        failed: run.counts.failed,
                      })}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
