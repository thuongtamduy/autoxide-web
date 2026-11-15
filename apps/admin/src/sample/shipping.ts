// Dữ liệu mẫu của màn "Vận chuyển" (module `shipping` của core, bước 44, chưa có). Màn dựng hoàn toàn
// bằng file này (W-006). Hình dạng theo đặc tả `docs/steps/44-shipping.md` của core (mục "Kiểu và
// trait", "Bảng dữ liệu", "API REST", "Mã lỗi", "Bổ sung theo D-201"); trường đặc tả chưa có ghi "dự
// kiến" và nằm trong bảng chỗ thiếu API.
//
// Vận đơn trỏ tới đơn mẫu của `sample/order-refs.ts` (mã `BM-2611-04xx`), biến thể của
// `sample/catalog.ts`, cửa hàng và kho của `sample/org.ts`. Tên hãng vận chuyển là ví dụ: bộ nối hãng
// thật là module riêng (D-191 của core). Khoá API của hãng không bao giờ được lưu ở đây — chỉ lưu thời
// điểm đặt khoá, như kho secret theo khách của core (không đọc lại được).
//
// COD (D-187 của core): tiền do hãng thu và chuyển theo hợp đồng; hệ thống chỉ ghi nghĩa vụ và đối
// soát, không nhận hay giữ tiền. Số điện thoại người nhận là dữ liệu cá nhân, ghi rõ là mẫu.
//
// Tiền là `Money` như JSON của core; cân bằng gram, kích thước bằng mm; giờ lưu UTC, ngày theo giờ
// Việt Nam. Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import { fold } from "@/lib/fold";
import {
  chargeableWeight,
  type DeliveryCalendar,
  etaFor,
  parseStatement,
  vnDate,
} from "@/lib/shipping";
import { type Money, ORG, type Ref, VARIANT_ID, variants } from "./catalog";
import type { SamplePage } from "./index";
import { ORDER_NUMBER_PATTERN, orderByNumber, orderId } from "./order-refs";
import { listUnits, type OrgUnit } from "./org";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;
const HOUR = 3_600_000;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 44

export type ShipmentStatus =
  | "pending"
  | "booking"
  | "ready_to_ship"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "delivery_failed"
  | "returning"
  | "returned"
  | "ready_for_pickup"
  | "picked_up_by_buyer"
  | "cancelled"
  | "lost";

export type CodStatus = "none" | "pending" | "collected" | "settled" | "mismatch";
export type MethodKind = "table_rate" | "carrier" | "pickup";

/** Địa chỉ theo `Address` của module `address` (bước 34): hai cấp tỉnh → phường / xã. */
export interface Address {
  country: string;
  province_code: string;
  province_name: string;
  commune_name: string;
  line: string;
}

export interface Parcel {
  id: string;
  position: number;
  weight_grams: number;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  tracking_number: string | null;
}

export interface ShipmentItem {
  order_line_key: string;
  variant_id: string;
  sku: string;
  name: string;
  quantity: number;
  parcel_id: string | null;
}

export interface TrackingEvent {
  id: string;
  source: "carrier" | "staff" | "system";
  event_key: string;
  status: ShipmentStatus;
  carrier_status: string;
  occurred_at: string;
  note: string;
}

export interface Shipment {
  id: string;
  org_id: string;
  origin_org_id: string;
  order_id: string;
  order_number: string;
  request_key: string;
  direction: "outbound" | "return";
  method_id: string;
  carrier_account_id: string | null;
  carrier_code: string | null;
  service_code: string | null;
  status: ShipmentStatus;
  status_at: string;
  recipient_name: string;
  recipient_phone: string;
  address: Address;
  declared_value: Money;
  cod: Money | null;
  quoted_fee: Money | null;
  actual_fee: Money | null;
  cod_status: CodStatus;
  attempts: number;
  /** Dự kiến: số lần giao tối đa của hãng trước khi hoàn hàng. */
  max_attempts: number;
  /** Dự kiến (D-201): ngày giao dự kiến dạng khoảng, theo giờ Việt Nam, chụp lúc tạo vận đơn. */
  eta_from: string | null;
  eta_to: string | null;
  parcels: Parcel[];
  items: ShipmentItem[];
  events: TrackingEvent[];
  created_at: string;
  updated_at: string;
}

export interface ShippingMethod {
  id: string;
  org_id: string;
  code: string;
  kind: MethodKind;
  names: Record<string, string>;
  active: boolean;
  position: number;
  carrier_account_id: string | null;
  service_code: string | null;
  free_over: Money | null;
  handling_fee: Money;
  volumetric_divisor: number;
  default_item_weight_grams: number | null;
  countries: string[];
  estimated_min_days: number | null;
  estimated_max_days: number | null;
  /** Dự kiến: giờ chốt riêng của phương thức (giao trong ngày), giờ Việt Nam. */
  cutoff: string | null;
  updated_at: string;
}

export interface Zone {
  id: string;
  org_id: string;
  name: string;
  /** Mã tỉnh; `null` = cả nước (vùng cụ thể theo tỉnh thắng vùng cả nước). */
  province_codes: string[] | null;
}

export interface Rate {
  id: string;
  method_id: string;
  zone_id: string;
  min_weight_grams: number;
  /** `null` = không giới hạn trên. */
  max_weight_grams: number | null;
  max_side_mm: number | null;
  amount: Money;
  /** Mỗi `step_grams` vượt `min_weight_grams` cộng `step_amount`. */
  step_grams: number | null;
  step_amount: Money | null;
}

export interface PickupPoint {
  method_id: string;
  org_id: string;
  instructions: string;
  prep_hours: number;
  /** Dự kiến: số ngày giữ hàng chờ khách tới nhận. */
  hold_days: number;
}

export interface CarrierCapabilities {
  multi_parcel: boolean;
  cod: boolean;
  label: boolean;
  cancel: boolean;
  statement_api: boolean;
  webhook: boolean;
}

export interface CarrierAccount {
  id: string;
  org_id: string;
  carrier_code: string;
  name: string;
  sandbox: boolean;
  active: boolean;
  capabilities: CarrierCapabilities;
  /** Dự kiến: kết quả lần kiểm kết nối gần nhất. */
  check_status: "ok" | "error" | "unknown";
  checked_at: string | null;
  last_error: string | null;
  last_event_at: string | null;
  /** Lúc đặt khoá API gần nhất; khoá nằm ở kho secret, không bao giờ trả lại. */
  secret_set_at: string | null;
}

export type StatementStatus = "imported" | "reconciled" | "has_mismatch";
export type LineMatch = "matched" | "amount_mismatch" | "unknown_tracking" | "not_delivered";

export interface CodStatementLine {
  id: string;
  tracking_number: string;
  cod: Money;
  fee: Money;
  shipment_id: string | null;
  order_number: string | null;
  match: LineMatch;
}

export interface CodStatement {
  id: string;
  carrier_account_id: string;
  carrier_name: string;
  statement_reference: string;
  period_from: string;
  period_to: string;
  total_cod: Money;
  total_fee: Money;
  net_paid: Money;
  status: StatementStatus;
  /** Dự kiến: tiền về đâu — tài khoản của khách, hay tài khoản thu hộ của đối tác (đơn trên sàn). */
  payee: "merchant" | "payment_partner";
  imported_by: Ref;
  imported_at: string;
  lines: CodStatementLine[];
}

export type DiscrepancyKind = "not_delivered" | "amount_mismatch" | "unknown_tracking" | "overdue";

export interface CodDiscrepancy {
  id: string;
  statement_line_id: string | null;
  statement_reference: string | null;
  shipment_id: string | null;
  tracking_number: string;
  order_number: string | null;
  kind: DiscrepancyKind;
  /** Số sổ cái đang ghi phải thu (lấy từ yêu cầu giao, không từ hãng). */
  expected: Money;
  /** Số hãng báo đã thu. */
  reported: Money;
  /** Phí hãng trừ trên dòng bảng kê. */
  reported_fee: Money;
  status: "open" | "resolved";
  resolution_note: string;
  resolved_by: Ref | null;
  resolved_at: string | null;
}

/** Lịch giao có ngày hiệu lực (`shipping_calendars`, D-201 — dự kiến, chưa có cột trong đặc tả). */
export interface CalendarVersion {
  id: string;
  org_id: string;
  cutoff: string;
  workdays: number[];
  effective_from: string;
  created_by: Ref;
  created_at: string;
}

export interface Holiday {
  id: string;
  /** `null` = cả chuỗi. */
  org_id: string | null;
  name: string;
  from: string | null;
  to: string | null;
  /** "awaiting_notice": đã biết sẽ nghỉ nhưng chưa có thông báo chính thức (vd Tết Nguyên đán). */
  status: "confirmed" | "awaiting_notice";
}

// ---------------------------------------------------------------- ID cố định

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

/** Nút "Miền Nam" của cây tổ chức mẫu (`sample/org.ts`). */
const SOUTH = "01a1e000-0000-7000-8000-000000000a02";

export const CARRIER_ID = {
  gnsg: uid("f1", 1),
  hh: uid("f1", 2),
  vtbm: uid("f1", 3),
  fake: uid("f1", 4),
} as const;

export const METHOD_ID = {
  standard: uid("f2", 1),
  standardCauGiay: uid("f2", 2),
  sameDay: uid("f2", 3),
  pickup: uid("f2", 4),
  economy: uid("f2", 5),
} as const;

/** Bộ nối hãng đã cài (`CarrierRegistry::codes`) và tên hiện. Tên hãng là ví dụ. */
export const CARRIER_CODES: Record<string, string> = {
  gnsg: "Giao Nhanh Sài Gòn",
  hh: "Chuyển Phát Hồng Hà",
  vtbm: "Vận Tải Ba Miền",
  fake: "Hãng giả để thử",
};

/** Tỉnh / thành mẫu (mã theo danh mục đơn vị hành chính; module `address`, bước 34). */
export const SAMPLE_PROVINCES: { code: string; name: string }[] = [
  { code: "79", name: "TP. Hồ Chí Minh" },
  { code: "01", name: "Hà Nội" },
  { code: "48", name: "Đà Nẵng" },
  { code: "92", name: "Cần Thơ" },
  { code: "75", name: "Đồng Nai" },
];

