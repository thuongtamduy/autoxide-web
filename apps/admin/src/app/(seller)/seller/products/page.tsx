import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Thumb } from "@/components/catalog/thumb";
import { AddProduct, SellerHead } from "@/components/market/seller";
import { AutoFilter } from "@/components/ui/auto-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { fold } from "@/lib/fold";
import { formatCount, formatMoney } from "@/lib/format";
import { LISTING_BADGE } from "@/lib/market";
import { sellerContext } from "@/lib/seller";
import { type ListingStatus, listListingReviews } from "@/sample/market";
import { editListingAction } from "../actions";

/** Thứ tự chip: việc của người bán trước (bị từ chối), rồi đang chờ, đã duyệt, bị gỡ. */
const STATUSES: readonly ListingStatus[] = ["rejected", "pending", "approved", "delisted"];

// Sản phẩm của tôi: mỗi sản phẩm mới hay sửa chờ sàn duyệt trước khi hiện cho người mua; phát hiện tự
// động (hàng có điều kiện thiếu giấy tờ…) hiện ngay để người bán bổ sung trước khi sàn xem. Bị từ chối
// thì lý do hiện ngay trên dòng, sửa xong là gửi duyệt lại.
export default async function SellerProducts(props: PageProps<"/seller/products">) {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const [t, tm, locale, params] = await Promise.all([
    getTranslations("seller"),
    getTranslations("market"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = STATUSES.find((s) => s === one("status"));
  const q = one("q").slice(0, 100);
  const { data: mine } = await listListingReviews({ seller: ctx.seller.org_id });
  const needle = fold(q);
  const data = mine.filter(
    (l) =>
      (!status || l.status === status) &&
      (!needle || fold(`${l.product_name} ${l.category_name}`).includes(needle)),
  );
  const count = (s: ListingStatus) => mine.filter((l) => l.status === s).length;
  const docNames = (types: string) =>
    types
      .split(",")
      .filter(Boolean)
      .map((type) => tm(`docType.${type}`))
      .join(", ");
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ status: status ?? "", q, ...change })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/seller/products?${query}` : "/seller/products";
  };
  const chip = (value: ListingStatus | null, label: string, n: number) => {
    const current = (value ?? "") === (status ?? "");
    return (
      <Link
        key={value ?? "all"}
        className={current ? "chip on" : "chip"}
        href={href({ status: value })}
        aria-current={current ? "page" : undefined}
      >
        {label} <span className="cnt">{formatCount(n, locale)}</span>
      </Link>
    );
  };
  const editable = ctx.seller.status !== "terminated";
  return (
    <div className="page mk-page">
      <SellerHead title={t("products.title")} description={t("products.description")} add />
      <div className="blocks">
        {!ctx.seller.gate.can_sell ? <p className="note warn">{t("products.hidden")}</p> : null}
        {mine.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="box"
              title={t("products.empty")}
              actions={<AddProduct className="btn sm pri" why="mk-add-why-empty" />}
            >
              {t("products.emptyBody")}
            </EmptyState>
          </div>
        ) : (
          <section className="block" aria-label={t("products.title")}>
            <nav className="chips" aria-label={t("products.byStatus")}>
              {chip(null, t("products.all"), mine.length)}
              {STATUSES.filter((s) => s !== "delisted" || count(s) > 0).map((s) =>
                chip(s, tm(`listingStatus.${s}`), count(s)),
              )}
            </nav>
            <search aria-label={t("products.search")}>
              <form className="filters" action="/seller/products">
                <AutoFilter />
                {status ? <input type="hidden" name="status" value={status} /> : null}
                <div className="fld grow">
                  <label className="lab" htmlFor="sl-products-q">
                    {t("products.search")}
                  </label>
                  <input
                    id="sl-products-q"
                    className="inp"
                    type="search"
                    name="q"
                    defaultValue={q}
                    placeholder={t("products.searchHint")}
                    maxLength={100}
                  />
                </div>
                <div className="filters-acts">
                  <button type="submit" className="btn">
                    {t("products.filter")}
                  </button>
                  {q ? (
                    <Link className="btn ghost" href={href({ q: null })}>
                      {t("products.clear")}
                    </Link>
                  ) : null}
                </div>
              </form>
            </search>
            <div className="card tcard">
              {data.length === 0 ? (
                <EmptyState
                  icon="search"
                  title={t("products.noMatch")}
                  actions={
                    <Link className="btn sm" href="/seller/products">
                      {t("products.clear")}
                    </Link>
                  }
                >
                  {t("products.noMatchBody")}
                </EmptyState>
              ) : (
                <Table cards>
                  <thead>
                    <tr>
                      <Th>{tm("listings.product")}</Th>
                      <Th className="text-right">{tm("listings.price")}</Th>
                      <Th className="text-right">{t("products.stock")}</Th>
                      <Th>{tm("listings.state")}</Th>
                      <Th>{tm("listings.findings")}</Th>
                      <Th>
                        <span className="vh">{tm("actions")}</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((l) => {
                      const findings = l.findings.filter((f) => f.code !== "seller_not_eligible");
                      // Bị từ chối: nút nói rõ việc phải làm (sửa rồi gửi lại).
                      const editLabel =
                        l.status === "rejected" ? t("products.fixResend") : t("products.edit");
                      return (
                        <tr key={l.id}>
                          <Td className="rt-title">
                            <span className="cat-prod">
                              <Thumb
                                mediaId={null}
                                name={l.product_name}
                                categoryPath={l.category_name}
                              />
                              <span className="cell2">
                                <b>{l.product_name}</b>
                                <span className="sub">
                                  {l.category_name} · <Time value={l.created_at} date />
                                </span>
                              </span>
                            </span>
                          </Td>
                          <Td label={tm("listings.price")} className="text-right num">
                            <span className="cell2">
                              <span>{formatMoney(l.price.amount, l.price.currency, locale)}</span>
                              {l.previous_price ? (
                                <s className="sub">
                                  {formatMoney(
                                    l.previous_price.amount,
                                    l.previous_price.currency,
                                    locale,
                                  )}
                                </s>
                              ) : null}
                            </span>
                          </Td>
                          <Td
                            label={t("products.stock")}
                            className={l.stock === 0 ? "text-right num tone-bad" : "text-right num"}
                          >
                            {l.stock === 0
                              ? t("products.outOfStock")
                              : formatCount(l.stock, locale)}
                          </Td>
                          <Td label={tm("listings.state")}>
                            <span className="cell2">
                              <span className={LISTING_BADGE[l.status]}>
                                <span className="dot" />
                                {tm(`listingStatus.${l.status}`)}
                              </span>
                              {l.reason ? (
                                <span className="mk-reason">
                                  <b>{t("products.reason")}</b> {l.reason}
                                </span>
                              ) : null}
                            </span>
                          </Td>
                          <Td label={tm("listings.findings")}>
                            {findings.length === 0 ? (
                              <span className="sub">{tm("listings.noFinding")}</span>
                            ) : (
                              <span className="cell2">
                                {findings.map((f) => (
                                  <span key={f.code} className="tone-bad">
                                    {tm(`listings.finding.${f.code}`, {
                                      rule: f.params.rule ?? "",
                                      documents: docNames(f.params.documents ?? ""),
                                    })}
                                  </span>
                                ))}
                              </span>
                            )}
                          </Td>
                          <Td className="rt-acts">
                            {editable ? (
                              <FormDialog
                                action={editListingAction}
                                label={editLabel}
                                ariaLabel={t("products.editOf", {
                                  action: editLabel,
                                  name: l.product_name,
                                })}
                                title={t("products.editTitle", { name: l.product_name })}
                                intro={t("products.editIntro")}
                                submit={t("products.addSubmit")}
                                done={t("products.edited")}
                                triggerClass={l.status === "rejected" ? "btn sm pri" : "btn sm"}
                                fields={[
                                  { kind: "hidden", name: "id", value: l.id },
                                  {
                                    kind: "text",
                                    name: "name",
                                    label: t("products.name"),
                                    defaultValue: l.product_name,
                                  },
                                  {
                                    kind: "text",
                                    name: "price",
                                    label: t("products.price"),
                                    mono: true,
                                    defaultValue: l.price.amount,
                                    hint: t("products.priceHint"),
                                  },
                                ]}
                              />
                            ) : null}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
