import { getLocale, getTranslations } from "next-intl/server";
import { SellerHead } from "@/components/market/seller";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatMoney } from "@/lib/format";
import { LISTING_BADGE } from "@/lib/market";
import { sellerContext } from "@/lib/seller";
import { listListingReviews } from "@/sample/market";

// Sản phẩm của tôi: mỗi sản phẩm mới hay sửa chờ sàn duyệt trước khi hiện cho người mua; phát hiện tự
// động (hàng có điều kiện thiếu giấy tờ…) hiện ngay để người bán bổ sung trước khi sàn xem.
export default async function SellerProducts() {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const [t, tm, locale] = await Promise.all([
    getTranslations("seller"),
    getTranslations("market"),
    getLocale(),
  ]);
  const { data } = await listListingReviews({ seller: ctx.seller.org_id });
  const docNames = (types: string) =>
    types
      .split(",")
      .filter(Boolean)
      .map((type) => tm(`docType.${type}`))
      .join(", ");
  return (
    <div className="page mk-page">
      <SellerHead title={t("products.title")} description={t("products.description")} />
      <div className="blocks">
        {!ctx.seller.gate.can_sell ? <p className="note warn">{t("products.hidden")}</p> : null}
        <div className="card tcard">
          {data.length === 0 ? (
            <p className="empty">{t("products.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{tm("listings.product")}</Th>
                  <Th className="text-right">{tm("listings.price")}</Th>
                  <Th>{tm("listings.findings")}</Th>
                  <Th>{tm("listings.state")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((l) => (
                  <tr key={l.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{l.product_name}</b>
                        <span className="sub">
                          {l.category_name} · <Time value={l.created_at} date />
                        </span>
                      </span>
                    </Td>
                    <Td label={tm("listings.price")} className="text-right num">
                      {formatMoney(l.price.amount, l.price.currency, locale)}
                    </Td>
                    <Td label={tm("listings.findings")}>
                      {l.findings.filter((f) => f.code !== "seller_not_eligible").length === 0 ? (
                        <span className="tone-ok">{tm("listings.noFinding")}</span>
                      ) : (
                        <span className="cell2">
                          {l.findings
                            .filter((f) => f.code !== "seller_not_eligible")
                            .map((f) => (
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
                    <Td label={tm("listings.state")}>
                      <span className="cell2">
                        <span className={LISTING_BADGE[l.status]}>
                          <span className="dot" />
                          {tm(`listingStatus.${l.status}`)}
                        </span>
                        {l.reason ? <span className="sub">{l.reason}</span> : null}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