const KHAI: Ref = { id: "01a1e000-0000-7000-8000-000000000f12", name: "Đỗ Khải" };
const MAI: Ref = { id: "01a1e000-0000-7000-8000-000000000f01", name: "Ngô Mai" };
export const SAMPLE_ACTOR: Ref = { id: "01a1e000-0000-7000-8000-000000000f99", name: "Bạn" };

/** Số điện thoại mẫu: không phải số thật. */
const PHONE = "0900000000";

// ---------------------------------------------------------------- Kho trong bộ nhớ

interface Store {
  shipments: Shipment[];
  methods: ShippingMethod[];
  zones: Zone[];
  rates: Rate[];
  pickups: PickupPoint[];
  carriers: CarrierAccount[];
  statements: CodStatement[];
  discrepancies: CodDiscrepancy[];
  calendars: CalendarVersion[];
  holidays: Holiday[];
  seq: number;
  tracking: number;
}

const vnd = (amount: number): Money => ({ amount: String(amount), currency: "VND" });

function at(t0: number, days: number, hours = 0, minutes = 0): string {
  return new Date(t0 + days * DAY + hours * HOUR + minutes * 60_000).toISOString();
}

function dayOf(t0: number, days: number): string {
  return vnDate(t0 + days * DAY);
}

function seedCarriers(t0: number): CarrierAccount[] {
  const caps = (over: Partial<CarrierCapabilities>): CarrierCapabilities => ({
    multi_parcel: false,
    cod: true,
    label: true,
    cancel: true,
    statement_api: false,
    webhook: true,
    ...over,
  });
  return [
    {
      id: CARRIER_ID.gnsg,
      org_id: SOUTH,
      carrier_code: "gnsg",
      name: "Giao Nhanh Sài Gòn",
      sandbox: false,
      active: true,
      capabilities: caps({ multi_parcel: true, statement_api: true }),
      check_status: "ok",
      checked_at: at(t0, -2, 8),
      last_error: null,
      last_event_at: at(t0, -2, 11, 30),
      secret_set_at: at(t0, -60),
    },
    {
      id: CARRIER_ID.hh,
      org_id: ORG.ROOT,
      carrier_code: "hh",
      name: "Chuyển Phát Hồng Hà",
      sandbox: false,
      active: true,
      capabilities: caps({ cancel: false, webhook: false }),
      check_status: "ok",
      checked_at: at(t0, -2, 8),
      last_error: null,
      last_event_at: at(t0, -2, 10, 58),
      secret_set_at: at(t0, -40),
    },
    {
      id: CARRIER_ID.vtbm,
      org_id: ORG.ROOT,
      carrier_code: "vtbm",
      name: "Vận Tải Ba Miền",
      sandbox: false,
      active: true,
      capabilities: caps({}),
      check_status: "error",
      checked_at: at(t0, -3, 23, 10),
      last_error: "carrier_auth_rejected",
      last_event_at: at(t0, -3, 23, 10),
      secret_set_at: at(t0, -200),
    },
    {
      id: CARRIER_ID.fake,
      org_id: ORG.ROOT,
      carrier_code: "fake",
      name: "Hãng giả để thử",
      sandbox: true,
      active: false,
      capabilities: caps({ multi_parcel: true, statement_api: true }),
      check_status: "unknown",
      checked_at: null,
      last_error: null,
      last_event_at: null,
      secret_set_at: null,
    },
  ];
}

function seedMethods(t0: number): ShippingMethod[] {
  const method = (
    id: string,
    org_id: string,
    code: string,
    kind: MethodKind,
    vi: string,
    en: string,
    over: Partial<ShippingMethod> = {},
  ): ShippingMethod => ({
    id,
    org_id,
    code,
    kind,
    names: { vi, en },
    active: true,
    position: 0,
    carrier_account_id: null,
    service_code: null,
    free_over: null,
    handling_fee: vnd(0),
    volumetric_divisor: 6000,
    default_item_weight_grams: 500,
    countries: ["VN"],
    estimated_min_days: 1,
    estimated_max_days: 3,
    cutoff: null,
    updated_at: at(t0, -30),
    ...over,
  });
  return [
    method(
      METHOD_ID.standard,
      ORG.ROOT,
      "standard",
      "table_rate",
      "Giao tiêu chuẩn",
      "Standard delivery",
      {
        free_over: vnd(1_000_000),
        position: 1,
      },
    ),
    method(
      METHOD_ID.standardCauGiay,
      ORG.CG,
      "standard",
      "table_rate",
      "Giao tiêu chuẩn",
      "Standard delivery",
      { free_over: vnd(1_000_000), position: 1, carrier_account_id: CARRIER_ID.hh },
    ),
    method(
      METHOD_ID.sameDay,
      ORG.Q3,
      "same_day",
      "carrier",
      "Giao trong ngày",
      "Same-day delivery",
      {
        carrier_account_id: CARRIER_ID.gnsg,
        service_code: "2h",
        estimated_min_days: 0,
        estimated_max_days: 0,
        cutoff: "11:00",
        position: 2,
      },
    ),
    method(METHOD_ID.pickup, ORG.ROOT, "pickup", "pickup", "Nhận tại cửa hàng", "Store pickup", {
      default_item_weight_grams: null,
      estimated_min_days: null,
      estimated_max_days: null,
      position: 3,
    }),
    method(
      METHOD_ID.economy,
      ORG.ROOT,
      "economy",
      "carrier",
      "Giao tiết kiệm",
      "Economy delivery",
      {
        carrier_account_id: CARRIER_ID.vtbm,
        service_code: "eco",
        handling_fee: vnd(5_000),
        estimated_min_days: 3,
        estimated_max_days: 5,
        position: 4,
      },
    ),
  ];
}

const ZONE_ID = {
  hcm: uid("f3", 1),
  hanoi: uid("f3", 2),
  south: uid("f3", 3),
  nation: uid("f3", 4),
} as const;

function seedZones(): Zone[] {
  return [
    { id: ZONE_ID.hcm, org_id: ORG.ROOT, name: "TP. Hồ Chí Minh", province_codes: ["79"] },
    { id: ZONE_ID.hanoi, org_id: ORG.ROOT, name: "Hà Nội", province_codes: ["01"] },
    { id: ZONE_ID.south, org_id: ORG.ROOT, name: "Miền Nam", province_codes: ["75", "92"] },
    { id: ZONE_ID.nation, org_id: ORG.ROOT, name: "Cả nước", province_codes: null },
  ];
}

function seedRates(): Rate[] {
  let n = 0;
  const rate = (
    method_id: string,
    zone_id: string,
    min: number,
    max: number | null,
    amount: number,
    step: [number, number] | null = null,
  ): Rate => {
    n += 1;
    return {
      id: uid("f4", n),
      method_id,
      zone_id,
      min_weight_grams: min,
      max_weight_grams: max,
      max_side_mm: 1000,
      amount: vnd(amount),
      step_grams: step ? step[0] : null,
      step_amount: step ? vnd(step[1]) : null,
    };
  };
  // Bảng phí của Trụ sở; CN Cầu Giấy ghi đè cùng mã `standard`, chỉ khác vùng Hà Nội.
  const table = (method: string, hanoi: number) => [
    rate(method, ZONE_ID.hcm, 0, 2000, 30_000),
    rate(method, ZONE_ID.hcm, 2000, null, 30_000, [500, 5_000]),
    rate(method, ZONE_ID.hanoi, 0, 2000, hanoi),
    rate(method, ZONE_ID.hanoi, 2000, null, hanoi, [500, 5_000]),
    rate(method, ZONE_ID.south, 0, 2000, 35_000),
    rate(method, ZONE_ID.south, 2000, null, 35_000, [500, 5_000]),
    rate(method, ZONE_ID.nation, 0, 2000, 45_000),
    rate(method, ZONE_ID.nation, 2000, 20_000, 60_000, [500, 8_000]),
  ];
  return [...table(METHOD_ID.standard, 40_000), ...table(METHOD_ID.standardCauGiay, 35_000)];
}

function seedPickups(): PickupPoint[] {
  const point = (org_id: string, prep: number): PickupPoint => ({
    method_id: METHOD_ID.pickup,
    org_id,
    instructions: "Đưa mã nhận hàng 6 số cho nhân viên quầy.",
    prep_hours: prep,
    hold_days: 3,
  });
  return [point(ORG.Q3, 2), point(ORG.TD, 2), point(ORG.CG, 4)];
}

/** Lịch ban đầu: chốt 16:00, hãng lấy thứ Hai – thứ Bảy. */
const BASE_CALENDAR: Omit<CalendarVersion, "id" | "created_at"> = {
  org_id: ORG.ROOT,
  cutoff: "16:00",
  workdays: [1, 2, 3, 4, 5, 6],
  effective_from: "2026-01-01",
  created_by: MAI,
};

function seedHolidays(t0: number): Holiday[] {
  return [
    {
      id: uid("f5", 1),
      org_id: ORG.WH,
      name: "Kiểm kê kho",
      from: dayOf(t0, 15),
      to: dayOf(t0, 15),
      status: "confirmed",
    },
    {
      id: uid("f5", 2),
      org_id: null,
      name: "Tết Dương lịch",
      from: "2027-01-01",
      to: "2027-01-01",
      status: "confirmed",
    },
    {
      id: uid("f5", 3),
      org_id: null,
      name: "Tết Nguyên đán 2027",
      from: null,
      to: null,
      status: "awaiting_notice",
    },
  ];
}

interface SeedShipment {
  n: number;
  order: string;
  status: ShipmentStatus;
  method: string;
  carrier: keyof typeof CARRIER_ID | null;
  origin: string;
  province: "79" | "01";
  commune: string;
  cod: number | null;
  fee: number | null;
  parcels: { grams: number; dims?: [number, number, number]; tracking?: string }[];
  items: [keyof typeof VARIANT_ID, number, number?][];
  events: [number, number, number, ShipmentStatus, string][];
  attempts?: number;
  cod_status?: CodStatus;
}

