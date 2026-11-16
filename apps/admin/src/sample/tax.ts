// Dữ liệu mẫu của nhóm thuế và thuế suất (module `tax` của bước 36 core, chưa có). Phân hệ Sản
// phẩm cần nó để chọn nhóm thuế của sản phẩm và hiện thuế suất đang áp; phân hệ Tài chính sau này
// dùng lại. Hình dạng theo đặc tả bước 36 (`docs/steps/36-money-ledger-tax.md`, bảng
// `tax_categories`, `tax_rates`, `GET /api/v1/tax/categories`, `GET /api/v1/tax/rates`).
//
// Thuế suất là dữ liệu có ngày hiệu lực (luật số hai của core): mức giảm 8% của nhóm
// `vat.standard_reducible` hết hiệu lực từ 01/01/2027 (ngày đó không gồm), rồi về 10%. Căn cứ theo
// gói "vn" của đặc tả — cần đối chiếu văn bản gốc trước khi chạy thật.
import type { Problem } from "@autoxide/sdk";

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

// ---------------------------------------------------------------- Phân hệ Tài chính (W-016)
//
// Phần thêm cho màn "Kế toán": tỉ lệ khấu trừ thay của sàn, quy tắc hoá đơn, gói dữ liệu thuế, hồ sơ
// thuế theo nút (cấp khách, sửa được) và tính thử thuế. Hình dạng theo bảng `tax_withholding_rates`,
// `tax_rules`, `tax_packs`, `tax_profiles` và `POST /api/v1/tax/quote` của đặc tả bước 36. Mọi tỉ lệ
// là dữ liệu có ngày hiệu lực kèm căn cứ; căn cứ chưa chắc ghi "cần đối chiếu văn bản gốc".

export type BusinessLine = "goods" | "services" | "production_transport" | "other";

/** Tỉ lệ khấu trừ thay (`tax_withholding_rates`): sàn có chức năng thanh toán khấu trừ cho hộ kinh doanh. */
export interface WithholdingRate {
  id: string;
  jurisdiction: string;
  payer_kind: "marketplace" | "affiliate";
  payee_regime: "household";
  business_line: BusinessLine;
  tax_kind: "vat" | "pit";
  /** Chữ thập phân, vd "0.5". */
  rate_percent: string;
  effective_from: string;
  effective_to: string | null;
  legal_basis: string;
  pack_version: string;
}

const WITHHOLDING_BASIS =
  "NĐ 117/2025/NĐ-CP, hiệu lực 01/7/2025 — cần đối chiếu văn bản gốc và quy định về hộ kinh doanh từ 2026";

const WITHHOLDING: WithholdingRate[] = (
  [
    ["51", "goods", "vat", "1"],
    ["52", "goods", "pit", "0.5"],
    ["53", "services", "vat", "5"],
    ["54", "services", "pit", "2"],
    ["55", "production_transport", "vat", "3"],
    ["56", "production_transport", "pit", "1.5"],
  ] as const
).map(([n, line, kind, percent]) => ({
  id: id(n),
  jurisdiction: "VN",
  payer_kind: "marketplace",
  payee_regime: "household",
  business_line: line,
  tax_kind: kind,
  rate_percent: percent,
  effective_from: "2025-07-01",
  effective_to: null,
  legal_basis: WITHHOLDING_BASIS,
  pack_version: PACK,
}));

// Thay bằng GET /api/v1/tax/withholding-rates?jurisdiction=VN (đề xuất, bước 36) khi core có.
export async function listWithholdingRates(): Promise<{ data: WithholdingRate[] }> {
  return { data: WITHHOLDING.map((r) => ({ ...r })) };
}

/** Một quy tắc có ngày hiệu lực (`tax_rules`): ngưỡng, thời hạn, nghĩa vụ về chứng từ. */
export interface TaxRule {
  id: string;
  jurisdiction: string;
  code: string;
  /** Giá trị của quy tắc (JSON của `tax_rules.value`). */
  value: { threshold?: { amount: string; currency: string }; years?: number; minutes?: number };
  effective_from: string;
  effective_to: string | null;
  legal_basis: string;
  needs_legal_review: boolean;
}

