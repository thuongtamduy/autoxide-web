// Dữ liệu mẫu của phân hệ Sản phẩm (module `catalog`, bước 41 của core, chưa có). Màn "Sản phẩm
// và giá" dựng hoàn toàn bằng file này (W-006); kho (`sample/inventory.ts`), khuyến mại và đơn
// hàng làm sau đọc sản phẩm, biến thể và giá ở đây qua các hàm export, nên ID là cố định
// (`PRODUCT_ID`, `VARIANT_ID`). Hình dạng theo đặc tả `docs/steps/41-catalog.md` của core (mục
// "Bảng dữ liệu", "API REST", "Mã lỗi"); phần đặc tả chưa có (thuộc tính đồ bếp, chạy thử nhập
// CSV, tình trạng "mở bán được chưa", khoảng giá trong danh sách) ghi "dự kiến" và nằm trong bảng
// chỗ thiếu API.
//
// Tiền là `Money` như JSON của core (D-180): `amount` là chuỗi số nguyên đơn vị nhỏ nhất. Giờ lưu
// UTC; ngày hiệu lực (`YYYY-MM-DD`) theo giờ Việt Nam. Dòng giá chỉ thêm, không sửa, không xoá.
// Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import { fold } from "@/lib/fold";
import { type SamplePage, samplePage } from "./index";
import { listUnits, type OrgUnit } from "./org";
import { isTaxCategory, listTaxRates, rateOn, vietnamDay } from "./tax";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;

/** Chữ theo ngôn ngữ (`{ vi, en }`), như cột JSON `names` / `labels` của đặc tả. */
export type Localized = Record<string, string>;

/** Tiền như JSON của core (D-180). */
export interface Money {
  amount: string;
  currency: string;
}

export interface Ref {
  id: string;
  name: string;
}

/** Ngôn ngữ nội dung sản phẩm; ngôn ngữ đầu là mặc định của khách. */
export const CATALOG_LOCALES = ["vi", "en"] as const;
export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 41

export type ProductKind = "physical" | "digital" | "service" | "bundle";
export type ProductStatus = "draft" | "active" | "inactive" | "archived";

export interface ProductTranslation {
  locale: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  meta_title: string;
  meta_description: string;
  /** Có phần do AI gợi ý đã được người duyệt áp dụng (dấu `ai_assisted`, bước 37). */
  ai_assisted: boolean;
}

export interface OptionValue {
  id: string;
  position: number;
  labels: Localized;
}

export interface ProductOption {
  id: string;
  position: number;
  names: Localized;
  values: OptionValue[];
}

export interface Variant {
  id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  option_value_ids: string[];
  /** Nhãn ghép từ giá trị tuỳ chọn ("26 cm", "Xanh"); trống khi sản phẩm một biến thể. */
  label: string;
  position: number;
  active: boolean;
  weight_grams: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  image_media_id: string | null;
  updated_at: string;
}

/** Ảnh của sản phẩm (`PUT /products/{id}/media`): media phải là `Public`. */
export interface ProductMedia {
  media_id: string;
  variant_id: string | null;
  position: number;
  alt: string;
}

export type AttributeType =
  | "text"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "option"
  | "options";

export interface AttributeOption {
  code: string;
  labels: Localized;
  position: number;
}

export interface Attribute {
  id: string;
  code: string;
  data_type: AttributeType;
  /** Số chữ số thập phân khi `decimal` (lưu số nguyên theo `scale`). */
  scale: number;
  unit: string | null;
  names: Localized;
  filterable: boolean;
  options: AttributeOption[];
}

/** Giá trị một thuộc tính của sản phẩm; chữ hoá để gửi qua form, kiểm theo `data_type`. */
export interface ProductAttribute {
  attribute_id: string;
  /** `text`/`date`/`integer`/`decimal`: chữ; `boolean`: "true"/"false"; `option(s)`: mã. */
  values: string[];
}

/**
 * Thuộc tính đồ bếp có cấu trúc (dự kiến; đặc tả 41 chưa có — `ui-phase3-api.md`): cùng nhãn và
 * đơn vị cho cả ngành hàng, để website hiện "đủ cho mấy người", "trong hộp có gì", "dùng và chăm
 * sóc" giống nhau ở mọi sản phẩm.
 */
export interface KitchenInfo {
  /** Số người ăn theo cỡ (từng biến thể). */
  serves: { variant_id: string; min: number; max: number }[];
  in_box: { quantity: number; name: Localized }[];
  not_included: Localized[];
  use: Localized;
  care: Localized;
  dishwasher_safe: boolean | null;
  /** Tệp hướng dẫn (PDF) trong thư viện media. */
  manual_media_id: string | null;
}

export interface BundleComponent {
  variant_id: string;
  quantity: number;
}

export interface Product {
  id: string;
  /** Nút sở hữu (trụ sở cho cả chuỗi). */
  org_id: string;
  kind: ProductKind;
  status: ProductStatus;
  tax_category: string | null;
  primary_category_id: string | null;
  track_inventory: boolean;
  allow_backorder: boolean;
  lot_tracked: boolean;
  serial_tracked: boolean;
  default_locale: string;
  ai_assisted: boolean;
  ever_active: boolean;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  translations: ProductTranslation[];
  options: ProductOption[];
  variants: Variant[];
  media: ProductMedia[];
  attributes: ProductAttribute[];
  kitchen: KitchenInfo | null;
  /** Combo: thành phần của biến thể duy nhất (`PUT /variants/{id}/components`). */
  components: BundleComponent[];
}

/** Một lần đổi của sản phẩm, cho dòng thời gian của màn (`audit` lọc theo bản ghi, bước 52). */
export interface ProductEvent {
  at: string;
  kind:
    | "created"
    | "updated"
    | "status"
    | "price"
    | "variant"
    | "media"
    | "ai_applied"
    | "ai_discarded"
    | "document"
    | "import";
  actor: Ref;
  params: Record<string, string>;
}

export interface CategoryAttribute {
  attribute_id: string;
  required: boolean;
  applies_to_descendants: boolean;
  /** Ngày bắt đầu (gồm). */
  effective_from: string;
  effective_to: string | null;
  legal_basis: string | null;
}

export interface Category {
  id: string;
  parent_id: string | null;
  depth: number;
  position: number;
  names: Localized;
  slugs: Localized;
  updated_at: string;
  attributes: CategoryAttribute[];
  restriction_codes: string[];
}

/** Danh mục kèm số sản phẩm và đường dẫn tên ("Bếp › Chảo"), như `GET /categories` sẽ trả. */
export interface CategorySummary extends Category {
  path: string;
  product_count: number;
  child_count: number;
}

export type RestrictionLevel = "prohibited" | "conditional";

/** Quy tắc hàng cấm / có điều kiện: dữ liệu dùng chung mọi khách, chỉ đọc (gói "vn"). */
export interface RestrictionRule {
  id: string;
  jurisdiction: string;
  code: string;
  level: RestrictionLevel;
  names: Localized;
  required_documents: string[];
  legal_basis: string;
  source_url: string | null;
  effective_from: string;
  effective_to: string | null;
  pack_version: string;
}

