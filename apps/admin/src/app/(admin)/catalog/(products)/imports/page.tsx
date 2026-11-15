import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { IMPORT_BADGE } from "@/components/catalog/badges";
import { ImportPanel } from "@/components/catalog/price-tools";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CATALOG_EXPORT, CATALOG_IMPORT, percentOf } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { can } from "@/lib/viewer";
import { IMPORT_MAX_ROWS, listTransfers } from "@/sample/catalog";

// Tab "Nhập CSV": nhập và xuất chạy bằng job; mỗi dòng kiểm riêng, dòng lỗi được ghi lại, không làm
// hỏng cả tệp. Có bước chạy thử (kiểm mà không ghi). Số tiền trong tệp là số nguyên đồng.
export default async function ImportsPage(props: PageProps<"/catalog/imports">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("catalog"),
    getLocale(),
    props.searchParams,
  ]);
  const open = typeof params.open === "string" ? params.open : "";
  const [{ data: transfers }, importer, exporter] = await Promise.all([
    listTransfers(),
    can(CATALOG_IMPORT),
    can(CATALOG_EXPORT),
  ]);
  const codeText = (code: string, values: Record<string, string>) => {
    const key = code.replaceAll(".", "_");
    return t.has(`rowErrors.${key}`) ? t(`rowErrors.${key}`, values) : code;
  };
  return (
    <div className="blocks">
      <p className="fhint">{t("imports.about", { max: formatCount(IMPORT_MAX_ROWS, locale) })}</p>
      {importer ? (
        <section className="block" aria-labelledby="import-h">
          <div className="block-head">
            <h2 id="import-h" className="h2">
              {t("imports.formTitle")}
            </h2>
            {exporter ? (
              <a className="btn sm" href="/catalog/export.csv" download>
                {t("imports.export")}
              </a>
            ) : null}
          </div>
          <ImportPanel />
        </section>
      ) : null}
      <section className="block" aria-labelledby="jobs-h">
        <div className="block-head">
          <h2 id="jobs-h" className="h2">
            {t("imports.listTitle")}
          </h2>
        </div>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("imports.fileCol")}</Th>
                <Th>{t("imports.rows")}</Th>
                <Th>{t("imports.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((job) => {
                const isOpen = open === job.id;
                return [
                  <tr key={job.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link
                          className="open mono"
                          href={
                            isOpen ? "/catalog/imports" : `/catalog/imports?open=${job.id}#jobs-h`
                          }
                          scroll={false}
                          aria-expanded={isOpen}
                        >
                          {job.file_name}
                        </Link>
                        <span className="sub">
                          {t(`imports.kinds.${job.kind}`)} · <Time value={job.created_at} /> ·{" "}
                          {job.created_by.name}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("imports.rows")}>
                      <span className="cell2">
                        {t("imports.okRows", {
                          ok: formatCount(job.ok_rows, locale),
                          total: formatCount(job.total_rows, locale),
                        })}
                        <progress
                          className="bar"
                          max={100}
                          value={percentOf(job.ok_rows, job.total_rows)}
                          aria-label={t("imports.rows")}
                        />
                      </span>
                    </Td>
                    <Td label={t("imports.state")}>
                      <span className={IMPORT_BADGE[job.status]}>
                        <span className="dot" />
                        {t(`imports.statuses.${job.status}`)}
                      </span>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${job.id}-open`} className="cat-detail-row">
                      <td colSpan={3}>
                        <div className="cat-detail">
                          <p>
                            {t("imports.detail", {
                              created: formatCount(job.created_rows, locale),
                              updated: formatCount(job.updated_rows, locale),
                              errors: job.errors.length,
                            })}
                          </p>
                          {job.errors.length > 0 ? (
                            <ul className="cat-rowerrs">
                              {job.errors.map((e) => (
                                <li key={`${e.row}-${e.column}-${e.code}`}>
                                  {e.row > 0 ? (
                                    <span className="mono">
                                      {t("imports.rowAt", { row: e.row, column: e.column })}
                                    </span>
                                  ) : null}{" "}
                                  {codeText(e.code, e.params)}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {job.status === "done_err" ? (
                            <p className="fhint">{t("imports.fixHint")}</p>
                          ) : null}
                          {job.status === "failed" ? (
                            <p className="fhint">{t("imports.splitHint")}</p>
                          ) : null}
                        </div>
                      </td>
                    </tr>
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