const RULES: TaxRule[] = [
  {
    id: id("61"),
    jurisdiction: "VN",
    code: "einvoice.cash_register_required",
    value: { threshold: { amount: "1000000000", currency: "VND" } },
    effective_from: "2025-06-01",
    effective_to: null,
    legal_basis: "NĐ 70/2025/NĐ-CP sửa NĐ 123/2020/NĐ-CP — cần đối chiếu lộ trình hạ ngưỡng",
    needs_legal_review: true,
  },
  {
    id: id("62"),
    jurisdiction: "VN",
    code: "einvoice.issue_on_delivery",
    value: {},
    effective_from: "2020-10-19",
    effective_to: null,
    legal_basis: "NĐ 123/2020/NĐ-CP, Điều 9 — cần đối chiếu văn bản gốc",
    needs_legal_review: true,
  },
  {
    id: id("63"),
    jurisdiction: "VN",
    code: "einvoice.correction",
    value: {},
    effective_from: "2025-06-01",
    effective_to: null,
    legal_basis: "NĐ 123/2020/NĐ-CP, Điều 19, sửa bởi NĐ 70/2025/NĐ-CP — cần đối chiếu văn bản gốc",
    needs_legal_review: true,
  },
  {
    id: id("64"),
    jurisdiction: "VN",
    code: "einvoice.mandate",
    value: {},
    effective_from: "2022-07-01",
    effective_to: null,
    legal_basis: "TT 78/2021/TT-BTC và văn bản thay thế — cần đối chiếu văn bản gốc",
    needs_legal_review: true,
  },
  {
    id: id("65"),
    jurisdiction: "VN",
    code: "accounting.retention",
    value: { years: 10 },
    effective_from: "2017-01-01",
    effective_to: null,
    legal_basis: "Luật Kế toán 88/2015/QH13, Điều 41; NĐ 174/2016/NĐ-CP, Điều 12",
    needs_legal_review: false,
  },
  {
    id: id("66"),
    jurisdiction: "VN",
    code: "accounting.chart_mapping",
    value: {},
    effective_from: "2026-01-01",
    effective_to: null,
    legal_basis:
      "TT 99/2025/TT-BTC (thay TT 200/2014) và TT 133/2016/TT-BTC — cần đối chiếu văn bản gốc",
    needs_legal_review: true,
  },
  {
    id: id("67"),
    jurisdiction: "VN",
    code: "payments.vietqr_standard",
    value: { minutes: 30 },
    effective_from: "2018-01-01",
    effective_to: null,
    legal_basis:
      "Đặc tả mã QR của NAPAS (dựa trên EMVCo) và TCCS 03:2018/NHNN — cần đối chiếu bản mới nhất",
    needs_legal_review: true,
  },
  {
    id: id("68"),
    jurisdiction: "VN",
    code: "payments.no_custody",
    value: {},
    effective_from: "2024-07-01",
    effective_to: null,
    legal_basis:
      "NĐ 52/2024/NĐ-CP và TT 40/2024/TT-NHNN: thu hộ, chi hộ cần giấy phép — cần đối chiếu văn bản gốc",
    needs_legal_review: true,
  },
];

// Thay bằng GET /api/v1/tax/rules?jurisdiction=VN (đề xuất, bước 36) khi core có.
export async function listTaxRules(): Promise<{ data: TaxRule[] }> {
  return { data: structuredClone(RULES) };
}

/** Quy tắc `code` đang có hiệu lực vào ngày `day`. */
export function taxRuleOn(
  rules: readonly TaxRule[],
  code: string,
  day: string = vietnamDay(),
): TaxRule | undefined {
  return rules.find(
    (r) =>
      r.code === code &&
      r.effective_from <= day &&
      (r.effective_to === null || day < r.effective_to),
  );
}