export const DOCUMENT_TYPES = [
  "self_declaration",
  "food_safety_certificate",
  "circulation_registration",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface ProductDocument {
  id: string;
  product_id: string;
  org_id: string;
  document_type: DocumentType;
  number: string;
  issued_by: string;
  issued_on: string;
  expires_on: string | null;
  /** Tệp trong kho riêng tư (`Storage`); xem bằng link ký có hạn. */
  file_key: string | null;
  created_at: string;
}

export type DocumentStatus = "valid" | "expiring" | "expired";

export type Audience = "consumer" | "business";

export interface PriceList {
  id: string;
  org_id: string;
  name: string;
  currency: string;
  tax_inclusive: boolean;
  audience: Audience;
  customer_group: string | null;
  priority: number;
  active: boolean;
  updated_at: string;
}

/** Bảng giá kèm tên nút và số dòng giá, như `GET /price-lists` sẽ trả (dự kiến). */
export interface PriceListSummary extends PriceList {
  org_name: string;
  price_count: number;
  variant_count: number;
}

/** Một dòng giá: chỉ thêm, không sửa, không xoá. */
export interface Price {
  id: string;
  price_list_id: string;
  variant_id: string;
  amount: Money;
  compare_at: Money | null;
  valid_from: string;
  valid_to: string | null;
  reference: string;
  created_by: Ref;
  created_at: string;
}

export type PriceState = "current" | "scheduled" | "past";

/** Giá chụp vào chứng từ (`PriceSnapshot` của `catalog::api`). */
export interface PriceSnapshot {
  variant_id: string;
  price_list_id: string;
  price_id: string;
  amount: Money;
  tax_inclusive: boolean;
  compare_at: Money | null;
  valid_from: string;
}

/** Vì sao một bảng giá thắng hay bị bỏ qua khi giải giá. */
export type CandidateOutcome =
  | "winner"
  | "no_price"
  | "outranked"
  | "inactive"
  | "group_mismatch"
  | "currency_mismatch"
  | "other_branch";

export interface PriceCandidate {
  price_list_id: string;
  name: string;
  org_id: string;
  org_name: string;
  /** 0 = chính cửa hàng; 1 = nút cha… `null` = không nằm trên nhánh của cửa hàng. */
  distance: number | null;
  customer_group: string | null;
  priority: number;
  amount: Money | null;
  outcome: CandidateOutcome;
}

/** `GET /variants/{id}/price?org_id=&customer_group=&currency=&at=`: giá và vì sao. */
export interface PriceResolution {
  variant_id: string;
  org_id: string;
  customer_group: string | null;
  currency: string;
  at: string;
  price: PriceSnapshot | null;
  candidates: PriceCandidate[];
}

export type TransferKind = "import" | "export";
export type TransferStatus = "queued" | "running" | "done" | "done_err" | "failed";

export interface RowError {
  row: number;
  column: string;
  code: string;
  params: Record<string, string>;
}

/** Một việc nhập / xuất CSV (`GET /imports/{id}`, `GET /exports/{id}`). */
export interface Transfer {
  id: string;
  kind: TransferKind;
  status: TransferStatus;
  file_name: string;
  mode: ImportMode | null;
  total_rows: number;
  ok_rows: number;
  created_rows: number;
  updated_rows: number;
  /** Lỗi theo dòng (tối đa 1.000), hay một lỗi của cả file (`row` = 0). */
  errors: RowError[];
  created_by: Ref;
  created_at: string;
  finished_at: string | null;
}

export type ImportMode = "upsert" | "update_only";

export type SuggestionStatus = "pending" | "applied" | "discarded";

export type SuggestionField =
  | "short_description"
  | "description"
  | "meta_title"
  | "meta_description";

/** Bản nháp do AI gợi ý: chỉ là gợi ý; người duyệt áp dụng thì sản phẩm mang `ai_assisted`. */
export interface Suggestion {
  id: string;
  product_id: string;
  locale: string;
  fields: Partial<Record<SuggestionField, string>>;
  /** Lời nhắc cho người duyệt (vd "kiểm chất liệu men"). */
  note: string | null;
  status: SuggestionStatus;
  created_at: string;
  decided_by: Ref | null;
  decided_at: string | null;
}

/** Một điều còn thiếu để mở bán (dự kiến: `GET /products/{id}/readiness`). */
export interface ReadinessIssue {
  code:
    | "catalog.tax_category_unknown"
    | "catalog.required_attributes_missing"
    | "catalog.documents_required"
    | "catalog.prohibited_goods"
    | "catalog.bundle_invalid";
  params: Record<string, string>;
}

/** Một dòng của danh sách sản phẩm (`GET /products`), kèm phần dự kiến cho màn quản trị. */
export interface ProductSummary {
  id: string;
  name: string;
  kind: ProductKind;
  status: ProductStatus;
  tax_category: string | null;
  category_id: string | null;
  category_path: string;
  variant_count: number;
  skus: string[];
  /** Khoảng giá ở bảng giá trụ sở lúc đọc (dự kiến). */
  price_min: Money | null;
  price_max: Money | null;
  lot_tracked: boolean;
  serial_tracked: boolean;
  allow_backorder: boolean;
  image_media_id: string | null;
  /** Điều còn thiếu để mở bán (dự kiến); trống = mở bán được. */
  issues: ReadinessIssue[];
  updated_at: string;
}

/** Ảnh chụp một biến thể (`VariantSnapshot` của `catalog::api`), cho kho, đơn, khuyến mại. */
export interface VariantSnapshot {
  variant_id: string;
  product_id: string;
  org_id: string;
  kind: ProductKind;
  status: ProductStatus;
  variant_active: boolean;
  sku: string;
  barcode: string | null;
  name: string;
  variant_label: string;
  locale: string;
  tax_category: string | null;
  category_ids: string[];
  weight_grams: number | null;
  requires_shipping: boolean;
  track_inventory: boolean;
  allow_backorder: boolean;
  lot_tracked: boolean;
  serial_tracked: boolean;
  image_media_id: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------- ID cố định

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

/** Nút tổ chức của `sample/org.ts` (cùng ID). */
export const ORG = {
  ROOT: "01a1e000-0000-7000-8000-000000000a01",
  Q3: "01a1e000-0000-7000-8000-000000000a03",
  TD: "01a1e000-0000-7000-8000-000000000a04",
  WH: "01a1e000-0000-7000-8000-000000000a05",
  CG: "01a1e000-0000-7000-8000-000000000a06",
} as const;

export const PRODUCT_ID = {
  castIronPan: uid("c1", 1),
  steelPot20: uid("c1", 2),
  knifeSet: uid("c1", 3),
  tamarindBoard35: uid("c1", 4),
  glassBox: uid("c1", 5),
  blueBowls: uid("c1", 6),
  towels: uid("c1", 7),
  dishSoap: uid("c1", 8),
  fishSauce: uid("c1", 9),
  potSet: uid("c1", 10),
  nonStickPan: uid("c1", 11),
  starterBundle: uid("c1", 12),
  shrimpSalt: uid("c1", 13),
  tamarindBoard25: uid("c1", 14),
  roundBoard30: uid("c1", 15),
} as const;

/** ID biến thể theo SKU: kho, đơn hàng, khuyến mại mẫu trỏ vào đây. */
export const VARIANT_ID = {
  CG24: uid("c2", 1),
  CG26: uid("c2", 2),
  CG28: uid("c2", 3),
  NI20: uid("c2", 4),
  DB3: uid("c2", 5),
  TG35: uid("c2", 6),
  HT1L: uid("c2", 7),
  BG6: uid("c2", 8),
  "KB4-XA": uid("c2", 9),
  "KB4-BE": uid("c2", 10),
  NRC750: uid("c2", 11),
  NMC500: uid("c2", 12),
  BNI3: uid("c2", 13),
  CCD28: uid("c2", 14),
  COMBO1: uid("c2", 15),
  MT200: uid("c2", 16),
  TG25: uid("c2", 17),
  TGT30: uid("c2", 18),
} as const;
export type SampleSku = keyof typeof VARIANT_ID;

const CAT = {
  kitchen: uid("c3", 1),
  pans: uid("c3", 2),
  pots: uid("c3", 3),
  knives: uid("c3", 4),
  tableware: uid("c3", 5),
  ceramics: uid("c3", 6),
  care: uid("c3", 7),
  food: uid("c3", 8),
  spices: uid("c3", 9),
  storage: uid("c3", 10),
  textiles: uid("c3", 11),
} as const;

const ATTR = {
  origin: uid("c4", 1),
  material: uid("c4", 2),
  diameter: uid("c4", 3),
  capacity: uid("c4", 4),
  stove_types: uid("c4", 5),
  expiry_date: uid("c4", 6),
  responsible_org: uid("c4", 7),
  ingredients: uid("c4", 8),
  warnings: uid("c4", 9),
  self_declaration_no: uid("c4", 10),
  food_safe_glaze: uid("c4", 11),
} as const;

export const PRICE_LIST_ID = {
  retail: uid("c5", 1),
  caugiay: uid("c5", 2),
  wholesale: uid("c5", 3),
  tet: uid("c5", 4),
} as const;

const YEN: Ref = { id: "01a1e000-0000-7000-8000-000000000f10", name: "Hoàng Yến" };
const MAI: Ref = { id: "01a1e000-0000-7000-8000-000000000f01", name: "Ngô Mai" };
/** Người đang thao tác trên kho mẫu (hàm mẫu không biết ai đăng nhập). */
export const SAMPLE_ACTOR: Ref = { id: "01a1e000-0000-7000-8000-000000000f99", name: "Bạn" };

// ---------------------------------------------------------------- Kho trong bộ nhớ

interface Store {
  products: Product[];
  events: Map<string, ProductEvent[]>;
  categories: Category[];
  attributes: Attribute[];
  rules: RestrictionRule[];
  documents: ProductDocument[];
  priceLists: PriceList[];
  prices: Price[];
  transfers: Transfer[];
  suggestions: Suggestion[];
  seq: number;
}

/** Giờ Việt Nam 00:00 của một ngày → UTC ISO. */
function vnMidnight(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00+07:00`)).toISOString();
}

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

const L = (vi: string, en: string): Localized => ({ vi, en });

interface SeedVariant {
  sku: SampleSku;
  label?: string;
  values?: string[];
  grams: number;
  dims: [number, number, number];
  barcode?: string;
}

interface SeedProduct {
  key: keyof typeof PRODUCT_ID;
  vi: string;
  en: string;
  slug: string;
  kind?: ProductKind;
  status: ProductStatus;
  tax: string | null;
  cat: string;
  option?: { names: Localized; values: Localized[] };
  variants: SeedVariant[];
  short?: [string, string];
  flags?: Partial<Pick<Product, "allow_backorder" | "lot_tracked" | "serial_tracked">>;
  attrs?: [keyof typeof ATTR, string[]][];
  kitchen?: KitchenInfo;
  components?: BundleComponent[];
  enAi?: boolean;
}

function product(seed: SeedProduct, index: number): Product {
  const id = PRODUCT_ID[seed.key];
  const kind = seed.kind ?? "physical";
  const options: ProductOption[] = seed.option
    ? [
        {
          id: uid("ca", index * 10),
          position: 0,
          names: seed.option.names,
          values: seed.option.values.map((labels, i) => ({
            id: uid("ca", index * 10 + i + 1),
            position: i,
            labels,
          })),
        },
      ]
    : [];
  const created = ago((40 - index) * DAY);
  const variants: Variant[] = seed.variants.map((v, i) => ({
    id: VARIANT_ID[v.sku],
    product_id: id,
    sku: v.sku,
    barcode: v.barcode ?? null,
    option_value_ids: options[0]?.values[i] ? [options[0].values[i].id] : [],
    label: v.label ?? "",
    position: i,
    active: true,
    weight_grams: v.grams,
    length_mm: v.dims[0],
    width_mm: v.dims[1],
    height_mm: v.dims[2],
    image_media_id: null,
    updated_at: created,
  }));
  const [shortVi, shortEn] = seed.short ?? ["", ""];
  return {
    id,
    org_id: ORG.ROOT,
    kind,
    status: seed.status,
    tax_category: seed.tax,
    primary_category_id: seed.cat,
    track_inventory: kind === "physical",
    allow_backorder: seed.flags?.allow_backorder ?? false,
    lot_tracked: seed.flags?.lot_tracked ?? false,
    serial_tracked: seed.flags?.serial_tracked ?? false,
    default_locale: "vi",
    ai_assisted: seed.enAi ?? false,
    ever_active: seed.status !== "draft",
    created_at: created,
    updated_at: ago(index * 3_600_000),
    activated_at: seed.status === "draft" ? null : ago((38 - index) * DAY),
    translations: [
      {
        locale: "vi",
        name: seed.vi,
        slug: seed.slug,
        short_description: shortVi,
        description: shortVi,
        meta_title: seed.vi,
        meta_description: shortVi,
        ai_assisted: false,
      },
      {
        locale: "en",
        name: seed.en,
        slug: `${seed.slug}-en`,
        short_description: shortEn,
        description: shortEn,
        meta_title: seed.en,
        meta_description: shortEn,
        ai_assisted: seed.enAi ?? false,
      },
    ],
    options,
    variants,
    media: [],
    attributes: (seed.attrs ?? []).map(([code, values]) => ({ attribute_id: ATTR[code], values })),
    kitchen: seed.kitchen ?? null,
    components: seed.components ?? [],
  };
}

const KITCHEN_ORG = "Công ty TNHH Bếp Mộc (mẫu)";

function seedProducts(): Product[] {
  const seeds: SeedProduct[] = [
    {
      key: "castIronPan",
      vi: "Chảo gang",
      en: "Cast iron pan",
      slug: "chao-gang",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.pans,
      option: {
        names: L("Cỡ", "Size"),
        values: [L("24 cm", "24 cm"), L("26 cm", "26 cm"), L("28 cm", "28 cm")],
      },
      variants: [
        {
          sku: "CG24",
          label: "24 cm",
          grams: 2600,
          dims: [380, 260, 60],
          barcode: "8930000000019",
        },
        {
          sku: "CG26",
          label: "26 cm",
          grams: 3100,
          dims: [410, 280, 60],
          barcode: "8930000000026",
        },
        {
          sku: "CG28",
          label: "28 cm",
          grams: 3600,
          dims: [440, 300, 60],
          barcode: "8930000000033",
        },
      ],
      short: [
        "Chảo gang đúc nguyên khối, giữ nhiệt đều, dùng được trên mọi loại bếp và trong lò.",
        "Solid cast iron pan that holds heat evenly; works on every stove and in the oven.",
      ],
      attrs: [
        ["origin", ["vn"]],
        ["material", ["cast_iron"]],
        ["stove_types", ["gas", "induction", "infrared", "oven"]],
        ["responsible_org", [KITCHEN_ORG]],
      ],
      kitchen: {
        serves: [
          { variant_id: VARIANT_ID.CG24, min: 1, max: 2 },
          { variant_id: VARIANT_ID.CG26, min: 2, max: 3 },
          { variant_id: VARIANT_ID.CG28, min: 3, max: 4 },
        ],
        in_box: [
          { quantity: 1, name: L("Chảo gang", "Cast iron pan") },
          { quantity: 1, name: L("Bọc tay cầm silicon", "Silicone handle cover") },
        ],
        not_included: [L("Nắp kính (bán riêng theo cỡ)", "Glass lid (sold separately by size)")],
        use: L(
          "Làm nóng chảo từ từ ở lửa vừa. Dùng được trên bếp gas, từ, hồng ngoại và trong lò tới 260 °C.",
          "Preheat slowly on medium heat. Works on gas, induction, infrared and in the oven up to 260 °C.",
        ),
        care: L(
          "Rửa tay bằng nước ấm, lau khô ngay và thoa một lớp dầu mỏng. Không ngâm nước lâu.",
          "Hand wash in warm water, dry at once and wipe with a thin coat of oil. Do not soak.",
        ),
        dishwasher_safe: false,
        manual_media_id: null,
      },
      enAi: true,
    },
    {
      key: "steelPot20",
      vi: "Nồi inox 3 đáy 20 cm",
      en: "Tri-ply stainless pot 20 cm",
      slug: "noi-inox-3-day-20",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.pots,
      variants: [{ sku: "NI20", grams: 1400, dims: [260, 220, 150] }],
      short: [
        "Nồi inox 304 ba lớp đáy, nắp kính có lỗ thoát hơi.",
        "Tri-ply 304 stainless pot with a vented glass lid.",
      ],
      attrs: [
        ["origin", ["vn"]],
        ["material", ["stainless_steel"]],
        ["capacity", ["2500"]],
        ["responsible_org", [KITCHEN_ORG]],
      ],
      kitchen: {
        serves: [{ variant_id: VARIANT_ID.NI20, min: 2, max: 4 }],
        in_box: [
          { quantity: 1, name: L("Nồi", "Pot") },
          { quantity: 1, name: L("Nắp kính", "Glass lid") },
        ],
        not_included: [],
        use: L(
          "Dùng được trên mọi loại bếp, kể cả bếp từ.",
          "Works on every stove, induction included.",
        ),
        care: L("Rửa được bằng máy rửa bát.", "Dishwasher safe."),
        dishwasher_safe: true,
        manual_media_id: null,
      },
    },
    {
      key: "knifeSet",
      vi: "Bộ dao bếp 3 món",
      en: "Kitchen knife set, 3 pieces",
      slug: "bo-dao-bep-3-mon",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.knives,
      variants: [{ sku: "DB3", grams: 1100, dims: [360, 120, 40] }],
      flags: { serial_tracked: true },
      attrs: [
        ["origin", ["vn"]],
        ["material", ["stainless_steel"]],
      ],
    },
    {
      key: "tamarindBoard35",
      vi: "Thớt gỗ me tây 35 cm",
      en: "Rain tree cutting board 35 cm",
      slug: "thot-go-me-tay-35",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.knives,
      variants: [{ sku: "TG35", grams: 1800, dims: [350, 250, 30] }],
      attrs: [
        ["origin", ["vn"]],
        ["material", ["wood"]],
      ],
    },
    {
      key: "glassBox",
      vi: "Hộp thuỷ tinh 1 lít (bộ 3)",
      en: "Glass food box 1 L (set of 3)",
      slug: "hop-thuy-tinh-1-lit",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.storage,
      variants: [{ sku: "HT1L", grams: 2400, dims: [300, 220, 200] }],
      flags: { allow_backorder: true },
      attrs: [["origin", ["vn"]]],
    },
    {
      key: "blueBowls",
      vi: "Bát gốm men lam (bộ 6)",
      en: "Blue glaze ceramic bowls (set of 6)",
      slug: "bat-gom-men-lam",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.ceramics,
      variants: [{ sku: "BG6", grams: 2100, dims: [300, 200, 150] }],
      attrs: [
        ["origin", ["vn"]],
        ["food_safe_glaze", ["true"]],
      ],
    },
    {
      key: "towels",
      vi: "Khăn bếp cotton (bộ 4)",
      en: "Cotton kitchen towels (set of 4)",
      slug: "khan-bep-cotton",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.textiles,
      option: { names: L("Màu", "Colour"), values: [L("Xanh", "Blue"), L("Be", "Beige")] },
      variants: [
        { sku: "KB4-XA", label: "Xanh", grams: 320, dims: [250, 200, 30] },
        { sku: "KB4-BE", label: "Be", grams: 320, dims: [250, 200, 30] },
      ],
    },
    {
      key: "dishSoap",
      vi: "Nước rửa chén hữu cơ 750 ml",
      en: "Organic dish soap 750 ml",
      slug: "nuoc-rua-chen-huu-co",
      status: "active",
      tax: "vat.standard",
      cat: CAT.care,
      variants: [{ sku: "NRC750", grams: 820, dims: [90, 60, 250] }],
      flags: { lot_tracked: true },
      attrs: [
        ["ingredients", ["Chất hoạt động bề mặt gốc thực vật, tinh dầu sả (mẫu)"]],
        ["warnings", ["Tránh xa tầm tay trẻ em. Không uống."]],
      ],
    },
    {
      key: "fishSauce",
      vi: "Nước mắm cốt cá cơm 500 ml",
      en: "Anchovy fish sauce 500 ml",
      slug: "nuoc-mam-cot-ca-com",
      status: "draft",
      tax: "vat.standard_reducible",
      cat: CAT.spices,
      variants: [{ sku: "NMC500", grams: 700, dims: [70, 70, 260] }],
      flags: { lot_tracked: true },
      attrs: [
        ["ingredients", ["Cá cơm, muối (mẫu)"]],
        ["expiry_date", ["2028-06-30"]],
        ["self_declaration_no", ["[SỐ VĂN BẢN]"]],
      ],
    },
    {
      key: "potSet",
      vi: "Bộ nồi inox 3 đáy (3 chiếc)",
      en: "Tri-ply pot set (3 pieces)",
      slug: "bo-noi-inox-3-day",
      status: "draft",
      tax: null,
      cat: CAT.pots,
      variants: [{ sku: "BNI3", grams: 4200, dims: [420, 300, 260] }],
      attrs: [
        ["material", ["stainless_steel"]],
        ["capacity", ["2000"]],
        ["responsible_org", [KITCHEN_ORG]],
      ],
    },
    {
      key: "nonStickPan",
      vi: "Chảo chống dính 28 cm",
      en: "Non-stick pan 28 cm",
      slug: "chao-chong-dinh-28",
      status: "inactive",
      tax: "vat.standard_reducible",
      cat: CAT.pans,
      variants: [{ sku: "CCD28", grams: 1200, dims: [500, 300, 70] }],
      attrs: [
        ["origin", ["cn"]],
        ["material", ["aluminium"]],
        ["stove_types", ["gas", "infrared"]],
        ["responsible_org", [KITCHEN_ORG]],
      ],
    },
    {
      key: "starterBundle",
      vi: "Combo bếp mới",
      en: "New kitchen bundle",
      slug: "combo-bep-moi",
      kind: "bundle",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.kitchen,
      variants: [{ sku: "COMBO1", grams: 4900, dims: [440, 300, 100] }],
      attrs: [
        ["origin", ["vn"]],
        ["responsible_org", [KITCHEN_ORG]],
      ],
      components: [
        { variant_id: VARIANT_ID.CG26, quantity: 1 },
        { variant_id: VARIANT_ID.TG35, quantity: 1 },
      ],
    },
    {
      key: "shrimpSalt",
      vi: "Muối tôm 200 g",
      en: "Shrimp salt 200 g",
      slug: "muoi-tom-200g",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.spices,
      variants: [{ sku: "MT200", grams: 230, dims: [80, 80, 110] }],
      flags: { lot_tracked: true },
      attrs: [
        ["ingredients", ["Muối, tôm khô, ớt (mẫu)"]],
        ["expiry_date", ["2027-08-31"]],
        ["self_declaration_no", ["[SỐ VĂN BẢN]"]],
      ],
    },
    {
      key: "tamarindBoard25",
      vi: "Thớt gỗ me tây 25 cm",
      en: "Rain tree cutting board 25 cm",
      slug: "thot-go-me-tay-25",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.knives,
      variants: [{ sku: "TG25", grams: 1100, dims: [250, 180, 30] }],
      attrs: [
        ["origin", ["vn"]],
        ["material", ["wood"]],
      ],
    },
    {
      key: "roundBoard30",
      vi: "Thớt gỗ tròn 30 cm",
      en: "Round wooden board 30 cm",
      slug: "thot-go-tron-30",
      status: "active",
      tax: "vat.standard_reducible",
      cat: CAT.knives,
      variants: [{ sku: "TGT30", grams: 1300, dims: [300, 300, 30] }],
      attrs: [
        ["origin", ["vn"]],
        ["material", ["wood"]],
      ],
    },
  ];
  return seeds.map((seed, index) => product(seed, index + 1));
}

function seedCategories(): Category[] {
  const cat = (
    id: string,
    parent: string | null,
    depth: number,
    position: number,
    vi: string,
    en: string,
    slug: string,
    attributes: CategoryAttribute[] = [],
    restriction_codes: string[] = [],
  ): Category => ({
    id,
    parent_id: parent,
    depth,
    position,
    names: L(vi, en),
    slugs: L(slug, `${slug}-en`),
    updated_at: ago(30 * DAY),
    attributes,
    restriction_codes,
  });
  const label = "NĐ 43/2017/NĐ-CP, sửa bởi NĐ 111/2021/NĐ-CP — cần đối chiếu văn bản gốc";
  const req = (
    attr: keyof typeof ATTR,
    from: string,
    descendants = true,
    basis: string | null = label,
  ): CategoryAttribute => ({
    attribute_id: ATTR[attr],
    required: true,
    applies_to_descendants: descendants,
    effective_from: from,
    effective_to: null,
    legal_basis: basis,
  });
  return [
    cat(CAT.kitchen, null, 0, 0, "Bếp", "Kitchen", "bep", [
      req("origin", "2022-02-15"),
      req("responsible_org", "2022-02-15"),
    ]),
    cat(CAT.pans, CAT.kitchen, 1, 0, "Chảo", "Pans", "chao", [
      req("material", "2022-02-15", true, null),
      req("stove_types", "2024-01-01", true, null),
    ]),
    cat(CAT.pots, CAT.kitchen, 1, 1, "Nồi", "Pots", "noi", [
      req("material", "2022-02-15", true, null),
      req("capacity", "2024-01-01", true, null),
    ]),
    cat(CAT.knives, null, 0, 1, "Dao và thớt", "Knives and boards", "dao-va-thot", [
      req("origin", "2022-02-15"),
      req("material", "2022-02-15", true, null),
    ]),
    cat(CAT.tableware, null, 0, 2, "Bát đĩa", "Tableware", "bat-dia", [
      req("origin", "2022-02-15"),
    ]),
    cat(CAT.ceramics, CAT.tableware, 1, 0, "Gốm sứ", "Ceramics", "gom-su", [
      req("food_safe_glaze", "2025-01-01", true, null),
    ]),
    cat(CAT.care, null, 0, 3, "Chăm sóc bếp", "Kitchen care", "cham-soc-bep", [
      req("ingredients", "2022-02-15"),
      req("warnings", "2022-02-15"),
    ]),
    cat(CAT.food, null, 0, 4, "Thực phẩm", "Food", "thuc-pham", [req("ingredients", "2022-02-15")]),
    cat(
      CAT.spices,
      CAT.food,
      1,
      0,
      "Gia vị",
      "Spices",
      "gia-vi",
      [req("expiry_date", "2022-02-15"), req("self_declaration_no", "2022-02-15")],
      ["FOOD_PACKAGED"],
    ),
    cat(CAT.storage, null, 0, 5, "Hộp đựng thực phẩm", "Food storage", "hop-dung-thuc-pham"),
    cat(CAT.textiles, null, 0, 6, "Khăn và vải bếp", "Kitchen textiles", "khan-va-vai-bep", [
      // Thuộc tính bắt buộc có ngày hiệu lực trong tương lai: sản phẩm đang bán vẫn bán.
      req("material", "2027-01-01", true, null),
    ]),
  ];
}

function seedAttributes(): Attribute[] {
  const opt = (code: string, vi: string, en: string, position: number): AttributeOption => ({
    code,
    labels: L(vi, en),
    position,
  });
  const attr = (
    code: keyof typeof ATTR,
    data_type: AttributeType,
    vi: string,
    en: string,
    filterable: boolean,
    extra: Partial<Pick<Attribute, "scale" | "unit" | "options">> = {},
  ): Attribute => ({
    id: ATTR[code],
    code,
    data_type,
    scale: extra.scale ?? 0,
    unit: extra.unit ?? null,
    names: L(vi, en),
    filterable,
    options: extra.options ?? [],
  });
  return [
    attr("origin", "option", "Xuất xứ", "Origin", true, {
      options: [
        opt("vn", "Việt Nam", "Vietnam", 0),
        opt("jp", "Nhật Bản", "Japan", 1),
        opt("cn", "Trung Quốc", "China", 2),
      ],
    }),
    attr("material", "options", "Chất liệu", "Material", true, {
      options: [
        opt("cast_iron", "Gang", "Cast iron", 0),
        opt("stainless_steel", "Inox", "Stainless steel", 1),
        opt("aluminium", "Nhôm", "Aluminium", 2),
        opt("wood", "Gỗ", "Wood", 3),
        opt("ceramic", "Gốm sứ", "Ceramic", 4),
        opt("cotton", "Cotton", "Cotton", 5),
      ],
    }),
    attr("diameter", "decimal", "Đường kính", "Diameter", true, { scale: 1, unit: "cm" }),
    attr("capacity", "integer", "Dung tích", "Capacity", true, { unit: "ml" }),
    attr("stove_types", "options", "Loại bếp dùng được", "Works on", true, {
      options: [
        opt("gas", "Bếp gas", "Gas", 0),
        opt("induction", "Bếp từ", "Induction", 1),
        opt("infrared", "Bếp hồng ngoại", "Infrared", 2),
        opt("oven", "Lò nướng", "Oven", 3),
      ],
    }),
    attr("expiry_date", "date", "Hạn sử dụng", "Best before", false),
    attr("responsible_org", "text", "Tổ chức chịu trách nhiệm", "Responsible organisation", false),
    attr("ingredients", "text", "Thành phần", "Ingredients", false),
    attr("warnings", "text", "Cảnh báo", "Warnings", false),
    attr("self_declaration_no", "text", "Số bản tự công bố", "Self-declaration number", false),
    attr("food_safe_glaze", "boolean", "Men an toàn thực phẩm", "Food-safe glaze", true),
  ];
}

function seedRules(): RestrictionRule[] {
  const rule = (
    n: number,
    code: string,
    level: RestrictionLevel,
    vi: string,
    en: string,
    documents: string[],
    basis: string,
  ): RestrictionRule => ({
    id: uid("cb", n),
    jurisdiction: "VN",
    code,
    level,
    names: L(vi, en),
    required_documents: documents,
    legal_basis: basis,
    source_url: null,
    effective_from: "2026-11-13",
    effective_to: null,
    pack_version: "vn-2026.11",
  });
  return [
    rule(
      1,
      "FOOD_PACKAGED",
      "conditional",
      "Thực phẩm bao gói sẵn",
      "Pre-packaged food",
      ["self_declaration"],
      "Pháp luật an toàn thực phẩm — cần đối chiếu văn bản gốc",
    ),
    rule(
      2,
      "HOUSEHOLD_BIOCIDE",
      "conditional",
      "Chế phẩm diệt khuẩn gia dụng",
      "Household biocides",
      ["circulation_registration"],
      "Cần đối chiếu văn bản gốc",
    ),
    rule(
      3,
      "FIREWORKS",
      "prohibited",
      "Pháo nổ",
      "Firecrackers",
      [],
      "Luật Đầu tư 61/2020/QH14, Điều 6 — cần đối chiếu danh mục hiện hành",
    ),
  ];
}

function seedDocuments(): ProductDocument[] {
  return [
    {
      id: uid("c7", 1),
      product_id: PRODUCT_ID.shrimpSalt,
      org_id: ORG.ROOT,
      document_type: "self_declaration",
      number: "[SỐ VĂN BẢN]",
      issued_by: "[CƠ QUAN CẤP]",
      issued_on: "2026-02-10",
      expires_on: null,
      file_key: "catalog/documents/mt200-tcb.pdf",
      created_at: ago(270 * DAY),
    },
    {
      id: uid("c7", 2),
      product_id: PRODUCT_ID.shrimpSalt,
      org_id: ORG.ROOT,
      document_type: "food_safety_certificate",
      number: "[SỐ VĂN BẢN]",
      issued_by: "[CƠ QUAN CẤP] · bên sản xuất",
      issued_on: "2024-01-05",
      expires_on: "2027-01-05",
      file_key: "catalog/documents/mt200-attp.pdf",
      created_at: ago(300 * DAY),
    },
  ];
}

function seedPriceLists(): PriceList[] {
  const list = (
    id: string,
    org: string,
    name: string,
    audience: Audience,
    tax_inclusive: boolean,
    priority: number,
    active: boolean,
    group: string | null = null,
  ): PriceList => ({
    id,
    org_id: org,
    name,
    currency: "VND",
    tax_inclusive,
    audience,
    customer_group: group,
    priority,
    active,
    updated_at: ago(45 * DAY),
  });
  return [
    list(PRICE_LIST_ID.retail, ORG.ROOT, "Giá bán lẻ toàn chuỗi", "consumer", true, 0, true),
    list(PRICE_LIST_ID.caugiay, ORG.CG, "Giá CN Cầu Giấy", "consumer", true, 0, true),
    list(
      PRICE_LIST_ID.wholesale,
      ORG.ROOT,
      "Giá sỉ nhà hàng",
      "business",
      false,
      10,
      true,
      "SI-NHAHANG",
    ),
    list(PRICE_LIST_ID.tet, ORG.ROOT, "Giá Tết 2026", "consumer", true, 5, false),
  ];
}

const vnd = (amount: number): Money => ({ amount: String(amount), currency: "VND" });

function seedPrices(): Price[] {
  let n = 0;
  const row = (
    list: string,
    sku: SampleSku,
    amount: number,
    from: string,
    reference: string,
    by: Ref = YEN,
    extra: { compare?: number; to?: string; created?: string } = {},
  ): Price => {
    n += 1;
    return {
      id: uid("c6", n),
      price_list_id: list,
      variant_id: VARIANT_ID[sku],
      amount: vnd(amount),
      compare_at: extra.compare ? vnd(extra.compare) : null,
      valid_from: vnMidnight(from),
      valid_to: extra.to ? vnMidnight(extra.to) : null,
      reference,
      created_by: by,
      created_at: extra.created ?? new Date(Date.parse(vnMidnight(from)) - 5 * DAY).toISOString(),
    };
  };
  const q4 = "2026-10-01";
  const retail: [SampleSku, number][] = [
    ["CG24", 590_000],
    ["CG26", 690_000],
    ["CG28", 760_000],
    ["NI20", 540_000],
    ["DB3", 820_000],
    ["TG35", 260_000],
    ["HT1L", 315_000],
    ["BG6", 420_000],
    ["KB4-XA", 99_000],
    ["KB4-BE", 99_000],
    ["NRC750", 89_000],
    ["NMC500", 125_000],
    ["CCD28", 450_000],
    ["COMBO1", 899_000],
    ["MT200", 45_000],
    ["TG25", 190_000],
    ["TGT30", 220_000],
  ];
  return [
    // Lịch sử của CG26: giá Tết (đã tắt), giá quý 3, giá quý 4 đang hiệu lực, giá hẹn giờ 2027.
    row(PRICE_LIST_ID.tet, "CG26", 650_000, "2026-01-20", "gia-tet-2026", MAI, {
      compare: 720_000,
      to: "2026-02-16",
    }),
    row(PRICE_LIST_ID.retail, "CG26", 720_000, "2026-07-01", "gia-q3-2026"),
    ...retail.map(([sku, amount]) => row(PRICE_LIST_ID.retail, sku, amount, q4, "gia-q4-2026")),
    // Giữ giá chưa thuế 638.889 ₫ khi GTGT về 10%: 638.889 × 1,1 ≈ 703.000 ₫.
    row(PRICE_LIST_ID.retail, "CG26", 703_000, "2027-01-01", "gia-2027-gtgt", YEN, {
      created: "2026-11-12T03:20:00.000Z",
    }),
    row(PRICE_LIST_ID.caugiay, "BG6", 440_000, q4, "gia-cg-q4-2026", MAI),
    row(PRICE_LIST_ID.caugiay, "KB4-XA", 105_000, q4, "gia-cg-q4-2026", MAI),
    row(PRICE_LIST_ID.caugiay, "KB4-BE", 105_000, q4, "gia-cg-q4-2026", MAI),
    row(PRICE_LIST_ID.wholesale, "CG26", 560_000, q4, "gia-si-q4-2026"),
    row(PRICE_LIST_ID.wholesale, "NI20", 430_000, q4, "gia-si-q4-2026"),
    row(PRICE_LIST_ID.wholesale, "TG35", 205_000, q4, "gia-si-q4-2026"),
  ];
}

function seedTransfers(): Transfer[] {
  const t = (
    n: number,
    status: TransferStatus,
    file: string,
    total: number,
    ok: number,
    created: number,
    by: Ref,
    at: number,
    errors: RowError[] = [],
  ): Transfer => ({
    id: uid("c8", n),
    kind: "import",
    status,
    file_name: file,
    mode: "upsert",
    total_rows: total,
    ok_rows: ok,
    created_rows: created,
    updated_rows: Math.max(0, ok - created),
    errors,
    created_by: by,
    created_at: ago(at),
    finished_at: status === "running" || status === "queued" ? null : ago(at - 11 * 60_000),
  });
  return [
    t(2, "running", "bo-suu-tap-gom.csv", 300, 140, 140, MAI, 2 * 3_600_000),
    t(1, "done_err", "san-pham-thang-11.csv", 2400, 2398, 412, MAI, 20 * 3_600_000, [
      { row: 37, column: "tax_category", code: "required", params: {} },
      { row: 88, column: "sku", code: "catalog.sku_taken", params: { sku: "CG26" } },
    ]),
    t(3, "done", "khan-bep-moi.csv", 64, 64, 64, YEN, 7 * DAY),
    t(4, "failed", "toan-bo-hang-tet.csv", 61_200, 0, 0, MAI, 10 * DAY, [
      { row: 0, column: "", code: "catalog.import_too_many_rows", params: { max: "50000" } },
    ]),
  ];
}

function seedSuggestions(): Suggestion[] {
  return [
    {
      id: uid("c9", 1),
      product_id: PRODUCT_ID.castIronPan,
      locale: "en",
      fields: {
        short_description:
          "A solid cast iron pan that heats evenly and lasts for generations. Use it on gas, induction or in the oven.",
        meta_title: "Cast iron pan 24–28 cm | Bếp Mộc",
        meta_description:
          "Solid cast iron pan in three sizes. Even heat, works on every stove and in the oven up to 260 °C.",
      },
      note: null,
      status: "pending",
      created_at: ago(2 * DAY),
      decided_by: null,
      decided_at: null,
    },
    {
      id: uid("c9", 2),
      product_id: PRODUCT_ID.blueBowls,
      locale: "vi",
      fields: {
        description:
          "Bộ 6 bát gốm men lam vẽ tay, men an toàn thực phẩm, dùng được trong lò vi sóng và máy rửa bát.",
      },
      note: "Người viết nên kiểm chất liệu men và xuất xứ trước khi áp.",
      status: "pending",
      created_at: ago(3 * DAY),
      decided_by: null,
      decided_at: null,
    },
  ];
}

function seedEvents(): Map<string, ProductEvent[]> {
  return new Map([
    [
      PRODUCT_ID.castIronPan,
      [
        {
          at: ago(2 * DAY + 3_600_000),
          kind: "ai_applied",
          actor: YEN,
          params: { locale: "en" },
        },
        {
          at: vnMidnight("2026-09-26"),
          kind: "price",
          actor: YEN,
          params: { list: "Giá bán lẻ toàn chuỗi", count: "3" },
        },
      ],
    ],
  ]);
}

function seed(): Store {
  return {
    products: seedProducts(),
    events: seedEvents(),
    categories: seedCategories(),
    attributes: seedAttributes(),
    rules: seedRules(),
    documents: seedDocuments(),
    priceLists: seedPriceLists(),
    prices: seedPrices(),
    transfers: seedTransfers(),
    suggestions: seedSuggestions(),
    seq: 0,
  };
}

// Kho giữ trên `globalThis`: Next.js có thể nạp lại module khi chạy thử, kho vẫn còn.
const KEY = Symbol.for("autoxide.sample.catalog");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleCatalog(): void {
  (globalThis as Holder)[KEY] = seed();
}

function newId(kind: string): string {
  const s = store();
  s.seq += 1;
  return uid(kind, 900_000 + s.seq);
}

function now(): string {
  return new Date().toISOString();
}

function fail(
  status: number,
  code: string,
  detail: string,
  errors?: Problem["errors"],
): SampleOutcome<never> {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: status === 404 ? "Not Found" : status === 409 ? "Conflict" : "Unprocessable Entity",
      status,
      code,
      detail,
      ...(errors && errors.length > 0 ? { errors } : {}),
    },
  };
}

function invalid(errors: NonNullable<Problem["errors"]>): SampleOutcome<never> {
  return fail(422, "validation_failed", "The request has invalid fields.", errors);
}

function fieldError(field: string, code: string, detail = code) {
  return { field, code, detail };
}

function record(productId: string, event: Omit<ProductEvent, "at" | "actor">): void {
  const list = store().events.get(productId) ?? [];
  list.unshift({ ...event, at: now(), actor: SAMPLE_ACTOR });
  store().events.set(productId, list);
}

function touch(product: Product): void {
  product.updated_at = now();
}

// ---------------------------------------------------------------- Đọc chung

/** Chữ theo ngôn ngữ, không có thì ngôn ngữ mặc định. */
export function pick(text: Localized, locale: string): string {
  return text[locale] || text.vi || Object.values(text)[0] || "";
}

export function translationOf(product: Product, locale: string): ProductTranslation {
  return (
    product.translations.find((t) => t.locale === locale) ??
    product.translations.find((t) => t.locale === product.default_locale) ??
    (product.translations[0] as ProductTranslation)
  );
}

function categoryById(id: string | null): Category | undefined {
  return id ? store().categories.find((c) => c.id === id) : undefined;
}

/** Danh mục và mọi tổ tiên, từ gốc xuống. */
function lineage(id: string | null): Category[] {
  const out: Category[] = [];
  let current = categoryById(id);
  while (current) {
    out.unshift(current);
    current = categoryById(current.parent_id);
  }
  return out;
}

function categoryPath(id: string | null, locale: string): string {
  return lineage(id)
    .map((c) => pick(c.names, locale))
    .join(" › ");
}

function sortedCategories(): Category[] {
  // Cây theo thứ tự duyệt sâu: cha rồi tới con, anh em theo `position`.
  const all = store().categories;
  const out: Category[] = [];
  const walk = (parent: string | null) => {
    for (const c of all
      .filter((x) => x.parent_id === parent)
      .sort((a, b) => a.position - b.position)) {
      out.push(c);
      walk(c.id);
    }
  };
  walk(null);
  return out;
}

/** Thuộc tính bắt buộc đang hiệu lực vào `day` cho một danh mục (gồm phần tổ tiên áp cho con). */
export function requiredAttributeIds(
  categoryId: string | null,
  day: string = vietnamDay(),
): string[] {
  const chain = lineage(categoryId);
  const ids = new Set<string>();
  chain.forEach((category, index) => {
    const own = index === chain.length - 1;
    for (const rule of category.attributes) {
      if (!rule.required) continue;
      if (!own && !rule.applies_to_descendants) continue;
      if (rule.effective_from > day) continue;
      if (rule.effective_to !== null && day >= rule.effective_to) continue;
      ids.add(rule.attribute_id);
    }
  });
  return [...ids];
}

/** Mã quy tắc hạn chế của danh mục và tổ tiên. */
function restrictionCodes(categoryId: string | null): string[] {
  return [...new Set(lineage(categoryId).flatMap((c) => c.restriction_codes))];
}

export function documentStatus(doc: ProductDocument, day: string = vietnamDay()): DocumentStatus {
  if (doc.expires_on === null) return "valid";
  if (doc.expires_on <= day) return "expired";
  const left = (Date.parse(doc.expires_on) - Date.parse(day)) / DAY;
  return left <= 60 ? "expiring" : "valid";
}

function hasValue(attribute: ProductAttribute | undefined): boolean {
  return Boolean(attribute?.values.some((v) => v.trim() !== ""));
}

/** Điều còn thiếu để mở bán, theo thứ tự core kiểm (đặc tả 41: `POST /products/{id}/status`). */
export function readiness(product: Product, day: string = vietnamDay()): ReadinessIssue[] {
  const s = store();
  const issues: ReadinessIssue[] = [];
  const rules = restrictionCodes(product.primary_category_id)
    .map((code) => s.rules.find((r) => r.code === code))
    .filter((r): r is RestrictionRule => r !== undefined);
  for (const rule of rules.filter((r) => r.level === "prohibited")) {
    issues.push({ code: "catalog.prohibited_goods", params: { rule: rule.code } });
  }
  if (!product.tax_category || !isTaxCategory(product.tax_category)) {
    issues.push({
      code: "catalog.tax_category_unknown",
      params: { code: product.tax_category ?? "—" },
    });
  }
  const missing = requiredAttributeIds(product.primary_category_id, day)
    .filter((id) => !hasValue(product.attributes.find((a) => a.attribute_id === id)))
    .map((id) => s.attributes.find((a) => a.id === id)?.code ?? id);
  if (missing.length > 0) {
    issues.push({
      code: "catalog.required_attributes_missing",
      params: { attributes: missing.join(", ") },
    });
  }
  const docs = s.documents.filter(
    (d) => d.product_id === product.id && documentStatus(d, day) !== "expired",
  );
  const needed = rules
    .filter((r) => r.level === "conditional")
    .flatMap((r) => r.required_documents)
    .filter((type) => !docs.some((d) => d.document_type === type));
  if (needed.length > 0) {
    issues.push({
      code: "catalog.documents_required",
      params: { documents: [...new Set(needed)].join(", ") },
    });
  }
  if (product.kind === "bundle") {
    const bad = product.components.some((c) => {
      const owner = s.products.find((p) => p.variants.some((v) => v.id === c.variant_id));
      return (
        !owner || owner.id === product.id || owner.kind === "bundle" || owner.kind === "service"
      );
    });
    if (bad || product.components.length === 0)
      issues.push({ code: "catalog.bundle_invalid", params: {} });
  }
  return issues;
}

// ---------------------------------------------------------------- Giá

export function priceState(
  price: Price,
  all: readonly Price[],
  at: number = Date.now(),
): PriceState {
  if (Date.parse(price.valid_from) > at) return "scheduled";
  const live = effectivePrice(
    all.filter((p) => p.price_list_id === price.price_list_id && p.variant_id === price.variant_id),
    at,
  );
  return live?.id === price.id ? "current" : "past";
}

/** Dòng giá hiệu lực lúc `at`: `valid_from` lớn nhất ≤ `at` và (`valid_to` trống hay > `at`). */
export function effectivePrice(rows: readonly Price[], at: number, strict = false): Price | null {
  let best: Price | null = null;
  for (const row of rows) {
    const from = Date.parse(row.valid_from);
    if (strict ? from >= at : from > at) continue;
    if (row.valid_to !== null && Date.parse(row.valid_to) <= at) continue;
    if (!best || from > Date.parse(best.valid_from)) best = row;
  }
  return best;
}

/** Nút và các nút cha, gần trước: [cửa hàng, vùng, trụ sở]. */
function ancestorsOf(units: readonly OrgUnit[], orgId: string): string[] {
  const out: string[] = [];
  let current = units.find((u) => u.id === orgId);
  while (current) {
    out.push(current.id);
    const parent = current.parent_id;
    current = parent ? units.find((u) => u.id === parent) : undefined;
  }
  return out;
}

/**
 * Giải giá theo đặc tả 41: bảng `active`, cùng tiền tệ, thuộc cửa hàng hay nút cha của nó, nhóm
 * khách khớp hay trống. Thứ tự: nút gần cửa hàng nhất → có nhóm khách hơn không nhóm → `priority`
 * cao hơn → `id`. Bảng đầu tiên có dòng giá hiệu lực thì thắng; bảng không có dòng cho biến thể
 * thì cửa hàng "kế thừa" bảng kế tiếp. Hàm thuần (test).
 */
export function resolvePriceWith(
  lists: readonly PriceList[],
  prices: readonly Price[],
  units: readonly OrgUnit[],
  query: {
    variant_id: string;
    org_id: string;
    customer_group: string | null;
    currency: string;
    at: string;
  },
): PriceResolution {
  const at = Date.parse(query.at);
  const chain = ancestorsOf(units, query.org_id);
  const nameOf = (id: string) => units.find((u) => u.id === id)?.name ?? id;
  const group = query.customer_group?.trim() || null;
  const rows = prices.filter((p) => p.variant_id === query.variant_id);
  const scored = lists.map(
    (
      list,
    ): {
      list: PriceList;
      distance: number | null;
      row: Price | null;
      outcome: CandidateOutcome;
    } => {
      const index = chain.indexOf(list.org_id);
      const distance = index >= 0 ? index : null;
      const row = effectivePrice(
        rows.filter((p) => p.price_list_id === list.id),
        at,
      );
      let outcome: CandidateOutcome = "outranked";
      if (distance === null) outcome = "other_branch";
      else if (!list.active) outcome = "inactive";
      else if (list.currency !== query.currency) outcome = "currency_mismatch";
      else if (list.customer_group !== null && list.customer_group !== group)
        outcome = "group_mismatch";
      else if (!row) outcome = "no_price";
      return { list, distance, row, outcome };
    },
  );
  const eligible = scored
    .filter((c) => c.outcome === "outranked")
    .sort(
      (a, b) =>
        (a.distance ?? 99) - (b.distance ?? 99) ||
        Number(b.list.customer_group !== null) - Number(a.list.customer_group !== null) ||
        b.list.priority - a.list.priority ||
        a.list.id.localeCompare(b.list.id),
    );
  const winner = eligible[0];
  if (winner) winner.outcome = "winner";
  const order = (c: (typeof scored)[number]) =>
    c.outcome === "winner" ? -1 : c.distance === null ? 99 : c.distance;
  const candidates: PriceCandidate[] = [...scored]
    .sort((a, b) => order(a) - order(b) || b.list.priority - a.list.priority)
    .map((c) => ({
      price_list_id: c.list.id,
      name: c.list.name,
      org_id: c.list.org_id,
      org_name: nameOf(c.list.org_id),
      distance: c.distance,
      customer_group: c.list.customer_group,
      priority: c.list.priority,
      amount: c.row ? c.row.amount : null,
      outcome: c.outcome,
    }));
  return {
    variant_id: query.variant_id,
    org_id: query.org_id,
    customer_group: group,
    currency: query.currency,
    at: new Date(at).toISOString(),
    price: winner?.row
      ? {
          variant_id: query.variant_id,
          price_list_id: winner.list.id,
          price_id: winner.row.id,
          amount: winner.row.amount,
          tax_inclusive: winner.list.tax_inclusive,
          compare_at: winner.row.compare_at,
          valid_from: winner.row.valid_from,
        }
      : null,
    candidates,
  };
}

// Thay bằng GET /api/v1/catalog/variants/{id}/price?org_id=&customer_group=&currency=&at= (bước 41).
export async function resolvePrice(query: {
  variant_id: string;
  org_id: string;
  customer_group?: string | null;
  currency?: string;
  at?: string;
}): Promise<SampleOutcome<PriceResolution>> {
  const s = store();
  const { data: units } = await listUnits();
  if (!findVariant(query.variant_id)) {
    return fail(404, "catalog.variant_not_found", "Variant not found.");
  }
  if (!units.some((u) => u.id === query.org_id)) {
    return invalid([fieldError("org_id", "unknown")]);
  }
  const at = query.at ?? now();
  if (Number.isNaN(Date.parse(at))) return invalid([fieldError("at", "time")]);
  return {
    ok: true,
    data: resolvePriceWith(s.priceLists, s.prices, units, {
      variant_id: query.variant_id,
      org_id: query.org_id,
      customer_group: query.customer_group ?? null,
      currency: query.currency ?? "VND",
      at,
    }),
  };
}

/** Giá của nhiều biến thể ở một cửa hàng lúc `at` (`Catalog::prices` của `catalog::api`). */
export async function pricesAt(
  orgId: string,
  variantIds: readonly string[],
  at: string = now(),
  customerGroup: string | null = null,
): Promise<Map<string, PriceResolution>> {
  const s = store();
  const { data: units } = await listUnits();
  return new Map(
    variantIds.map((variant_id) => [
      variant_id,
      resolvePriceWith(s.priceLists, s.prices, units, {
        variant_id,
        org_id: orgId,
        customer_group: customerGroup,
        currency: "VND",
        at,
      }),
    ]),
  );
}

// ---------------------------------------------------------------- Sản phẩm

function findVariant(id: string): { product: Product; variant: Variant } | null {
  for (const product of store().products) {
    const variant = product.variants.find((v) => v.id === id);
    if (variant) return { product, variant };
  }
  return null;
}

function summarize(product: Product, locale: string, retail: Price[], at: number): ProductSummary {
  const amounts = product.variants
    .map((v) =>
      effectivePrice(
        retail.filter((p) => p.variant_id === v.id),
        at,
      ),
    )
    .filter((p): p is Price => p !== null)
    .map((p) => Number(p.amount.amount));
  return {
    id: product.id,
    name: translationOf(product, locale).name,
    kind: product.kind,
    status: product.status,
    tax_category: product.tax_category,
    category_id: product.primary_category_id,
    category_path: categoryPath(product.primary_category_id, locale),
    variant_count: product.variants.length,
    skus: product.variants.map((v) => v.sku),
    price_min: amounts.length > 0 ? vnd(Math.min(...amounts)) : null,
    price_max: amounts.length > 0 ? vnd(Math.max(...amounts)) : null,
    lot_tracked: product.lot_tracked,
    serial_tracked: product.serial_tracked,
    allow_backorder: product.allow_backorder,
    image_media_id: product.media[0]?.media_id ?? null,
    issues: product.status === "active" || product.status === "archived" ? [] : readiness(product),
    updated_at: product.updated_at,
  };
}

export interface ProductQuery {
  status?: ProductStatus;
  /** Chỉ sản phẩm chưa mở bán được (bản nháp, ngừng bán còn thiếu điều kiện) — dự kiến. */
  blocked?: boolean;
  kind?: ProductKind;
  category_id?: string;
  q?: string;
  locale?: string;
  limit?: number;
  cursor?: string | null;
}

// Thay bằng GET /api/v1/catalog/products?status=&kind=&category_id=&q= (bước 41) khi core có. Tìm
// không dấu trên tên (mọi ngôn ngữ) và SKU, như `search_key` của đặc tả. Mới sửa trước.
export async function listProducts(query: ProductQuery = {}): Promise<SamplePage<ProductSummary>> {
  const s = store();
  const locale = query.locale ?? "vi";
  const retail = s.prices.filter((p) => p.price_list_id === PRICE_LIST_ID.retail);
  const at = Date.now();
  const needle = query.q ? fold(query.q) : "";
  const inCategory = (product: Product) =>
    !query.category_id ||
    lineage(product.primary_category_id).some((c) => c.id === query.category_id);
  const all = s.products
    .filter((p) => !query.status || p.status === query.status)
    .filter((p) => !query.kind || p.kind === query.kind)
    .filter(inCategory)
    .filter((p) => {
      if (!needle) return true;
      const hay = [...p.translations.map((t) => t.name), ...p.variants.map((v) => v.sku)]
        .map(fold)
        .join(" ");
      return hay.includes(needle);
    })
    .map((p) => summarize(p, locale, retail, at))
    .filter((p) => !query.blocked || p.issues.length > 0)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  return samplePage(all, { limit: query.limit ?? 25, cursor: query.cursor ?? null });
}

/** Số sản phẩm theo trạng thái và các con số tóm tắt của đầu màn (dự kiến: `GET /products/stats`). */
export async function productStats(): Promise<{
  data: {
    by_status: Record<ProductStatus, number>;
    blocked: number;
    variants: number;
    by_tax: Record<string, number>;
  };
}> {
  const s = store();
  const by_status: Record<ProductStatus, number> = {
    draft: 0,
    active: 0,
    inactive: 0,
    archived: 0,
  };
  const by_tax: Record<string, number> = {};
  let blocked = 0;
  for (const p of s.products) {
    by_status[p.status] += 1;
    if (p.tax_category && p.status !== "archived")
      by_tax[p.tax_category] = (by_tax[p.tax_category] ?? 0) + 1;
    if ((p.status === "draft" || p.status === "inactive") && readiness(p).length > 0) blocked += 1;
  }
  return {
    data: {
      by_status,
      blocked,
      variants: s.products
        .filter((p) => p.status !== "archived")
        .reduce((n, p) => n + p.variants.length, 0),
      by_tax,
    },
  };
}

// Thay bằng GET /api/v1/catalog/products/{id} (bước 41) khi core có.
export async function getProduct(id: string): Promise<{ data: Product } | null> {
  const product = store().products.find((p) => p.id === id);
  return product ? { data: structuredClone(product) } : null;
}

/** Dòng thời gian của sản phẩm (dự kiến: audit lọc theo bản ghi, bước 52). Mới trước. */
export async function productHistory(id: string): Promise<{ data: ProductEvent[] }> {
  return { data: [...(store().events.get(id) ?? [])] };
}

/** Thay bằng GET /api/v1/catalog/products/{id}/readiness (mới) khi core có. */
export async function productReadiness(id: string): Promise<{ data: ReadinessIssue[] } | null> {
  const product = store().products.find((p) => p.id === id);
  return product ? { data: readiness(product) } : null;
}

const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function skuKey(sku: string): string {
  return sku.toUpperCase().replace(/\s+/g, "");
}

function skuTaken(sku: string, except?: string): boolean {
  const key = skuKey(sku);
  return store().products.some((p) =>
    p.variants.some((v) => v.id !== except && skuKey(v.sku) === key),
  );
}

/** GTIN: chỉ kiểm chữ số kiểm tra khi mã toàn số dài 8 / 12 / 13 / 14 (khuyến nghị của đặc tả). */
export function gtinValid(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return true;
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  const sum = digits
    .reverse()
    .reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Slug theo quy tắc của `autoxide_kernel::slug`: chữ thường không dấu, gạch nối. */
export function slugify(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function slugTaken(locale: string, slug: string, except?: string): boolean {
  return store().products.some(
    (p) => p.id !== except && p.translations.some((t) => t.locale === locale && t.slug === slug),
  );
}

export interface NewProduct {
  name: string;
  kind: ProductKind;
  category_id: string;
  tax_category: string;
  sku: string;
}

// Thay bằng POST /api/v1/catalog/products (bước 41) khi core có. Sản phẩm mới là bản nháp có một
// biến thể. Gom mọi lỗi của đầu vào để báo một lần.
export async function createProduct(input: NewProduct): Promise<SampleOutcome<Product>> {
  const errors: NonNullable<Problem["errors"]> = [];
  const name = input.name.trim();
  if (!name) errors.push(fieldError("name", "required"));
  if (!categoryById(input.category_id)) errors.push(fieldError("category_id", "unknown"));
  if (!isTaxCategory(input.tax_category)) errors.push(fieldError("tax_category", "unknown"));
  if (!["physical", "digital", "service", "bundle"].includes(input.kind))
    errors.push(fieldError("kind", "unknown"));
  const sku = input.sku.trim();
  if (!SKU.test(sku)) errors.push(fieldError("sku", "sku_format"));
  if (errors.length > 0) return invalid(errors);
  if (skuTaken(sku))
    return fail(409, "catalog.sku_taken", `SKU ${sku} is already used.`, [
      fieldError("sku", "catalog.sku_taken"),
    ]);
  let slug = slugify(name) || "san-pham";
  for (let n = 2; slugTaken("vi", slug); n += 1) slug = `${slugify(name)}-${n}`;
  const id = newId("c1");
  const created = now();
  const kind = input.kind;
  const product: Product = {
    id,
    org_id: ORG.ROOT,
    kind,
    status: "draft",
    tax_category: input.tax_category,
    primary_category_id: input.category_id,
    track_inventory: kind === "physical",
    allow_backorder: false,
    lot_tracked: false,
    serial_tracked: false,
    default_locale: "vi",
    ai_assisted: false,
    ever_active: false,
    created_at: created,
    updated_at: created,
    activated_at: null,
    translations: [
      {
        locale: "vi",
        name,
        slug,
        short_description: "",
        description: "",
        meta_title: "",
        meta_description: "",
        ai_assisted: false,
      },
    ],
    options: [],
    variants: [
      {
        id: newId("c2"),
        product_id: id,
        sku,
        barcode: null,
        option_value_ids: [],
        label: "",
        position: 0,
        active: true,
        weight_grams: null,
        length_mm: null,
        width_mm: null,
        height_mm: null,
        image_media_id: null,
        updated_at: created,
      },
    ],
    media: [],
    attributes: [],
    kitchen: null,
    components: [],
  };
  store().products.unshift(product);
  record(id, { kind: "created", params: {} });
  return { ok: true, data: structuredClone(product) };
}

export interface ProductPatch {
  category_id: string;
  tax_category: string;
  allow_backorder: boolean;
  lot_tracked: boolean;
  serial_tracked: boolean;
}

// Thay bằng PATCH /api/v1/catalog/products/{id} (bước 41, If-Match) khi core có.
export async function updateProduct(
  id: string,
  patch: ProductPatch,
): Promise<SampleOutcome<Product>> {
  const product = store().products.find((p) => p.id === id);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  const errors: NonNullable<Problem["errors"]> = [];
  if (!categoryById(patch.category_id)) errors.push(fieldError("category_id", "unknown"));
  if (patch.tax_category && !isTaxCategory(patch.tax_category))
    errors.push(fieldError("tax_category", "unknown"));
  if (patch.lot_tracked && patch.serial_tracked)
    errors.push(fieldError("serial_tracked", "lot_or_serial"));
  if (errors.length > 0) return invalid(errors);
  product.primary_category_id = patch.category_id;
  product.tax_category = patch.tax_category || null;
  product.allow_backorder = patch.allow_backorder;
  product.lot_tracked = patch.lot_tracked;
  product.serial_tracked = patch.serial_tracked;
  touch(product);
  record(id, { kind: "updated", params: {} });
  return { ok: true, data: structuredClone(product) };
}

const TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  draft: ["active"],
  active: ["inactive"],
  inactive: ["active", "archived"],
  archived: [],
};

// Thay bằng POST /api/v1/catalog/products/{id}/status (bước 41) khi core có. Mở bán kiểm thuộc tính
// bắt buộc, nhóm thuế, giấy tờ, combo; mọi điều còn thiếu báo một lần trong `errors`.
export async function setProductStatus(
  id: string,
  status: ProductStatus,
): Promise<SampleOutcome<{ product: Product; previous: ProductStatus }>> {
  const product = store().products.find((p) => p.id === id);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  const previous = product.status;
  if (previous === status)
    return { ok: true, data: { product: structuredClone(product), previous } };
  if (!TRANSITIONS[previous].includes(status)) {
    return fail(
      409,
      "catalog.invalid_status_transition",
      `Cannot move the product from ${previous} to ${status}.`,
    );
  }
  if (status === "active") {
    const issues = readiness(product);
    const first = issues[0];
    if (first) {
      return fail(
        first.code === "catalog.required_attributes_missing" ||
          first.code === "catalog.tax_category_unknown" ||
          first.code === "catalog.bundle_invalid"
          ? 422
          : 409,
        first.code,
        first.code,
        issues.map((issue) => ({
          field: "status",
          code: issue.code,
          detail: Object.values(issue.params).join(", "),
        })),
      );
    }
  }
  product.status = status;
  if (status === "active") {
    product.ever_active = true;
    product.activated_at = now();
  }
  touch(product);
  record(id, { kind: "status", params: { from: previous, to: status } });
  return { ok: true, data: { product: structuredClone(product), previous } };
}

// Thay bằng DELETE /api/v1/catalog/products/{id} (bước 41) khi core có. Chỉ xoá được sản phẩm chưa
// từng bán; còn lại thì lưu trữ.
export async function deleteProduct(id: string): Promise<SampleOutcome<undefined>> {
  const s = store();
  const product = s.products.find((p) => p.id === id);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  if (product.ever_active)
    return fail(
      409,
      "catalog.product_not_deletable",
      "The product was sold before; archive it instead.",
    );
  s.products = s.products.filter((p) => p.id !== id);
  s.suggestions = s.suggestions.filter((x) => x.product_id !== id);
  return { ok: true, data: undefined };
}

export interface TranslationInput {
  locale: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  meta_title: string;
  meta_description: string;
}

// Thay bằng PUT /api/v1/catalog/products/{id}/translations/{locale} (bước 41) khi core có. Slug trống
// thì sinh từ tên.
export async function putTranslation(
  id: string,
  input: TranslationInput,
): Promise<SampleOutcome<ProductTranslation>> {
  const product = store().products.find((p) => p.id === id);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  const errors: NonNullable<Problem["errors"]> = [];
  if (!(CATALOG_LOCALES as readonly string[]).includes(input.locale))
    errors.push(fieldError("locale", "unknown"));
  const name = input.name.trim();
  if (!name) errors.push(fieldError("name", "required"));
  const slug = input.slug.trim() ? input.slug.trim() : slugify(name);
  if (slug && slug !== slugify(slug)) errors.push(fieldError("slug", "slug_format"));
  if (input.meta_title.length > 70) errors.push(fieldError("meta_title", "max_70"));
  if (input.meta_description.length > 160) errors.push(fieldError("meta_description", "max_160"));
  if (errors.length > 0) return invalid(errors);
  if (slugTaken(input.locale, slug, id)) {
    return fail(409, "catalog.slug_taken", `The path ${slug} is used by another product.`, [
      fieldError("slug", "catalog.slug_taken"),
    ]);
  }
  const existing = product.translations.find((t) => t.locale === input.locale);
  const next: ProductTranslation = {
    locale: input.locale,
    name,
    slug,
    short_description: input.short_description.trim(),
    description: input.description.trim(),
    meta_title: input.meta_title.trim(),
    meta_description: input.meta_description.trim(),
    ai_assisted: existing?.ai_assisted ?? false,
  };
  product.translations = [
    ...product.translations.filter((t) => t.locale !== input.locale),
    next,
  ].sort(
    (a, b) =>
      CATALOG_LOCALES.indexOf(a.locale as CatalogLocale) -
      CATALOG_LOCALES.indexOf(b.locale as CatalogLocale),
  );
  touch(product);
  record(id, { kind: "updated", params: { locale: input.locale } });
  return { ok: true, data: { ...next } };
}

export interface VariantInput {
  sku: string;
  barcode: string;
  /** Giá trị cho tuỳ chọn đầu tiên ("30 cm"); sản phẩm chưa có tuỳ chọn thì kèm `option_name`. */
  option_value: string;
  option_name: string;
  weight_grams: string;
  length_mm: string;
  width_mm: string;
  height_mm: string;
}

function optionalInt(
  value: string,
  field: string,
  errors: NonNullable<Problem["errors"]>,
): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d{1,9}$/.test(text)) {
    errors.push(fieldError(field, "whole_number"));
    return null;
  }
  return Number(text);
}

// Thay bằng POST /api/v1/catalog/products/{id}/variants và PATCH /variants/{id} (bước 41) khi core
// có. `variantId` trống = thêm mới.
export async function saveVariant(
  productId: string,
  variantId: string | null,
  input: VariantInput,
): Promise<SampleOutcome<Variant>> {
  const product = store().products.find((p) => p.id === productId);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  const existing = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
  if (variantId && !existing) return fail(404, "catalog.variant_not_found", "Variant not found.");
  const errors: NonNullable<Problem["errors"]> = [];
  const sku = input.sku.trim();
  if (!SKU.test(sku)) errors.push(fieldError("sku", "sku_format"));
  const barcode = input.barcode.trim() || null;
  if (barcode && !gtinValid(barcode)) errors.push(fieldError("barcode", "gtin_check"));
  const weight = optionalInt(input.weight_grams, "weight_grams", errors);
  const length = optionalInt(input.length_mm, "length_mm", errors);
  const width = optionalInt(input.width_mm, "width_mm", errors);
  const height = optionalInt(input.height_mm, "height_mm", errors);
  const value = input.option_value.trim();
  const optionName = input.option_name.trim();
  const isNew = !existing;
  if (isNew && product.kind === "bundle") errors.push(fieldError("sku", "bundle_single_variant"));
  if (isNew && product.variants.length > 0 && !value)
    errors.push(fieldError("option_value", "required"));
  if (isNew && product.options.length === 0 && product.variants.length > 0 && !optionName) {
    errors.push(fieldError("option_name", "required"));
  }
  if (errors.length > 0) return invalid(errors);
  if (skuTaken(sku, existing?.id)) {
    return fail(409, "catalog.sku_taken", `SKU ${sku} is already used.`, [
      fieldError("sku", "catalog.sku_taken"),
    ]);
  }
  if (
    barcode &&
    store().products.some((p) =>
      p.variants.some((v) => v.id !== existing?.id && v.barcode === barcode),
    )
  ) {
    return fail(409, "catalog.barcode_taken", `Barcode ${barcode} is already used.`, [
      fieldError("barcode", "catalog.barcode_taken"),
    ]);
  }
  if (existing) {
    Object.assign(existing, {
      sku,
      barcode,
      weight_grams: weight,
      length_mm: length,
      width_mm: width,
      height_mm: height,
      updated_at: now(),
    });
    touch(product);
    record(productId, { kind: "variant", params: { sku } });
    return { ok: true, data: { ...existing } };
  }
  let optionValueIds: string[] = [];
  let label = "";
  if (value) {
    if (product.options.length === 0) {
      // Sản phẩm một biến thể có thêm biến thể thứ hai: tạo tuỳ chọn, biến thể cũ thành giá trị đầu.
      const option: ProductOption = {
        id: newId("ca"),
        position: 0,
        names: { vi: optionName },
        values: [],
      };
      product.options.push(option);
      for (const old of product.variants) {
        const first: OptionValue = {
          id: newId("ca"),
          position: option.values.length,
          labels: { vi: old.sku },
        };
        option.values.push(first);
        old.option_value_ids = [first.id];
        old.label = old.sku;
      }
    }
    const option = product.options[0] as ProductOption;
    const known = option.values.find((v) => fold(pick(v.labels, "vi")) === fold(value));
    if (known && product.variants.some((v) => v.option_value_ids.includes(known.id))) {
      return fail(
        409,
        "catalog.option_combination_taken",
        "The product already has a variant with this option.",
        [fieldError("option_value", "catalog.option_combination_taken")],
      );
    }
    const chosen = known ?? {
      id: newId("ca"),
      position: option.values.length,
      labels: { vi: value },
    };
    if (!known) option.values.push(chosen);
    optionValueIds = [chosen.id];
    label = value;
  }
  const variant: Variant = {
    id: newId("c2"),
    product_id: productId,
    sku,
    barcode,
    option_value_ids: optionValueIds,
    label,
    position: product.variants.length,
    active: true,
    weight_grams: weight,
    length_mm: length,
    width_mm: width,
    height_mm: height,
    image_media_id: null,
    updated_at: now(),
  };
  product.variants.push(variant);
  touch(product);
  record(productId, { kind: "variant", params: { sku } });
  return { ok: true, data: { ...variant } };
}

// Thay bằng PATCH /api/v1/catalog/variants/{id} `{active}` (bước 41) khi core có.
export async function setVariantActive(
  variantId: string,
  active: boolean,
): Promise<SampleOutcome<Variant>> {
  const found = findVariant(variantId);
  if (!found) return fail(404, "catalog.variant_not_found", "Variant not found.");
  if (
    !active &&
    found.product.variants.filter((v) => v.active).length <= 1 &&
    found.variant.active
  ) {
    return fail(409, "catalog.last_active_variant", "A product needs at least one active variant.");
  }
  found.variant.active = active;
  found.variant.updated_at = now();
  touch(found.product);
  return { ok: true, data: { ...found.variant } };
}

// Thay bằng PUT /api/v1/catalog/products/{id}/attributes (bước 41) khi core có: thay cả tập.
export async function putAttributes(
  productId: string,
  values: Record<string, string[]>,
): Promise<SampleOutcome<ProductAttribute[]>> {
  const s = store();
  const product = s.products.find((p) => p.id === productId);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  const errors: NonNullable<Problem["errors"]> = [];
  const next: ProductAttribute[] = [];
  for (const [attributeId, raw] of Object.entries(values)) {
    const attribute = s.attributes.find((a) => a.id === attributeId);
    if (!attribute) {
      errors.push(fieldError(`attr.${attributeId}`, "unknown"));
      continue;
    }
    const list = raw.map((v) => v.trim()).filter((v) => v !== "");
    if (list.length === 0) continue;
    const field = `attr.${attribute.id}`;
    const one = list[0] as string;
    if (attribute.data_type === "integer" && !/^-?\d{1,12}$/.test(one))
      errors.push(fieldError(field, "whole_number"));
    if (
      attribute.data_type === "decimal" &&
      !new RegExp(`^-?\\d{1,9}([.,]\\d{1,${attribute.scale}})?$`).test(one)
    ) {
      errors.push(fieldError(field, "decimal"));
    }
    if (attribute.data_type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(one))
      errors.push(fieldError(field, "date"));
    if (
      (attribute.data_type === "option" || attribute.data_type === "options") &&
      list.some((code) => !attribute.options.some((o) => o.code === code))
    ) {
      errors.push(fieldError(field, "unknown"));
    }
    next.push({
      attribute_id: attribute.id,
      values: attribute.data_type === "options" ? list : [one],
    });
  }
  if (errors.length > 0) return invalid(errors);
  product.attributes = next;
  touch(product);
  record(productId, { kind: "updated", params: {} });
  return { ok: true, data: next.map((a) => ({ ...a })) };
}

export interface KitchenInput {
  locale: string;
  serves: Record<string, { min: string; max: string }>;
  in_box: string;
  not_included: string;
  use: string;
  care: string;
  dishwasher_safe: "" | "yes" | "no";
  manual_media_id: string;
}

/** "2 × Nắp kính" / "2 x Nắp kính" / "Nắp kính" (một cái) → số lượng và tên. */
export function parseBoxLine(line: string): { quantity: number; name: string } | null {
  const text = line.trim();
  if (!text) return null;
  const match = /^(\d{1,3})\s*[×xX*]\s*(.+)$/.exec(text);
  if (match) return { quantity: Number(match[1]), name: (match[2] as string).trim() };
  return { quantity: 1, name: text };
}

// Thay bằng PUT /api/v1/catalog/products/{id}/kitchen (mới; thuộc tính đồ bếp có cấu trúc) khi core
// có. Chữ theo một ngôn ngữ mỗi lần lưu; số người ăn theo từng biến thể.
export async function putKitchen(
  productId: string,
  input: KitchenInput,
): Promise<SampleOutcome<KitchenInfo>> {
  const product = store().products.find((p) => p.id === productId);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  const errors: NonNullable<Problem["errors"]> = [];
  const serves: KitchenInfo["serves"] = [];
  for (const variant of product.variants) {
    const entry = input.serves[variant.id];
    if (!entry || (!entry.min.trim() && !entry.max.trim())) continue;
    const min = Number(entry.min);
    const max = Number(entry.max || entry.min);
    if (!/^\d{1,2}$/.test(entry.min.trim()) || !Number.isInteger(max) || max < min || min < 1) {
      errors.push(fieldError(`serves.${variant.id}`, "serves_range"));
      continue;
    }
    serves.push({ variant_id: variant.id, min, max });
  }
  const lines = input.in_box.split(/\r?\n/).map(parseBoxLine);
  if (lines.some((l) => l && l.name.length > 120)) errors.push(fieldError("in_box", "too_long"));
  if (errors.length > 0) return invalid(errors);
  const locale = input.locale;
  const old = product.kitchen;
  const merge = (current: Localized | undefined, text: string): Localized => ({
    ...(current ?? {}),
    [locale]: text.trim(),
  });
  const boxLines = lines.filter((l): l is { quantity: number; name: string } => l !== null);
  const kitchen: KitchenInfo = {
    serves,
    in_box: boxLines.map((l, i) => ({
      quantity: l.quantity,
      name: merge(old?.in_box[i]?.name, l.name),
    })),
    not_included: input.not_included
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((text, i) => merge(old?.not_included[i], text)),
    use: merge(old?.use, input.use),
    care: merge(old?.care, input.care),
    dishwasher_safe: input.dishwasher_safe === "" ? null : input.dishwasher_safe === "yes",
    manual_media_id: input.manual_media_id.trim() || null,
  };
  product.kitchen = kitchen;
  touch(product);
  record(productId, { kind: "updated", params: { locale } });
  return { ok: true, data: structuredClone(kitchen) };
}

// Thay bằng PUT /api/v1/catalog/products/{id}/media (bước 41) khi core có: thay cả tập. Ảnh phải
// là media công khai (`catalog.media_not_public`).
export async function putMedia(
  productId: string,
  media: { media_id: string; variant_id: string | null; alt: string; public: boolean }[],
): Promise<SampleOutcome<ProductMedia[]>> {
  const product = store().products.find((p) => p.id === productId);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  if (media.some((m) => !m.public))
    return fail(422, "catalog.media_not_public", "Product images must be public media.");
  if (media.some((m) => m.variant_id && !product.variants.some((v) => v.id === m.variant_id))) {
    return invalid([fieldError("variant_id", "unknown")]);
  }
  if (media.some((m) => m.alt.length > 250)) return invalid([fieldError("alt", "too_long")]);
  product.media = media.map((m, position) => ({
    media_id: m.media_id,
    variant_id: m.variant_id,
    position,
    alt: m.alt.trim(),
  }));
  touch(product);
  record(productId, { kind: "media", params: { count: String(media.length) } });
  return { ok: true, data: product.media.map((m) => ({ ...m })) };
}

// ---------------------------------------------------------------- Danh mục, thuộc tính, hạn chế

// Thay bằng GET /api/v1/catalog/categories (bước 41) khi core có. Cây theo thứ tự duyệt sâu.
export async function listCategories(locale = "vi"): Promise<{ data: CategorySummary[] }> {
  const s = store();
  return {
    data: sortedCategories().map((c) => ({
      ...structuredClone(c),
      path: categoryPath(c.id, locale),
      product_count: s.products.filter((p) =>
        lineage(p.primary_category_id).some((x) => x.id === c.id),
      ).length,
      child_count: s.categories.filter((x) => x.parent_id === c.id).length,
    })),
  };
}

// Thay bằng POST /api/v1/catalog/categories (bước 41) khi core có. Đường dẫn tự sinh từ tên.
export async function createCategory(input: {
  name: string;
  parent_id: string | null;
}): Promise<SampleOutcome<Category>> {
  const s = store();
  const name = input.name.trim();
  const errors: NonNullable<Problem["errors"]> = [];
  if (!name) errors.push(fieldError("name", "required"));
  const parent = input.parent_id ? categoryById(input.parent_id) : undefined;
  if (input.parent_id && !parent) errors.push(fieldError("parent_id", "unknown"));
  if (errors.length > 0) return invalid(errors);
  const slug = slugify(name);
  if (s.categories.some((c) => c.slugs.vi === slug)) {
    return fail(409, "catalog.slug_taken", `The path ${slug} is used.`, [
      fieldError("name", "catalog.slug_taken"),
    ]);
  }
  const category: Category = {
    id: newId("c3"),
    parent_id: parent?.id ?? null,
    depth: parent ? parent.depth + 1 : 0,
    position: s.categories.filter((c) => c.parent_id === (parent?.id ?? null)).length,
    names: { vi: name },
    slugs: { vi: slug },
    updated_at: now(),
    attributes: [],
    restriction_codes: [],
  };
  s.categories.push(category);
  return { ok: true, data: structuredClone(category) };
}

// Thay bằng POST /api/v1/catalog/categories/{id}/move (bước 41) khi core có. Không dời được vào
// chính nhánh con của nó (`catalog.category_cycle`).
export async function moveCategory(
  id: string,
  parentId: string | null,
): Promise<SampleOutcome<Category>> {
  const s = store();
  const category = categoryById(id);
  if (!category) return fail(404, "catalog.category_not_found", "Category not found.");
  if (parentId && !categoryById(parentId)) return invalid([fieldError("parent_id", "unknown")]);
  if (parentId && lineage(parentId).some((c) => c.id === id)) {
    return fail(409, "catalog.category_cycle", "Cannot move a category into its own branch.", [
      fieldError("parent_id", "catalog.category_cycle"),
    ]);
  }
  category.parent_id = parentId;
  category.position = s.categories.filter((c) => c.parent_id === parentId && c.id !== id).length;
  // Độ sâu của cả nhánh tính lại.
  const fix = (node: Category, depth: number) => {
    node.depth = depth;
    for (const child of s.categories.filter((c) => c.parent_id === node.id)) fix(child, depth + 1);
  };
  fix(category, parentId ? (categoryById(parentId)?.depth ?? 0) + 1 : 0);
  category.updated_at = now();
  return { ok: true, data: structuredClone(category) };
}

export interface CategoryAttributeInput {
  attribute_id: string;
  effective_from: string;
  applies_to_descendants: boolean;
  legal_basis: string;
}

// Thay bằng PUT /api/v1/catalog/categories/{id}/attributes (bước 41) khi core có. Ở đây thêm hay
// thay một dòng (theo thuộc tính); lần đổi trạng thái sau của sản phẩm mới bị kiểm.
export async function setCategoryAttribute(
  categoryId: string,
  input: CategoryAttributeInput,
): Promise<SampleOutcome<Category>> {
  const s = store();
  const category = categoryById(categoryId);
  if (!category) return fail(404, "catalog.category_not_found", "Category not found.");
  const errors: NonNullable<Problem["errors"]> = [];
  if (!s.attributes.some((a) => a.id === input.attribute_id))
    errors.push(fieldError("attribute_id", "unknown"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effective_from))
    errors.push(fieldError("effective_from", "date"));
  if (errors.length > 0) return invalid(errors);
  category.attributes = [
    ...category.attributes.filter((a) => a.attribute_id !== input.attribute_id),
    {
      attribute_id: input.attribute_id,
      required: true,
      applies_to_descendants: input.applies_to_descendants,
      effective_from: input.effective_from,
      effective_to: null,
      legal_basis: input.legal_basis.trim() || null,
    },
  ];
  category.updated_at = now();
  return { ok: true, data: structuredClone(category) };
}

// Thay bằng PUT /api/v1/catalog/categories/{id}/attributes (bước 41) — bỏ một dòng khỏi tập.
export async function removeCategoryAttribute(
  categoryId: string,
  attributeId: string,
): Promise<SampleOutcome<Category>> {
  const category = categoryById(categoryId);
  if (!category) return fail(404, "catalog.category_not_found", "Category not found.");
  category.attributes = category.attributes.filter((a) => a.attribute_id !== attributeId);
  category.updated_at = now();
  return { ok: true, data: structuredClone(category) };
}

// Thay bằng GET /api/v1/catalog/attributes (bước 41) khi core có.
export async function listAttributes(): Promise<{ data: Attribute[] }> {
  return { data: structuredClone(store().attributes) };
}

export interface NewAttribute {
  code: string;
  name: string;
  data_type: AttributeType;
  unit: string;
  scale: string;
  filterable: boolean;
  options: string;
}

// Thay bằng POST /api/v1/catalog/attributes (bước 41) khi core có. Lựa chọn viết mỗi dòng
// `mã | nhãn`.
export async function createAttribute(input: NewAttribute): Promise<SampleOutcome<Attribute>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const code = input.code.trim();
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(code)) errors.push(fieldError("code", "code_format"));
  if (!input.name.trim()) errors.push(fieldError("name", "required"));
  const types: AttributeType[] = [
    "text",
    "integer",
    "decimal",
    "boolean",
    "date",
    "option",
    "options",
  ];
  if (!types.includes(input.data_type)) errors.push(fieldError("data_type", "unknown"));
  const scale = input.data_type === "decimal" ? Number(input.scale || "1") : 0;
  if (input.data_type === "decimal" && !(Number.isInteger(scale) && scale >= 1 && scale <= 6)) {
    errors.push(fieldError("scale", "scale_range"));
  }
  const options = input.options
    .split(/\r?\n/)
    .map((line) => line.split("|").map((p) => p.trim()))
    .filter((parts) => parts[0])
    .map(([optCode, label], position) => ({
      code: optCode as string,
      labels: { vi: label || (optCode as string) },
      position,
    }));
  if ((input.data_type === "option" || input.data_type === "options") && options.length === 0) {
    errors.push(fieldError("options", "min_one"));
  }
  if (errors.length > 0) return invalid(errors);
  if (s.attributes.some((a) => a.code === code)) {
    return fail(409, "catalog.attribute_code_taken", `Attribute ${code} already exists.`, [
      fieldError("code", "catalog.attribute_code_taken"),
    ]);
  }
  const attribute: Attribute = {
    id: newId("c4"),
    code,
    data_type: input.data_type,
    scale,
    unit: input.unit.trim() || null,
    names: { vi: input.name.trim() },
    filterable: input.filterable,
    options: input.data_type === "option" || input.data_type === "options" ? options : [],
  };
  s.attributes.push(attribute);
  return { ok: true, data: structuredClone(attribute) };
}

// Thay bằng GET /api/v1/catalog/restriction-rules (bước 41) khi core có: dùng chung, chỉ đọc.
export async function listRestrictionRules(): Promise<{ data: RestrictionRule[] }> {
  return { data: structuredClone(store().rules) };
}

/** Giấy tờ kèm tên sản phẩm, và dòng "còn thiếu" của sản phẩm cần giấy tờ mà chưa có (dự kiến). */
export interface DocumentRow {
  id: string;
  product_id: string;
  product_name: string;
  document_type: DocumentType;
  document: ProductDocument | null;
  status: DocumentStatus | "missing";
}

// Thay bằng GET /api/v1/catalog/products/{id}/documents (bước 41) khi core có. Màn cần danh sách
// xuyên sản phẩm (sắp hết hạn, còn thiếu) — dự kiến `GET /documents?status=`.
export async function listDocuments(locale = "vi"): Promise<{ data: DocumentRow[] }> {
  const s = store();
  const day = vietnamDay();
  const rows: DocumentRow[] = s.documents.map((d) => {
    const product = s.products.find((p) => p.id === d.product_id);
    return {
      id: d.id,
      product_id: d.product_id,
      product_name: product ? translationOf(product, locale).name : d.product_id,
      document_type: d.document_type,
      document: { ...d },
      status: documentStatus(d, day),
    };
  });
  for (const product of s.products.filter((p) => p.status !== "archived")) {
    const needed = restrictionCodes(product.primary_category_id)
      .map((code) => s.rules.find((r) => r.code === code))
      .filter((r): r is RestrictionRule => r?.level === "conditional")
      .flatMap((r) => r.required_documents as DocumentType[]);
    for (const type of new Set(needed)) {
      const has = s.documents.some(
        (d) =>
          d.product_id === product.id &&
          d.document_type === type &&
          documentStatus(d, day) !== "expired",
      );
      if (!has) {
        rows.push({
          id: `missing-${product.id}-${type}`,
          product_id: product.id,
          product_name: translationOf(product, locale).name,
          document_type: type,
          document: null,
          status: "missing",
        });
      }
    }
  }
  const rank = { missing: 0, expired: 1, expiring: 2, valid: 3 } as const;
  return {
    data: rows.sort(
      (a, b) => rank[a.status] - rank[b.status] || a.product_name.localeCompare(b.product_name),
    ),
  };
}

export interface NewDocument {
  product_id: string;
  document_type: string;
  number: string;
  issued_by: string;
  issued_on: string;
  expires_on: string;
}

// Thay bằng POST /api/v1/catalog/products/{id}/documents (bước 41, tải tệp lên kho riêng tư) khi
// core có.
export async function addDocument(input: NewDocument): Promise<SampleOutcome<ProductDocument>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const product = s.products.find((p) => p.id === input.product_id);
  if (!product) errors.push(fieldError("product_id", "unknown"));
  if (!(DOCUMENT_TYPES as readonly string[]).includes(input.document_type))
    errors.push(fieldError("document_type", "unknown"));
  if (!input.number.trim()) errors.push(fieldError("number", "required"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issued_on)) errors.push(fieldError("issued_on", "date"));
  if (input.expires_on && !/^\d{4}-\d{2}-\d{2}$/.test(input.expires_on))
    errors.push(fieldError("expires_on", "date"));
  if (input.expires_on && input.issued_on && input.expires_on <= input.issued_on)
    errors.push(fieldError("expires_on", "after_issued"));
  if (errors.length > 0 || !product) return invalid(errors);
  const doc: ProductDocument = {
    id: newId("c7"),
    product_id: product.id,
    org_id: product.org_id,
    document_type: input.document_type as DocumentType,
    number: input.number.trim(),
    issued_by: input.issued_by.trim(),
    issued_on: input.issued_on,
    expires_on: input.expires_on || null,
    file_key: null,
    created_at: now(),
  };
  s.documents.push(doc);
  record(product.id, { kind: "document", params: { type: doc.document_type } });
  return { ok: true, data: { ...doc } };
}

// ---------------------------------------------------------------- Bảng giá

// Thay bằng GET /api/v1/catalog/price-lists (bước 41) khi core có. Kèm tên nút và số dòng (dự kiến).
export async function listPriceLists(): Promise<{ data: PriceListSummary[] }> {
  const s = store();
  const { data: units } = await listUnits();
  return {
    data: s.priceLists.map((list) => {
      const rows = s.prices.filter((p) => p.price_list_id === list.id);
      return {
        ...list,
        org_name: units.find((u) => u.id === list.org_id)?.name ?? list.org_id,
        price_count: rows.length,
        variant_count: new Set(rows.map((r) => r.variant_id)).size,
      };
    }),
  };
}

export interface NewPriceList {
  name: string;
  org_id: string;
  audience: string;
  currency: string;
  tax_inclusive: boolean;
  customer_group: string;
  priority: string;
}

// Thay bằng POST /api/v1/catalog/price-lists (bước 41) khi core có. Bán cho người tiêu dùng ở Việt
// Nam: VND và đã gồm thuế (`catalog.consumer_price_rules`).
export async function createPriceList(input: NewPriceList): Promise<SampleOutcome<PriceList>> {
  const s = store();
  const { data: units } = await listUnits();
  const errors: NonNullable<Problem["errors"]> = [];
  if (!input.name.trim()) errors.push(fieldError("name", "required"));
  if (!units.some((u) => u.id === input.org_id)) errors.push(fieldError("org_id", "unknown"));
  if (input.audience !== "consumer" && input.audience !== "business")
    errors.push(fieldError("audience", "unknown"));
  if (!/^[A-Z]{3}$/.test(input.currency)) errors.push(fieldError("currency", "unknown"));
  if (!/^-?\d{1,4}$/.test(input.priority || "0"))
    errors.push(fieldError("priority", "whole_number"));
  if (errors.length > 0) return invalid(errors);
  if (input.audience === "consumer" && (input.currency !== "VND" || !input.tax_inclusive)) {
    return fail(
      422,
      "catalog.consumer_price_rules",
      "Consumer price lists in Vietnam must be in VND and include tax.",
      [
        fieldError(
          input.currency !== "VND" ? "currency" : "tax_inclusive",
          "catalog.consumer_price_rules",
        ),
      ],
    );
  }
  const list: PriceList = {
    id: newId("c5"),
    org_id: input.org_id,
    name: input.name.trim(),
    currency: input.currency,
    tax_inclusive: input.tax_inclusive,
    audience: input.audience as Audience,
    customer_group: input.customer_group.trim() || null,
    priority: Number(input.priority || "0"),
    active: true,
    updated_at: now(),
  };
  s.priceLists.push(list);
  return { ok: true, data: { ...list } };
}

// Thay bằng PATCH /api/v1/catalog/price-lists/{id} `{active}` (bước 41) khi core có.
export async function setPriceListActive(
  id: string,
  active: boolean,
): Promise<SampleOutcome<{ list: PriceList; previous: boolean }>> {
  const list = store().priceLists.find((l) => l.id === id);
  if (!list) return fail(404, "catalog.price_list_not_found", "Price list not found.");
  const previous = list.active;
  list.active = active;
  list.updated_at = now();
  return { ok: true, data: { list: { ...list }, previous } };
}

export interface NewPrice {
  price_list_id: string;
  /** SKU hay mã vạch của biến thể. */
  code: string;
  amount: string;
  compare_at: string;
  /** Giờ Việt Nam, `YYYY-MM-DDTHH:mm`. */
  valid_from: string;
  reference: string;
}

/** Biến thể theo SKU hay mã vạch (`GET /variants?code=`). */
export function variantByCodeSync(code: string): { product: Product; variant: Variant } | null {
  const key = skuKey(code);
  for (const product of store().products) {
    const variant = product.variants.find(
      (v) => skuKey(v.sku) === key || v.barcode === code.trim(),
    );
    if (variant) return { product, variant };
  }
  return null;
}

const AMOUNT = /^\d{1,12}$/;

// Thay bằng POST /api/v1/catalog/price-lists/{id}/prices (bước 41) khi core có. Dòng giá chỉ thêm;
// `reference` chống thêm hai lần khi bấm lại (`submit_once`): cùng mã, cùng nội dung → trả dòng cũ.
export async function addPrice(
  input: NewPrice,
): Promise<SampleOutcome<{ price: Price; replayed: boolean }>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const list = s.priceLists.find((l) => l.id === input.price_list_id);
  if (!list) errors.push(fieldError("price_list_id", "unknown"));
  const found = variantByCodeSync(input.code);
  if (!found) errors.push(fieldError("code", "catalog.variant_not_found"));
  const amount = input.amount.trim();
  // Số tiền là số nguyên đồng; "1.000,50" hay "690.000" không nhận (đặc tả: không đoán định dạng).
  if (!AMOUNT.test(amount)) errors.push(fieldError("amount", "money_minor"));
  const compare = input.compare_at.trim();
  if (compare && !AMOUNT.test(compare)) errors.push(fieldError("compare_at", "money_minor"));
  const from = Date.parse(`${input.valid_from}:00+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.valid_from) || Number.isNaN(from)) {
    errors.push(fieldError("valid_from", "time"));
  }
  const reference = input.reference.trim();
  if (!reference) errors.push(fieldError("reference", "required"));
  if (errors.length > 0 || !list || !found) return invalid(errors);
  const existing = s.prices.find(
    (p) =>
      p.price_list_id === list.id && p.reference === reference && p.variant_id === found.variant.id,
  );
  if (existing) {
    const same = existing.amount.amount === amount && Date.parse(existing.valid_from) === from;
    if (same) return { ok: true, data: { price: { ...existing }, replayed: true } };
    return fail(
      409,
      "reference_reused",
      "This reference was already used with different content.",
      [fieldError("reference", "reference_reused")],
    );
  }
  const price: Price = {
    id: newId("c6"),
    price_list_id: list.id,
    variant_id: found.variant.id,
    amount: { amount, currency: list.currency },
    compare_at: compare ? { amount: compare, currency: list.currency } : null,
    valid_from: new Date(from).toISOString(),
    valid_to: null,
    reference,
    created_by: SAMPLE_ACTOR,
    created_at: now(),
  };
  s.prices.push(price);
  record(found.product.id, { kind: "price", params: { list: list.name, count: "1" } });
  return { ok: true, data: { price: { ...price }, replayed: false } };
}

