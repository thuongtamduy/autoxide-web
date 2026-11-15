import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { applyCountAction, cancelCountAction } from "@/app/(admin)/catalog/inventory/actions";
import { COUNT_BADGE } from "@/components/catalog/badges";
import { CountDialog, CountLinesForm } from "@/components/inventory/forms";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { INVENTORY_ADJUST, INVENTORY_COUNT } from "@/lib/catalog";
import { can } from "@/lib/viewer";
import { allVariants } from "@/sample/catalog";
import { countDiff, listCounts, warehouses } from "@/sample/inventory";

// Tab "Kiểm kê": đếm khi cửa hàng vẫn bán. Số trong kho ghi ngay lúc đếm từng dòng; chênh lệch =
// số đếm − số lúc đếm, cộng vào tồn hiện tại khi áp dụng. Dòng lệch phải có lý do.
export default async function CountsPage(props: PageProps<"/catalog/inventory/counts">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getLocale(),
    props.searchParams,
  ]);
  const open = typeof params.open === "string" ? params.open : "";
  const [{ data: counts }, units, { data: variants }, count, adjust] = await Promise.all([
    listCounts(),
    warehouses(),
    allVariants(locale),
    can(INVENTORY_COUNT),
    can(INVENTORY_ADJUST),
  ]);
  const name = (id: string) => {
    const v = variants.find((x) => x.variant_id === id);
    return v ? `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""} · ${v.sku}` : id;
  };
  const diffText = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
  return (
    <div className="blocks">
      <p className="note">
        <b>{t("counts.whileSellingStrong")}</b> {t("counts.whileSelling")}
      </p>
      <section className="block" aria-labelledby="counts-h">
        <div className="block-head">
          <h2 id="counts-h" className="h2">
            {t("counts.title")}
          </h2>
          {count ? (
            <CountDialog warehouses={units.map((u) => ({ value: u.id, label: u.name }))} />
          ) : null}
        </div>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("counts.number")}</Th>
                <Th>{t("counts.where")}</Th>
                <Th className="text-right">{t("counts.counted")}</Th>
                <Th className="text-right">{t("counts.diffCol")}</Th>
                <Th>{t("counts.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => {
                const isOpen = open === c.id;
                return [
                  <tr key={c.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <Link
                        className="open mono"
                        href={
                          isOpen
                            ? "/catalog/inventory/counts"
                            : `/catalog/inventory/counts?open=${c.id}#counts-h`
                        }
                        scroll={false}
                        aria-expanded={isOpen}
                      >
                        {c.number}
                      </Link>
                    </Td>
                    <Td label={t("counts.where")}>
                      <span className="cell2">
                        {c.org_name}
                        <span className="sub">
                          {c.scope} · <Time value={c.created_at} />
                        </span>
                      </span>
                    </Td>
                    <Td label={t("counts.counted")} className="text-right">
                      {t("counts.linesOf", { counted: c.counted_lines, total: c.lines.length })}
                    </Td>
                    <Td label={t("counts.diffCol")} className="text-right">
                      <span className="cell2">
                        {c.status === "cancelled" ? t("counts.notApplied") : diffText(c.difference)}
                        {c.missing_reason > 0 ? (
                          <span className="sub cat-neg">
                            {t("counts.missingReason", { count: c.missing_reason })}
                          </span>
                        ) : c.plus !== 0 || c.minus !== 0 ? (
                          <span className="sub">
                            {t("counts.plusMinus", {
                              plus: diffText(c.plus),
                              minus: diffText(c.minus),
                            })}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={t("counts.state")}>
                      <span className={COUNT_BADGE[c.status]}>
                        <span className="dot" />
                        {t(`countStatus.${c.status}`)}
                      </span>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${c.id}-open`} className="cat-detail-row">
                      <td colSpan={5}>
                        <div className="cat-detail">
                          <h3 className="h2">
                            {c.number} · {c.org_name}
                          </h3>
                          {c.status === "open" && count ? (
                            <CountLinesForm
                              id={c.id}
                              lines={c.lines.map((l) => ({
                                id: l.id,
                                label: name(l.variant_id),
                                counted: l.counted === null ? "" : String(l.counted),
                                expected: l.expected_at_count,
                                reason: l.reason_code ?? "",
                              }))}
                            />
                          ) : (
                            <ul className="cat-lines">
                              {c.lines
                                .filter((l) => countDiff(l) !== 0)
                                .map((l) => (
                                  <li key={l.id}>
                                    <span>
                                      {name(l.variant_id)}
                                      {l.reason_code ? ` · ${t(`reasons.${l.reason_code}`)}` : ""}
                                    </span>
                                    <b>
                                      {l.expected_at_count} → {l.counted} ({diffText(countDiff(l))})
                                    </b>
                                  </li>
                                ))}
                            </ul>
                          )}
                          {c.status === "open" ? (
                            <>
                              <p className="fhint">
                                {c.missing_reason > 0
                                  ? t("counts.needReasons")
                                  : t("counts.applyNote")}
                              </p>
                              <span className="row-acts start">
                                {adjust ? (
                                  <ConfirmAction
                                    action={applyCountAction}
                                    id={c.id}
                                    label={t("counts.apply")}
                                    title={t("counts.applyTitle", { number: c.number })}
                                    points={[t("counts.applyPoint"), t("counts.applyFinal")]}
                                    submit={t("counts.applySubmit")}
                                    done={t("counts.applied")}
                                    danger={false}
                                  />
                                ) : (
                                  <span className="fhint">{t("counts.applyNeeds")}</span>
                                )}
                                {count ? (
                                  <ConfirmAction
                                    action={cancelCountAction}
                                    id={c.id}
                                    label={t("counts.cancel")}
                                    title={t("counts.cancelTitle", { number: c.number })}
                                    points={[t("counts.cancelPoint")]}
                                    submit={t("counts.cancelSubmit")}
                                    done={t("counts.cancelled")}
                                  />
                                ) : null}
                              </span>
                            </>
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