async function seedShipments(t0: number, calendar: DeliveryCalendar): Promise<Shipment[]> {
  const seeds: SeedShipment[] = [
    {
      n: 1,
      order: "BM-2611-0415",
      status: "pending",
      method: METHOD_ID.standardCauGiay,
      carrier: "hh",
      origin: ORG.CG,
      province: "01",
      commune: "Phường Ba Đình",
      cod: 862_000,
      fee: 35_000,
      parcels: [{ grams: 1900, dims: [300, 200, 150] }],
      items: [
        ["BG6", 1],
        ["KB4-XA", 2],
        ["NRC750", 1],
      ],
      events: [[-2, 10, 12, "pending", "order_confirmed"]],
    },
    {
      n: 2,
      order: "BM-2611-0414",
      status: "out_for_delivery",
      method: METHOD_ID.standard,
      carrier: "gnsg",
      origin: ORG.Q3,
      province: "79",
      commune: "Phường Tân Định",
      cod: null,
      fee: 30_000,
      parcels: [
        { grams: 2800, dims: [500, 300, 120], tracking: "GN-8813 0215" },
        { grams: 1200, dims: [360, 120, 40], tracking: "GN-8813 0216" },
      ],
      items: [
        ["CG26", 2, 0],
        ["DB3", 1, 1],
      ],
      events: [
        [-2, 10, 5, "ready_to_ship", "booked"],
        [-2, 10, 20, "picked_up", "picked_up"],
        [-2, 11, 30, "out_for_delivery", "delivering"],
      ],
    },
    {
      n: 3,
      order: "BM-2611-0407",
      status: "delivery_failed",
      method: METHOD_ID.standard,
      carrier: "gnsg",
      origin: ORG.Q3,
      province: "79",
      commune: "Phường Bình Thạnh",
      cod: 345_000,
      fee: 30_000,
      parcels: [{ grams: 1600, dims: [300, 220, 200], tracking: "GN-8812 9930" }],
      items: [["HT1L", 1]],
      attempts: 2,
      cod_status: "pending",
      events: [
        [-4, 9, 0, "picked_up", "picked_up"],
        [-3, 15, 10, "delivery_failed", "reschedule_requested"],
        [-2, 10, 40, "delivery_failed", "recipient_unreachable"],
      ],
    },
    {
      n: 4,
      order: "BM-2611-0417",
      status: "ready_to_ship",
      method: METHOD_ID.standard,
      carrier: "hh",
      origin: ORG.WH,
      province: "01",
      commune: "Phường Hoàn Kiếm",
      cod: null,
      fee: 40_000,
      parcels: [{ grams: 1800, dims: [300, 220, 200], tracking: "HH-55 0192" }],
      items: [
        ["HT1L", 1],
        ["KB4-BE", 1],
      ],
      events: [[-1, 14, 0, "ready_to_ship", "booked"]],
    },
    {
      n: 5,
      order: "BM-2611-0371",
      status: "returning",
      method: METHOD_ID.standard,
      carrier: "gnsg",
      origin: ORG.TD,
      province: "79",
      commune: "Phường Thủ Đức",
      cod: null,
      fee: 30_000,
      parcels: [{ grams: 2300, dims: [260, 220, 150], tracking: "GN-8811 7804" }],
      items: [["NI20", 1]],
      attempts: 3,
      events: [
        [-6, 17, 0, "delivery_failed", "third_attempt_failed"],
        [-5, 8, 0, "returning", "return_to_sender"],
      ],
    },
    {
      n: 6,
      order: "BM-2611-0410",
      status: "ready_for_pickup",
      method: METHOD_ID.pickup,
      carrier: null,
      origin: ORG.Q3,
      province: "79",
      commune: "Phường Xuân Hoà",
      cod: null,
      fee: 0,
      parcels: [{ grams: 1100 }],
      items: [["TG35", 1]],
      events: [[-1, 9, 30, "ready_for_pickup", "prepared"]],
    },
    {
      n: 7,
      order: "BM-2611-0396",
      status: "delivered",
      method: METHOD_ID.standard,
      carrier: "gnsg",
      origin: ORG.Q3,
      province: "79",
      commune: "Phường Bến Thành",
      cod: 1_059_000,
      fee: 0,
      parcels: [{ grams: 3100, dims: [500, 300, 120], tracking: "GN-8813 0102" }],
      items: [
        ["CG28", 1],
        ["DB3", 1],
      ],
      cod_status: "collected",
      events: [
        [-3, 9, 0, "picked_up", "picked_up"],
        [-2, 9, 40, "delivered", "delivered_cod_collected"],
      ],
    },
    {
      n: 8,
      order: "BM-2611-0418",
      status: "in_transit",
      method: METHOD_ID.sameDay,
      carrier: "gnsg",
      origin: ORG.Q3,
      province: "79",
      commune: "Phường Sài Gòn",
      cod: null,
      fee: 30_000,
      parcels: [{ grams: 1400, dims: [500, 300, 70], tracking: "GN-8813 0230" }],
      items: [["CCD28", 1]],
      events: [
        [0, 9, 10, "picked_up", "picked_up"],
        [0, 9, 40, "in_transit", "in_transit"],
      ],
    },
    {
      n: 9,
      order: "BM-2611-0362",
      status: "out_for_delivery",
      method: METHOD_ID.standard,
      carrier: "gnsg",
      origin: ORG.Q3,
      province: "79",
      commune: "Phường Gia Định",
      cod: 129_000,
      fee: 30_000,
      parcels: [{ grams: 900, tracking: "GN-8812 4471" }],
      items: [["NMC500", 1]],
      cod_status: "pending",
      events: [
        [-9, 9, 0, "picked_up", "picked_up"],
        [-9, 14, 0, "out_for_delivery", "delivering"],
      ],
    },
    {
      n: 10,
      order: "BM-2611-0367",
      status: "out_for_delivery",
      method: METHOD_ID.standard,
      carrier: "gnsg",
      origin: ORG.TD,
      province: "79",
      commune: "Phường Linh Xuân",
      cod: 119_000,
      fee: 30_000,
      parcels: [{ grams: 800, tracking: "GN-8812 4502" }],
      items: [["NRC750", 1]],
      cod_status: "pending",
      events: [
        [-9, 9, 30, "picked_up", "picked_up"],
        [-9, 15, 0, "out_for_delivery", "delivering"],
      ],
    },
    {
      n: 11,
      order: "BM-2611-0331",
      status: "delivered",
      method: METHOD_ID.standard,
      carrier: "gnsg",
      origin: ORG.Q3,
      province: "79",
      commune: "Phường Tân Định",
      cod: 260_000,
      fee: 30_000,
      parcels: [{ grams: 1800, tracking: "GN-8809 1120" }],
      items: [["TG35", 1]],
      cod_status: "settled",
      events: [[-12, 16, 0, "delivered", "delivered_cod_collected"]],
    },
    {
      n: 12,
      order: "BM-2611-0388",
      status: "delivered",
      method: METHOD_ID.standardCauGiay,
      carrier: "hh",
      origin: ORG.CG,
      province: "01",
      commune: "Phường Cầu Giấy",
      cod: 590_000,
      fee: 35_000,
      parcels: [{ grams: 2600, tracking: "HH-55 0150" }],
      items: [["CG24", 1]],
      cod_status: "settled",
      events: [[-10, 11, 0, "delivered", "delivered_cod_collected"]],
    },
    {
      n: 13,
      order: "BM-2611-0352",
      status: "delivered",
      method: METHOD_ID.standard,
      carrier: "gnsg",
      origin: ORG.TD,
      province: "79",
      commune: "Phường Thủ Đức",
      cod: 450_000,
      fee: 30_000,
      parcels: [{ grams: 1300, tracking: "GN-8808 6610" }],
      items: [["CCD28", 1]],
      cod_status: "settled",
      events: [[-16, 10, 0, "delivered", "delivered_cod_collected"]],
    },
  ];
  const ids = [...new Set(seeds.flatMap((s) => s.items.map(([sku]) => VARIANT_ID[sku])))];
  const { data: snaps } = await variants(ids);
  return seeds.map((seed) => {
    const id = uid("f6", seed.n);
    const created = at(t0, (seed.events[0]?.[0] ?? 0) - 1, 10, 0);
    const parcels: Parcel[] = seed.parcels.map((p, i) => ({
      id: uid("f7", seed.n * 10 + i),
      position: i,
      weight_grams: p.grams,
      length_mm: p.dims?.[0] ?? null,
      width_mm: p.dims?.[1] ?? null,
      height_mm: p.dims?.[2] ?? null,
      tracking_number: p.tracking ?? null,
    }));
    const items: ShipmentItem[] = seed.items.map(([sku, quantity, parcel], i) => {
      const snap = snaps.find((v) => v.variant_id === VARIANT_ID[sku]);
      return {
        order_line_key: `l${i + 1}`,
        variant_id: VARIANT_ID[sku],
        sku,
        name: snap ? `${snap.name}${snap.variant_label ? ` ${snap.variant_label}` : ""}` : sku,
        quantity,
        parcel_id: parcel === undefined ? (parcels[0]?.id ?? null) : (parcels[parcel]?.id ?? null),
      };
    });
    const events: TrackingEvent[] = seed.events.map(([d, h, m, status, carrierStatus], i) => ({
      id: uid("f8", seed.n * 10 + i),
      source: status === "pending" || status === "ready_for_pickup" ? "system" : "carrier",
      event_key: `${seed.n}-${i}`,
      status,
      carrier_status: carrierStatus,
      occurred_at: at(t0, d, h, m),
      note: "",
    }));
    const method = seed.method === METHOD_ID.sameDay ? [0, 0] : [1, 3];
    const eta = etaFor(Date.parse(created), calendar, method[0] ?? 1, method[1] ?? 3);
    const value = seed.cod ?? 500_000;
    return {
      id,
      org_id: orderByNumber(seed.order)?.org_id ?? seed.origin,
      origin_org_id: seed.origin,
      order_id: orderId(seed.order),
      order_number: seed.order,
      request_key: "main",
      direction: "outbound",
      method_id: seed.method,
      carrier_account_id: seed.carrier ? CARRIER_ID[seed.carrier] : null,
      carrier_code: seed.carrier,
      service_code: seed.method === METHOD_ID.sameDay ? "2h" : seed.carrier ? "standard" : null,
      status: seed.status,
      status_at: events.at(-1)?.occurred_at ?? created,
      recipient_name: `Người nhận ${seed.n} (mẫu)`,
      recipient_phone: PHONE,
      address: {
        country: "VN",
        province_code: seed.province,
        province_name: seed.province === "79" ? "TP. Hồ Chí Minh" : "Hà Nội",
        commune_name: seed.commune,
        line: `${seed.n} đường Mẫu`,
      },
      declared_value: vnd(value),
      cod: seed.cod === null ? null : vnd(seed.cod),
      quoted_fee: seed.fee === null ? null : vnd(seed.fee),
      actual_fee: null,
      cod_status: seed.cod_status ?? (seed.cod ? "pending" : "none"),
      attempts: seed.attempts ?? 0,
      max_attempts: 3,
      eta_from: seed.carrier || seed.method === METHOD_ID.standard ? eta.eta_from : null,
      eta_to: seed.carrier || seed.method === METHOD_ID.standard ? eta.eta_to : null,
      parcels,
      items,
      events,
      created_at: created,
      updated_at: events.at(-1)?.occurred_at ?? created,
    };
  });
}

