// Dựng dữ liệu cho component dùng chung (thẻ sản phẩm…) từ dữ liệu mẫu. Khi core có API thì viết
// hàm tương tự từ kiểu của SDK; component không đổi.
import type { ProductCardData } from "@/components/product-card";
import { keepUnits } from "@/lib/format";
import { routes } from "@/lib/routes";
import {
  availability,
  COUPON,
  couponPrice,
  type SampleProduct,
  type StoreCode,
  storeByCode,
  variantBySku,
} from "./catalog";
import { text } from "./index";

const money = (amount: number) => ({ amount, currency: "VND" });

export function productCard(
  product: SampleProduct,
  store: StoreCode,
  locale: string,
): ProductCardData {
  const variant = variantBySku(product.default_sku) ?? product.variants[0];
  const price = variant?.price ?? 0;
  const code = variant ? couponPrice(variant.sku) : null;
  const left = availability(product.default_sku, store);
  const storeName = text(storeByCode(store).name, locale);
  return {
    id: product.id,
    href: routes.product(text(product.slugs, locale)),
    name: keepUnits(text(product.names, locale)),
    art: product.art,
    tone: product.tone,
    price: money(price),
    was: null,
    coupon: code !== null ? { price: money(code), code: COUPON.code } : null,
    rating: { value: product.rating, count: product.reviews },
    availability:
      left.kind === "low"
        ? { kind: "low", left: left.left, store: storeName }
        : { kind: left.kind, store: storeName },
    seller: null,
    flag: code !== null ? "coupon" : product.flag,
    options: product.variants.length,
    // Nút "Thêm" thêm đúng lựa chọn có giá đang hiện trên thẻ (vd chảo 26 cm).
    quickAdd: variant ? [variant.sku] : [],
  };
}
