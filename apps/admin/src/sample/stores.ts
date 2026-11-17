// Dữ liệu mẫu của màn "Cửa hàng" (vận hành tại quầy, bản thiết kế StoreOps): ca thu ngân, bán tại quầy,
// đánh giá sản phẩm. Cùng module `orders` của core (bước 45, chưa có): đặc tả `docs/steps/45-orders.md`
// (bảng `orders_pos_shifts`, `orders_pos_sales`, `orders_reviews`, `orders_review_stats`; API `/pos/…`,
// `/reviews`). Đơn tại quầy, đơn nhận tại cửa hàng, đổi trả dùng chung kho của `sample/orders.ts`.
//
// Tiền mặt là tiền của cửa hàng, nằm trong két và ghi vào tài khoản "tiền mặt tại quầy" của từng cửa
// hàng; hệ thống chỉ ghi nhận (D-187 của core). Đánh giá theo Luật Bảo vệ quyền lợi người tiêu dùng
// 19/2023: không ẩn vì nội dung chê; chỉ ẩn với lý do trong danh sách cho phép, ghi người ẩn, báo người
// viết — cần đối chiếu văn bản gốc. Tóm tắt bằng AI chỉ là bản nháp, người duyệt rồi mới hiện (D-109).
import type { Problem } from "@autoxide/sdk";
import { type SortDir, sortRows } from "@/lib/table";
import {
  allVariants,
  listCategories,
  type Money,
  ORG,
  PRODUCT_ID,
  pricesAt,
  type Ref,
} from "./catalog";
import { listLevels } from "./inventory";
import {
  num,
  type Order,
  ordersState,
  type PaymentMethod,
  placePosOrder,
  posLines,
  SAMPLE_ACTOR,
  shiftIdFor,
  vnd,
} from "./orders";
import { listUnits } from "./org";
import { listTaxRates, rateOn, vietnamDay } from "./tax";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

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
      title: detail,
      status,
      code,
      detail,
      ...(errors ? { errors } : {}),
    },
  };
}
function invalid(errors: NonNullable<Problem["errors"]>): SampleOutcome<never> {
  return fail(422, "validation_failed", "The request has invalid fields.", errors);
}
function fieldError(field: string, code: string, detail = code) {
  return { field, code, detail };
}

const PHAN_THU: Ref = { id: "01a1e000-0000-7000-8000-000000000f21", name: "Phan Thu" };
const LE_HOANG: Ref = { id: "01a1e000-0000-7000-8000-000000000f22", name: "Lê Hoàng" };
const DINH_QUANG: Ref = { id: "01a1e000-0000-7000-8000-000000000f23", name: "Đinh Quang" };
const LAN: Ref = { id: "01a1e000-0000-7000-8000-000000000f12", name: "Lan Phạm" };

/** Thu ngân và tiền đầu ca mặc định của từng cửa hàng (mẫu). */
const REGISTERS: Record<string, { cashier: Ref; opening: number }> = {
  [ORG.Q3]: { cashier: PHAN_THU, opening: 2_000_000 },
  [ORG.TD]: { cashier: LE_HOANG, opening: 2_000_000 },
  [ORG.CG]: { cashier: DINH_QUANG, opening: 1_500_000 },
};

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 45

export interface Shift {
  id: string;
  org_id: string;
  org_name: string;
  register_code: string;
  opened_by: Ref;
  opened_at: string;
  opening_cash: Money;
  closed_by: Ref | null;
  closed_at: string | null;
  /** Tiền mặt dự kiến = đầu ca + tiền mặt thu trong ca − tiền mặt hoàn trong ca. */
  expected_cash: Money;
  counted_cash: Money | null;
  difference: Money | null;
  /** Dự kiến (`docs/prompts/ui-phase2-api.md`): lý do chênh lệch, bắt buộc khi lệch. */
  difference_reason: string | null;
  status: "open" | "closed";
  cash_sales: Money;
  cash_refunds: Money;
  /** Đơn tại quầy trong ca (mọi cách trả). */
  order_numbers: string[];
  cash_order_numbers: string[];
}