function seedCod(t0: number, shipments: readonly Shipment[]) {
  const byTracking = (tracking: string) =>
    shipments.find((s) => s.parcels.some((p) => p.tracking_number === tracking));
  let n = 0;
  const line = (tracking: string, cod: number, fee: number, match: LineMatch): CodStatementLine => {
    n += 1;
    const shipment = byTracking(tracking);
    return {
      id: uid("f9", n),
      tracking_number: tracking,
      cod: vnd(cod),
      fee: vnd(fee),
      shipment_id: shipment?.id ?? null,
      order_number: shipment?.order_number ?? null,
      match,
    };
  };
  const statement = (
    k: number,
    carrier: keyof typeof CARRIER_ID,
    reference: string,
    from: number,
    lines: CodStatementLine[],
    status: StatementStatus,
    imported: number,
  ): CodStatement => {
    const cod = lines.reduce((s, l) => s + Number(l.cod.amount), 0);
    const fee = lines.reduce((s, l) => s + Number(l.fee.amount), 0);
    return {
      id: uid("fa", k),
      carrier_account_id: CARRIER_ID[carrier],
      carrier_name: CARRIER_CODES[carrier] ?? carrier,
      statement_reference: reference,
      period_from: dayOf(t0, from),
      period_to: dayOf(t0, from + 6),
      total_cod: vnd(cod),
      total_fee: vnd(fee),
      net_paid: vnd(cod - fee),
      status,
      payee: "merchant",
      imported_by: KHAI,
      imported_at: at(t0, imported, 9, 0),
      lines,
    };
  };
  const w45 = [
    line("GN-8812 4471", 129_000, 34_000, "not_delivered"),
    line("GN-8812 4502", 119_000, 34_000, "not_delivered"),
    line("GN-8809 1120", 240_000, 20_000, "matched"),
  ];
  const statements = [
    statement(1, "gnsg", "GNSG-2026-W45", -13, w45, "has_mismatch", -6),
    statement(
      2,
      "hh",
      "HH-2026-W45",
      -13,
      [line("HH-55 0150", 590_000, 35_000, "matched")],
      "reconciled",
      -6,
    ),
    statement(
      3,
      "gnsg",
      "GNSG-2026-W44",
      -20,
      [line("GN-8808 6610", 450_000, 30_000, "matched")],
      "reconciled",
      -13,
    ),
  ];
  const disc = (
    k: number,
    l: CodStatementLine,
    kind: DiscrepancyKind,
    expected: number,
    resolved: { note: string; by: Ref; at: string } | null,
  ): CodDiscrepancy => ({
    id: uid("fb", k),
    statement_line_id: l.id,
    statement_reference: "GNSG-2026-W45",
    shipment_id: l.shipment_id,
    tracking_number: l.tracking_number,
    order_number: l.order_number,
    kind,
    expected: vnd(expected),
    reported: l.cod,
    reported_fee: l.fee,
    status: resolved ? "resolved" : "open",
    resolution_note: resolved?.note ?? "",
    resolved_by: resolved?.by ?? null,
    resolved_at: resolved?.at ?? null,
  });
  const [l1, l2, l3] = w45 as [CodStatementLine, CodStatementLine, CodStatementLine];
  const discrepancies = [
    disc(1, l1, "not_delivered", 0, null),
    disc(2, l2, "not_delivered", 0, null),
    disc(3, l3, "amount_mismatch", 260_000, {
      note: "Hãng bù 20.000 ₫ ở bảng kê tuần sau.",
      by: KHAI,
      at: at(t0, -10, 15, 0),
    }),
  ];
  return { statements, discrepancies };
}

async function seed(): Promise<Store> {
  const t0 = Date.parse(`${vnDate(Date.now())}T00:00:00+07:00`);
  const holidays = seedHolidays(t0);
  const calendar = toCalendar(BASE_CALENDAR, holidays, ORG.ROOT);
  const shipments = await seedShipments(t0, calendar);
  const { statements, discrepancies } = seedCod(t0, shipments);
  return {
    shipments,
    methods: seedMethods(t0),
    zones: seedZones(),
    rates: seedRates(),
    pickups: seedPickups(),
    carriers: seedCarriers(t0),
    statements,
    discrepancies,
    calendars: [{ ...BASE_CALENDAR, id: uid("fc", 1), created_at: at(t0, -300) }],
    holidays,
    seq: 0,
    tracking: 300,
  };
}

// Kho giữ trên `globalThis`: Next.js có thể nạp lại module khi chạy thử, kho vẫn còn. Dựng kho cần
// đọc tên biến thể (hàm async của `sample/catalog.ts`), nên giữ Promise của lần dựng đầu.
const KEY = Symbol.for("autoxide.sample.shipping");
type Holder = { [KEY]?: Promise<Store> };

function store(): Promise<Store> {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleShipping(): void {
  (globalThis as Holder)[KEY] = seed();
}

async function newId(kind: string): Promise<string> {
  const s = await store();
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
      title:
        status === 404
          ? "Not Found"
          : status === 409
            ? "Conflict"
            : status === 502
              ? "Bad Gateway"
              : "Unprocessable Entity",
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

const whole = (text: string) => /^\d{1,12}$/.test(text);

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

// ---------------------------------------------------------------- Lịch giao

/** Lịch hiệu lực ở ngày `day` cho một nút (gồm ngày nghỉ của cả chuỗi và của nút đó). */
function toCalendar(
  version: Pick<CalendarVersion, "cutoff" | "workdays">,
  holidays: readonly Holiday[],
  orgId: string | null,
): DeliveryCalendar {
  return {
    cutoff: version.cutoff,
    workdays: version.workdays,
    holidays: holidays
      .filter((h) => h.status === "confirmed" && h.from && h.to)
      .filter((h) => h.org_id === null || h.org_id === orgId)
      .map((h) => ({ from: h.from as string, to: h.to as string })),
  };
}

/** Phiên bản lịch hiệu lực ở ngày `day` (bản có `effective_from` lớn nhất ≤ `day`). */
export function calendarAt(
  versions: readonly CalendarVersion[],
  day: string,
): CalendarVersion | null {
  let best: CalendarVersion | null = null;
  for (const v of versions) {
    if (v.effective_from > day) continue;
    if (!best || v.effective_from > best.effective_from) best = v;
  }
  return best;
}

// Thay bằng GET /api/v1/shipping/calendars (dự kiến, D-201) khi core có: các phiên bản lịch có ngày
// hiệu lực và ngày nghỉ.
export async function getCalendar(): Promise<{
  data: { versions: CalendarVersion[]; holidays: Holiday[]; current: CalendarVersion | null };
}> {
  const s = await store();
  const versions = [...s.calendars].sort((a, b) =>
    b.effective_from.localeCompare(a.effective_from),
  );
  return {
    data: {
      versions: structuredClone(versions),
      holidays: structuredClone(
        [...s.holidays].sort((a, b) => (a.from ?? "9999").localeCompare(b.from ?? "9999")),
      ),
      current: calendarAt(s.calendars, vnDate(Date.now())),
    },
  };
}

/** Ví dụ ngày giao dự kiến cho đơn đặt lúc `orderedAt` (cùng hàm với báo giá). */
export async function etaExample(
  orderedAt: number,
  minDays: number,
  maxDays: number,
): Promise<ReturnType<typeof etaFor>> {
  const s = await store();
  const version = calendarAt(s.calendars, vnDate(orderedAt)) ?? { ...BASE_CALENDAR };
  return etaFor(orderedAt, toCalendar(version, s.holidays, ORG.ROOT), minDays, maxDays);
}

export interface CalendarInput {
  cutoff: string;
  workdays: string;
  effective_from: string;
}

const WORKDAY_SETS: Record<string, number[]> = {
  mon_sat: [1, 2, 3, 4, 5, 6],
  mon_fri: [1, 2, 3, 4, 5],
  all: [0, 1, 2, 3, 4, 5, 6],
};

// Thay bằng POST /api/v1/shipping/calendars (dự kiến) khi core có. Lịch là dữ liệu có ngày hiệu lực:
// thêm phiên bản mới áp từ một ngày sau hôm nay, không sửa phiên bản cũ — ngày dự kiến của đơn đã
// đặt không đổi.
export async function saveCalendar(input: CalendarInput): Promise<SampleOutcome<CalendarVersion>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const cutoff = input.cutoff.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) errors.push(fieldError("cutoff", "time"));
  const workdays = WORKDAY_SETS[input.workdays];
  if (!workdays) errors.push(fieldError("workdays", "unknown"));
  const from = input.effective_from.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) errors.push(fieldError("effective_from", "date"));
  else if (from <= vnDate(Date.now())) errors.push(fieldError("effective_from", "future_day"));
  else if (s.calendars.some((c) => c.effective_from === from))
    errors.push(fieldError("effective_from", "shipping.calendar_exists"));
  if (errors.length > 0 || !workdays) return invalid(errors);
  const version: CalendarVersion = {
    id: await newId("fc"),
    org_id: ORG.ROOT,
    cutoff,
    workdays,
    effective_from: from,
    created_by: SAMPLE_ACTOR,
    created_at: now(),
  };
  s.calendars.push(version);
  return { ok: true, data: structuredClone(version) };
}

export interface HolidayInput {
  from: string;
  to: string;
  name: string;
  org_id: string;
}