// Thay bằng GET /api/v1/catalog/price-lists/{id}/prices?variant_id= (bước 41) khi core có. Ở đây
// gộp mọi bảng giá của một biến thể (màn "Lịch sử giá"), mới trước.
export async function priceHistory(
  variantId: string,
): Promise<{ data: (Price & { state: PriceState })[] }> {
  const s = store();
  const rows = s.prices.filter((p) => p.variant_id === variantId);
  return {
    data: rows
      .map((p) => ({ ...p, state: priceState(p, rows) }))
      .sort(
        (a, b) =>
          b.valid_from.localeCompare(a.valid_from) || b.created_at.localeCompare(a.created_at),
      ),
  };
}

/** Giá của mọi biến thể đang bán ở một cửa hàng: kế thừa hay ghi đè (màn "Giá theo cửa hàng"). */
export interface StorePriceRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  label: string;
  sku: string;
  resolution: PriceResolution;
  /** Bảng thắng thuộc chính cửa hàng (ghi đè) hay nút cha (kế thừa); `null` = chưa có giá. */
  source: "override" | "inherited" | null;
}

// Dự kiến: GET /api/v1/catalog/stores/{org_id}/prices (mới; hoặc gọi `/variants/{id}/price` cho từng
// biến thể). Bỏ sản phẩm đã lưu trữ.
export async function storePrices(
  orgId: string,
  locale = "vi",
): Promise<{ data: StorePriceRow[] }> {
  const s = store();
  const products = s.products.filter((p) => p.status !== "archived");
  const ids = products.flatMap((p) => p.variants.filter((v) => v.active).map((v) => v.id));
  const resolved = await pricesAt(orgId, ids);
  return {
    data: products.flatMap((p) =>
      p.variants
        .filter((v) => v.active)
        .map((v) => {
          const resolution = resolved.get(v.id) as PriceResolution;
          const winner = resolution.candidates.find((c) => c.outcome === "winner");
          return {
            variant_id: v.id,
            product_id: p.id,
            product_name: translationOf(p, locale).name,
            label: v.label,
            sku: v.sku,
            resolution,
            source: winner ? (winner.distance === 0 ? "override" : "inherited") : null,
          };
        }),
    ),
  };
}

