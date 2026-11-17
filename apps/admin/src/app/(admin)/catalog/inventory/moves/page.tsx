import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { QuickAdjustForm } from "@/components/inventory/forms";
import { AutoFilter } from "@/components/ui/auto-filter";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { INVENTORY_ADJUST, signed } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { readPage, readSort, slicePage, withQuery } from "@/lib/table";
import { can } from "@/lib/viewer";
import { cleanDay, listMovements, type MovementKind, warehouses } from "@/sample/inventory";

const KINDS: (MovementKind | "transfer")[] = [
  "receipt",
  "sale",
  "adjustment",
  "transfer",
  "count",
  "return",
  "expiry",
  "supplier_return",
];

const BASE = "/catalog/inventory/moves";

/** Sổ chỉ sắp được theo thời gian (API dự kiến chỉ có `order`), nên chỉ một cột sắp. */
const MOVE_SORTS = ["at"] as const;

// Tab "Sổ biến động": sổ chỉ thêm — mọi lần nhập, xuất, chuyển, điều chỉnh, kiểm kê, hết hạn lô là
// một dòng; không sửa, không xoá; ghi sai thì ghi một dòng ngược lại kèm lý do. Là chứng từ kho. Bộ
// bảng chuẩn (W-058): sắp theo thời gian, lọc khoảng ngày (`from` / `to`, giờ Việt Nam — đặc tả 42 có
// sẵn hai tham số này), phân trang có tổng (hàm mẫu có đủ danh sách), "⋯" trên dòng. Không có thao
// tác hàng loạt: sổ chỉ thêm, không có gì để sửa hay xoá.
export default async function MovesPage(props: PageProps<"/catalog/inventory/moves">) {
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const kind = KINDS.find((k) => k === one("kind"));
  const org = one("org");
  const level = one("level");
  const open = one("open");
  // Ngày đảo ngược (từ sau đến) thì đổi chỗ, thay vì trả bảng rỗng khó hiểu.
  const asked = { from: cleanDay(one("from")), to: cleanDay(one("to")) };
  const [from, to] =
    asked.from && asked.to && asked.from > asked.to
      ? [asked.to, asked.from]
      : [asked.from, asked.to];
  const sorted = one("sort") !== "";
  const sort = readSort(params, MOVE_SORTS, { field: "at", dir: "desc" });
  const paging = readPage(params);
  const [units, listed, adjust] = await Promise.all([
    warehouses(),
    listMovements({
      locale,
      ...(kind ? { kind } : {}),
      ...(org ? { org_id: org } : {}),
      ...(level ? { level_id: level } : {}),
      from,
      to,
      dir: sort.dir,
      limit: 100_000,
    }),
    can(INVENTORY_ADJUST),
  ]);
  const page = slicePage(listed.data, paging.page, paging.per);
  const keep = {
    kind: kind ?? "",
    org,
    level,
    from,
    to,
    ...(sorted ? { sort: sort.field, dir: sort.dir } : {}),
  };
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
  const options = units.map((u) => ({ value: u.id, label: u.name }));
  return (
    <div className="blocks">
      <p className="fhint">{t("moves.about")}</p>
      <section className="block" aria-labelledby="moves-h">
        <div className="block-head">
          <h2 id="moves-h" className="h2">
            {t("moves.title")}
          </h2>
          {level ? (
            <Link className="btn sm ghost" href={withQuery(BASE, keep, { level: null })}>
              {t("moves.allLevels")}
            </Link>
          ) : null}
        </div>
        <nav className="chips" aria-label={t("moves.byKind")}>
          <Link
            className={kind ? "chip" : "chip on"}
            href={withQuery(BASE, keep, { kind: null })}
            aria-current={kind ? undefined : "page"}
          >
            {t("moves.all")}
          </Link>
          {KINDS.map((k) => (
            <Link
              key={k}
              className={kind === k ? "chip on" : "chip"}
              href={withQuery(BASE, keep, { kind: k })}
              aria-current={kind === k ? "page" : undefined}
            >
              {t(`moveKinds.${k}`)}
            </Link>
          ))}
        </nav>
        <nav className="chips" aria-label={t("levels.warehouse")}>
          <Link
            className={org ? "chip" : "chip on"}
            href={withQuery(BASE, keep, { org: null })}
            aria-current={org ? undefined : "page"}
          >
            {t("levels.allWarehouses")}
          </Link>
          {units.map((u) => (
            <Link
              key={u.id}
              className={org === u.id ? "chip on" : "chip"}
              href={withQuery(BASE, keep, { org: u.id })}
              aria-current={org === u.id ? "page" : undefined}
            >
              {u.name}
            </Link>
          ))}
        </nav>
        <search aria-label={t("moves.byDate")}>
          <form className="filters" action={BASE}>
            <AutoFilter />
            {Object.entries({ kind: kind ?? "", org, level, sort: keep.sort, dir: keep.dir })
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
            <div className="fld">
              <label className="lab" htmlFor="moves-from">
                {t("moves.from")}
              </label>
              <input id="moves-from" className="inp" type="date" name="from" defaultValue={from} />
            </div>
            <div className="fld">
              <label className="lab" htmlFor="moves-to">
                {t("moves.to")}
              </label>
              <input id="moves-to" className="inp" type="date" name="to" defaultValue={to} />
            </div>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("levels.filter")}
              </button>
              {from || to ? (
                <Link className="btn ghost" href={withQuery(BASE, keep, { from: null, to: null })}>
                  {t("moves.clearDates")}
                </Link>
              ) : null}
            </div>
          </form>
        </search>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("moves.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <SortTh field="at" sort={sort} base={BASE} keep={keep} first="desc">
                    {t("moves.at")}
                  </SortTh>
                  <Th>{t("moves.variant")}</Th>
                  <Th>{t("moves.kind")}</Th>
                  <Th className="text-right">{t("moves.quantity")}</Th>
                  <Th>{t("moves.source")}</Th>
                  <Th>{t("moves.actor")}</Th>
                  <Th>
                    <span className="vh">{t("moves.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((m) => {
                  const isOpen = open === m.id;
                  return [
                    <tr key={m.id} data-current={isOpen ? "" : undefined}>
                      <Td className="whitespace-nowrap" label={t("moves.at")}>
                        <Time value={m.created_at} />
                      </Td>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={isOpen ? href({ open: null }) : `${href({ open: m.id })}#moves-h`}
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {m.name}
                          </Link>
                          <span className="sub">
                            <span className="mono">{m.sku}</span> · {m.org_name}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("moves.kind")}>{t(`moveKinds.${m.kind}`)}</Td>
                      <Td
                        label={t("moves.quantity")}
                        className={m.quantity < 0 ? "text-right cat-neg" : "text-right cat-pos"}
                      >
                        <b>{signed(m.quantity, locale)}</b>
                      </Td>
                      <Td label={t("moves.source")}>
                        <span className="cell2">
                          {m.source_type === "opening" ? t("moves.opening") : m.source_label}
                          {m.reason_code && m.reason_code !== "opening_balance" ? (
                            <span className="sub">
                              {t(`reasons.${m.reason_code}`)}
                              {m.note ? `: ${m.note}` : ""}
                            </span>
                          ) : null}
                        </span>
                      </Td>
                      <Td label={t("moves.actor")}>{m.actor?.name ?? t("moves.system")}</Td>
                      <Td className="rt-acts">
                        <RowMenu
                          label={tt("moreFor", { name: `${m.name} · ${m.org_name}` })}
                          items={[
                            {
                              label: isOpen ? t("moves.hide") : t("moves.view"),
                              href: isOpen
                                ? href({ open: null })
                                : `${href({ open: m.id })}#moves-h`,
                            },
                            ...(level === m.level_id
                              ? []
                              : [
                                  {
                                    label: t("levels.viewLedger"),
                                    href: withQuery(BASE, {}, { level: m.level_id }),
                                  },
                                ]),
                            {
                              label: t("moves.copySource"),
                              copy: `${m.source_type} · ${m.source_id}`,
                              done: t("moves.copied"),
                            },
                          ]}
                        />
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${m.id}-open`} className="cat-detail-row">
                        <td colSpan={7}>
                          <div className="cat-detail">
                            <dl className="kv cat-kv">
                              <dt>{t("moves.kindCode")}</dt>
                              <dd className="mono">{m.kind}</dd>
                              <dt>{t("moves.unitCost")}</dt>
                              <dd>
                                {formatMoney(m.unit_cost.amount, m.unit_cost.currency, locale)}
                              </dd>
                              <dt>{t("moves.sourceCode")}</dt>
                              <dd className="mono">
                                {m.source_type} · {m.source_id}
                              </dd>
                              {m.lot_code ? (
                                <>
                                  <dt>{t("moves.lot")}</dt>
                                  <dd className="mono">{m.lot_code}</dd>
                                </>
                              ) : null}
                              {m.reason_code ? (
                                <>
                                  <dt>{t("moves.reasonCode")}</dt>
                                  <dd className="mono">{m.reason_code}</dd>
                                </>
                              ) : null}
                            </dl>
                            <p className="fhint">{t("moves.appendOnly")}</p>
                            {adjust && m.kind === "adjustment" && m.source_type !== "opening" ? (
                              <QuickAdjustForm warehouses={options} org={m.org_id} code={m.sku} />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          )}
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
      </section>
      {adjust ? (
        <section className="block half" aria-labelledby="quick-h">
          <h2 id="quick-h" className="h2">
            {t("moves.quickTitle")}
          </h2>
          <p className="fhint">{t("moves.quickAbout")}</p>
          <QuickAdjustForm warehouses={options} />
        </section>
      ) : null}
      <section className="block half" aria-labelledby="who-h">
        <h2 id="who-h" className="h2">
          {t("moves.whoTitle")}
        </h2>
        <p className="note">
          <b>{t("moves.whoStrong")}</b> {t("moves.who")}
        </p>
      </section>
    </div>
  );
}
