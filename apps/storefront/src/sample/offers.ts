// Một dòng bán được trong giỏ (mẫu, W-030): SKU của Bếp Mộc (`catalog.ts`) hay của người bán trên sàn
// (`market.ts`). Khi core có giỏ hàng (bước 45), `GET /api/v1/orders/carts/{id}` trả sẵn tên, giá, nơi
// bán của từng dòng (`Catalog::snapshot`, `owner_org_id`) và hàm này bỏ đi.
import type { ArtName, Tone } from "@/components/icon";
import { productBySku, variantBySku } from "./catalog";
import { type Localized, text } from "./index";
import { sellerBySlug, sellerOpen, sellerProductBySku } from "./market";

/** Cân của SKU Bếp Mộc (gram), từ `apps/admin/src/sample/catalog.ts`. */
const GRAMS: Record<string, number> = {
  CG24: 2600,
  CG26: 3100,
  CG28: 3600,
  NI20: 1400,
  DB3: 1100,
  TG35: 1800,
  HT1L: 2400,
  BG6: 2100,
  NRC750: 820,
  COMBO1: 4900,
  MT200: 230,
  TG25: 1100,
  TGT30: 1300,
  "KB4-XA": 320,
  "KB4-BE": 320,
};

export interface Offer {
  sku: string;
  names: Localized;
  /** Nhãn lựa chọn ("26 cm"), `null` khi một biến thể. */
  option: Localized | null;
  /** Giá gồm thuế, VND. */
  price: number;
  grams: number;
  art: ArtName;
  tone: Tone;
  /** Slug người bán; `null` = Bếp Mộc bán. */
  seller: string | null;
  /** Người bán đang tạm khoá thì không bán được. */
  sellable: boolean;
  /** Slug trang sản phẩm (hàng Bếp Mộc) — hàng người bán mở ở gian hàng. */
  slugs: Localized | null;
}

export function offerBySku(sku: string): Offer | undefined {
  const variant = variantBySku(sku);
  const product = variant ? productBySku(sku) : undefined;
  if (variant && product) {
    return {
      sku,
      names: product.names,
      option: variant.labels,
      price: variant.price,
      grams: GRAMS[sku] ?? 500,
      art: product.art,
      tone: product.tone,
      seller: null,
      sellable: true,
      slugs: product.slugs,
    };
  }
  const listed = sellerProductBySku(sku);
  if (!listed) return undefined;
  const seller = sellerBySlug(listed.seller);
  return {
    sku,
    names: listed.names,
    option: null,
    price: listed.price,
    grams: listed.grams,
    art: listed.art,
    tone: listed.tone,
    seller: listed.seller,
    sellable: seller ? sellerOpen(seller) : false,
    slugs: null,
  };
}

/** SKU có trong giỏ được (có thật và người bán đang bán). */
export function isSellableSku(sku: string): boolean {
  return offerBySku(sku)?.sellable ?? false;
}

/** Tên đầy đủ của dòng: "Chảo gang · 26 cm". */
export function offerName(offer: Offer, locale: string): string {
  const name = text(offer.names, locale);
  return offer.option ? `${name} · ${text(offer.option, locale)}` : name;
}