// Thay bằng POST /api/v1/shipping/calendars/holidays (dự kiến) khi core có.
export async function addHoliday(input: HolidayInput): Promise<SampleOutcome<Holiday>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const from = input.from.trim();
  const to = input.to.trim();
  if (!day.test(from)) errors.push(fieldError("from", from ? "date" : "required"));
  if (!day.test(to)) errors.push(fieldError("to", to ? "date" : "required"));
  else if (day.test(from) && to < from) errors.push(fieldError("to", "shipping.range_order"));
  const name = input.name.trim();
  if (!name) errors.push(fieldError("name", "required"));
  else if (name.length > 80) errors.push(fieldError("name", "too_long"));
  const { data: units } = await listUnits();
  if (input.org_id && !units.some((u) => u.id === input.org_id))
    errors.push(fieldError("org_id", "unknown"));
  if (errors.length > 0) return invalid(errors);
  // Ngày nghỉ chờ thông báo cùng tên thì thay bằng ngày thật.
  const waiting = s.holidays.find(
    (h) => h.status === "awaiting_notice" && fold(h.name) === fold(name),
  );
  if (waiting) {
    waiting.from = from;
    waiting.to = to;
    waiting.status = "confirmed";
    waiting.org_id = input.org_id || null;
    return { ok: true, data: structuredClone(waiting) };
  }
  const holiday: Holiday = {
    id: await newId("f5"),
    org_id: input.org_id || null,
    name,
    from,
    to,
    status: "confirmed",
  };
  s.holidays.push(holiday);
  return { ok: true, data: structuredClone(holiday) };
}

// ---------------------------------------------------------------- Phương thức, bảng phí, báo giá

export interface MethodRow extends ShippingMethod {
  org_name: string;
  /** Phương thức cùng mã ở nút cha mà phương thức này ghi đè (dự kiến, để màn nói "ghi đè"). */
  overrides: string | null;
  carrier_name: string | null;
  carrier_status: CarrierAccount["check_status"] | null;
  rate_count: number;
}

// Thay bằng GET /api/v1/shipping/methods (bước 44) khi core có. Theo thứ tự `position`, nút cha trước.
export async function listMethods(): Promise<{ data: MethodRow[] }> {
  const s = await store();
  const { data: units } = await listUnits();
  const depth = (id: string) => ancestorsOf(units, id).length;
  return {
    data: [...s.methods]
      .sort((a, b) => a.position - b.position || depth(a.org_id) - depth(b.org_id))
      .map((m) => {
        const chain = ancestorsOf(units, m.org_id).slice(1);
        const parent = s.methods.find((x) => x.code === m.code && chain.includes(x.org_id));
        const carrier = s.carriers.find((c) => c.id === m.carrier_account_id);
        return {
          ...structuredClone(m),
          org_name: units.find((u) => u.id === m.org_id)?.name ?? m.org_id,
          overrides: parent?.id ?? null,
          carrier_name: carrier?.name ?? null,
          carrier_status: carrier ? (carrier.active ? carrier.check_status : "error") : null,
          rate_count: s.rates.filter((r) => r.method_id === m.id).length,
        };
      }),
  };
}

// Thay bằng GET /api/v1/shipping/zones và GET /methods/{id} (mục `rates`) (bước 44).
export async function listRates(
  methodId: string,
): Promise<{ data: { rates: Rate[]; zones: Zone[] } } | null> {
  const s = await store();
  if (!s.methods.some((m) => m.id === methodId)) return null;
  return {
    data: {
      rates: structuredClone(s.rates.filter((r) => r.method_id === methodId)),
      zones: structuredClone(s.zones),
    },
  };
}

export interface PickupRow extends PickupPoint {
  org_name: string;
}

// Thay bằng GET /api/v1/shipping/methods/{id} (mục `pickup_points`) (bước 44).
export async function listPickupPoints(): Promise<{ data: PickupRow[] }> {
  const s = await store();
  const { data: units } = await listUnits();
  return {
    data: s.pickups.map((p) => ({
      ...p,
      org_name: units.find((u) => u.id === p.org_id)?.name ?? p.org_id,
    })),
  };
}

// Thay bằng PATCH /api/v1/shipping/methods/{id} `{active}` (bước 44). Trả trạng thái cũ cho Hoàn tác.
export async function setMethodActive(
  id: string,
  active: boolean,
): Promise<SampleOutcome<{ method: ShippingMethod; previous: boolean }>> {
  const s = await store();
  const m = s.methods.find((x) => x.id === id);
  if (!m) return fail(404, "shipping.method_not_found", "Method not found.");
  const previous = m.active;
  m.active = active;
  m.updated_at = now();
  return { ok: true, data: { method: structuredClone(m), previous } };
}

export interface NewMethod {
  name: string;
  code: string;
  kind: string;
  org_id: string;
  free_over: string;
  days: string;
  carrier_account_id: string;
}

// Thay bằng POST /api/v1/shipping/methods (bước 44). Mã trùng ở cùng nút → `shipping.method_code_taken`;
// cùng mã ở nút con là ghi đè (được phép).
export async function createMethod(input: NewMethod): Promise<SampleOutcome<ShippingMethod>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const name = input.name.trim();
  if (!name) errors.push(fieldError("name", "required"));
  else if (name.length > 60) errors.push(fieldError("name", "too_long"));
  const code = input.code.trim();
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(code))
    errors.push(fieldError("code", code ? "code_format" : "required"));
  else if (s.methods.some((m) => m.code === code && m.org_id === input.org_id))
    errors.push(fieldError("code", "shipping.method_code_taken", code));
  const kind: MethodKind | null =
    input.kind === "table_rate" || input.kind === "carrier" || input.kind === "pickup"
      ? input.kind
      : null;
  if (!kind) errors.push(fieldError("kind", "unknown"));
  const { data: units } = await listUnits();
  if (!units.some((u) => u.id === input.org_id)) errors.push(fieldError("org_id", "unknown"));
  const free = input.free_over.trim();
  if (free && !whole(free)) errors.push(fieldError("free_over", "money_minor"));
  const days = input.days.trim();
  const range = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/.exec(days);
  if (days && (!range || Number(range[1]) > Number(range[2])))
    errors.push(fieldError("days", "shipping.days_range"));
  if (kind === "carrier") {
    if (!s.carriers.some((c) => c.id === input.carrier_account_id))
      errors.push(fieldError("carrier_account_id", "unknown"));
  }
  if (errors.length > 0 || !kind) return invalid(errors);
  const method: ShippingMethod = {
    id: await newId("f2"),
    org_id: input.org_id,
    code,
    kind,
    names: { vi: name, en: name },
    // Phương thức mới tắt: chưa có bảng phí thì không báo giá.
    active: false,
    position: Math.max(0, ...s.methods.map((m) => m.position)) + 1,
    carrier_account_id: kind === "carrier" ? input.carrier_account_id : null,
    service_code: null,
    free_over: free ? vnd(Number(free)) : null,
    handling_fee: vnd(0),
    volumetric_divisor: 6000,
    default_item_weight_grams: 500,
    countries: ["VN"],
    estimated_min_days: range ? Number(range[1]) : null,
    estimated_max_days: range ? Number(range[2]) : null,
    cutoff: null,
    updated_at: now(),
  };
  s.methods.push(method);
  return { ok: true, data: structuredClone(method) };
}

/** Phí của một bậc cho cân `grams` (bậc chứa cân, cộng bước vượt); hàm thuần (test). */
export function rateFor(
  rates: readonly Rate[],
  zoneId: string,
  grams: number,
): { amount: number; rate: Rate } | null {
  const rate = rates.find(
    (r) =>
      r.zone_id === zoneId &&
      r.min_weight_grams <= grams &&
      (r.max_weight_grams === null || grams < r.max_weight_grams),
  );
  if (!rate) return null;
  const over = grams - rate.min_weight_grams;
  const steps =
    rate.step_grams && rate.step_amount && over > 0 ? Math.ceil(over / rate.step_grams) : 0;
  return {
    amount: Number(rate.amount.amount) + steps * Number(rate.step_amount?.amount ?? 0),
    rate,
  };
}

/** Vùng của một tỉnh: vùng ghi đúng tỉnh thắng vùng cả nước. */
export function zoneFor(zones: readonly Zone[], provinceCode: string): Zone | null {
  return (
    zones.find((z) => z.province_codes?.includes(provinceCode)) ??
    zones.find((z) => z.province_codes === null) ??
    null
  );
}

export interface ShippingOption {
  method_id: string;
  method_code: string;
  name: string;
  kind: MethodKind;
  amount: Money;
  free_shipping_applied: boolean;
  /** Dự kiến: còn thiếu bao nhiêu để được miễn phí (ngưỡng `free_over`). */
  free_shipping_missing: Money | null;
  carrier_code: string | null;
  pickup_org_id: string | null;
  pickup_name: string | null;
  chargeable_weight_grams: number;
  /** D-201: ngày giao dự kiến (giờ Việt Nam). */
  eta_from: string | null;
  eta_to: string | null;
  order_by: string | null;
  /** Nhận tại cửa hàng: giờ sẵn sàng. */
  ready_at: string | null;
  hold_days: number | null;
}

export interface Quote {
  options: ShippingOption[];
  unavailable: { method_code: string; name: string; reason_code: string }[];
}

export interface QuoteInput {
  org_id: string;
  province_code: string;
  weight_grams: string;
  order_value: string;
}

