// Thẻ sản phẩm (`ProductCardData`) từ sản phẩm người bán trên sàn (mẫu, W-030), như `view.ts` cho
// hàng Bếp Mộc. Hàng người bán chưa có trang sản phẩm riêng (trang `/san-pham/<slug>` đọc catalog của
// Bếp Mộc), nên thẻ mở ở gian hàng, đúng ô của sản phẩm (`#sku`).
import type { ProductCardData } from "@/components/product-card";
import { keepUnits } from "@/lib/format";
import { routes } from "@/lib/routes";
import { text } from "./index";
import { type SellerProduct, sellerBySlug, sellerOpen } from "./market";

export function sellerProductCard(
  product: SellerProduct,
  locale: string,
  withSeller = false,
): ProductCardData {
  const seller = sellerBySlug(product.seller);
  const open = seller ? sellerOpen(seller) : false;
  return {
    id: product.sku,
    href: `${routes.seller(product.seller)}#${product.sku.toLowerCase()}`,
    name: keepUnits(text(product.names, locale)),
    art: product.art,
    tone: product.tone,
    price: { amount: product.price, currency: "VND" },
    was: null,
    coupon: null,
    rating: { value: product.rating, count: product.reviews },
    availability: { kind: "seller" },
    seller: withSeller ? (seller?.display_name ?? null) : null,
    flag: null,
    options: 1,
    quickAdd: open ? [product.sku] : [],
  };
}
