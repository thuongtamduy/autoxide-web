import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { keepUnits } from "@/lib/format";
import { routes } from "@/lib/routes";
import { text } from "@/sample";
import type { QuoteGroup } from "@/sample/checkout";
import { setQuantity } from "@/sample/checkout-actions";
import { sellerBySlug } from "@/sample/market";
import { Art, Icon } from "../icon";
import { Price } from "../price";

// Dòng giỏ chia theo nơi bán (D-216 của core): "Bếp Mộc bán và giao" và mỗi người bán trên sàn một thẻ,
// vì mỗi nơi bán thành một đơn riêng, giao riêng. Đổi số lượng, bỏ dòng bằng form gửi Server Action:
// chạy cả khi tắt JavaScript; trang tự dựng lại với giỏ mới.

function QuantityForm({
  sku,
  name,
  quantity,
  locale,
}: {
  sku: string;
  name: string;
  quantity: number;
  locale: string;
}) {
  const t = useTranslations("cart");
  return (
    <form action={setQuantity} className="co-qty" aria-label={t("quantityOf", { name })}>
      <input type="hidden" name="sku" value={sku} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        name="quantity"
        value={quantity - 1}
        className="btn ghost sm sq"
        aria-label={quantity > 1 ? t("less", { name }) : t("remove", { name })}
      >
        <Icon name="minus" small />
      </button>
      <output className="num" aria-live="polite">
        {quantity}
      </output>
      <button
        type="submit"
        name="quantity"
        value={quantity + 1}
        className="btn ghost sm sq"
        aria-label={t("more", { name })}
        disabled={quantity >= 99}
      >
        <Icon name="plus" small />
      </button>
    </form>
  );
}

export function CartGroups({
  groups,
  locale,
  siteName,
  editable = true,
}: {
  groups: QuoteGroup[];
  locale: string;
  siteName: string;
  editable?: boolean;
}) {
  const t = useTranslations("cart");
  return groups.map((group) => {
    const seller = group.seller ? sellerBySlug(group.seller) : null;
    return (
      <section
        className="card co-group rise"
        key={group.seller ?? "own"}
        aria-label={seller ? seller.display_name : t("ownTitle", { name: siteName })}
      >
        <div className="co-group-head">
          <Icon name="store" small />
          <b>
            {seller ? (
              <Link href={routes.seller(seller.slug)}>{seller.display_name}</Link>
            ) : (
              t("ownTitle", { name: siteName })
            )}
          </b>
          {seller ? <span className="badge b-ok">{t("verified")}</span> : null}
          <span className="muted co-group-note">
            {seller
              ? seller.fulfillment === "self"
                ? t("sellerShips")
                : t("platformShips")
              : t("ownNote")}
          </span>
        </div>
        {group.lines.map((line) => {
          const name = keepUnits(text(line.offer.names, locale));
          const full = line.offer.option ? `${name} · ${text(line.offer.option, locale)}` : name;
          return (
            <div className="co-line" key={line.sku}>
              <span className={`thumb ${line.offer.tone}`}>
                <Art name={line.offer.art} />
              </span>
              <span className="co-line-text">
                {line.offer.slugs ? (
                  <Link
                    className="co-line-name"
                    href={routes.product(text(line.offer.slugs, locale))}
                  >
                    {full}
                  </Link>
                ) : (
                  <span className="co-line-name">{full}</span>
                )}
                <span className="muted">
                  <Price money={{ amount: line.offer.price, currency: "VND" }} locale={locale} />{" "}
                  {t("each")}
                </span>
                {line.discount > 0 ? (
                  <span className="co-line-promo">
                    {t("codeLine")}{" "}
                    <Price
                      money={{ amount: -line.discount, currency: "VND" }}
                      locale={locale}
                      sale
                    />
                  </span>
                ) : null}
              </span>
              {editable ? (
                <QuantityForm sku={line.sku} name={full} quantity={line.quantity} locale={locale} />
              ) : (
                <span className="num muted">× {line.quantity}</span>
              )}
              <Price
                className="co-line-total"
                money={{ amount: line.amount, currency: "VND" }}
                locale={locale}
              />
              {editable ? (
                <form action={setQuantity}>
                  <input type="hidden" name="sku" value={line.sku} />
                  <input type="hidden" name="quantity" value="0" />
                  <button
                    type="submit"
                    className="btn ghost sm sq"
                    aria-label={t("remove", { name: full })}
                  >
                    <Icon name="trash" small />
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </section>
    );
  });
}