// Thay bằng POST /api/v1/shipping/quote (bước 44) với thân `QuoteRequest`. Phương thức kế thừa theo
// cây (nút gần ghi đè cùng mã), rẻ trước; hãng lỗi thì phương thức đó vào `unavailable`, không làm
// hỏng cả báo giá.
export async function quote(input: QuoteInput, locale = "vi"): Promise<SampleOutcome<Quote>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const { data: units } = await listUnits();
  const org = units.find((u) => u.id === input.org_id && u.unit_type === "store");
  if (!org) errors.push(fieldError("org_id", "unknown"));
  const province = SAMPLE_PROVINCES.find((p) => p.code === input.province_code);
  if (!province) errors.push(fieldError("province_code", "unknown"));
  const grams = input.weight_grams.trim();
  if (!whole(grams) || Number(grams) <= 0)
    errors.push(fieldError("weight_grams", grams ? "whole_number" : "required"));
  const value = input.order_value.trim();
  if (!whole(value)) errors.push(fieldError("order_value", value ? "money_minor" : "required"));
  if (errors.length > 0 || !org || !province) return invalid(errors);
  const chain = ancestorsOf(units, org.id);
  // Nút gần nhất thắng với cùng mã.
  const chosen = new Map<string, ShippingMethod>();
  for (const id of chain) {
    for (const m of s.methods.filter((x) => x.org_id === id)) {
      if (!chosen.has(m.code)) chosen.set(m.code, m);
    }
  }
  const nowAt = Date.now();
  const version = calendarAt(s.calendars, vnDate(nowAt)) ?? { ...BASE_CALENDAR };
  const calendar = toCalendar(version, s.holidays, org.id);
  const options: ShippingOption[] = [];
  const unavailable: Quote["unavailable"] = [];
  const weight = Number(grams);
  const orderValue = Number(value);
  for (const m of [...chosen.values()].sort((a, b) => a.position - b.position)) {
    const name = m.names[locale] ?? m.names.vi ?? m.code;
    if (!m.active) continue;
    const empty = {
      method_id: m.id,
      method_code: m.code,
      name,
      kind: m.kind,
      free_shipping_applied: false,
      free_shipping_missing: null,
      carrier_code: null,
      pickup_org_id: null,
      pickup_name: null,
      chargeable_weight_grams: weight,
      eta_from: null,
      eta_to: null,
      order_by: null,
      ready_at: null,
      hold_days: null,
    };
    if (m.kind === "pickup") {
      const point = s.pickups.find((p) => p.method_id === m.id && p.org_id === org.id);
      if (!point) {
        unavailable.push({ method_code: m.code, name, reason_code: "shipping.no_pickup_point" });
        continue;
      }
      options.push({
        ...empty,
        amount: vnd(0),
        pickup_org_id: org.id,
        pickup_name: org.name,
        ready_at: new Date(nowAt + point.prep_hours * HOUR).toISOString(),
        hold_days: point.hold_days,
      });
      continue;
    }
    let amount: number;
    if (m.kind === "carrier") {
      const carrier = s.carriers.find((c) => c.id === m.carrier_account_id);
      if (!carrier?.active || carrier.check_status === "error") {
        unavailable.push({
          method_code: m.code,
          name,
          reason_code: "shipping.carrier_unavailable",
        });
        continue;
      }
      // Giá do hãng báo (mẫu: theo bảng của Trụ sở) cộng phí xử lý.
      const zone = zoneFor(s.zones, province.code);
      const base = zone
        ? rateFor(
            s.rates.filter((r) => r.method_id === METHOD_ID.standard),
            zone.id,
            weight,
          )
        : null;
      if (!base) {
        unavailable.push({ method_code: m.code, name, reason_code: "shipping.no_method" });
        continue;
      }
      if (m.service_code === "2h" && province.code !== "79") {
        unavailable.push({ method_code: m.code, name, reason_code: "shipping.outside_area" });
        continue;
      }
      amount = base.amount + Number(m.handling_fee.amount);
    } else {
      const zone = zoneFor(
        s.zones.filter((z) => chain.includes(z.org_id)),
        province.code,
      );
      const found = zone
        ? rateFor(
            s.rates.filter((r) => r.method_id === m.id),
            zone.id,
            weight,
          )
        : null;
      if (!found) {
        unavailable.push({
          method_code: m.code,
          name,
          reason_code: "shipping.weight_out_of_range",
        });
        continue;
      }
      amount = found.amount;
    }
    const freeOver = m.free_over ? Number(m.free_over.amount) : null;
    const free = freeOver !== null && orderValue >= freeOver;
    const cutoff = m.cutoff ? { ...calendar, cutoff: m.cutoff } : calendar;
    const eta =
      m.estimated_min_days !== null && m.estimated_max_days !== null
        ? etaFor(nowAt, cutoff, m.estimated_min_days, m.estimated_max_days)
        : null;
    options.push({
      ...empty,
      amount: vnd(free ? 0 : amount),
      free_shipping_applied: free,
      free_shipping_missing: freeOver !== null && !free ? vnd(freeOver - orderValue) : null,
      carrier_code: s.carriers.find((c) => c.id === m.carrier_account_id)?.carrier_code ?? null,
      eta_from: eta?.eta_from ?? null,
      eta_to: eta?.eta_to ?? null,
      order_by: eta?.order_by ?? null,
    });
  }
  options.sort((a, b) => Number(a.amount.amount) - Number(b.amount.amount));
  return { ok: true, data: { options, unavailable } };
}

// ---------------------------------------------------------------- Vận đơn

export interface ShipmentRow extends Shipment {
  origin_name: string;
  method_name: string;
  carrier_name: string | null;
  tracking_numbers: string[];
  chargeable_weight_grams: number;
  volumetric_grams: number;
}

export interface ShipmentQuery {
  status?: ShipmentStatus;
  q?: string;
  locale?: string;
  limit?: number;
  cursor?: string | null;
}

async function toRow(
  s: Store,
  x: Shipment,
  units: readonly OrgUnit[],
  locale: string,
): Promise<ShipmentRow> {
  const method = s.methods.find((m) => m.id === x.method_id);
  const weight = chargeableWeight(x.parcels, method?.volumetric_divisor ?? 6000);
  return {
    ...structuredClone(x),
    origin_name: units.find((u) => u.id === x.origin_org_id)?.name ?? x.origin_org_id,
    method_name: method ? (method.names[locale] ?? method.names.vi ?? method.code) : "",
    carrier_name: s.carriers.find((c) => c.id === x.carrier_account_id)?.name ?? null,
    tracking_numbers: x.parcels.map((p) => p.tracking_number).filter((t): t is string => !!t),
    chargeable_weight_grams: weight.chargeable,
    volumetric_grams: weight.volumetric,
  };
}

// Thay bằng GET /api/v1/shipping/shipments?order_id&status&org_id&tracking (bước 44). Mới đổi trạng
// thái trước. Tìm theo mã đơn hay mã vận đơn (không dấu, bỏ khoảng trắng).
export async function listShipments(query: ShipmentQuery = {}): Promise<SamplePage<ShipmentRow>> {
  const s = await store();
  const { data: units } = await listUnits();
  const q = fold(query.q ?? "").replace(/\s+/g, "");
  const rows = s.shipments
    .filter((x) => !query.status || x.status === query.status)
    .filter(
      (x) =>
        !q ||
        fold(x.order_number).includes(q) ||
        x.parcels.some((p) =>
          fold(p.tracking_number ?? "")
            .replace(/\s+/g, "")
            .includes(q),
        ),
    )
    .sort((a, b) => b.status_at.localeCompare(a.status_at) || a.id.localeCompare(b.id));
  const limit = query.limit ?? 25;
  const start = query.cursor ? rows.findIndex((r) => r.id === query.cursor) + 1 : 0;
  const page = rows.slice(start, start + limit);
  return {
    data: await Promise.all(page.map((x) => toRow(s, x, units, query.locale ?? "vi"))),
    pagination: {
      limit,
      next_cursor: start + limit < rows.length ? (page.at(-1)?.id ?? null) : null,
    },
  };
}

/** Số vận đơn theo trạng thái (dự kiến; core chưa có endpoint đếm). */
export async function shipmentCounts(): Promise<Record<ShipmentStatus, number>> {
  const s = await store();
  const out = {} as Record<ShipmentStatus, number>;
  for (const x of s.shipments) out[x.status] = (out[x.status] ?? 0) + 1;
  return out;
}

// Thay bằng GET /api/v1/shipping/shipments/{id} (bước 44): kèm kiện, món, lịch sử trạng thái.
export async function getShipment(
  id: string,
  locale = "vi",
): Promise<{ data: ShipmentRow } | null> {
  const s = await store();
  const x = s.shipments.find((y) => y.id === id);
  if (!x) return null;
  const { data: units } = await listUnits();
  return { data: await toRow(s, x, units, locale) };
}

type ShipmentMove = "book" | "cancel" | "redeliver" | "return" | "receive_return" | "hand_over";

const SHIPMENT_MOVES: Record<ShipmentMove, { from: ShipmentStatus[]; to: ShipmentStatus }> = {
  book: { from: ["pending"], to: "ready_to_ship" },
  cancel: { from: ["pending", "booking", "ready_to_ship", "ready_for_pickup"], to: "cancelled" },
  redeliver: { from: ["delivery_failed"], to: "out_for_delivery" },
  return: { from: ["delivery_failed"], to: "returning" },
  receive_return: { from: ["returning"], to: "returned" },
  hand_over: { from: ["ready_for_pickup"], to: "picked_up_by_buyer" },
};

function pushEvent(
  x: Shipment,
  status: ShipmentStatus,
  source: TrackingEvent["source"],
  carrierStatus: string,
) {
  const at = now();
  x.events.push({
    id: `${x.id}-${x.events.length}`,
    source,
    event_key: `${source}-${x.events.length}-${at}`,
    status,
    carrier_status: carrierStatus,
    occurred_at: at,
    note: "",
  });
  x.status = status;
  x.status_at = at;
  x.updated_at = at;
}

// Thay bằng POST /api/v1/shipping/shipments/{id}/book | cancel (bước 44) và POST …/status (cập nhật
// tay: giao lại, hoàn hàng, nhận hàng hoàn, bàn giao tại quầy). Đặt hãng gọi hãng NGOÀI transaction;
// mẫu cấp mã vận đơn ngay. Huỷ sau khi hãng đã lấy hàng → `shipping.cancel_too_late`.
export async function changeShipment(
  id: string,
  move: ShipmentMove,
): Promise<SampleOutcome<Shipment>> {
  const s = await store();
  const x = s.shipments.find((y) => y.id === id);
  if (!x) return fail(404, "shipping.shipment_not_found", "Shipment not found.");
  const rule = SHIPMENT_MOVES[move];
  if (!rule) return fail(409, "shipping.invalid_transition", move);
  if (move === "cancel" && ["picked_up", "in_transit", "out_for_delivery"].includes(x.status)) {
    return fail(409, "shipping.cancel_too_late", "The carrier already picked up the parcel.");
  }
  if (!rule.from.includes(x.status)) {
    return fail(409, "shipping.invalid_transition", `${x.status}→${rule.to}`, [
      fieldError("status", "shipping.invalid_transition", `${x.status}→${rule.to}`),
    ]);
  }
  if (move === "book") {
    const carrier = s.carriers.find((c) => c.id === x.carrier_account_id);
    if (!carrier) return fail(422, "shipping.carrier_unknown", "No carrier for this method.");
    if (!carrier.active || carrier.check_status === "error") {
      return fail(502, "shipping.carrier_error", carrier.last_error ?? "carrier_error");
    }
    for (const p of x.parcels) {
      s.tracking += 1;
      p.tracking_number ??= `${carrier.carrier_code === "hh" ? "HH-55" : "GN-8813"} ${String(s.tracking).padStart(4, "0")}`;
    }
  }
  if (move === "redeliver") x.attempts = Math.min(x.max_attempts, x.attempts);
  if (move === "return" || move === "cancel") {
    if (x.cod_status === "pending") x.cod_status = "none";
  }
  pushEvent(x, rule.to, "staff", move);
  return { ok: true, data: structuredClone(x) };
}

