import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  applyCountAction,
  bulkApplyCountsAction,
  bulkCancelCountsAction,
  cancelCountAction,
} from "@/app/(admin)/catalog/inventory/actions";
import { COUNT_BADGE } from "@/components/catalog/badges";
import { CountDialog, CountLinesForm } from "@/components/inventory/forms";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { INVENTORY_ADJUST, INVENTORY_COUNT } from "@/lib/catalog";
import { readPage, readSort, slicePage, withQuery } from "@/lib/table";
import { can } from "@/lib/viewer";
import { allVariants } from "@/sample/catalog";
import { COUNT_SORTS, type CountRow, countDiff, listCounts, warehouses } from "@/sample/inventory";

const BASE = "/catalog/inventory/counts";

// Tab "Kiểm kê": đếm khi cửa hàng vẫn bán. Số trong kho ghi ngay lúc đếm từng dòng; chênh lệch =
// số đếm − số lúc đếm, cộng vào tồn hiện tại khi áp dụng. Dòng lệch phải có lý do. Bộ bảng chuẩn
// (W-058): chọn nhiều để áp dụng hay huỷ (lặp lệnh từng phiếu; phiếu thiếu lý do báo lỗi riêng và vẫn
// được chọn); "⋯" trên dòng; sắp theo số phiếu, ngày tạo; phân trang có tổng.
export default async function CountsPage(props: PageProps<"/catalog/inventory/counts">) {
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const open = typeof params.open === "string" ? params.open : "";
  const sorted = typeof params.sort === "string" && params.sort !== "";
  const sort = readSort(params, COUNT_SORTS, { field: "created", dir: "desc" });
  const paging = readPage(params);
  const [{ data: listed }, units, { data: variants }, count, adjust] = await Promise.all([
    listCounts(sorted ? sort : null),
    warehouses(),
    allVariants(locale),
    can(INVENTORY_COUNT),
    can(INVENTORY_ADJUST),
  ]);
  const page = slicePage(listed, paging.page, paging.per);
  const counts = page.data;
  const keep = sorted ? { sort: sort.field, dir: sort.dir } : {};
  const href = (change: Record<string, string | null>) =>
    withQuery(
      BASE,
      {
        ...keep,
        ...(page.page > 1 ? { page: page.page } : {}),
        ...(paging.per !== 25 ? { per: paging.per } : {}),
      },
      change,
    );
  const name = (id: string) => {
    const v = variants.find((x) => x.variant_id === id);
    return v ? `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""} · ${v.sku}` : id;
  };
  const diffText = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
  const apply = (c: CountRow) => (
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
  );
  const cancel = (c: CountRow) => (
    <ConfirmAction
      action={cancelCountAction}
      id={c.id}
      label={t("counts.cancel")}
      title={t("counts.cancelTitle", { number: c.number })}
      points={[t("counts.cancelPoint")]}
      submit={t("counts.cancelSubmit")}
      done={t("counts.cancelled")}
    />
  );
  const menu = (c: CountRow, isOpen: boolean): RowMenuItem[] => [
    {
      label: isOpen ? t("counts.hide") : t("counts.view"),
      href: isOpen ? href({ open: null }) : `${href({ open: c.id })}#counts-h`,
    },
    ...(c.status === "open" && adjust ? [{ label: t("counts.apply"), dialog: apply(c) }] : []),
    ...(c.status === "open" && count
      ? [{ label: t("counts.cancel"), danger: true, dialog: cancel(c) }]
      : []),
  ];
  const actions: BulkActionSpec[] = [
    ...(adjust
      ? [
          {
            key: "apply",
            label: t("counts.apply"),
            tone: "pri" as const,
            run: bulkApplyCountsAction,
            confirm: {
              title: t("counts.bulkApplyTitle"),
              points: [t("counts.applyPoint"), t("counts.bulkApplyReasons")],
              submit: t("counts.applySubmit"),
            },
          },
        ]
      : []),
    ...(count
      ? [
          {
            key: "cancel",
            label: t("counts.cancel"),
            tone: "danger" as const,
            run: bulkCancelCountsAction,
            confirm: {
              title: t("counts.bulkCancelTitle"),
              points: [t("counts.cancelPoint")],
              submit: t("counts.cancelSubmit"),
            },
          },
        ]
      : []),
  ];
  const selectable = actions.length > 0;
  const cols = selectable ? 7 : 6;
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
          <BulkTable ids={counts.map((c) => c.id)} actions={actions}>
            <Table cards>
              <thead>
                <tr>
                  {selectable ? <SelectAllTh /> : null}
                  <SortTh field="number" sort={sort} base={BASE} keep={keep}>
                    {t("counts.number")}
                  </SortTh>
                  <Th>{t("counts.where")}</Th>
                  <SortTh field="created" sort={sort} base={BASE} keep={keep} first="desc">
                    {t("counts.created")}
                  </SortTh>
                  <Th className="text-right">{t("counts.counted")}</Th>
                  <Th className="text-right">{t("counts.diffCol")}</Th>
                  <Th>{t("counts.state")}</Th>
                  <Th>
                    <span className="vh">{t("counts.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => {
                  const isOpen = open === c.id;
                  return [
                    <tr key={c.id} data-current={isOpen ? "" : undefined}>
                      {selectable ? <SelectTd id={c.id} name={c.number} /> : null}
                      <Td className="rt-title">
                        <Link
                          className="open mono"
                          href={isOpen ? href({ open: null }) : `${href({ open: c.id })}#counts-h`}
                          scroll={false}
                          aria-expanded={isOpen}
                        >
                          {c.number}
                        </Link>
                      </Td>
                      <Td label={t("counts.where")}>
                        <span className="cell2">
                          {c.org_name}
                          <span className="sub">{c.scope}</span>
                        </span>
                      </Td>
                      <Td label={t("counts.created")} className="whitespace-nowrap">
                        <Time value={c.created_at} />
                      </Td>
                      <Td label={t("counts.counted")} className="text-right">
                        {t("counts.linesOf", { counted: c.counted_lines, total: c.lines.length })}
                      </Td>
                      <Td label={t("counts.diffCol")} className="text-right">
                        <span className="cell2">
                          {c.status === "cancelled"
                            ? t("counts.notApplied")
                            : diffText(c.difference)}
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
                      <Td className="rt-acts">
                        <RowMenu
                          label={tt("moreFor", { name: c.number })}
                          items={menu(c, isOpen)}
                        />
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${c.id}-open`} className="cat-detail-row">
                        <td colSpan={cols}>
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
                                        {l.expected_at_count} → {l.counted} (
                                        {diffText(countDiff(l))})
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
                                    apply(c)
                                  ) : (
                                    <span className="fhint">{t("counts.applyNeeds")}</span>
                                  )}
                                  {count ? cancel(c) : null}
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
          </BulkTable>
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
      </section>
    </div>
  );
}