// ---------------------------------------------------------------- Nhập / xuất CSV

/** Cột của tệp nhập (dòng đầu là tiêu đề). Số tiền là số nguyên đồng. */
export const IMPORT_COLUMNS = [
  "sku",
  "name",
  "category",
  "tax_category",
  "price",
  "weight_grams",
] as const;
export const IMPORT_MAX_ROWS = 50_000;

export interface ImportPreviewRow {
  row: number;
  sku: string;
  name: string;
  action: "create" | "update" | "skip";
}

export interface ImportPreview {
  total_rows: number;
  create: number;
  update: number;
  errors: RowError[];
  rows: ImportPreviewRow[];
}

interface ParsedRow {
  row: number;
  cells: Record<string, string>;
}

function categoryByPath(text: string): Category | undefined {
  const needle = fold(text).replace(/\s*[›>/]\s*/g, "›");
  return store().categories.find(
    (c) =>
      c.slugs.vi === text.trim() ||
      fold(categoryPath(c.id, "vi")).replace(/\s*›\s*/g, "›") === needle ||
      fold(pick(c.names, "vi")) === needle,
  );
}

function checkRows(
  rows: readonly ParsedRow[],
  mode: ImportMode,
): { preview: ImportPreview; valid: ParsedRow[] } {
  const errors: RowError[] = [];
  const out: ImportPreviewRow[] = [];
  const valid: ParsedRow[] = [];
  const seen = new Set<string>();
  for (const { row, cells } of rows) {
    const sku = (cells.sku ?? "").trim();
    const name = (cells.name ?? "").trim();
    const rowErrors: RowError[] = [];
    if (!SKU.test(sku)) rowErrors.push({ row, column: "sku", code: "sku_format", params: {} });
    else if (seen.has(skuKey(sku)))
      rowErrors.push({ row, column: "sku", code: "duplicate_in_file", params: { sku } });
    const existing = sku ? variantByCodeSync(sku) : null;
    if (!existing && mode === "update_only")
      rowErrors.push({ row, column: "sku", code: "catalog.variant_not_found", params: { sku } });
    if (!existing && !name) rowErrors.push({ row, column: "name", code: "required", params: {} });
    const category = (cells.category ?? "").trim();
    if (category && !categoryByPath(category))
      rowErrors.push({
        row,
        column: "category",
        code: "catalog.category_not_found",
        params: { category },
      });
    if (!existing && !category)
      rowErrors.push({ row, column: "category", code: "required", params: {} });
    const tax = (cells.tax_category ?? "").trim();
    if (tax && !isTaxCategory(tax))
      rowErrors.push({
        row,
        column: "tax_category",
        code: "catalog.tax_category_unknown",
        params: { code: tax },
      });
    if (!existing && !tax)
      rowErrors.push({ row, column: "tax_category", code: "required", params: {} });
    const price = (cells.price ?? "").trim();
    if (price && !AMOUNT.test(price))
      rowErrors.push({ row, column: "price", code: "money_minor", params: { value: price } });
    const weight = (cells.weight_grams ?? "").trim();
    if (weight && !/^\d{1,9}$/.test(weight))
      rowErrors.push({ row, column: "weight_grams", code: "whole_number", params: {} });
    if (sku) seen.add(skuKey(sku));
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      out.push({ row, sku, name, action: "skip" });
      continue;
    }
    valid.push({ row, cells });
    out.push({
      row,
      sku,
      name: name || (existing ? translationOf(existing.product, "vi").name : ""),
      action: existing ? "update" : "create",
    });
  }
  return {
    preview: {
      total_rows: rows.length,
      create: out.filter((r) => r.action === "create").length,
      update: out.filter((r) => r.action === "update").length,
      errors,
      rows: out,
    },
    valid,
  };
}