/** Gói dữ liệu thuế đang dùng (`GET /api/v1/tax/packs`, chỉ nhân sự nền tảng nhập). */
export interface TaxPack {
  code: string;
  /** Số phiên bản tăng dần (`tax_packs.version`). */
  version: number;
  /** Nhãn của bản, như `pack_version` trên từng thuế suất. */
  release: string;
  imported_at: string;
  checked_on: string;
  source_note: string;
  counts: { rates: number; withholding: number; rules: number };
}

// Thay bằng GET /api/v1/tax/packs (bước 36) khi core có.
export async function currentTaxPack(): Promise<{ data: TaxPack }> {
  return {
    data: {
      code: "vn",
      version: 7,
      release: PACK,
      imported_at: "2026-11-02T03:00:00Z",
      checked_on: "2026-11-13",
      source_note:
        "Tổng hợp qua báo chí, công ty luật ngày 13/11/2026 — mọi dòng có căn cứ, cần đối chiếu văn bản gốc",
      counts: { rates: RATES.length, withholding: WITHHOLDING.length, rules: RULES.length },
    },
  };
}

/** Thuế suất sắp hết hạn trong `days` ngày mà chưa có bản kế tiếp (doctor `tax.expiring_rates`). */
export function expiringRates(
  rates: readonly TaxRate[],
  day: string = vietnamDay(),
  days = 60,
): { rate: TaxRate; successor: TaxRate | null }[] {
  const limit = new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return rates
    .filter((r) => r.effective_to !== null && r.effective_from <= day && r.effective_to > day)
    .filter((r) => (r.effective_to as string) <= limit)
    .map((rate) => ({
      rate,
      successor:
        rates.find(
          (r) => r.category_code === rate.category_code && r.effective_from === rate.effective_to,
        ) ?? null,
    }));
}

// ---------------------------------------------------------------- Tính tiền thuế (không qua số thực)

/** Thuế suất dạng chữ ("8", "0.5") thành phân số nguyên: 0.5 → 5/10. */
function percentParts(percent: string): { units: bigint; scale: bigint } {
  const [whole = "0", fraction = ""] = percent.trim().split(".");
  const scale = 10n ** BigInt(fraction.length);
  return { units: BigInt(whole) * scale + BigInt(fraction || "0"), scale };
}

/** Chia làm tròn nửa lên (số không âm). */
function divHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** `amount × percent%` làm tròn nửa lên tới đơn vị nhỏ nhất (thuế khấu trừ thay, thuế trên giá chưa thuế). */
export function applyPercent(amount: number, percent: string): number {
  const { units, scale } = percentParts(percent);
  return Number(divHalfUp(BigInt(amount) * units, 100n * scale));
}

/** Tách ngược giá đã gồm thuế: `net = round(gross / (1 + r))`, `tax = gross − net` — làm tròn một lần. */
export function splitInclusive(gross: number, percent: string): { net: number; tax: number } {
  const { units, scale } = percentParts(percent);
  const net = Number(divHalfUp(BigInt(gross) * 100n * scale, 100n * scale + units));
  return { net, tax: gross - net };
}

export interface TaxQuote {
  category: string;
  tax_point: string;
  rate: TaxRate;
  gross: number;
  net: number;
  tax: number;
  currency: "VND";
  /** Ảnh chụp lưu vào chứng từ (`snapshot` của `TaxQuote`). */
  snapshot: { rate_id: string; rate_percent: string; pack_version: string; rounding: "half_up" };
}