// Thay bằng việc hỏi hãng qua `ShippingCarrier::track` (job `shipping.poll_tracking`, bước 44); core
// chưa có endpoint hỏi lại theo yêu cầu (dự kiến `POST /shipments/{id}/track`). Hãng xác nhận đã giao
// thì vận đơn sang "Đã giao", COD thành "đã thu" và dòng lệch của bảng kê (nếu có) tự khớp.
export async function trackShipment(id: string): Promise<SampleOutcome<{ changed: boolean }>> {
  const s = await store();
  const x = s.shipments.find((y) => y.id === id);
  if (!x) return fail(404, "shipping.shipment_not_found", "Shipment not found.");
  const line = s.statements
    .flatMap((st) => st.lines.map((l) => ({ st, l })))
    .find(({ l }) => l.shipment_id === x.id && l.match === "not_delivered");
  if (!line) return { ok: true, data: { changed: false } };
  pushEvent(x, "delivered", "carrier", "delivered_cod_collected");
  x.cod_status = "settled";
  line.l.match = "matched";
  for (const d of s.discrepancies.filter(
    (d) => d.statement_line_id === line.l.id && d.status === "open",
  )) {
    d.status = "resolved";
    d.resolution_note = "carrier_confirmed_delivery";
    d.resolved_by = SAMPLE_ACTOR;
    d.resolved_at = now();
  }
  if (line.st.lines.every((l) => l.match === "matched")) line.st.status = "reconciled";
  return { ok: true, data: { changed: true } };
}

// Thay bằng PUT /api/v1/shipping/shipments/{id}/parcels (bước 44). Chỉ khi chưa đặt hãng. Cân mỗi
// kiện là số nguyên gram, cách nhau bằng dấu phẩy.
export async function splitParcels(id: string, weights: string): Promise<SampleOutcome<Shipment>> {
  const s = await store();
  const x = s.shipments.find((y) => y.id === id);
  if (!x) return fail(404, "shipping.shipment_not_found", "Shipment not found.");
  if (x.status !== "pending") return fail(409, "shipping.already_booked", "Already booked.");
  const parts = weights
    .split(/[,;\s]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const errors: NonNullable<Problem["errors"]> = [];
  if (parts.length < 2 || parts.length > 10)
    errors.push(fieldError("weights", "shipping.parcel_count"));
  const bad = parts.filter((p) => !whole(p) || Number(p) <= 0);
  if (bad.length > 0) errors.push(fieldError("weights", "shipping.parcel_weight", bad.join(", ")));
  if (errors.length > 0) return invalid(errors);
  x.parcels = parts.map((w, i) => ({
    id: `${x.id}-p${i}`,
    position: i,
    weight_grams: Number(w),
    length_mm: null,
    width_mm: null,
    height_mm: null,
    tracking_number: null,
  }));
  for (const item of x.items) item.parcel_id = null;
  x.updated_at = now();
  return { ok: true, data: structuredClone(x) };
}

export interface NewShipment {
  order_number: string;
  origin_org_id: string;
  method_id: string;
  recipient_name: string;
  recipient_phone: string;
  province_code: string;
  address_line: string;
  cod: string;
  weight_grams: string;
}

// Thay bằng POST /api/v1/shipping/shipments (bước 44) với thân `ShipmentRequest`: vận đơn tay cho
// đơn bán tại quầy giao sau. Một đơn nhiều lần giao thì mỗi lần một `request_key` khác.
export async function createShipment(input: NewShipment): Promise<SampleOutcome<Shipment>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const number = input.order_number.trim().toUpperCase();
  if (!number) errors.push(fieldError("order_number", "required"));
  else if (!ORDER_NUMBER_PATTERN.test(number))
    errors.push(fieldError("order_number", "shipping.order_number_format"));
  const { data: units } = await listUnits();
  const origin = units.find(
    (u) => u.id === input.origin_org_id && (u.unit_type === "store" || u.unit_type === "warehouse"),
  );
  if (!origin) errors.push(fieldError("origin_org_id", "unknown"));
  const method = s.methods.find((m) => m.id === input.method_id && m.active);
  if (!method) errors.push(fieldError("method_id", "unknown"));
  const name = input.recipient_name.trim();
  if (!name) errors.push(fieldError("recipient_name", "required"));
  const phone = input.recipient_phone.replace(/[\s.]/g, "");
  if (!phone) errors.push(fieldError("recipient_phone", "required"));
  else if (!/^0\d{9}$/.test(phone)) errors.push(fieldError("recipient_phone", "phone"));
  const province = SAMPLE_PROVINCES.find((p) => p.code === input.province_code);
  if (!province) errors.push(fieldError("province_code", "unknown"));
  const line = input.address_line.trim();
  if (!line) errors.push(fieldError("address_line", "required"));
  const cod = input.cod.trim();
  if (cod && !whole(cod)) errors.push(fieldError("cod", "money_minor"));
  const grams = input.weight_grams.trim();
  if (!whole(grams) || Number(grams) <= 0)
    errors.push(fieldError("weight_grams", grams ? "whole_number" : "required"));
  if (errors.length > 0 || !origin || !method || !province) return invalid(errors);
  const existing = s.shipments.filter((x) => x.order_number === number);
  const requestKey = existing.length === 0 ? "main" : `part-${existing.length + 1}`;
  const version = calendarAt(s.calendars, vnDate(Date.now())) ?? { ...BASE_CALENDAR };
  const eta =
    method.estimated_min_days !== null && method.estimated_max_days !== null
      ? etaFor(
          Date.now(),
          toCalendar(version, s.holidays, origin.id),
          method.estimated_min_days,
          method.estimated_max_days,
        )
      : null;
  const id = await newId("f6");
  const created = now();
  // Phường / xã nằm cùng ô địa chỉ (chưa có danh mục đơn vị hành chính của bước 34).
  const [commune, ...rest] = line.split(",").map((p) => p.trim());
  const shipment: Shipment = {
    id,
    org_id: orderByNumber(number)?.org_id ?? origin.id,
    origin_org_id: origin.id,
    order_id: orderByNumber(number)?.id ?? id,
    order_number: number,
    request_key: requestKey,
    direction: "outbound",
    method_id: method.id,
    carrier_account_id:
      method.kind === "pickup" ? null : (method.carrier_account_id ?? CARRIER_ID.gnsg),
    carrier_code:
      method.kind === "pickup"
        ? null
        : (s.carriers.find((c) => c.id === (method.carrier_account_id ?? CARRIER_ID.gnsg))
            ?.carrier_code ?? null),
    service_code: method.service_code,
    status: method.kind === "pickup" ? "ready_for_pickup" : "pending",
    status_at: created,
    recipient_name: name,
    recipient_phone: phone,
    address: {
      country: "VN",
      province_code: province.code,
      province_name: province.name,
      commune_name: commune ?? "",
      line: rest.join(", "),
    },
    declared_value: vnd(cod ? Number(cod) : 0),
    cod: cod && Number(cod) > 0 ? vnd(Number(cod)) : null,
    quoted_fee: null,
    actual_fee: null,
    cod_status: cod && Number(cod) > 0 ? "pending" : "none",
    attempts: 0,
    max_attempts: 3,
    eta_from: eta?.eta_from ?? null,
    eta_to: eta?.eta_to ?? null,
    parcels: [
      {
        id: `${id}-p0`,
        position: 0,
        weight_grams: Number(grams),
        length_mm: null,
        width_mm: null,
        height_mm: null,
        tracking_number: null,
      },
    ],
    items: [],
    events: [
      {
        id: `${id}-e0`,
        source: "staff",
        event_key: "created",
        status: method.kind === "pickup" ? "ready_for_pickup" : "pending",
        carrier_status: "created_manually",
        occurred_at: created,
        note: "",
      },
    ],
    created_at: created,
    updated_at: created,
  };
  s.shipments.push(shipment);
  return { ok: true, data: structuredClone(shipment) };
}

/** Phương thức đang bật (cho ô chọn của vận đơn tay). */
export async function activeMethods(locale = "vi"): Promise<{ id: string; label: string }[]> {
  const { data } = await listMethods();
  return data
    .filter((m) => m.active)
    .map((m) => ({ id: m.id, label: `${m.names[locale] ?? m.names.vi} · ${m.org_name}` }));
}

// ---------------------------------------------------------------- Đối soát COD

/** Số liệu đầu tab COD (dự kiến). */
export async function codStats(): Promise<{
  data: { receivable: Money; open_mismatch: Money; open_count: number; overdue: number };
}> {
  const s = await store();
  const receivable = s.shipments
    .filter((x) => x.cod && x.status === "delivered" && x.cod_status === "collected")
    .reduce((sum, x) => sum + Number(x.cod?.amount ?? 0), 0);
  const open = s.discrepancies.filter((d) => d.status === "open");
  const overdueBefore = Date.now() - 14 * DAY;
  const overdue = s.shipments.filter(
    (x) => x.cod_status === "collected" && Date.parse(x.status_at) < overdueBefore,
  ).length;
  return {
    data: {
      receivable: vnd(receivable),
      open_mismatch: vnd(
        open.reduce((sum, d) => sum + Number(d.reported.amount) - Number(d.reported_fee.amount), 0),
      ),
      open_count: open.length,
      overdue,
    },
  };
}

// Thay bằng GET /api/v1/shipping/cod/statements (bước 44). Mới nhập trước.
export async function listStatements(
  query: { status?: StatementStatus } = {},
): Promise<{ data: CodStatement[] }> {
  const s = await store();
  return {
    data: structuredClone(
      s.statements
        .filter((x) => !query.status || x.status === query.status)
        .sort((a, b) => b.imported_at.localeCompare(a.imported_at)),
    ),
  };
}

// Thay bằng GET /api/v1/shipping/cod/discrepancies (bước 44). Chưa xử lý trước.
export async function listDiscrepancies(
  query: { status?: "open" | "resolved" } = {},
): Promise<{ data: CodDiscrepancy[] }> {
  const s = await store();
  return {
    data: structuredClone(
      s.discrepancies
        .filter((d) => !query.status || d.status === query.status)
        .sort((a, b) =>
          a.status === b.status ? a.id.localeCompare(b.id) : a.status === "open" ? -1 : 1,
        ),
    ),
  };
}

