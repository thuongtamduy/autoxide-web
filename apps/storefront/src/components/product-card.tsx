import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Money } from "@/lib/format";
import { AddToCart } from "./add-to-cart";
import { Art, type ArtName, type Tone } from "./icon";
import { Price } from "./price";
import { Rating } from "./rating";

/** Tình trạng hàng hiện trên thẻ (theo cửa hàng người mua chọn). */
export type CardAvailability =
  | { kind: "in_store" | "out" | "warehouse"; store: string }
  | { kind: "low"; store: string; left: number }
  | { kind: "seller" };

/**
 * Dữ liệu của một thẻ sản phẩm — không phụ thuộc nguồn: hôm nay dựng từ dữ liệu mẫu
 * (`sample/view.ts`), khi core có catalog (bước 41) thì dựng từ API. Mọi trang có lưới sản phẩm
 * (trang chủ, danh mục, tìm kiếm, gian hàng) dùng chung thẻ này.
 */
export interface ProductCardData {
  id: string;
  href: string;
  name: string;
  art: ArtName;
  tone: Tone;
  price: Money;
  /** Giá gạch (trước giảm). */
  was: Money | null;
  /** Giá khi nhập mã giảm. */
  coupon: { price: Money; code: string } | null;
  rating: { value: number; count: number } | null;
  availability: CardAvailability | null;
  seller: string | null;
  flag: "coupon" | "new" | null;
  /** Số lựa chọn (cỡ, màu); > 1 thì hiện "· 3 lựa chọn". */
  options: number;
  /** SKU thêm vào giỏ khi bấm "Thêm"; rỗng = không có nút (vd phải chọn cỡ trước). */
  quickAdd: string[];
}

function AvailabilityLine({ value }: { value: CardAvailability }) {
  const t = useTranslations("product.availability");
  const tone =
    value.kind === "out"
      ? "warn"
      : value.kind === "low"
        ? "sale"
        : value.kind === "warehouse"
          ? "muted"
          : "ok";
  const label =
    value.kind === "seller"
      ? t("seller")
      : value.kind === "low"
        ? t("low", { left: value.left, store: value.store })
        : t(value.kind, { store: value.store });
  return (
    <span className={`pc-avail av-${tone}`}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function ProductCard({ product, locale }: { product: ProductCardData; locale: string }) {
  const t = useTranslations("product");
  return (
    <div className="pcard">
      <Link
        href={product.href}
        className={`thumb ${product.tone}`}
        aria-label={product.name}
        tabIndex={-1}
      >
        <Art name={product.art} />
        {product.flag ? (
          <span className="flag">
            <span className={`badge ${product.flag === "coupon" ? "b-sale" : "b-brand"}`}>
              {t(product.flag === "coupon" ? "flagCoupon" : "flagNew")}
            </span>
          </span>
        ) : null}
      </Link>
      {product.quickAdd.length > 0 ? (
        <AddToCart
          skus={product.quickAdd}
          className="btn sm pri quick"
          label={t("addNamed", { name: product.name })}
          done={t("added", { name: product.name })}
        >
          {t("add")}
        </AddToCart>
      ) : null}
      <span className="pc-body">
        <Link href={product.href} className="pc-name">
          {product.name}
        </Link>
        <span className="pc-price">
          <Price money={product.price} locale={locale} sale={product.was !== null} />
          {product.was ? <Price money={product.was} locale={locale} was /> : null}
        </span>
        {product.coupon ? (
          <span className="pc-code">
            <Price money={product.coupon.price} locale={locale} sale />{" "}
            {t("withCode", { code: product.coupon.code })}
          </span>
        ) : null}
        {product.rating || product.options > 1 ? (
          <span className="pc-meta">
            {product.rating ? (
              <Rating value={product.rating.value} count={product.rating.count} locale={locale} />
            ) : null}
            {product.options > 1 ? (
              <span className="muted">{t("options", { count: product.options })}</span>
            ) : null}
          </span>
        ) : null}
        {product.availability ? <AvailabilityLine value={product.availability} /> : null}
        {product.seller ? (
          <span className="muted pc-seller">{t("soldBy", { seller: product.seller })}</span>
        ) : null}
      </span>
    </div>
  );
}