// Thay bằng POST /api/v1/tax/quote (bước 36, `price_mode: inclusive`) khi core có. Chỉ tính, không ghi.
export async function quoteInclusive(input: {
  category: string;
  gross: number;
  tax_point: string;
}): Promise<{ ok: true; data: TaxQuote } | { ok: false; code: string }> {
  if (!isTaxCategory(input.category)) return { ok: false, code: "tax.category_unknown" };
  const rate = rateOn(RATES, input.category, input.tax_point);
  if (!rate) return { ok: false, code: "tax.rate_missing" };
  const { net, tax } = splitInclusive(input.gross, rate.rate_percent);
  return {
    ok: true,
    data: {
      category: input.category,
      tax_point: input.tax_point,
      rate: { ...rate },
      gross: input.gross,
      net,
      tax,
      currency: "VND",
      snapshot: {
        rate_id: rate.id,
        rate_percent: rate.rate_percent,
        pack_version: rate.pack_version,
        rounding: "half_up",
      },
    },
  };
}

// ---------------------------------------------------------------- Hồ sơ thuế theo nút (cấp khách)

export type TaxRegime = "vat_credit" | "vat_direct" | "household" | "exempt";
export const TAX_REGIMES: readonly TaxRegime[] = [
  "vat_credit",
  "vat_direct",
  "household",
  "exempt",
];

/** Hồ sơ thuế của một nút (`tax_profiles`); nút không có hồ sơ dùng hồ sơ của tổ tiên gần nhất. */
export interface TaxProfile {
  id: string;
  org_id: string;
  tax_code: string;
  regime: TaxRegime;
  legal_name: string;
  address: string;
  business_lines: BusinessLine[];
  updated_at: string;
  updated_by: string;
  /** Số lần đã sửa (lịch sử thay đổi ghi audit). */
  revisions: number;
}

const TAX_CODE_FORMAT = /^\d{10}(-\d{3})?$/;

/** Mã số thuế đúng định dạng: 10 số, hoặc 10 số, gạch nối, 3 số (đơn vị phụ thuộc). */
export function isTaxCodeFormat(text: string): boolean {
  return TAX_CODE_FORMAT.test(text.trim());
}

const PROFILE_SEED: [string, string, string, TaxRegime, string, BusinessLine[]][] = [
  [
    "71",
    "01a1e000-0000-7000-8000-000000000a01",
    "[MÃ SỐ THUẾ MẪU]",
    "vat_credit",
    "Công ty TNHH Bếp Mộc (mẫu)",
    ["goods"],
  ],
  [
    "72",
    "01a1e000-0000-7000-8000-000000000a03",
    "[MÃ SỐ THUẾ MẪU]-001",
    "vat_credit",
    "Công ty TNHH Bếp Mộc — CN Quận 3 (mẫu)",
    ["goods"],
  ],
  [
    "73",
    "01a1e000-0000-7000-8000-000000000a04",
    "[MÃ SỐ THUẾ MẪU]-002",
    "vat_credit",
    "Công ty TNHH Bếp Mộc — CN Thủ Đức (mẫu)",
    ["goods"],
  ],
  [
    "74",
    "01a1e000-0000-7000-8000-000000000a06",
    "[MÃ SỐ THUẾ MẪU]-003",
    "vat_credit",
    "Công ty TNHH Bếp Mộc — CN Cầu Giấy (mẫu)",
    ["goods"],
  ],
  [
    "75",
    "01a1e000-0000-7000-8000-000000000a10",
    "[MÃ SỐ THUẾ MẪU]",
    "household",
    "Hộ kinh doanh Gia Dụng Nhà Na (mẫu)",
    ["goods"],
  ],
  [
    "76",
    "01a1e000-0000-7000-8000-000000000a11",
    "[MÃ SỐ THUẾ MẪU]",
    "vat_credit",
    "Công ty TNHH Gốm Sứ Bát Tràng Xưa (mẫu)",
    ["goods"],
  ],
];