/**
 * Đọc CSV theo RFC 4180: bỏ BOM, nhận CRLF / LF, ngoặc kép, xuống dòng trong ô. Trả các dòng (mảng
 * ô). Hàm thuần (test) — cùng việc với `autoxide_kernel::csv::read` của core.
 */
export function readCsv(text: string, maxRows: number): { rows: string[][]; tooMany: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  const separator =
    (source.split(/\r?\n/)[0] ?? "").includes(";") &&
    !(source.split(/\r?\n/)[0] ?? "").includes(",")
      ? ";"
      : ",";
  const endRow = () => {
    row.push(cell);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
    cell = "";
  };
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      endRow();
      if (rows.length > maxRows + 1) return { rows, tooMany: true };
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) endRow();
  return { rows, tooMany: rows.length > maxRows + 1 };
}

function parseImport(text: string): { rows: ParsedRow[] } | { problem: RowError } {
  const { rows, tooMany } = readCsv(text, IMPORT_MAX_ROWS);
  if (tooMany)
    return {
      problem: {
        row: 0,
        column: "",
        code: "catalog.import_too_many_rows",
        params: { max: String(IMPORT_MAX_ROWS) },
      },
    };
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = ["sku"].filter((c) => !header.includes(c));
  if (rows.length === 0 || missing.length > 0) {
    return {
      problem: { row: 1, column: "sku", code: "missing_column", params: { column: "sku" } },
    };
  }
  return {
    rows: rows.slice(1).map((cells, index) => ({
      row: index + 2,
      cells: Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])),
    })),
  };
}

