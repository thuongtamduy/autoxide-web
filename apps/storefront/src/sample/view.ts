// Dựng dữ liệu cho component dùng chung (thẻ sản phẩm…) từ dữ liệu mẫu. Khi core có API thì viết
// hàm tương tự từ kiểu của SDK; component không đổi.
import type { ProductCardData } from "@/components/product-card";
import { keepUnits } from "@/lib/format";
import type { ListingItem } from "@/lib/listing";
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
import { sellerProfile } from "./seller-profiles";

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
  // Hàng của người bán trên sàn: người bán giao, không có tồn ở cửa hàng của chuỗi.
  const seller = product.seller ? (sellerProfile(product.seller)?.name ?? product.seller) : null;
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
    availability: seller
      ? { kind: "seller" }
      : left.kind === "low"
        ? { kind: "low", left: left.left, store: storeName }
        : { kind: left.kind, store: storeName },
    seller,
    flag: code !== null ? "coupon" : product.flag,
    options: product.variants.length,
    // Nút "Thêm" thêm đúng lựa chọn có giá đang hiện trên thẻ (vd chảo 26 cm).
    quickAdd: variant ? [variant.sku] : [],
  };
}

/** Dòng để lọc / sắp trên trang danh mục (`lib/listing.ts`); `rank` là thứ tự "bán chạy". */
export function listingItem(product: SampleProduct, store: StoreCode, rank: number): ListingItem {
  const variant = variantBySku(product.default_sku) ?? product.variants[0];
  return {
    id: product.id,
    price: variant?.price ?? 0,
    discountBp: product.variants.some((v) => couponPrice(v.sku) !== null) ? COUPON.value_bp : 0,
    rating: product.rating,
    rank,
    addedOn: product.added_on,
    material: product.attrs.material ?? [],
    stove: product.attrs.stove ?? [],
    seller: product.seller ? "market" : "shop",
    // Hàng của người bán do người bán giao: không bao giờ "có sẵn ở cửa hàng".
    inStore:
      !product.seller &&
      product.variants.some((v) => {
        const kind = availability(v.sku, store).kind;
        return kind === "in_store" || kind === "low";
      }),
  };
}