function seedProfiles(): TaxProfile[] {
  return PROFILE_SEED.map(([n, org, code, regime, name, lines]) => ({
    id: id(n),
    org_id: org,
    tax_code: code,
    regime,
    legal_name: name,
    address: "[ĐỊA CHỈ MẪU]",
    business_lines: lines,
    updated_at: n === "71" ? "2026-11-02T03:15:00Z" : "2026-08-20T02:00:00Z",
    updated_by: "Đào Thu Hương",
    revisions: n === "71" ? 3 : 1,
  }));
}

const PROFILES_KEY = Symbol.for("autoxide.sample.tax-profiles");
type ProfileHolder = { [PROFILES_KEY]?: TaxProfile[] };

function profiles(): TaxProfile[] {
  const holder = globalThis as ProfileHolder;
  holder[PROFILES_KEY] ??= seedProfiles();
  return holder[PROFILES_KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleTaxProfiles(): void {
  (globalThis as ProfileHolder)[PROFILES_KEY] = seedProfiles();
}

// Thay bằng GET /api/v1/tax/profiles (bước 36) khi core có.
export async function listTaxProfiles(): Promise<{ data: TaxProfile[] }> {
  return { data: structuredClone(profiles()) };
}

/**
 * Hồ sơ hiệu lực của nút `orgId`: của chính nút, hoặc của tổ tiên gần nhất (khuôn kế thừa của bước
 * 34). `parents` là cha của từng nút (id → id cha).
 */
export function effectiveTaxProfile(
  list: readonly TaxProfile[],
  parents: ReadonlyMap<string, string | null>,
  orgId: string,
): { profile: TaxProfile; source_org_id: string; inherited: boolean } | null {
  let current: string | null | undefined = orgId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const own = list.find((p) => p.org_id === current);
    if (own) return { profile: own, source_org_id: current, inherited: current !== orgId };
    current = parents.get(current);
  }
  return null;
}

// Thay bằng PUT /api/v1/tax/profiles/{org_id} (bước 36, `tax.profiles_manage`, If-Match) khi core có.
// Gom mọi lỗi của ô một lần; nút chưa có hồ sơ riêng thì tạo hồ sơ riêng (thôi kế thừa).
export async function putTaxProfile(
  orgId: string,
  input: { tax_code: string; legal_name: string; regime: string },
  actor: string,
): Promise<{ ok: true; data: TaxProfile } | { ok: false; problem: Problem }> {
  const errors: { field: string; code: string; detail: string }[] = [];
  const taxCode = input.tax_code.trim();
  if (!taxCode) errors.push({ field: "tax_code", code: "required", detail: "required" });
  else if (!isTaxCodeFormat(taxCode))
    errors.push({ field: "tax_code", code: "tax_code", detail: "must be 10 or 10-3 digits" });
  if (!input.legal_name.trim())
    errors.push({ field: "legal_name", code: "required", detail: "required" });
  if (!TAX_REGIMES.includes(input.regime as TaxRegime))
    errors.push({ field: "regime", code: "unknown", detail: "unknown regime" });
  if (errors.length > 0) {
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Unprocessable Entity",
        status: 422,
        code: "validation_failed",
        detail: "The request has invalid fields.",
        errors,
      },
    };
  }
  const list = profiles();
  const now = new Date().toISOString();
  const found = list.find((p) => p.org_id === orgId);
  if (found) {
    found.tax_code = taxCode;
    found.legal_name = input.legal_name.trim();
    found.regime = input.regime as TaxRegime;
    found.updated_at = now;
    found.updated_by = actor;
    found.revisions += 1;
    return { ok: true, data: { ...found } };
  }
  const created: TaxProfile = {
    id: `01a1e000-0000-7000-8000-0000ce${String(900_000 + list.length).padStart(6, "0")}`,
    org_id: orgId,
    tax_code: taxCode,
    regime: input.regime as TaxRegime,
    legal_name: input.legal_name.trim(),
    address: "[ĐỊA CHỈ MẪU]",
    business_lines: ["goods"],
    updated_at: now,
    updated_by: actor,
    revisions: 1,
  };
  list.push(created);
  return { ok: true, data: { ...created } };
}
