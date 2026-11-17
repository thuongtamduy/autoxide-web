import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PRODUCT_BADGE } from "@/components/catalog/badges";
import { SuggestionActions } from "@/components/catalog/suggestion-actions";
import { Thumb } from "@/components/catalog/thumb";
import { AutoFilter } from "@/components/ui/auto-filter";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CATALOG_PRODUCTS_WRITE, formatDay, vatLabel } from "@/lib/catalog";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  listCategories,
  listProducts,
  listSuggestions,
  type ProductKind,
  type ProductStatus,
  type ProductSummary,
  productStats,
} from "@/sample/catalog";
import { listTaxRates, rateOn } from "@/sample/tax";

const STATUSES: ProductStatus[] = ["active", "draft", "inactive", "archived"];
const KINDS: ProductKind[] = ["physical", "digital", "service", "bundle"];

// Tab "Sản phẩm": số liệu đầu màn, danh sách lọc theo trạng thái / danh mục / loại, tìm không dấu
// theo tên và SKU, phân trang theo con trỏ; bản nháp AI chờ người xem.
export default async function ProductsPage(props: PageProps<"/catalog">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("catalog"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = STATUSES.find((s) => s === one("status"));
  const blocked = one("status") === "blocked";
  const kind = KINDS.find((k) => k === one("kind"));
  const q = one("q").slice(0, 200);
  const category = one("category");
  const cursor = one("cursor") || null;
  const [page, { data: stats }, { data: categories }, { data: rates }, { data: drafts }, write] =
    await Promise.all([
      listProducts({
        ...(status ? { status } : {}),
        ...(blocked ? { blocked } : {}),
        ...(kind ? { kind } : {}),
        ...(category ? { category_id: category } : {}),
        q,
        locale,
        cursor,
        limit: 25,
      }),
      productStats(),
      listCategories(locale),
      listTaxRates(),
      listSuggestions({ status: "pending" }),
      can(CATALOG_PRODUCTS_WRITE),
    ]);
  const total = (
    await listProducts({
      ...(status ? { status } : {}),
      ...(blocked ? { blocked } : {}),
      ...(kind ? { kind } : {}),
      ...(category ? { category_id: category } : {}),
      q,
      locale,
      limit: 1000,
    })
  ).data.length;
  const reduced = rates.find(
    (r) => r.category_code === "vat.standard_reducible" && r.rate_percent === "8",
  );
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: one("status"), kind: kind ?? "", category, q, ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/catalog?${query}` : "/catalog";
  };
  const money = (row: ProductSummary) => {
    if (!row.price_min || !row.price_max) return t("products.noPrice");
    const min = formatMoney(row.price_min.amount, row.price_min.currency, locale);
    return row.price_min.amount === row.price_max.amount
      ? min
      : `${min} – ${formatMoney(row.price_max.amount, row.price_max.currency, locale)}`;
  };
  const vat = (code: string | null) =>
    code ? vatLabel(rateOn(rates, code)?.rate_percent ?? null, t("vatShort")) : "—";
  const chip = (value: string | null, label: string, count: number) => {
    const current = (value ?? "") === one("status");
    return (
      <Link
        key={value ?? "all"}
        className={current ? "chip on" : "chip"}
        href={href({ status: value, cursor: null })}
        aria-current={current ? "page" : undefined}
      >
        {label} <span className="cnt">{formatCount(count, locale)}</span>
      </Link>
    );
  };
  const all = Object.values(stats.by_status).reduce((a, b) => a + b, 0);

  return (
    <div className="blocks">
      {one("deleted") ? <Flash text={t("product.deleted")} /> : null}
      <section className="block" aria-label={t("products.kpis")}>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("products.kpiActive")}</span>
            <b className="kpi-value">{formatCount(stats.by_status.active, locale)}</b>
            <span className="kpi-sub">
              {t("products.kpiActiveSub", { count: stats.by_status.inactive })}
            </span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("products.kpiVariants")}</span>
            <b className="kpi-value">{formatCount(stats.variants, locale)}</b>
            <span className="kpi-sub">{t("products.kpiVariantsSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("products.kpiBlocked")}</span>
            <b className="kpi-value">{formatCount(stats.blocked, locale)}</b>
            <span className="kpi-sub">{t("products.kpiBlockedSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("products.kpiReduced")}</span>
            <b className="kpi-value">
              {formatCount(stats.by_tax["vat.standard_reducible"] ?? 0, locale)}
            </b>
            <span className="kpi-sub">
              {reduced?.effective_to
                ? t("products.kpiReducedSub", { date: formatDay(reduced.effective_to, locale) })
                : t("products.kpiReducedNone")}
            </span>
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="products-h">
        <div className="block-head">
          <h2 id="products-h" className="h2">
            {t("products.title")}
          </h2>
        </div>
        <p className="fhint">{t("products.about")}</p>
        <nav className="chips" aria-label={t("products.byStatus")}>
          {chip(null, t("products.all"), all)}
          {STATUSES.map((s) => chip(s, t(`status.${s}`), stats.by_status[s]))}
          {chip("blocked", t("products.blocked"), stats.blocked)}
        </nav>
        <search aria-label={t("products.search")}>
          <form className="filters" action="/catalog">
            <AutoFilter />
            {one("status") ? <input type="hidden" name="status" value={one("status")} /> : null}
            <div className="fld grow">
              <label className="lab" htmlFor="cat-q">
                {t("products.search")}
              </label>
              <input
                id="cat-q"
                className="inp"
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("products.searchHint")}
                maxLength={200}
              />
            </div>
            <div className="fld">
              <label className="lab" htmlFor="cat-category">
                {t("products.category")}
              </label>
              <select id="cat-category" className="inp" name="category" defaultValue={category}>
                <option value="">{t("products.allCategories")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.path}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label className="lab" htmlFor="cat-kind">
                {t("products.kind")}
              </label>
              <select id="cat-kind" className="inp" name="kind" defaultValue={kind ?? ""}>
                <option value="">{t("products.allKinds")}</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("products.filter")}
              </button>
              {q || category || kind ? (
                <Link
                  className="btn ghost"
                  href={href({ q: null, category: null, kind: null, cursor: null })}
                >
                  {t("products.clear")}
                </Link>
              ) : null}
            </div>
          </form>
        </search>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("products.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("products.product")}</Th>
                  <Th>{t("products.category")}</Th>
                  <Th className="text-right">{t("products.price")}</Th>
                  <Th>{t("products.tax")}</Th>
                  <Th>{t("products.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((row) => (
                  <tr key={row.id}>
                    <Td className="rt-title">
                      <span className="cat-prod">
                        <Thumb
                          mediaId={row.image_media_id}
                          name={row.name}
                          categoryPath={row.category_path}
                        />
                        <span className="cell2">
                          <Link className="open" href={`/catalog/products/${row.id}`}>
                            {row.name}
                          </Link>
                          <span className="sub">
                            {t("products.variants", { count: row.variant_count })} ·{" "}
                            <span className="mono">{row.skus.slice(0, 3).join(", ")}</span>
                            {row.lot_tracked ? ` · ${t("products.lot")}` : ""}
                            {row.serial_tracked ? ` · ${t("products.serial")}` : ""}
                            {row.allow_backorder ? ` · ${t("products.backorder")}` : ""}
                            {row.kind !== "physical" ? ` · ${t(`kinds.${row.kind}`)}` : ""}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td label={t("products.category")}>{row.category_path || "—"}</Td>
                    <Td label={t("products.price")} className="text-right whitespace-nowrap">
                      {money(row)}
                    </Td>
                    <Td label={t("products.tax")}>{vat(row.tax_category)}</Td>
                    <Td label={t("products.status")}>
                      <span className="cell2">
                        <span className={PRODUCT_BADGE[row.status]}>
                          <span className="dot" />
                          {t(`status.${row.status}`)}
                        </span>
                        {row.issues.length > 0 ? (
                          <span
                            className="badge b-bad"
                            title={row.issues
                              .map((i) => t(`issues.${i.code.replaceAll(".", "_")}`, i.params))
                              .join(" · ")}
                          >
                            {t("products.blockedBadge", { count: row.issues.length })}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <div className="pager">
          <span className="fhint">{t("products.foot", { shown: page.data.length, total })}</span>
          {page.pagination.next_cursor ? (
            <Link className="btn sm" href={href({ cursor: page.pagination.next_cursor })}>
              {t("products.next")}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="block" aria-labelledby="ai-h">
        <div className="block-head">
          <h2 id="ai-h" className="h2">
            {t("ai.title")}
          </h2>
        </div>
        <p className="fhint">{t("ai.about")}</p>
        <div className="card list">
          {drafts.length === 0 ? <p className="empty">{t("ai.empty")}</p> : null}
          {drafts.map((draft) => (
            <div className="item" key={draft.id}>
              <span className="sq-ic info" aria-hidden="true">
                ✦
              </span>
              <div className="item-main">
                <span className="item-title">
                  <Link className="open" href={`/catalog/products/${draft.product_id}#ai`}>
                    {draft.product_name}
                  </Link>{" "}
                  ·{" "}
                  {t("ai.fields", {
                    locale: draft.locale.toUpperCase(),
                    fields: Object.keys(draft.fields)
                      .map((f) => t(`ai.field.${f}`))
                      .join(", "),
                  })}
                </span>
                <span className="item-meta">
                  {t("ai.when")} <Time value={draft.created_at} />
                  {draft.note ? ` · ${draft.note}` : ""}
                </span>
              </div>
              <span className="badge b-info">{t("ai.pending")}</span>
              {write ? <SuggestionActions id={draft.id} /> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
