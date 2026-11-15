import "server-only";

import { getTranslations } from "next-intl/server";
import { listCategories } from "@/sample/catalog";
import { listTaxCategories, listTaxRates, rateOn } from "@/sample/tax";

// Phần dùng chung của các trang trong phân hệ Sản phẩm (máy chủ).

/** Endpoint còn thiếu của bước 41, ghi vào nhãn "Dữ liệu mẫu" (W-006). */
export const ENDPOINTS_41 =
  "GET/POST /api/v1/catalog/products, /categories, /attributes, /price-lists, /imports, /variants/{id}/price";

/** Endpoint còn thiếu của bước 42. */
export const ENDPOINTS_42 =
  "GET /api/v1/inventory/levels, /movements, /transfers, /counts, /suppliers, /purchase-orders, /receipts";

/** Ô chọn của "Sản phẩm mới" (dùng cả ở trang chi tiết): danh mục theo cây, nhóm thuế kèm mức. */
export async function newProductOptions(locale: string) {
  const t = await getTranslations("catalog");
  const [{ data: categories }, { data: taxes }, { data: rates }] = await Promise.all([
    listCategories(locale),
    listTaxCategories(),
    listTaxRates(),
  ]);
  return {
    categories: categories.map((c) => ({ value: c.id, label: c.path })),
    taxes: taxes.map((c) => {
      const rate = rateOn(rates, c.code);
      return {
        value: c.code,
        label: `${locale === "vi" ? c.name_vi : c.name_en}${rate ? ` · ${t("vat", { rate: rate.rate_percent })}` : ""}`,
      };
    }),
  };
}