// Thay bằng POST /api/v1/shipping/cod/discrepancies/{id}/resolve (bước 44): đóng kèm lý do; lý do lưu
// cùng người xử lý. Không đảo được.
export async function resolveDiscrepancy(
  id: string,
  note: string,
): Promise<SampleOutcome<CodDiscrepancy>> {
  const s = await store();
  const d = s.discrepancies.find((x) => x.id === id);
  if (!d) return fail(404, "shipping.discrepancy_not_found", "Discrepancy not found.");
  if (d.status !== "open") return fail(409, "shipping.discrepancy_resolved", "Already resolved.");
  if (note.trim().length < 5) return invalid([fieldError("note", "shipping.note_too_short")]);
  d.status = "resolved";
  d.resolution_note = note.trim();
  d.resolved_by = SAMPLE_ACTOR;
  d.resolved_at = now();
  return { ok: true, data: structuredClone(d) };
}

export interface StatementInput {
  carrier_account_id: string;
  reference: string;
  csv: string;
}

// Thay bằng POST /api/v1/shipping/cod/statements (bước 44): đọc CSV định dạng chung, khớp theo mã vận
// đơn, sinh chênh lệch. Nhập lại cùng mã bảng kê và cùng nội dung → trả bản cũ (`replayed`); khác nội
// dung → `shipping.statement_duplicate`.
export async function importStatement(
  input: StatementInput,
): Promise<SampleOutcome<{ statement: CodStatement; replayed: boolean }>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const carrier = s.carriers.find((c) => c.id === input.carrier_account_id);
  if (!carrier) errors.push(fieldError("carrier_account_id", "unknown"));
  const reference = input.reference.trim().toUpperCase();
  if (!reference) errors.push(fieldError("reference", "required"));
  else if (!/^[A-Z0-9][A-Z0-9-]{2,40}$/.test(reference))
    errors.push(fieldError("reference", "reference_format"));
  const parsed = parseStatement(input.csv);
  if (!input.csv.trim()) errors.push(fieldError("csv", "required"));
  else if (parsed.missing.length > 0)
    errors.push(fieldError("csv", "missing_column", parsed.missing.join(", ")));
  else if (parsed.bad.length > 0)
    errors.push(fieldError("csv", "shipping.statement_bad_rows", parsed.bad.join(", ")));
  else if (parsed.rows.length === 0) errors.push(fieldError("csv", "required"));
  if (errors.length > 0 || !carrier) return invalid(errors);
  const signature = JSON.stringify(parsed.rows);
  const same = s.statements.find(
    (x) => x.carrier_account_id === carrier.id && x.statement_reference === reference,
  );
  if (same) {
    const old = JSON.stringify(
      same.lines.map((l) => ({
        tracking_number: l.tracking_number,
        cod: Number(l.cod.amount),
        fee: Number(l.fee.amount),
      })),
    );
    if (old === signature)
      return { ok: true, data: { statement: structuredClone(same), replayed: true } };
    return invalid([fieldError("reference", "shipping.statement_duplicate", reference)]);
  }
  const statementId = await newId("fa");
  const lines: CodStatementLine[] = [];
  const created: CodDiscrepancy[] = [];
  for (const row of parsed.rows) {
    const x = s.shipments.find((y) =>
      y.parcels.some(
        (p) =>
          (p.tracking_number ?? "").replace(/\s+/g, "") === row.tracking_number.replace(/\s+/g, ""),
      ),
    );
    let match: LineMatch = "matched";
    if (!x) match = "unknown_tracking";
    else if (x.status !== "delivered") match = "not_delivered";
    else if (!x.cod || Number(x.cod.amount) !== row.cod) match = "amount_mismatch";
    const line: CodStatementLine = {
      id: await newId("f9"),
      tracking_number: row.tracking_number,
      cod: vnd(row.cod),
      fee: vnd(row.fee),
      shipment_id: x?.id ?? null,
      order_number: x?.order_number ?? null,
      match,
    };
    lines.push(line);
    if (match === "matched" && x) x.cod_status = "settled";
    else {
      created.push({
        id: await newId("fb"),
        statement_line_id: line.id,
        statement_reference: reference,
        shipment_id: x?.id ?? null,
        tracking_number: row.tracking_number,
        order_number: x?.order_number ?? null,
        kind: match === "matched" ? "amount_mismatch" : match,
        expected: vnd(match === "amount_mismatch" && x?.cod ? Number(x.cod.amount) : 0),
        reported: vnd(row.cod),
        reported_fee: vnd(row.fee),
        status: "open",
        resolution_note: "",
        resolved_by: null,
        resolved_at: null,
      });
      if (x && match === "amount_mismatch") x.cod_status = "mismatch";
    }
  }
  const cod = lines.reduce((sum, l) => sum + Number(l.cod.amount), 0);
  const fee = lines.reduce((sum, l) => sum + Number(l.fee.amount), 0);
  const today = vnDate(Date.now());
  const statement: CodStatement = {
    id: statementId,
    carrier_account_id: carrier.id,
    carrier_name: carrier.name,
    statement_reference: reference,
    period_from: vnDate(Date.now() - 7 * DAY),
    period_to: today,
    total_cod: vnd(cod),
    total_fee: vnd(fee),
    net_paid: vnd(cod - fee),
    status: created.length > 0 ? "has_mismatch" : "reconciled",
    payee: "merchant",
    imported_by: SAMPLE_ACTOR,
    imported_at: now(),
    lines,
  };
  s.statements.push(statement);
  s.discrepancies.push(...created);
  return { ok: true, data: { statement: structuredClone(statement), replayed: false } };
}

// ---------------------------------------------------------------- Hãng vận chuyển

export interface CarrierRow extends CarrierAccount {
  org_name: string;
  method_count: number;
}

// Thay bằng GET /api/v1/shipping/carrier-accounts (bước 44). Không bao giờ có khoá API trong kết quả.
export async function listCarrierAccounts(): Promise<{ data: CarrierRow[] }> {
  const s = await store();
  const { data: units } = await listUnits();
  return {
    data: s.carriers.map((c) => ({
      ...structuredClone(c),
      org_name: units.find((u) => u.id === c.org_id)?.name ?? c.org_id,
      method_count: s.methods.filter((m) => m.carrier_account_id === c.id).length,
    })),
  };
}

// Thay bằng POST /api/v1/shipping/carrier-accounts/{id}/test (bước 44). Lỗi của hãng trả 502
// `shipping.carrier_error`, không làm hỏng màn.
export async function testCarrierAccount(id: string): Promise<SampleOutcome<CarrierAccount>> {
  const s = await store();
  const c = s.carriers.find((x) => x.id === id);
  if (!c) return fail(404, "shipping.carrier_account_not_found", "Carrier account not found.");
  c.checked_at = now();
  if (c.last_error) {
    c.check_status = "error";
    return fail(502, "shipping.carrier_error", c.last_error);
  }
  c.check_status = "ok";
  return { ok: true, data: structuredClone(c) };
}

// Thay bằng PATCH /api/v1/shipping/carrier-accounts/{id} `{active}` (bước 44). Trả trạng thái cũ cho
// Hoàn tác. Tắt thì vận đơn đang đi vẫn nhận cập nhật.
export async function setCarrierActive(
  id: string,
  active: boolean,
): Promise<SampleOutcome<{ previous: boolean }>> {
  const s = await store();
  const c = s.carriers.find((x) => x.id === id);
  if (!c) return fail(404, "shipping.carrier_account_not_found", "Carrier account not found.");
  const previous = c.active;
  c.active = active;
  return { ok: true, data: { previous } };
}

// Thay bằng PATCH /api/v1/shipping/carrier-accounts/{id} `{credentials}` (bước 44): khoá ghi vào kho
// secret theo khách (bước 33), không bao giờ trả lại. Mẫu không lưu khoá — chỉ ghi lúc đặt.
export async function replaceCarrierKey(
  id: string,
  key: string,
): Promise<SampleOutcome<CarrierAccount>> {
  const s = await store();
  const c = s.carriers.find((x) => x.id === id);
  if (!c) return fail(404, "shipping.carrier_account_not_found", "Carrier account not found.");
  if (key.trim().length < 16) return invalid([fieldError("key", "shipping.key_too_short")]);
  c.secret_set_at = now();
  c.last_error = null;
  c.check_status = "ok";
  c.checked_at = now();
  return { ok: true, data: structuredClone(c) };
}

export interface NewCarrier {
  carrier_code: string;
  name: string;
  key: string;
  sandbox: boolean;
  org_id: string;
}

// Thay bằng POST /api/v1/shipping/carrier-accounts (bước 44). Chỉ hãng đã cài bộ nối.
export async function createCarrierAccount(
  input: NewCarrier,
): Promise<SampleOutcome<CarrierAccount>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  if (!CARRIER_CODES[input.carrier_code])
    errors.push(fieldError("carrier_code", "shipping.carrier_unknown", input.carrier_code));
  const name = input.name.trim();
  if (!name) errors.push(fieldError("name", "required"));
  else if (s.carriers.some((c) => fold(c.name) === fold(name)))
    errors.push(fieldError("name", "shipping.carrier_name_taken"));
  if (input.key.trim().length < 16) errors.push(fieldError("key", "shipping.key_too_short"));
  const { data: units } = await listUnits();
  if (!units.some((u) => u.id === input.org_id)) errors.push(fieldError("org_id", "unknown"));
  if (errors.length > 0) return invalid(errors);
  const account: CarrierAccount = {
    id: await newId("f1"),
    org_id: input.org_id,
    carrier_code: input.carrier_code,
    name,
    sandbox: input.sandbox,
    active: true,
    capabilities: {
      multi_parcel: false,
      cod: true,
      label: true,
      cancel: true,
      statement_api: false,
      webhook: true,
    },
    check_status: "ok",
    checked_at: now(),
    last_error: null,
    last_event_at: null,
    secret_set_at: now(),
  };
  s.carriers.push(account);
  return { ok: true, data: structuredClone(account) };
}

/** Kho và cửa hàng (nơi gửi của vận đơn). */
export async function originOptions(): Promise<OrgUnit[]> {
  const { data } = await listUnits();
  return data.filter((u) => u.unit_type === "store" || u.unit_type === "warehouse");
}
