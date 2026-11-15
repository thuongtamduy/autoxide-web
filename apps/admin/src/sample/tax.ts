// Dữ liệu mẫu của nhóm thuế và thuế suất (module `tax` của bước 36 core, chưa có). Phân hệ Sản
// phẩm cần nó để chọn nhóm thuế của sản phẩm và hiện thuế suất đang áp; phân hệ Tài chính sau này
// dùng lại. Hình dạng theo đặc tả bước 36 (`docs/steps/36-money-ledger-tax.md`, bảng
// `tax_categories`, `tax_rates`, `GET /api/v1/tax/categories`, `GET /api/v1/tax/rates`).
//
// Thuế suất là dữ liệu có ngày hiệu lực (luật số hai của core): mức giảm 8% của nhóm
// `vat.standard_reducible` hết hiệu lực từ 01/01/2027 (ngày đó không gồm), rồi về 10%. Căn cứ theo
// gói "vn" của đặc tả — cần đối chiếu văn bản gốc trước khi chạy thật.

export type TaxKind = "vat" | "excise" | "environment";

/** Nhóm thuế (`GET /api/v1/tax/categories?jurisdiction=VN`). */
export interface TaxCategory {
  id: string;
  jurisdiction: string;
  code: string;
  name_en: string;
  name_vi: string;
  tax_kind: TaxKind;
}

/** Một thuế suất có ngày hiệu lực (`GET /api/v1/tax/rates?jurisdiction=&category=`). */
export interface TaxRate {
  id: string;
  jurisdiction: string;
  category_code: string;
  tax_kind: TaxKind;
  basis: "percent";
  /** Chữ, vd "8" (không dùng số thực cho thuế suất). */
  rate_percent: string;
  /** Ngày bắt đầu (gồm), `YYYY-MM-DD` giờ Việt Nam. */
  effective_from: string;
  /** Ngày hết (không gồm); `null` = chưa hết. */
  effective_to: string | null;
  legal_basis: string;
  pack_version: string;
}

const PACK = "vn-2026.11";
const id = (n: string) => `01a1e000-0000-7000-8000-0000ce0000${n}`;

const CATEGORIES: TaxCategory[] = [
  {
    id: id("01"),
    jurisdiction: "VN",
    code: "vat.standard_reducible",
    name_en: "VAT standard rate, temporarily reduced",
    name_vi: "GTGT thuế suất chuẩn, đang được giảm",
    tax_kind: "vat",
  },
  {
    id: id("02"),
    jurisdiction: "VN",
    code: "vat.standard",
    name_en: "VAT standard rate (not reducible)",
    name_vi: "GTGT thuế suất chuẩn (không thuộc nhóm giảm)",
    tax_kind: "vat",
  },
  {
    id: id("03"),
    jurisdiction: "VN",
    code: "vat.reduced_5",
    name_en: "VAT reduced rate 5%",
    name_vi: "GTGT thuế suất 5%",
    tax_kind: "vat",
  },
  {
    id: id("04"),
    jurisdiction: "VN",
    code: "vat.zero",
    name_en: "VAT 0% (export)",
    name_vi: "GTGT 0% (xuất khẩu)",
    tax_kind: "vat",
  },
  {
    id: id("05"),
    jurisdiction: "VN",
    code: "vat.exempt",
    name_en: "Not subject to VAT",
    name_vi: "Không chịu thuế GTGT",
    tax_kind: "vat",
  },
];

const VAT_LAW = "Luật Thuế GTGT 48/2024/QH15 — cần đối chiếu văn bản gốc";
const REDUCTION =
  "Giảm 2% từ 01/7/2025 tới hết 31/12/2026 theo nghị quyết của Quốc hội và nghị định hướng dẫn — cần đối chiếu danh mục hàng không được giảm";

const RATES: TaxRate[] = [
  rate("11", "vat.standard_reducible", "10", "2025-01-01", "2025-07-01", VAT_LAW),
  rate("12", "vat.standard_reducible", "8", "2025-07-01", "2027-01-01", REDUCTION),
  rate("13", "vat.standard_reducible", "10", "2027-01-01", null, VAT_LAW),
  rate("21", "vat.standard", "10", "2025-01-01", null, VAT_LAW),
  rate("31", "vat.reduced_5", "5", "2025-01-01", null, VAT_LAW),
  rate("41", "vat.zero", "0", "2025-01-01", null, VAT_LAW),
];

function rate(
  n: string,
  category: string,
  percent: string,
  from: string,
  to: string | null,
  basis: string,
): TaxRate {
  return {
    id: id(n),
    jurisdiction: "VN",
    category_code: category,
    tax_kind: "vat",
    basis: "percent",
    rate_percent: percent,
    effective_from: from,
    effective_to: to,
    legal_basis: basis,
    pack_version: PACK,
  };
}

/** Ngày `YYYY-MM-DD` theo giờ Việt Nam (UTC+7) của một thời điểm. */
export function vietnamDay(at: number = Date.now()): string {
  return new Date(at + 7 * 3_600_000).toISOString().slice(0, 10);
}

// Thay bằng GET /api/v1/tax/categories?jurisdiction=VN (bước 36) khi core có.
export async function listTaxCategories(): Promise<{ data: TaxCategory[] }> {
  return { data: CATEGORIES.map((c) => ({ ...c })) };
}

// Thay bằng GET /api/v1/tax/rates?jurisdiction=VN&category= (bước 36) khi core có. Cũ trước.
export async function listTaxRates(category?: string): Promise<{ data: TaxRate[] }> {
  return {
    data: RATES.filter((r) => !category || r.category_code === category)
      .map((r) => ({ ...r }))
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from)),
  };
}

/** Thuế suất đang áp cho nhóm `category` vào ngày `day` (gồm ngày bắt đầu, không gồm ngày hết). */
export function rateOn(
  rates: readonly TaxRate[],
  category: string,
  day: string = vietnamDay(),
): TaxRate | null {
  return (
    rates.find(
      (r) =>
        r.category_code === category &&
        r.effective_from <= day &&
        (r.effective_to === null || day < r.effective_to),
    ) ?? null
  );
}

/** Thuế suất kế tiếp sau `day` của nhóm (đổi mức sắp tới), nếu có. */
export function nextRate(
  rates: readonly TaxRate[],
  category: string,
  day: string = vietnamDay(),
): TaxRate | null {
  return (
    rates
      .filter((r) => r.category_code === category && r.effective_from > day)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0] ?? null
  );
}

/** Mã nhóm thuế có trong engine thuế (sản phẩm chọn mã lạ thì `catalog.tax_category_unknown`). */
export function isTaxCategory(code: string): boolean {
  return CATEGORIES.some((c) => c.code === code);
}