export const HIDE_REASONS = ["contact_info", "advertising", "abusive", "off_topic"] as const;
export type HideReason = (typeof HIDE_REASONS)[number];

export interface Review {
  id: string;
  org_id: string;
  order_id: string;
  order_number: string;
  product_id: string;
  product_name: string;
  author_name: string;
  /** Người bán trên sàn (bước 46): người bán trả lời ở trung tâm người bán, sàn chỉ kiểm duyệt. */
  seller_name: string | null;
  rating: number;
  body: string;
  media_count: number;
  status: "published" | "hidden";
  /** Dự kiến: nhân viên đã xem (đếm "đánh giá mới"). */
  seen: boolean;
  /** Dự kiến: phát hiện tự động (số điện thoại, đường link) — chỉ gợi ý, không tự ẩn. */
  flags: ("contact_info" | "link")[];
  hidden_reason: HideReason | null;
  hidden_note: string | null;
  hidden_by: Ref | null;
  hidden_at: string | null;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface ReviewSummaryDraft {
  id: string;
  product_id: string;
  product_name: string;
  source_count: number;
  text: string;
  status: "draft" | "live" | "dropped";
  decided_by: Ref | null;
  decided_at: string | null;
}

export interface ReviewStats {
  product_id: string;
  product_name: string;
  /** Số đánh giá đang hiện theo sao, từ 1 tới 5. */
  counts: [number, number, number, number, number];
}

interface Store {
  shifts: Shift[];
  reviews: Review[];
  summaries: ReviewSummaryDraft[];
  stats: ReviewStats[];
  /** Đã bán tại quầy trong phiên chạy (theo `org:variant`), trừ vào tồn đọc từ Tồn kho. */
  sold: Map<string, number>;
  seq: number;
}

// ---------------------------------------------------------------- Dựng dữ liệu

async function seedShifts(orders: readonly Order[]): Promise<Shift[]> {
  const { data: units } = await listUnits();
  const name = (id: string) => units.find((u) => u.id === id)?.name ?? id;
  const ids = new Map<string, { org: string; day: string }>();
  for (const o of orders) {
    if (o.shift_id)
      ids.set(o.shift_id, { org: o.org_id, day: vietnamDay(Date.parse(o.placed_at)) });
  }
  const shifts: Shift[] = [];
  for (const [id, { org, day }] of ids) {
    const register = REGISTERS[org];
    if (!register) continue;
    const opened = Date.parse(`${day}T08:00:00+07:00`);
    shifts.push(blank(id, org, name(org), register.cashier, opened, register.opening));
  }
  // Hôm nay: ba ca vừa mở, chưa bán (bán tại quầy ở màn Đơn hàng ghi vào đây). Giờ mở ca không lùi quá
  // đầu ngày (giờ Việt Nam): mở màn ngay sau nửa đêm thì ca vẫn là của hôm nay, không thành ca hôm qua.
  const now = Date.now();
  const dayStart = Date.parse(`${vietnamDay(now)}T00:00:00+07:00`);
  for (const org of [ORG.Q3, ORG.TD, ORG.CG]) {
    const register = REGISTERS[org];
    if (!register) continue;
    const id = shiftIdFor(org, vietnamDay(now));
    if (!shifts.some((x) => x.id === id)) {
      shifts.push(
        blank(
          id,
          org,
          name(org),
          register.cashier,
          Math.max(now - (org === ORG.CG ? 90 : 120) * MINUTE, dayStart + MINUTE),
          register.opening,
        ),
      );
    }
  }
  const todayDay = vietnamDay(now);
  for (const x of shifts) {
    const day = vietnamDay(Date.parse(x.opened_at));
    if (day === todayDay) continue;
    // Ca của ngày trước: đã đóng lúc 21:05; ca của CN Thủ Đức có đơn BM-2611-0416 lệch −20.000 ₫.
    tally(x, orders);
    const counted =
      num(x.expected_cash) - (x.cash_order_numbers.includes("BM-2611-0416") ? 20_000 : 0);
    x.status = "closed";
    x.closed_by = x.opened_by;
    x.closed_at = new Date(Date.parse(`${day}T21:05:00+07:00`)).toISOString();
    x.counted_cash = vnd(counted);
    x.difference = vnd(counted - num(x.expected_cash));
    x.difference_reason =
      counted === num(x.expected_cash) ? null : "Thối nhầm cho khách 20.000 ₫, đã lập biên bản.";
  }
  return shifts.sort(
    (a, b) => b.opened_at.localeCompare(a.opened_at) || a.org_name.localeCompare(b.org_name),
  );
}

function blank(
  id: string,
  org: string,
  orgName: string,
  by: Ref,
  opened: number,
  opening: number,
): Shift {
  return {
    id,
    org_id: org,
    org_name: orgName,
    register_code: "Quầy 1",
    opened_by: by,
    opened_at: new Date(opened).toISOString(),
    opening_cash: vnd(opening),
    closed_by: null,
    closed_at: null,
    expected_cash: vnd(opening),
    counted_cash: null,
    difference: null,
    difference_reason: null,
    status: "open",
    cash_sales: vnd(0),
    cash_refunds: vnd(0),
    order_numbers: [],
    cash_order_numbers: [],
  };
}

/** Tính tiền mặt của ca từ đơn tại quầy và tiền mặt hoàn trong ca (ca đang mở tính lại mỗi lần đọc). */
function tally(x: Shift, orders: readonly Order[]): void {
  const mine = orders.filter((o) => o.shift_id === x.id);
  const cash = mine.filter((o) => o.payment_method === "cash");
  const until = x.closed_at ? Date.parse(x.closed_at) : Date.now() + MINUTE;
  const refunds = orders
    .filter((o) => o.org_id === x.org_id)
    .flatMap((o) => o.refunds)
    .filter(
      (r) =>
        r.destination === "cash_drawer" &&
        Date.parse(r.created_at) >= Date.parse(x.opened_at) &&
        Date.parse(r.created_at) <= until,
    );
  const sales = cash.reduce((s, o) => s + num(o.total), 0);
  const back = refunds.reduce((s, r) => s + num(r.amount), 0);
  x.order_numbers = mine.map((o) => o.number);
  x.cash_order_numbers = cash.map((o) => o.number);
  x.cash_sales = vnd(sales);
  x.cash_refunds = vnd(back);
  if (x.status === "open") x.expected_cash = vnd(num(x.opening_cash) + sales - back);
}

const REVIEW_SEEDS: readonly [
  n: number,
  sku: string,
  product: string,
  order: string,
  rating: number,
  body: string,
  media: number,
  ageH: number,
  extra: Partial<Review>,
][] = [
  [
    1,
    "CG26",
    PRODUCT_ID.castIronPan,
    "BM-2611-0409",
    2,
    "Chảo bị nứt ở quai khi nhận, đã gửi yêu cầu trả.",
    2,
    8,
    {},
  ],
  [
    2,
    "TG35",
    PRODUCT_ID.tamarindBoard35,
    "BM-2611-0398",
    5,
    "Thớt dày, cầm chắc tay, không bị mùi.",
    0,
    10,
    {},
  ],
  [
    3,
    "HT1L",
    PRODUCT_ID.glassBox,
    "BM-2611-0380",
    1,
    "Nắp hộp bị mẻ. Ai cần gọi 0900 000 000 (số mẫu) mình bán lại.",
    0,
    30,
    { flags: ["contact_info"] },
  ],
  [
    4,
    "BG6",
    PRODUCT_ID.blueBowls,
    "BM-2611-0390",
    3,
    "Men đẹp nhưng một bát hơi cong miệng.",
    3,
    34,
    {},
  ],
  [
    5,
    "KB4-XA",
    PRODUCT_ID.towels,
    "BM-2611-0398",
    4,
    "Thấm tốt, giặt máy không phai.",
    0,
    190,
    { seen: true, reply: "Cảm ơn chị đã tin dùng khăn của Bếp Mộc.", replied_at: "" },
  ],
  [
    6,
    "NRC750",
    PRODUCT_ID.dishSoap,
    "BM-2611-0317",
    1,
    "Mua rẻ hơn ở trang khác, bấm link example.com/khuyen-mai …",
    0,
    120,
    {
      seen: true,
      status: "hidden",
      hidden_reason: "advertising",
      hidden_note: "Quảng cáo kèm đường link ra ngoài.",
      hidden_by: LAN,
      flags: ["link"],
    },
  ],
];

async function seedReviews(orders: readonly Order[]): Promise<Review[]> {
  const { data: snaps } = await allVariants();
  const now = Date.now();
  return REVIEW_SEEDS.map(([n, sku, product, number, rating, body, media, ageH, extra]) => {
    const o = orders.find((x) => x.number === number);
    const snap = snaps.find((v) => v.sku === sku);
    const created = new Date(now - ageH * HOUR).toISOString();
    return {
      id: uid("77", n),
      org_id: o?.org_id ?? ORG.ROOT,
      order_id: o?.id ?? "",
      order_number: number,
      product_id: product,
      product_name: snap?.name ?? sku,
      author_name: o?.buyer.name ?? "",
      seller_name: o?.seller?.name ?? null,
      rating,
      body,
      media_count: media,
      status: "published",
      seen: false,
      flags: [],
      hidden_reason: null,
      hidden_note: null,
      hidden_by: null,
      hidden_at: null,
      reply: null,
      replied_at: null,
      created_at: created,
      ...extra,
      ...(extra.replied_at === ""
        ? { replied_at: new Date(now - (ageH - 20) * HOUR).toISOString() }
        : {}),
      ...(extra.status === "hidden"
        ? { hidden_at: new Date(now - (ageH - 2) * HOUR).toISOString() }
        : {}),
    };
  });
}

async function seed(): Promise<Store> {
  const { orders } = await ordersState();
  const now = Date.now();
  return {
    shifts: await seedShifts(orders),
    reviews: await seedReviews(orders),
    summaries: [
      {
        id: uid("78", 1),
        product_id: PRODUCT_ID.castIronPan,
        product_name: "Chảo gang",
        source_count: 128,
        text: "Khen giữ nhiệt tốt, bền, dùng được bếp từ. Chê nặng tay và phải dưỡng chảo trước khi dùng; vài người nhận chảo nứt quai.",
        status: "draft",
        decided_by: null,
        decided_at: null,
      },
      {
        id: uid("78", 2),
        product_id: PRODUCT_ID.knifeSet,
        product_name: "Bộ dao bếp 3 món",
        source_count: 64,
        text: "Khen sắc, cán cầm chắc. Chê lưỡi dễ mẻ nếu chặt xương.",
        status: "live",
        decided_by: LAN,
        decided_at: new Date(now - 10 * DAY).toISOString(),
      },
    ],
    stats: [
      { product_id: PRODUCT_ID.castIronPan, product_name: "Chảo gang", counts: [5, 7, 10, 27, 79] },
      {
        product_id: PRODUCT_ID.knifeSet,
        product_name: "Bộ dao bếp 3 món",
        counts: [2, 4, 8, 20, 30],
      },
    ],
    sold: new Map(),
    seq: 0,
  };
}

const KEY = Symbol.for("autoxide.sample.stores");
type Holder = { [KEY]?: Promise<Store> };

function store(): Promise<Store> {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Dựng lại kho mẫu (test). */
export function resetSampleStores(): void {
  (globalThis as Holder)[KEY] = seed();
}

// ---------------------------------------------------------------- Ca thu ngân

// Dự kiến: GET /api/v1/orders/pos/shifts?org_id=&status= (đặc tả 45 chỉ có mở / đóng ca). Mới trước;
// `sort` sắp theo giờ mở ca hay số lệch (dự kiến `?sort=` của core).
export async function listShifts(
  sort: { field: ShiftSort; dir: SortDir } | null = null,
): Promise<{ data: Shift[] }> {
  const s = await store();
  const { orders } = await ordersState();
  for (const x of s.shifts) if (x.status === "open") tally(x, orders);
  const rows = s.shifts.map((x) => ({ ...x }));
  if (!sort) return { data: rows };
  return {
    data: sortRows(
      rows,
      (x) =>
        sort.field === "opened"
          ? Date.parse(x.opened_at)
          : x.difference
            ? Number(x.difference.amount)
            : null,
      sort.dir,
    ),
  };
}

/** Cột của bảng ca mà hàm mẫu sắp được. */
export const SHIFT_SORTS = ["opened", "difference"] as const;
export type ShiftSort = (typeof SHIFT_SORTS)[number];

/**
 * Bộ lọc của bảng ca. `attention` (mặc định): ca đang mở và ca đã đóng mà tiền đếm lệch — hai thứ
 * người quản lý cửa hàng cần xem; `all`: mọi ca.
 */
export const SHIFT_CHIPS = ["attention", "open", "closed", "diff", "all"] as const;
export type ShiftChip = (typeof SHIFT_CHIPS)[number];

/** Ca đã đóng mà tiền đếm khác tiền dự kiến. */
export function shiftLagging(x: Pick<Shift, "difference">): boolean {
  return x.difference !== null && Number(x.difference.amount) !== 0;
}

export function shiftMatches(x: Pick<Shift, "status" | "difference">, chip: ShiftChip): boolean {
  switch (chip) {
    case "attention":
      return x.status === "open" || shiftLagging(x);
    case "open":
    case "closed":
      return x.status === chip;
    case "diff":
      return shiftLagging(x);
    default:
      return true;
  }
}

/** Ca đang mở của một cửa hàng (bán tại quầy ghi vào đây). */
export async function openShiftAt(orgId: string): Promise<Shift | null> {
  const { data } = await listShifts();
  return data.find((x) => x.org_id === orgId && x.status === "open") ?? null;
}

// Thay bằng POST /api/v1/orders/pos/shifts {org_id, register_code, opening_cash} (bước 45).
export async function openShift(input: {
  org_id: string;
  register: string;
  opening: string;
}): Promise<SampleOutcome<Shift>> {
  const s = await store();
  const { data: units } = await listUnits();
  const errors: NonNullable<Problem["errors"]> = [];
  const unit = units.find((u) => u.id === input.org_id && u.unit_type === "store");
  if (!unit) errors.push(fieldError("org_id", "unknown"));
  const register = input.register.trim();
  if (!register) errors.push(fieldError("register", "required"));
  const opening = input.opening.replace(/[\s.,₫]/g, "");
  if (!/^\d{1,10}$/.test(opening)) errors.push(fieldError("opening", "money_minor"));
  if (errors.length > 0 || !unit) return invalid(errors);
  if (
    s.shifts.some(
      (x) =>
        x.status === "open" &&
        x.org_id === unit.id &&
        x.register_code.toLowerCase() === register.toLowerCase(),
    )
  ) {
    return fail(
      409,
      "orders.shift_already_open",
      `Register ${register} already has an open shift.`,
      [fieldError("register", "orders.shift_already_open", register)],
    );
  }
  s.seq += 1;
  const shift = blank(
    `${shiftIdFor(unit.id, vietnamDay())}-${s.seq}`,
    unit.id,
    unit.name,
    SAMPLE_ACTOR,
    Date.now(),
    Number(opening),
  );
  shift.register_code = register;
  s.shifts.unshift(shift);
  return { ok: true, data: shift };
}

// Thay bằng POST /api/v1/orders/pos/shifts/{id}/close {counted_cash, difference_reason} (bước 45;
// `difference_reason` là dự kiến). Lệch mà không ghi lý do thì từ chối.
export async function closeShift(
  id: string,
  input: { counted: string; reason: string },
): Promise<SampleOutcome<Shift>> {
  const s = await store();
  const x = s.shifts.find((y) => y.id === id);
  if (!x) return fail(404, "orders.shift_not_found", "Shift not found.");
  if (x.status !== "open") return fail(409, "orders.shift_not_open", "The shift is not open.");
  const { orders } = await ordersState();
  tally(x, orders);
  const text = input.counted.replace(/[\s.,₫]/g, "");
  if (!/^\d{1,10}$/.test(text)) return invalid([fieldError("counted", "money_minor")]);
  const counted = Number(text);
  const diff = counted - num(x.expected_cash);
  if (diff !== 0 && !input.reason.trim()) {
    return invalid([fieldError("reason", "orders.shift_difference_reason_required", String(diff))]);
  }
  x.status = "closed";
  x.closed_by = SAMPLE_ACTOR;
  x.closed_at = new Date().toISOString();
  x.counted_cash = vnd(counted);
  x.difference = vnd(diff);
  x.difference_reason = diff === 0 ? null : input.reason.trim();
  return { ok: true, data: x };
}

// ---------------------------------------------------------------- Bán tại quầy

export interface PosItem {
  variant_id: string;
  sku: string;
  name: string;
  /** Mã vạch in trên hàng (máy quét gõ vào ô tìm rồi Enter). */
  barcode: string | null;
  /** Nhóm hàng đầu tiên của sản phẩm, để lọc nhanh ở quầy. */
  category: { id: string; name: string } | null;
  price: Money;
  /** Thuế suất GTGT đang áp (%), giá đã gồm thuế. */
  vat_percent: number;
  /** Tồn bán được ở cửa hàng (Tồn kho) trừ phần đã bán tại quầy trong phiên. */
  available: number;
}

// Dự kiến: danh mục bán tại quầy của một cửa hàng — giá theo bảng giá của cửa hàng (`catalog`, bước 41),
// tồn bán được của cửa hàng (`inventory`, bước 42).
export async function posCatalog(orgId: string, locale = "vi"): Promise<{ data: PosItem[] }> {
  const s = await store();
  const [{ data: snaps }, { data: cats }] = await Promise.all([
    allVariants(locale),
    listCategories(locale),
  ]);
  const sellable = snaps.filter(
    (v) => v.status === "active" && v.variant_active && v.kind === "physical",
  );
  const [prices, levels, rates] = await Promise.all([
    pricesAt(
      orgId,
      sellable.map((v) => v.variant_id),
    ),
    listLevels({ org_id: orgId, limit: 500 }),
    listTaxRates(),
  ]);
  const day = vietnamDay();
  const out: PosItem[] = [];
  for (const v of sellable) {
    const price = prices.get(v.variant_id)?.price?.amount;
    if (!price) continue;
    const level = levels.data.find((l) => l.variant_id === v.variant_id);
    const rate = v.tax_category ? rateOn(rates.data, v.tax_category, day) : null;
    const cat = cats.find((c) => c.id === v.category_ids[0]);
    out.push({
      variant_id: v.variant_id,
      sku: v.sku,
      name: `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}`,
      barcode: v.barcode,
      category: cat ? { id: cat.id, name: cat.names[locale] ?? cat.names.vi ?? cat.id } : null,
      price,
      vat_percent: rate ? Number(rate.rate_percent) : 0,
      available: Math.max(
        0,
        (level?.available ?? 0) - (s.sold.get(`${orgId}:${v.variant_id}`) ?? 0),
      ),
    });
  }
  // Hàng còn ở cửa hàng lên trước.
  return {
    data: out.sort(
      (a, b) => Number(b.available > 0) - Number(a.available > 0) || a.name.localeCompare(b.name),
    ),
  };
}

const POS_METHODS: readonly PaymentMethod[] = ["cash", "card_terminal", "vietqr"];

// Thay bằng POST /api/v1/orders/pos/sales {shift_id, reference, lines, payments} (bước 45): cần ca đang
// mở ở cửa hàng, đủ tồn; đơn vào thẳng "đã giao", lập hoá đơn từ máy tính tiền. Trùng `reference` trả
// đơn cũ (máy quầy gửi lại khi mất mạng). `codes`: mã giảm giá (máy chủ xét như lúc thử giỏ; mã không
// áp được thì bỏ qua). `buyer`: tên khách đã chọn ở quầy, trống = khách lẻ.
export async function createPosSale(input: {
  org_id: string;
  lines: string;
  method: string;
  reference: string;
  codes?: readonly string[];
  buyer?: string;
}): Promise<SampleOutcome<{ order: Order; replayed: boolean }>> {
  const s = await store();
  const { data: units } = await listUnits();
  const unit = units.find((u) => u.id === input.org_id && u.unit_type === "store");
  const errors: NonNullable<Problem["errors"]> = [];
  if (!unit) errors.push(fieldError("org_id", "unknown"));
  const { items, bad } = posLines(input.lines);
  if (items.length === 0 && bad.length === 0) errors.push(fieldError("lines", "orders.cart_empty"));
  for (const b of bad) errors.push(fieldError("lines", "orders.line_format", b));
  if (!(POS_METHODS as readonly string[]).includes(input.method))
    errors.push(fieldError("method", "unknown"));
  if (errors.length > 0 || !unit) return invalid(errors);
  const shift = await openShiftAt(unit.id);
  if (!shift) return fail(409, "orders.shift_not_open", "No shift is open at this store.");
  const catalog = await posCatalog(unit.id);
  for (const [sku, quantity] of items) {
    const item = catalog.data.find((c) => c.sku === sku);
    if (!item) errors.push(fieldError("lines", "orders.variant_unavailable", sku));
    else if (quantity > item.available)
      errors.push(fieldError("lines", "orders.out_of_stock", `${sku} (${item.available})`));
  }
  if (errors.length > 0)
    return fail(409, "orders.out_of_stock", "Not enough stock at this store.", errors);
  const out = await placePosOrder({
    org_id: unit.id,
    org_name: unit.name,
    items,
    method: input.method as PaymentMethod,
    codes: input.codes ?? [],
    buyer: input.buyer?.trim() || null,
    shift_id: shift.id,
    reference: input.reference || `${Date.now()}`,
  });
  if (!out.ok) return out;
  if (!out.data.replayed) {
    for (const line of out.data.order.lines) {
      const key = `${unit.id}:${line.variant_id}`;
      s.sold.set(key, (s.sold.get(key) ?? 0) + line.quantity);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Đánh giá

export type ReviewChip = "all" | "new" | "published" | "hidden" | "low";

// Thay bằng GET /api/v1/orders/reviews?status=&rating_max= (bước 45). `seen` là dự kiến.
export async function listReviews(chip: ReviewChip = "all"): Promise<{ data: Review[] }> {
  const s = await store();
  const keep = (r: Review) =>
    chip === "all" ||
    (chip === "new" && !r.seen && r.status === "published") ||
    (chip === "published" && r.status === "published") ||
    (chip === "hidden" && r.status === "hidden") ||
    (chip === "low" && r.rating <= 2);
  return { data: s.reviews.filter(keep).sort((a, b) => b.created_at.localeCompare(a.created_at)) };
}

export async function reviewCounts(): Promise<Record<ReviewChip, number>> {
  const s = await store();
  return {
    all: s.reviews.length,
    new: s.reviews.filter((r) => !r.seen && r.status === "published").length,
    published: s.reviews.filter((r) => r.status === "published").length,
    hidden: s.reviews.filter((r) => r.status === "hidden").length,
    low: s.reviews.filter((r) => r.rating <= 2).length,
  };
}

async function review(id: string): Promise<Review | null> {
  return (await store()).reviews.find((r) => r.id === id) ?? null;
}

const reviewNotFound = () => fail(404, "orders.review_not_found", "Review not found.");

// Dự kiến (`docs/prompts/ui-phase2-api.md`): POST /api/v1/orders/reviews/{id}/seen.
export async function markReviewSeen(id: string): Promise<SampleOutcome<Review>> {
  const r = await review(id);
  if (!r) return reviewNotFound();
  r.seen = true;
  return { ok: true, data: r };
}

// Thay bằng POST /api/v1/orders/reviews/{id}/reply (bước 45). Trả lời hiện công khai dưới đánh giá.
export async function replyReview(id: string, text: string): Promise<SampleOutcome<Review>> {
  const r = await review(id);
  if (!r) return reviewNotFound();
  const body = text.trim();
  if (!body) return invalid([fieldError("text", "required")]);
  if (body.length > 1000) return invalid([fieldError("text", "too_long")]);
  if (r.seller_name)
    return fail(409, "orders.review_reply_by_seller", "The seller replies to marketplace reviews.");
  r.reply = body;
  r.replied_at = new Date().toISOString();
  r.seen = true;
  return { ok: true, data: r };
}

// Thay bằng POST /api/v1/orders/reviews/{id}/moderation {action: hide | publish, reason, note} (bước 45).
// Chỉ ẩn với lý do trong danh sách cho phép (`orders.moderation_reason_invalid`); ghi người ẩn, báo
// người viết. Mở lại được.
export async function moderateReview(
  id: string,
  input: { action: "hide" | "publish"; reason?: string; note?: string },
): Promise<SampleOutcome<Review>> {
  const r = await review(id);
  if (!r) return reviewNotFound();
  if (input.action === "publish") {
    if (r.status !== "hidden")
      return fail(409, "orders.review_not_hidden", "The review is not hidden.");
    r.status = "published";
    r.hidden_reason = null;
    r.hidden_note = null;
    r.hidden_by = null;
    r.hidden_at = null;
    return { ok: true, data: r };
  }
  const errors: NonNullable<Problem["errors"]> = [];
  if (!(HIDE_REASONS as readonly string[]).includes(input.reason ?? ""))
    errors.push(fieldError("reason", "orders.moderation_reason_invalid"));
  if (!input.note?.trim()) errors.push(fieldError("note", "required"));
  if (errors.length > 0) return invalid(errors);
  if (r.status === "hidden")
    return fail(409, "orders.review_already_hidden", "The review is already hidden.");
  r.status = "hidden";
  r.seen = true;
  r.hidden_reason = input.reason as HideReason;
  r.hidden_note = input.note?.trim() ?? null;
  r.hidden_by = SAMPLE_ACTOR;
  r.hidden_at = new Date().toISOString();
  return { ok: true, data: r };
}

// Dự kiến (`docs/prompts/ui-phase2-api.md`, D-201): bản nháp tóm tắt đánh giá bằng AI — duyệt rồi mới
// hiện kèm nhãn "Tóm tắt bởi AI"; tóm tắt không được bỏ ý kiến chê.
export async function listSummaries(): Promise<{ data: ReviewSummaryDraft[] }> {
  return { data: (await store()).summaries.map((x) => ({ ...x })) };
}

export async function decideSummary(
  id: string,
  decision: "approve" | "drop",
): Promise<SampleOutcome<ReviewSummaryDraft>> {
  const x = (await store()).summaries.find((y) => y.id === id);
  if (!x) return fail(404, "orders.summary_not_found", "Draft not found.");
  if (x.status !== "draft")
    return fail(409, "orders.summary_decided", "This draft was already decided.");
  x.status = decision === "approve" ? "live" : "dropped";
  x.decided_by = SAMPLE_ACTOR;
  x.decided_at = new Date().toISOString();
  return { ok: true, data: x };
}

// Thay bằng thống kê kèm `GET /api/v1/orders/public/products/{id}/reviews` (bảng `orders_review_stats`).
export async function listReviewStats(): Promise<{ data: ReviewStats[] }> {
  return { data: (await store()).stats.map((x) => ({ ...x })) };
}

/** Số trung bình (một chữ số lẻ) và tổng của một thống kê sao. */
export function average(counts: readonly number[]): { total: number; mean: number } {
  const total = counts.reduce((s, n) => s + n, 0);
  const sum = counts.reduce((s, n, i) => s + n * (i + 1), 0);
  return { total, mean: total === 0 ? 0 : Math.round((sum / total) * 10) / 10 };
}