// Thay bằng POST /api/v1/catalog/imports?dry_run=true (mới) khi core có: kiểm từng dòng như lần nhập
// thật, không ghi gì.
export async function previewImport(
  text: string,
  mode: ImportMode,
): Promise<SampleOutcome<ImportPreview>> {
  const parsed = parseImport(text);
  if ("problem" in parsed) {
    return fail(422, parsed.problem.code, parsed.problem.code, [
      {
        field: "file",
        code: parsed.problem.code,
        detail: parsed.problem.params.max ?? parsed.problem.params.column ?? "",
      },
    ]);
  }
  return { ok: true, data: checkRows(parsed.rows, mode).preview };
}

// Thay bằng POST /api/v1/catalog/imports (bước 41: multipart → 202 + job) khi core có. Dòng lỗi
// ghi lại, không chặn dòng đúng; khớp theo SKU nên nhập lại không tạo trùng.
export async function runImport(
  text: string,
  mode: ImportMode,
  fileName: string,
): Promise<SampleOutcome<Transfer>> {
  const s = store();
  const parsed = parseImport(text);
  const base = {
    id: newId("c8"),
    kind: "import" as const,
    file_name: fileName || "import.csv",
    mode,
    created_by: SAMPLE_ACTOR,
    created_at: now(),
    finished_at: now(),
  };
  if ("problem" in parsed) {
    const failed: Transfer = {
      ...base,
      status: "failed",
      total_rows: 0,
      ok_rows: 0,
      created_rows: 0,
      updated_rows: 0,
      errors: [parsed.problem],
    };
    s.transfers.unshift(failed);
    return { ok: true, data: { ...failed } };
  }
  const { preview, valid } = checkRows(parsed.rows, mode);
  let created = 0;
  let updated = 0;
  for (const { cells } of valid) {
    const sku = (cells.sku ?? "").trim();
    const found = variantByCodeSync(sku);
    const category = (cells.category ?? "").trim()
      ? categoryByPath(cells.category ?? "")
      : undefined;
    const tax = (cells.tax_category ?? "").trim();
    const weight = (cells.weight_grams ?? "").trim();
    let variantId: string;
    if (found) {
      if (category) found.product.primary_category_id = category.id;
      if (tax) found.product.tax_category = tax;
      if (weight) found.variant.weight_grams = Number(weight);
      const name = (cells.name ?? "").trim();
      const vi = found.product.translations.find((t) => t.locale === "vi");
      if (name && vi && found.product.variants.length === 1) vi.name = name;
      touch(found.product);
      record(found.product.id, { kind: "import", params: { file: base.file_name } });
      variantId = found.variant.id;
      updated += 1;
    } else {
      const made = await createProduct({
        name: (cells.name ?? "").trim(),
        kind: "physical",
        category_id: category?.id ?? "",
        tax_category: tax,
        sku,
      });
      if (!made.ok) continue;
      if (weight) (made.data.variants[0] as Variant).weight_grams = Number(weight);
      const live = s.products.find((p) => p.id === made.data.id);
      if (live && weight) (live.variants[0] as Variant).weight_grams = Number(weight);
      variantId = (made.data.variants[0] as Variant).id;
      created += 1;
    }
    const price = (cells.price ?? "").trim();
    if (price) {
      s.prices.push({
        id: newId("c6"),
        price_list_id: PRICE_LIST_ID.retail,
        variant_id: variantId,
        amount: vnd(Number(price)),
        compare_at: null,
        valid_from: now(),
        valid_to: null,
        reference: `import:${base.id}`,
        created_by: SAMPLE_ACTOR,
        created_at: now(),
      });
    }
  }
  const transfer: Transfer = {
    ...base,
    status: preview.errors.length > 0 ? "done_err" : "done",
    total_rows: preview.total_rows,
    ok_rows: created + updated,
    created_rows: created,
    updated_rows: updated,
    errors: preview.errors.slice(0, 1000),
  };
  s.transfers.unshift(transfer);
  return { ok: true, data: { ...transfer } };
}

// Thay bằng GET /api/v1/catalog/imports và /exports (bước 41; danh sách xuyên việc là dự kiến) khi
// core có. Mới trước.
export async function listTransfers(): Promise<{ data: Transfer[] }> {
  return { data: structuredClone(store().transfers) };
}

/** Ô bắt đầu bằng = + - @ (hay tab, CR) thêm dấu `'` để bảng tính không chạy công thức. */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

// Thay bằng POST /api/v1/catalog/exports + GET /exports/{id}/content (bước 41) khi core có. Trả
// nội dung CSV (BOM, CRLF) và ghi một việc xuất.
export async function exportProducts(): Promise<{ data: { transfer: Transfer; csv: string } }> {
  const s = store();
  const retail = s.prices.filter((p) => p.price_list_id === PRICE_LIST_ID.retail);
  const at = Date.now();
  const lines = [IMPORT_COLUMNS.join(",")];
  for (const product of s.products) {
    for (const variant of product.variants) {
      const price = effectivePrice(
        retail.filter((p) => p.variant_id === variant.id),
        at,
      );
      lines.push(
        [
          variant.sku,
          translationOf(product, "vi").name + (variant.label ? ` ${variant.label}` : ""),
          categoryPath(product.primary_category_id, "vi"),
          product.tax_category ?? "",
          price?.amount.amount ?? "",
          variant.weight_grams === null ? "" : String(variant.weight_grams),
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  const transfer: Transfer = {
    id: newId("c8"),
    kind: "export",
    status: "done",
    file_name: `san-pham-${vietnamDay()}.csv`,
    mode: null,
    total_rows: lines.length - 1,
    ok_rows: lines.length - 1,
    created_rows: 0,
    updated_rows: 0,
    errors: [],
    created_by: SAMPLE_ACTOR,
    created_at: now(),
    finished_at: now(),
  };
  s.transfers.unshift(transfer);
  return { data: { transfer: { ...transfer }, csv: `﻿${lines.join("\r\n")}\r\n` } };
}

// ---------------------------------------------------------------- Bản nháp AI

// Thay bằng GET /api/v1/catalog/suggestions?status=pending (dự kiến; bước 41 chỉ có theo sản phẩm)
// khi core có. Mới trước.
export async function listSuggestions(
  query: { product_id?: string; status?: SuggestionStatus } = {},
): Promise<{
  data: (Suggestion & { product_name: string })[];
}> {
  const s = store();
  return {
    data: s.suggestions
      .filter((x) => !query.product_id || x.product_id === query.product_id)
      .filter((x) => !query.status || x.status === query.status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((x) => {
        const product = s.products.find((p) => p.id === x.product_id);
        return {
          ...structuredClone(x),
          product_name: product ? translationOf(product, "vi").name : x.product_id,
        };
      }),
  };
}

// Thay bằng POST /api/v1/catalog/products/{id}/suggestions (bước 41; gọi `dyn TextModel` của module
// `ai`) khi core có. Ở đây viết một bản nháp mẫu từ dữ liệu sẵn có — không gọi mô hình nào. Chỉ là
// bản nháp: không đổi sản phẩm cho tới khi người duyệt bấm "Áp dụng".
export async function suggestCopy(
  productId: string,
  locale: string,
): Promise<SampleOutcome<Suggestion>> {
  const s = store();
  const product = s.products.find((p) => p.id === productId);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  if (!(CATALOG_LOCALES as readonly string[]).includes(locale))
    return invalid([fieldError("locale", "unknown")]);
  const name = translationOf(product, locale).name;
  const path = categoryPath(product.primary_category_id, locale);
  const sizes = product.variants
    .map((v) => v.label)
    .filter(Boolean)
    .join(", ");
  const vi = locale === "vi";
  const suggestion: Suggestion = {
    id: newId("c9"),
    product_id: productId,
    locale,
    fields: {
      short_description: vi
        ? `${name} của Bếp Mộc${sizes ? `, có ${sizes}` : ""}. Bền, dễ dùng, hợp với bếp gia đình.`
        : `${name} by Bếp Mộc${sizes ? `, in ${sizes}` : ""}. Durable, easy to use, made for home kitchens.`,
      meta_title: `${name} | Bếp Mộc`.slice(0, 70),
      meta_description: (vi
        ? `${name} trong nhóm ${path}. Xem cỡ, chất liệu và cách chăm sóc.`
        : `${name} in ${path}. See sizes, materials and care instructions.`
      ).slice(0, 160),
    },
    note: vi
      ? "Kiểm lại chất liệu, xuất xứ và cỡ trước khi áp."
      : "Check materials, origin and sizes before applying.",
    status: "pending",
    created_at: now(),
    decided_by: null,
    decided_at: null,
  };
  s.suggestions.unshift(suggestion);
  return { ok: true, data: structuredClone(suggestion) };
}

// Thay bằng POST /api/v1/catalog/suggestions/{id}/apply và /discard (bước 41) khi core có. Áp dụng
// chép các trường vào bản dịch và bật `ai_assisted`.
export async function decideSuggestion(
  id: string,
  apply: boolean,
): Promise<SampleOutcome<Suggestion>> {
  const s = store();
  const suggestion = s.suggestions.find((x) => x.id === id);
  if (!suggestion) return fail(404, "catalog.suggestion_not_found", "Suggestion not found.");
  if (suggestion.status !== "pending")
    return fail(409, "catalog.suggestion_decided", "This draft was already decided.");
  const product = s.products.find((p) => p.id === suggestion.product_id);
  if (!product) return fail(404, "catalog.product_not_found", "Product not found.");
  if (apply) {
    let translation = product.translations.find((t) => t.locale === suggestion.locale);
    if (!translation) {
      const base = translationOf(product, product.default_locale);
      translation = {
        ...base,
        locale: suggestion.locale,
        slug: `${base.slug}-${suggestion.locale}`,
        ai_assisted: false,
      };
      product.translations.push(translation);
    }
    for (const [field, value] of Object.entries(suggestion.fields)) {
      if (typeof value === "string") translation[field as SuggestionField] = value;
    }
    translation.ai_assisted = true;
    product.ai_assisted = true;
    touch(product);
  }
  suggestion.status = apply ? "applied" : "discarded";
  suggestion.decided_by = SAMPLE_ACTOR;
  suggestion.decided_at = now();
  record(product.id, {
    kind: apply ? "ai_applied" : "ai_discarded",
    params: { locale: suggestion.locale },
  });
  return { ok: true, data: structuredClone(suggestion) };
}

// ---------------------------------------------------------------- Hợp đồng cho module khác

/** Biến thể theo ID (`Catalog::variants`), theo thứ tự `ids`, bỏ ID không có. */
export async function variants(
  ids: readonly string[],
  locale = "vi",
): Promise<{ data: VariantSnapshot[] }> {
  return {
    data: ids
      .map((id) => findVariant(id))
      .filter((x): x is { product: Product; variant: Variant } => x !== null)
      .map(({ product, variant }) => snapshot(product, variant, locale)),
  };
}

/** Mọi biến thể (kho dùng để dựng ô chọn và tên); bỏ sản phẩm đã lưu trữ. */
export async function allVariants(locale = "vi"): Promise<{ data: VariantSnapshot[] }> {
  return {
    data: store()
      .products.filter((p) => p.status !== "archived")
      .flatMap((p) => p.variants.map((v) => snapshot(p, v, locale))),
  };
}

/** Biến thể theo SKU hay mã vạch (`Catalog::variant_by_code`). */
export async function variantByCode(
  code: string,
  locale = "vi",
): Promise<{ data: VariantSnapshot | null }> {
  const found = variantByCodeSync(code);
  return { data: found ? snapshot(found.product, found.variant, locale) : null };
}

function snapshot(product: Product, variant: Variant, locale: string): VariantSnapshot {
  const translation = translationOf(product, locale);
  return {
    variant_id: variant.id,
    product_id: product.id,
    org_id: product.org_id,
    kind: product.kind,
    status: product.status,
    variant_active: variant.active,
    sku: variant.sku,
    barcode: variant.barcode,
    name: translation.name,
    variant_label: variant.label,
    locale: translation.locale,
    tax_category: product.tax_category,
    category_ids: lineage(product.primary_category_id).map((c) => c.id),
    weight_grams: variant.weight_grams,
    requires_shipping: product.kind === "physical" || product.kind === "bundle",
    track_inventory: product.track_inventory,
    allow_backorder: product.allow_backorder,
    lot_tracked: product.lot_tracked,
    serial_tracked: product.serial_tracked,
    image_media_id: variant.image_media_id ?? product.media[0]?.media_id ?? null,
    updated_at: variant.updated_at,
  };
}

/** Thuế suất đang áp cho sản phẩm (để hiện "GTGT 8%"); `null` khi chưa chọn nhóm. */
export async function productTaxRate(taxCategory: string | null): Promise<string | null> {
  if (!taxCategory) return null;
  const { data } = await listTaxRates(taxCategory);
  return rateOn(data, taxCategory)?.rate_percent ?? null;
}
