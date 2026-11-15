// Dữ liệu mẫu của phân hệ Kho (module `inventory`, bước 42 của core, chưa có). Màn "Tồn kho" dựng
// hoàn toàn bằng file này (W-006). Biến thể lấy từ `sample/catalog.ts` (cùng ID), kho và cửa hàng
// từ `sample/org.ts` (`listUnits()`: nút loại `warehouse` hay `store`). Hình dạng theo đặc tả
// `docs/steps/42-inventory.md` của core (mục "Mô hình tồn", "Bảng dữ liệu", "API REST", "Mã lỗi").
//
// Mô hình tồn như đặc tả: mỗi dòng (biến thể × kho) có `on_hand` = tổng sổ biến động của dòng, và
// `available` = `on_hand` − chỗ đang giữ. Sổ biến động chỉ thêm. Mọi đổi số tồn đi qua `move()`,
// để `verifyLevels()` luôn sạch (test). Lệnh ghi đổi kho trong bộ nhớ của tiến trình máy chủ.
import type { Problem } from "@autoxide/sdk";
import { fold } from "@/lib/fold";
import {
  allVariants,
  type Money,
  ORG,
  type Ref,
  SAMPLE_ACTOR,
  type SampleSku,
  VARIANT_ID,
  type VariantSnapshot,
  variantByCodeSync,
} from "./catalog";
import { type SamplePage, samplePage } from "./index";
import { listUnits, type OrgUnit } from "./org";
import { vietnamDay } from "./tax";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;
const HOUR = 3_600_000;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 42

export type MovementKind =
  | "receipt"
  | "sale"
  | "return"
  | "adjustment"
  | "count"
  | "transfer_out"
  | "transfer_in"
  | "expiry"
  | "supplier_return";

export const REASON_CODES = [
  "damaged",
  "lost",
  "found",
  "correction",
  "sample",
  "expired",
  "opening_balance",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** Một dòng tồn (`GET /inventory/levels`). `reserved` suy ra: `on_hand − available`. */
export interface Level {
  id: string;
  org_id: string;
  variant_id: string;
  on_hand: number;
  available: number;
  reserved: number;
  incoming: number;
  reorder_point: number | null;
  allow_negative: boolean;
  average_cost: Money;
  updated_at: string;
}

export type StockStatus = "ok" | "low" | "out" | "out_backorder";

/** Dòng tồn kèm tên biến thể và kho, như màn cần (dự kiến: `include=variant,org`). */
export interface LevelRow extends Level {
  sku: string;
  name: string;
  variant_label: string;
  org_name: string;
  status: StockStatus;
  lot_tracked: boolean;
  serial_tracked: boolean;
}

export interface Movement {
  id: string;
  org_id: string;
  variant_id: string;
  level_id: string;
  kind: MovementKind;
  quantity: number;
  unit_cost: Money;
  lot_code: string | null;
  reason_code: ReasonCode | null;
  note: string;
  source_type: string;
  source_id: string;
  /** Số chứng từ để hiện (đơn, phiếu…); dự kiến API trả kèm. */
  source_label: string;
  actor: Ref | null;
  created_at: string;
}

export interface MovementRow extends Movement {
  sku: string;
  name: string;
  org_name: string;
}

export interface Reservation {
  id: string;
  order_number: string;
  level_id: string;
  quantity: number;
  status: "held" | "confirmed";
  expires_at: string | null;
}

export type TransferStatus =
  | "draft"
  | "in_transit"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";

export interface TransferLine {
  id: string;
  variant_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: Money;
  lot_code: string | null;
}

export interface StockTransfer {
  id: string;
  number: string;
  from_org_id: string;
  to_org_id: string;
  status: TransferStatus;
  note: string;
  reference: string | null;
  shipped_at: string | null;
  expected_on: string | null;
  received_at: string | null;
  created_at: string;
  lines: TransferLine[];
}

export type CountStatus = "open" | "applied" | "cancelled";

export interface CountLine {
  id: string;
  variant_id: string;
  counted: number | null;
  /** `on_hand` ngay lúc đếm dòng này; lệch = `counted − expected_at_count`. */
  expected_at_count: number | null;
  counted_at: string | null;
  reason_code: ReasonCode | null;
}

export interface StockCount {
  id: string;
  number: string;
  org_id: string;
  scope: string;
  status: CountStatus;
  created_at: string;
  applied_at: string | null;
  lines: CountLine[];
}

export type LotStatus = "fresh" | "expiring" | "expired";

export interface Lot {
  id: string;
  level_id: string;
  lot_code: string;
  expires_on: string | null;
  on_hand: number;
  received_at: string;
  receipt_number: string | null;
}

export interface LotRow extends Lot {
  sku: string;
  name: string;
  org_id: string;
  org_name: string;
  status: LotStatus;
}

export type SerialStatus = "in_stock" | "sold" | "returned" | "written_off";

export interface Serial {
  id: string;
  variant_id: string;
  serial: string;
  org_id: string | null;
  status: SerialStatus;
  order_number: string | null;
  note: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  org_id: string;
  code: string;
  name: string;
  /** Mô tả ngắn (nhóm hàng). */
  note: string;
  tax_code: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  payment_terms_days: number;
  currency: string;
  active: boolean;
  updated_at: string;
}

/** Nhà cung cấp kèm công nợ đọc từ sổ cái (dự kiến; sổ cái là bước 36). */
export interface SupplierRow extends Supplier {
  received: Money;
  returned: Money;
  paid: Money;
  payable: Money;
}

export type PurchaseStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";

export interface PurchaseLine {
  id: string;
  variant_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: Money;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  org_id: string;
  supplier_id: string;
  status: PurchaseStatus;
  expected_on: string | null;
  ordered_by: Ref;
  note: string;
  total: Money;
  created_at: string;
  lines: PurchaseLine[];
}

export type LedgerStatus = "queued" | "posted";

export interface ReceiptLine {
  variant_id: string;
  quantity: number;
  unit_cost: Money;
  lot_code: string | null;
  expires_on: string | null;
  serials: string[];
}

export interface Receipt {
  id: string;
  number: string;
  org_id: string;
  supplier_id: string | null;
  purchase_order_id: string | null;
  reference: string;
  total: Money;
  /** Job `inventory.post_receipt_to_ledger`: chờ chạy hay đã ghi sổ cái (dự kiến API trả). */
  ledger_status: LedgerStatus;
  posted_at: string;
  created_by: Ref;
  lines: ReceiptLine[];
}

export interface SupplierReturn {
  id: string;
  number: string;
  org_id: string;
  supplier_id: string;
  receipt_id: string | null;
  reference: string;
  reason: string;
  total: Money;
  ledger_status: LedgerStatus;
  posted_at: string;
  lines: { variant_id: string; quantity: number; unit_cost: Money }[];
}

// ---------------------------------------------------------------- ID cố định

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

const BAO: Ref = { id: "01a1e000-0000-7000-8000-000000000f11", name: "Lý Quốc Bảo" };
const THAO: Ref = { id: "01a1e000-0000-7000-8000-000000000f12", name: "Phan Thảo" };
const YEN: Ref = { id: "01a1e000-0000-7000-8000-000000000f10", name: "Hoàng Yến" };
const SYSTEM: Ref = { id: "system", name: "Hệ thống" };
const DAILY_JOB: Ref = { id: "job", name: "Job hằng ngày" };

export const SUPPLIER_ID = {
  saoMai: uid("d6", 1),
  xanh: uid("d6", 2),
  bongViet: uid("d6", 3),
  phucAn: uid("d6", 4),
  meTay: uid("d6", 5),
  lamHong: uid("d6", 6),
  tanPhat: uid("d6", 7),
} as const;

const vnd = (amount: number): Money => ({ amount: String(amount), currency: "VND" });
const ZERO = vnd(0);

// ---------------------------------------------------------------- Kho trong bộ nhớ

interface Store {
  levels: Level[];
  movements: Movement[];
  reservations: Reservation[];
  transfers: StockTransfer[];
  counts: StockCount[];
  lots: Lot[];
  serials: Serial[];
  suppliers: Supplier[];
  /** Đã thanh toán cho nhà cung cấp (ghi ở phân hệ Tài chính, bước 36). */
  payments: { supplier_id: string; amount: Money; paid_at: string }[];
  purchaseOrders: PurchaseOrder[];
  receipts: Receipt[];
  returns: SupplierReturn[];
  /** Job ghi sổ cái đang chờ của phiếu mới tạo: id phiếu → lúc job "chạy xong" (mô phỏng). */
  ledgerDue: Record<string, number>;
  seq: number;
}

function at(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

interface LevelSeed {
  sku: SampleSku;
  org: string;
  on_hand: number;
  reserved: number;
  reorder: number | null;
  cost: number;
}

const LEVELS: LevelSeed[] = [
  { sku: "CG26", org: ORG.WH, on_hand: 5, reserved: 2, reorder: 20, cost: 410_000 },
  { sku: "TG35", org: ORG.WH, on_hand: 10, reserved: 2, reorder: 15, cost: 138_000 },
  { sku: "DB3", org: ORG.CG, on_hand: 3, reserved: 1, reorder: 10, cost: 505_000 },
  { sku: "CG26", org: ORG.CG, on_hand: 4, reserved: 1, reorder: 6, cost: 410_000 },
  { sku: "CG28", org: ORG.CG, on_hand: 1, reserved: 0, reorder: 4, cost: 455_000 },
  { sku: "HT1L", org: ORG.Q3, on_hand: 0, reserved: 0, reorder: 12, cost: 165_000 },
  { sku: "CG28", org: ORG.Q3, on_hand: 0, reserved: 0, reorder: 4, cost: 455_000 },
  { sku: "CG26", org: ORG.Q3, on_hand: 13, reserved: 1, reorder: 6, cost: 410_000 },
  { sku: "KB4-XA", org: ORG.WH, on_hand: 46, reserved: 6, reorder: 30, cost: 52_000 },
  { sku: "NRC750", org: ORG.WH, on_hand: 120, reserved: 4, reorder: 40, cost: 48_000 },
  { sku: "CG24", org: ORG.WH, on_hand: 25, reserved: 0, reorder: 10, cost: 350_000 },
  { sku: "CG28", org: ORG.WH, on_hand: 18, reserved: 0, reorder: 8, cost: 455_000 },
  { sku: "NI20", org: ORG.WH, on_hand: 30, reserved: 2, reorder: 10, cost: 330_000 },
  { sku: "NI20", org: ORG.CG, on_hand: 7, reserved: 0, reorder: 3, cost: 330_000 },
  { sku: "DB3", org: ORG.WH, on_hand: 4, reserved: 0, reorder: 4, cost: 505_000 },
  { sku: "HT1L", org: ORG.WH, on_hand: 56, reserved: 3, reorder: 20, cost: 165_000 },
  { sku: "BG6", org: ORG.Q3, on_hand: 14, reserved: 0, reorder: 6, cost: 230_000 },
  { sku: "BG6", org: ORG.TD, on_hand: 8, reserved: 1, reorder: 6, cost: 230_000 },
  { sku: "KB4-XA", org: ORG.TD, on_hand: 20, reserved: 0, reorder: 10, cost: 52_000 },
  { sku: "KB4-XA", org: ORG.CG, on_hand: 25, reserved: 0, reorder: 10, cost: 52_000 },
  { sku: "KB4-BE", org: ORG.WH, on_hand: 38, reserved: 0, reorder: 30, cost: 52_000 },
  { sku: "NRC750", org: ORG.CG, on_hand: 18, reserved: 0, reorder: 10, cost: 48_000 },
  { sku: "NRC750", org: ORG.Q3, on_hand: 0, reserved: 0, reorder: 10, cost: 48_000 },
  { sku: "MT200", org: ORG.WH, on_hand: 40, reserved: 0, reorder: 20, cost: 26_000 },
  { sku: "TG25", org: ORG.WH, on_hand: 11, reserved: 0, reorder: 6, cost: 98_000 },
  { sku: "TGT30", org: ORG.WH, on_hand: 6, reserved: 0, reorder: 4, cost: 112_000 },
];

function levelId(index: number): string {
  return uid("d1", index + 1);
}

function seed(): Store {
  const created = at(60 * DAY);
  const levels: Level[] = LEVELS.map((l, i) => ({
    id: levelId(i),
    org_id: l.org,
    variant_id: VARIANT_ID[l.sku],
    on_hand: l.on_hand,
    available: l.on_hand - l.reserved,
    reserved: l.reserved,
    incoming: 0,
    reorder_point: l.reorder,
    allow_negative: l.sku === "HT1L",
    average_cost: vnd(l.cost),
    updated_at: created,
  }));
  const find = (sku: SampleSku, org: string) =>
    levels.find((l) => l.variant_id === VARIANT_ID[sku] && l.org_id === org) as Level;
  let n = 0;
  const movements: Movement[] = [];
  const mv = (
    sku: SampleSku,
    org: string,
    kind: MovementKind,
    quantity: number,
    when: string,
    source: [string, string],
    actor: Ref | null,
    extra: Partial<Pick<Movement, "reason_code" | "note" | "lot_code" | "unit_cost">> = {},
  ) => {
    const level = find(sku, org);
    n += 1;
    movements.push({
      id: uid("d2", n),
      org_id: org,
      variant_id: level.variant_id,
      level_id: level.id,
      kind,
      quantity,
      unit_cost: extra.unit_cost ?? level.average_cost,
      lot_code: extra.lot_code ?? null,
      reason_code: extra.reason_code ?? null,
      note: extra.note ?? "",
      source_type: source[0],
      source_id: source[1],
      source_label: source[1],
      actor,
      created_at: when,
    });
  };
  // Biến động gần đây (bản thiết kế), mới trước khi đọc.
  const recent: Parameters<typeof mv>[] = [
    ["CG26", ORG.WH, "sale", -1, at(2 * HOUR), ["orders", "BM-2611-0411"], SYSTEM],
    [
      "TG35",
      ORG.WH,
      "adjustment",
      -2,
      at(3 * HOUR),
      ["adjustment", "adj-1113-0007"],
      BAO,
      { reason_code: "damaged", note: "Nứt khi bốc xếp, có ảnh" },
    ],
    [
      "KB4-XA",
      ORG.WH,
      "receipt",
      30,
      at(8 * HOUR),
      ["receipt", "PN-0411"],
      BAO,
      { unit_cost: vnd(52_000) },
    ],
    ["CG26", ORG.WH, "transfer_out", -12, at(24 * HOUR), ["transfer", "CK-0219"], BAO],
    ["DB3", ORG.WH, "transfer_out", -8, at(24 * HOUR), ["transfer", "CK-0219"], BAO],
    ["NI20", ORG.WH, "transfer_out", -4, at(24 * HOUR), ["transfer", "CK-0219"], BAO],
    [
      "BG6",
      ORG.Q3,
      "count",
      -1,
      at(31 * HOUR),
      ["count", "KK-0030"],
      THAO,
      { reason_code: "damaged", note: "Vỡ" },
    ],
    ["HT1L", ORG.Q3, "return", 1, at(2 * DAY), ["orders", "BM-2611-0371"], SYSTEM],
    ["HT1L", ORG.Q3, "sale", -1, at(2 * DAY - HOUR), ["orders", "BM-2611-0380"], SYSTEM],
    [
      "HT1L",
      ORG.WH,
      "receipt",
      60,
      at(2 * DAY + 3 * HOUR),
      ["receipt", "PN-0409"],
      BAO,
      { unit_cost: vnd(165_000) },
    ],
    [
      "HT1L",
      ORG.WH,
      "supplier_return",
      -4,
      at(DAY + 5 * HOUR),
      ["supplier_return", "TH-0006"],
      BAO,
    ],
    [
      "NRC750",
      ORG.WH,
      "receipt",
      72,
      at(3 * DAY),
      ["receipt", "PN-0405"],
      BAO,
      { lot_code: "NRC-2611", unit_cost: vnd(48_000) },
    ],
    [
      "NRC750",
      ORG.Q3,
      "expiry",
      -6,
      at(14 * DAY),
      ["lot", "NRC-2608"],
      DAILY_JOB,
      { lot_code: "NRC-2608" },
    ],
    [
      "BG6",
      ORG.Q3,
      "receipt",
      19,
      at(10 * DAY),
      ["receipt", "PN-0398"],
      BAO,
      { unit_cost: vnd(230_000) },
    ],
    [
      "BG6",
      ORG.Q3,
      "supplier_return",
      -1,
      at(10 * DAY - 2 * HOUR),
      ["supplier_return", "TH-0005"],
      BAO,
    ],
    ["TG25", ORG.WH, "sale", -1, at(5 * HOUR), ["orders", "BM-2611-0407"], SYSTEM],
  ];
  // Số dư đầu kỳ: phần còn lại để `on_hand` bằng đúng tổng sổ của dòng.
  const sums = new Map<string, number>();
  for (const [sku, org, , qty] of recent) {
    const key = find(sku, org).id;
    sums.set(key, (sums.get(key) ?? 0) + qty);
  }
  LEVELS.forEach((l) => {
    const level = find(l.sku, l.org);
    const opening = l.on_hand - (sums.get(level.id) ?? 0);
    if (opening !== 0) {
      mv(
        l.sku,
        l.org,
        opening > 0 ? "adjustment" : "adjustment",
        opening,
        created,
        ["opening", "Số dư đầu kỳ"],
        null,
        {
          reason_code: "opening_balance",
        },
      );
    }
  });
  for (const args of recent) mv(...args);

  const reservations: Reservation[] = [];
  let r = 0;
  for (const level of levels) {
    for (let left = level.reserved; left > 0; ) {
      const quantity = Math.min(left, 2);
      r += 1;
      reservations.push({
        id: uid("d3", r),
        order_number: `BM-2611-${String(400 + r).padStart(4, "0")}`,
        level_id: level.id,
        quantity,
        status: r % 3 === 0 ? "held" : "confirmed",
        expires_at: r % 3 === 0 ? at(-6 * HOUR) : null,
      });
      left -= quantity;
    }
  }

  const line = (
    k: number,
    sku: SampleSku,
    quantity: number,
    received: number,
    cost: number,
  ): TransferLine => ({
    id: uid("d4", k),
    variant_id: VARIANT_ID[sku],
    quantity,
    received_quantity: received,
    unit_cost: vnd(cost),
    lot_code: null,
  });
  const transfers: StockTransfer[] = [
    {
      id: uid("d5", 219),
      number: "CK-0219",
      from_org_id: ORG.WH,
      to_org_id: ORG.CG,
      status: "in_transit",
      note: "Đi đường bộ, gửi kèm vận đơn",
      reference: "VC-2611-044",
      shipped_at: at(24 * HOUR),
      expected_on: vietnamDay(Date.now() + 2 * DAY),
      received_at: null,
      created_at: at(26 * HOUR),
      lines: [
        line(1, "CG26", 12, 0, 410_000),
        line(2, "DB3", 8, 0, 505_000),
        line(3, "NI20", 4, 0, 330_000),
      ],
    },
    {
      id: uid("d5", 220),
      number: "CK-0220",
      from_org_id: ORG.WH,
      to_org_id: ORG.Q3,
      status: "draft",
      note: "Bù hàng hết",
      reference: null,
      shipped_at: null,
      expected_on: null,
      received_at: null,
      created_at: at(6 * HOUR),
      lines: [line(4, "HT1L", 24, 0, 165_000)],
    },
    {
      id: uid("d5", 216),
      number: "CK-0216",
      from_org_id: ORG.WH,
      to_org_id: ORG.TD,
      status: "partially_received",
      note: "",
      reference: null,
      shipped_at: at(4 * DAY),
      expected_on: vietnamDay(Date.now() - 3 * DAY),
      received_at: at(3 * DAY),
      created_at: at(4 * DAY + 2 * HOUR),
      lines: [line(5, "KB4-XA", 20, 20, 52_000), line(6, "BG6", 10, 8, 230_000)],
    },
    {
      id: uid("d5", 214),
      number: "CK-0214",
      from_org_id: ORG.Q3,
      to_org_id: ORG.TD,
      status: "received",
      note: "",
      reference: null,
      shipped_at: at(7 * DAY),
      expected_on: vietnamDay(Date.now() - 6 * DAY),
      received_at: at(6 * DAY),
      created_at: at(7 * DAY + HOUR),
      lines: [line(7, "BG6", 6, 6, 230_000)],
    },
    {
      id: uid("d5", 211),
      number: "CK-0211",
      from_org_id: ORG.WH,
      to_org_id: ORG.Q3,
      status: "closed",
      note: "",
      reference: null,
      shipped_at: at(11 * DAY),
      expected_on: vietnamDay(Date.now() - 10 * DAY),
      received_at: at(9 * DAY),
      created_at: at(11 * DAY + HOUR),
      lines: [
        line(8, "CG26", 20, 20, 410_000),
        line(9, "CG28", 12, 12, 455_000),
        line(10, "KB4-XA", 12, 12, 52_000),
        line(11, "NRC750", 8, 8, 48_000),
      ],
    },
  ];
  // "Đang về" ở kho đích = phần chưa nhận của phiếu đang đi đường.
  for (const t of transfers.filter(
    (x) => x.status === "in_transit" || x.status === "partially_received",
  )) {
    for (const l of t.lines) {
      const level = levels.find((x) => x.org_id === t.to_org_id && x.variant_id === l.variant_id);
      if (level) level.incoming += l.quantity - l.received_quantity;
    }
  }

  const countLine = (
    k: number,
    sku: SampleSku,
    expected: number | null,
    counted: number | null,
    reason: ReasonCode | null,
    when: number,
  ): CountLine => ({
    id: uid("d7", k),
    variant_id: VARIANT_ID[sku],
    counted,
    expected_at_count: expected,
    counted_at: counted === null ? null : at(when),
    reason_code: reason,
  });
  const counts: StockCount[] = [
    {
      id: uid("d8", 31),
      number: "KK-0031",
      org_id: ORG.CG,
      scope: "Toàn cửa hàng",
      status: "open",
      created_at: at(6 * HOUR),
      applied_at: null,
      lines: [
        countLine(1, "NI20", 7, 6, "damaged", 5 * HOUR),
        countLine(2, "KB4-XA", 25, 23, null, 4 * HOUR),
        countLine(3, "CG26", 4, 4, null, 4 * HOUR),
        countLine(4, "CG28", 1, 1, null, 4 * HOUR),
        countLine(5, "DB3", 3, 3, null, 3 * HOUR),
        countLine(6, "NRC750", 18, 18, null, 3 * HOUR),
      ],
    },
    {
      id: uid("d8", 32),
      number: "KK-0032",
      org_id: ORG.WH,
      scope: "Kệ A: dao, thớt",
      status: "open",
      created_at: at(2 * HOUR),
      applied_at: null,
      lines: [
        countLine(7, "TG25", 11, 12, "found", HOUR),
        countLine(8, "TGT30", 6, 5, "lost", HOUR),
        countLine(9, "TG35", 10, 10, null, HOUR),
        countLine(10, "DB3", 4, null, null, 0),
      ],
    },
    {
      id: uid("d8", 30),
      number: "KK-0030",
      org_id: ORG.Q3,
      scope: "Quầy gốm sứ",
      status: "applied",
      created_at: at(32 * HOUR),
      applied_at: at(31 * HOUR),
      lines: [countLine(11, "BG6", 15, 14, "damaged", 31 * HOUR)],
    },
    {
      id: uid("d8", 29),
      number: "KK-0029",
      org_id: ORG.WH,
      scope: "Toàn kho · tạo nhầm",
      status: "cancelled",
      created_at: at(9 * DAY),
      applied_at: null,
      lines: [],
    },
  ];

  const lotLevel = (sku: SampleSku, org: string) => find(sku, org).id;
  const lots: Lot[] = [
    {
      id: uid("d9", 1),
      level_id: lotLevel("NRC750", ORG.WH),
      lot_code: "NRC-2609",
      expires_on: vietnamDay(Date.now() + 15 * DAY),
      on_hand: 48,
      received_at: at(64 * DAY),
      receipt_number: "PN-0367",
    },
    {
      id: uid("d9", 2),
      level_id: lotLevel("NRC750", ORG.WH),
      lot_code: "NRC-2611",
      expires_on: "2027-05-15",
      on_hand: 72,
      received_at: at(3 * DAY),
      receipt_number: "PN-0405",
    },
    {
      id: uid("d9", 3),
      level_id: lotLevel("NRC750", ORG.CG),
      lot_code: "NRC-2610",
      expires_on: "2027-01-20",
      on_hand: 18,
      received_at: at(30 * DAY),
      receipt_number: "PN-0388",
    },
    {
      id: uid("d9", 4),
      level_id: lotLevel("NRC750", ORG.Q3),
      lot_code: "NRC-2608",
      expires_on: vietnamDay(Date.now() - 15 * DAY),
      on_hand: 0,
      received_at: at(90 * DAY),
      receipt_number: "PN-0341",
    },
    {
      id: uid("d9", 5),
      level_id: lotLevel("MT200", ORG.WH),
      lot_code: "MT-2610",
      expires_on: "2027-08-31",
      on_hand: 40,
      received_at: at(25 * DAY),
      receipt_number: "PN-0390",
    },
  ];

  const serial = (
    k: number,
    code: string,
    org: string | null,
    status: SerialStatus,
    order: string | null,
    note = "",
  ): Serial => ({
    id: uid("da", k),
    variant_id: VARIANT_ID.DB3,
    serial: code,
    org_id: org,
    status,
    order_number: order,
    note,
    updated_at: at(k * HOUR),
  });
  const serials: Serial[] = [
    serial(1, "DB3-26-00418", ORG.CG, "in_stock", null),
    serial(2, "DB3-26-00419", ORG.CG, "in_stock", null),
    serial(3, "DB3-26-00424", ORG.CG, "in_stock", null),
    serial(4, "DB3-26-00420", ORG.WH, "in_stock", null),
    serial(5, "DB3-26-00421", ORG.WH, "in_stock", null),
    serial(6, "DB3-26-00422", ORG.WH, "in_stock", null),
    serial(7, "DB3-26-00423", ORG.WH, "in_stock", null),
    serial(8, "DB3-26-00377", null, "sold", "BM-2611-0396"),
    serial(9, "DB3-26-00351", ORG.WH, "returned", "BM-2611-0371", "Khách trả lại, chờ kiểm"),
    serial(10, "DB3-26-00290", ORG.WH, "written_off", null, "Mẻ lưỡi"),
  ];

  const supplier = (
    id: string,
    code: string,
    name: string,
    note: string,
    terms: number,
    active = true,
  ): Supplier => ({
    id,
    org_id: ORG.ROOT,
    code,
    name,
    note,
    tax_code: "[MÃ SỐ THUẾ]",
    contact_name: "[TÊN]",
    phone: "[SỐ ĐIỆN THOẠI]",
    email: `${code.toLowerCase()}@example.com`,
    address_line: "[ĐỊA CHỈ]",
    payment_terms_days: terms,
    currency: "VND",
    active,
    updated_at: at(40 * DAY),
  });
  const suppliers: Supplier[] = [
    supplier(SUPPLIER_ID.saoMai, "NCC-TTSM", "Thuỷ Tinh Sao Mai", "Hộp và bình thuỷ tinh", 30),
    supplier(SUPPLIER_ID.xanh, "NCC-HPX", "Hoá Phẩm Xanh An Lành", "Nước rửa, tẩy rửa", 30),
    supplier(SUPPLIER_ID.bongViet, "NCC-DMBV", "Dệt May Bông Việt", "Khăn, tạp dề", 15),
    supplier(SUPPLIER_ID.phucAn, "NCC-GDPA", "Xưởng Gang Đúc Phúc An", "Chảo, nồi gang", 30),
    supplier(SUPPLIER_ID.meTay, "NCC-MMT", "Xưởng Mộc Me Tây", "Thớt, khay gỗ", 30),
    supplier(SUPPLIER_ID.lamHong, "NCC-GLH", "Xưởng Gốm Lam Hồng", "Bát đĩa gốm", 15),
    supplier(
      SUPPLIER_ID.tanPhat,
      "NCC-NTP",
      "Nhựa Gia Dụng Tân Phát",
      "Ngừng từ 09/2026",
      30,
      false,
    ),
  ];

  const pl = (
    k: number,
    sku: SampleSku,
    quantity: number,
    received: number,
    cost: number,
  ): PurchaseLine => ({
    id: uid("db", k),
    variant_id: VARIANT_ID[sku],
    quantity,
    received_quantity: received,
    unit_cost: vnd(cost),
  });
  const po = (
    n: number,
    supplierId: string,
    org: string,
    status: PurchaseStatus,
    lines: PurchaseLine[],
    expected: string | null,
    created: number,
    note = "",
  ): PurchaseOrder => ({
    id: uid("dc", n),
    number: `PO-${String(n).padStart(4, "0")}`,
    org_id: org,
    supplier_id: supplierId,
    status,
    expected_on: expected,
    ordered_by: YEN,
    note,
    total: vnd(lines.reduce((sum, l) => sum + l.quantity * Number(l.unit_cost.amount), 0)),
    created_at: at(created),
    lines,
  });
  const purchaseOrders: PurchaseOrder[] = [
    po(
      88,
      SUPPLIER_ID.meTay,
      ORG.WH,
      "draft",
      [pl(1, "TG35", 60, 0, 140_000)],
      null,
      5 * HOUR,
      "Gợi ý từ cảnh báo tồn thấp",
    ),
    po(
      87,
      SUPPLIER_ID.phucAn,
      ORG.WH,
      "ordered",
      [pl(2, "CG26", 60, 0, 405_000), pl(3, "CG28", 30, 0, 455_000)],
      vietnamDay(Date.now() + 3 * DAY),
      4 * DAY,
    ),
    po(
      86,
      SUPPLIER_ID.xanh,
      ORG.WH,
      "received",
      [pl(4, "NRC750", 72, 72, 48_000)],
      vietnamDay(Date.now() - 3 * DAY),
      8 * DAY,
    ),
    po(
      85,
      SUPPLIER_ID.saoMai,
      ORG.WH,
      "partially_received",
      [pl(5, "HT1L", 120, 60, 165_000)],
      vietnamDay(Date.now() + 5 * DAY),
      9 * DAY,
    ),
    po(
      84,
      SUPPLIER_ID.lamHong,
      ORG.Q3,
      "closed",
      [pl(6, "BG6", 20, 19, 230_000)],
      vietnamDay(Date.now() - 11 * DAY),
      14 * DAY,
      "Đóng thiếu 1",
    ),
  ];
  for (const order of purchaseOrders.filter(
    (p) => p.status === "ordered" || p.status === "partially_received",
  )) {
    for (const l of order.lines) {
      const level = levels.find((x) => x.org_id === order.org_id && x.variant_id === l.variant_id);
      if (level) level.incoming += l.quantity - l.received_quantity;
    }
  }

  const receipt = (
    n: number,
    supplierId: string,
    org: string,
    poNumber: number | null,
    lines: ReceiptLine[],
    when: number,
    status: LedgerStatus,
    reference: string,
  ): Receipt => ({
    id: uid("dd", n),
    number: `PN-${String(n).padStart(4, "0")}`,
    org_id: org,
    supplier_id: supplierId,
    purchase_order_id: poNumber === null ? null : uid("dc", poNumber),
    reference,
    total: vnd(lines.reduce((s, l) => s + l.quantity * Number(l.unit_cost.amount), 0)),
    ledger_status: status,
    posted_at: at(when),
    created_by: BAO,
    lines,
  });
  const rl = (
    sku: SampleSku,
    quantity: number,
    cost: number,
    lot: string | null = null,
    expires: string | null = null,
  ): ReceiptLine => ({
    variant_id: VARIANT_ID[sku],
    quantity,
    unit_cost: vnd(cost),
    lot_code: lot,
    expires_on: expires,
    serials: [],
  });
  const receipts: Receipt[] = [
    receipt(
      411,
      SUPPLIER_ID.bongViet,
      ORG.WH,
      null,
      [rl("KB4-XA", 30, 52_000)],
      8 * HOUR,
      "queued",
      "pn-1113-dmbv-01",
    ),
    receipt(
      409,
      SUPPLIER_ID.saoMai,
      ORG.WH,
      85,
      [rl("HT1L", 60, 165_000)],
      2 * DAY + 3 * HOUR,
      "posted",
      "SM-2611-102",
    ),
    receipt(
      405,
      SUPPLIER_ID.xanh,
      ORG.WH,
      86,
      [rl("NRC750", 72, 48_000, "NRC-2611", "2027-05-15")],
      3 * DAY,
      "posted",
      "XAL-2611-07",
    ),
    receipt(
      398,
      SUPPLIER_ID.lamHong,
      ORG.Q3,
      84,
      [rl("BG6", 19, 230_000)],
      10 * DAY,
      "posted",
      "GLH-1103",
    ),
  ];
  const returns: SupplierReturn[] = [
    {
      id: uid("de", 6),
      number: "TH-0006",
      org_id: ORG.WH,
      supplier_id: SUPPLIER_ID.saoMai,
      receipt_id: uid("dd", 409),
      reference: "th-1112-ttsm",
      reason: "4 bộ nứt",
      total: vnd(660_000),
      ledger_status: "posted",
      posted_at: at(DAY + 5 * HOUR),
      lines: [{ variant_id: VARIANT_ID.HT1L, quantity: 4, unit_cost: vnd(165_000) }],
    },
    {
      id: uid("de", 5),
      number: "TH-0005",
      org_id: ORG.Q3,
      supplier_id: SUPPLIER_ID.lamHong,
      receipt_id: uid("dd", 398),
      reference: "th-1105-glh",
      reason: "1 bộ bát mẻ",
      total: vnd(230_000),
      ledger_status: "posted",
      posted_at: at(10 * DAY - 2 * HOUR),
      lines: [{ variant_id: VARIANT_ID.BG6, quantity: 1, unit_cost: vnd(230_000) }],
    },
  ];
  return {
    levels,
    movements,
    reservations,
    transfers,
    counts,
    lots,
    serials,
    suppliers,
    payments: [{ supplier_id: SUPPLIER_ID.lamHong, amount: vnd(4_140_000), paid_at: at(5 * DAY) }],
    purchaseOrders,
    receipts,
    returns,
    ledgerDue: {},
    seq: 0,
  };
}

const KEY = Symbol.for("autoxide.sample.inventory");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleInventory(): void {
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

/** Số chứng từ kế tiếp theo tiền tố (`numbering` của bước 36). */
function nextNumber(prefix: string, used: readonly string[]): string {
  const max = used
    .filter((n) => n.startsWith(`${prefix}-`))
    .map((n) => Number(n.slice(prefix.length + 1)))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------- Đọc chung

export async function warehouses(): Promise<OrgUnit[]> {
  const { data } = await listUnits();
  // Kho trước cửa hàng: ô chọn mặc định là kho chính.
  return data
    .filter(
      (u) => (u.unit_type === "warehouse" || u.unit_type === "store") && u.status === "active",
    )
    .sort((a, b) => Number(b.unit_type === "warehouse") - Number(a.unit_type === "warehouse"));
}

/** Tên kho và biến thể; tên sản phẩm theo ngôn ngữ xin (không có thì ngôn ngữ mặc định). */
async function lookups(locale = "vi") {
  const [{ data: units }, { data: list }] = await Promise.all([listUnits(), allVariants(locale)]);
  const variants = new Map(list.map((v) => [v.variant_id, v]));
  const orgName = (id: string | null) => (id ? (units.find((u) => u.id === id)?.name ?? id) : "—");
  return { units, variants, orgName };
}

export function stockStatus(
  level: Pick<Level, "available" | "reorder_point" | "allow_negative">,
): StockStatus {
  if (level.available <= 0) return level.allow_negative ? "out_backorder" : "out";
  if (level.reorder_point !== null && level.available <= level.reorder_point) return "low";
  return "ok";
}

function levelRow(
  level: Level,
  variants: Map<string, VariantSnapshot>,
  orgName: (id: string) => string,
): LevelRow {
  const v = variants.get(level.variant_id);
  return {
    ...level,
    reserved: level.on_hand - level.available,
    sku: v?.sku ?? level.variant_id,
    name: v?.name ?? level.variant_id,
    variant_label: v?.variant_label ?? "",
    org_name: orgName(level.org_id),
    status: stockStatus(level),
    lot_tracked: v?.lot_tracked ?? false,
    serial_tracked: v?.serial_tracked ?? false,
  };
}

/** Dòng tồn của (kho, biến thể); chưa có thì tạo dòng trống (như lần nhập đầu ở core). */
function levelFor(orgId: string, variantId: string, snapshot?: VariantSnapshot): Level {
  const s = store();
  let level = s.levels.find((l) => l.org_id === orgId && l.variant_id === variantId);
  if (!level) {
    level = {
      id: newId("d1"),
      org_id: orgId,
      variant_id: variantId,
      on_hand: 0,
      available: 0,
      reserved: 0,
      incoming: 0,
      reorder_point: null,
      allow_negative: snapshot?.allow_backorder ?? false,
      average_cost: ZERO,
      updated_at: now(),
    };
    s.levels.push(level);
  }
  return level;
}

/**
 * Ghi một dòng sổ và đổi số tồn cùng lúc — đường duy nhất đổi `on_hand` / `available` (như
 * `rows::adjust` của core). Giữ chỗ không đi qua đây vì không ghi sổ.
 */
function move(
  level: Level,
  kind: MovementKind,
  quantity: number,
  source: { type: string; id: string; label: string },
  extra: {
    reason?: ReasonCode | null;
    note?: string;
    lot?: string | null;
    cost?: Money;
    actor?: Ref | null;
  } = {},
): Movement {
  const s = store();
  level.on_hand += quantity;
  level.available += quantity;
  level.reserved = level.on_hand - level.available;
  level.updated_at = now();
  const movement: Movement = {
    id: newId("d2"),
    org_id: level.org_id,
    variant_id: level.variant_id,
    level_id: level.id,
    kind,
    quantity,
    unit_cost: extra.cost ?? level.average_cost,
    lot_code: extra.lot ?? null,
    reason_code: extra.reason ?? null,
    note: extra.note ?? "",
    source_type: source.type,
    source_id: source.id,
    source_label: source.label,
    actor: extra.actor === undefined ? SAMPLE_ACTOR : extra.actor,
    created_at: now(),
  };
  s.movements.push(movement);
  return movement;
}

/**
 * Giá vốn bình quân gia quyền sau khi nhập `quantity` với giá `cost`. Làm tròn nửa lên xa số 0 về
 * đơn vị nhỏ nhất (khuyến nghị của đặc tả 42); tồn ≤ 0 trước khi nhập thì giá vốn = giá nhập. Hàm
 * thuần (test).
 */
export function weightedAverage(
  onHand: number,
  average: number,
  quantity: number,
  cost: number,
): number {
  if (onHand <= 0) return cost;
  const total = onHand * average + quantity * cost;
  const units = onHand + quantity;
  return Math.sign(total) * Math.round(Math.abs(total) / units);
}

/** So `on_hand` với tổng sổ của từng dòng (`inventory.verify_levels`): chỉ báo, không sửa. */
export function verifyLevels(): { level_id: string; on_hand: number; ledger: number }[] {
  const s = store();
  return s.levels
    .map((l) => ({
      level_id: l.id,
      on_hand: l.on_hand,
      ledger: s.movements.filter((m) => m.level_id === l.id).reduce((n, m) => n + m.quantity, 0),
    }))
    .filter((x) => x.on_hand !== x.ledger);
}

// ---------------------------------------------------------------- Tồn

export interface LevelQuery {
  locale?: string;
  org_id?: string;
  status?: StockStatus | "below";
  q?: string;
  limit?: number;
  cursor?: string | null;
}

// Thay bằng GET /api/v1/inventory/levels?org_id=&variant_id=&below_reorder= (bước 42) khi core có.
// Tìm không dấu theo tên và SKU (dự kiến `q`). Dòng cần xử lý trước: hết, dưới mức, rồi đủ.
export async function listLevels(query: LevelQuery = {}): Promise<SamplePage<LevelRow>> {
  const { variants, orgName } = await lookups(query.locale);
  const needle = query.q ? fold(query.q) : "";
  const rank: Record<StockStatus, number> = { out: 0, out_backorder: 1, low: 2, ok: 3 };
  const rows = store()
    .levels.map((l) => levelRow(l, variants, orgName))
    .filter((l) => !query.org_id || l.org_id === query.org_id)
    .filter((l) =>
      !query.status
        ? true
        : query.status === "below"
          ? l.status !== "ok"
          : query.status === "out"
            ? l.status === "out" || l.status === "out_backorder"
            : l.status === query.status,
    )
    .filter((l) => !needle || fold(`${l.name} ${l.sku} ${l.variant_label}`).includes(needle))
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        a.name.localeCompare(b.name) ||
        a.org_name.localeCompare(b.org_name),
    );
  return samplePage(rows, { limit: query.limit ?? 50, cursor: query.cursor ?? null });
}

// Thay bằng GET /api/v1/inventory/levels/{id} (bước 42) khi core có. Kèm chỗ đang giữ, lô, serial
// và biến động gần đây (dự kiến `include=`).
export async function getLevel(
  id: string,
  locale = "vi",
): Promise<{
  data: {
    level: LevelRow;
    reservations: Reservation[];
    lots: LotRow[];
    serials: Serial[];
    movements: MovementRow[];
  };
} | null> {
  const s = store();
  const level = s.levels.find((l) => l.id === id);
  if (!level) return null;
  const { variants, orgName } = await lookups(locale);
  const row = levelRow(level, variants, orgName);
  return {
    data: {
      level: row,
      reservations: s.reservations.filter((r) => r.level_id === id).map((r) => ({ ...r })),
      lots: s.lots.filter((l) => l.level_id === id).map((l) => lotRow(l, row)),
      serials: s.serials
        .filter(
          (x) =>
            x.variant_id === level.variant_id &&
            x.org_id === level.org_id &&
            x.status === "in_stock",
        )
        .map((x) => ({ ...x })),
      movements: s.movements
        .filter((m) => m.level_id === id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 6)
        .map((m) => ({ ...m, sku: row.sku, name: row.name, org_name: row.org_name })),
    },
  };
}

/** Số liệu đầu màn (dự kiến: `GET /reports/valuation` + đếm theo trạng thái). */
export async function inventoryStats(): Promise<{
  data: {
    value: Money;
    by_org: { org_id: string; org_name: string; value: Money }[];
    low: number;
    out: number;
    in_transit: number;
    low_by_org: { org_name: string; count: number }[];
  };
}> {
  const s = store();
  const { orgName } = await lookups();
  const units = await warehouses();
  const value = (levels: Level[]) =>
    levels.reduce((n, l) => n + Math.max(0, l.on_hand) * Number(l.average_cost.amount), 0);
  const low = s.levels.filter((l) => stockStatus(l) === "low");
  const lowBy = new Map<string, number>();
  for (const l of low) lowBy.set(l.org_id, (lowBy.get(l.org_id) ?? 0) + 1);
  return {
    data: {
      value: vnd(value(s.levels)),
      by_org: units.map((u) => ({
        org_id: u.id,
        org_name: u.name,
        value: vnd(value(s.levels.filter((l) => l.org_id === u.id))),
      })),
      low: low.length,
      out: s.levels.filter((l) => l.available <= 0).length,
      in_transit: s.transfers.filter((t) => t.status === "in_transit").length,
      low_by_org: [...lowBy.entries()].map(([org, count]) => ({ org_name: orgName(org), count })),
    },
  };
}

// Thay bằng PATCH /api/v1/inventory/levels/{id} `{reorder_point}` (bước 42) khi core có.
export async function setReorderPoint(id: string, value: string): Promise<SampleOutcome<Level>> {
  const level = store().levels.find((l) => l.id === id);
  if (!level) return fail(404, "inventory.level_not_found", "Stock level not found.");
  const text = value.trim();
  if (text && !/^\d{1,7}$/.test(text))
    return invalid([fieldError("reorder_point", "whole_number")]);
  level.reorder_point = text ? Number(text) : null;
  level.updated_at = now();
  return { ok: true, data: { ...level } };
}

// ---------------------------------------------------------------- Sổ biến động

export interface MovementQuery {
  locale?: string;
  org_id?: string;
  kind?: MovementKind | "transfer";
  level_id?: string;
  limit?: number;
  cursor?: string | null;
}

// Thay bằng GET /api/v1/inventory/movements?org_id=&variant_id=&kind=&from=&to= (bước 42) khi core
// có. Mới trước.
export async function listMovements(query: MovementQuery = {}): Promise<SamplePage<MovementRow>> {
  const { variants, orgName } = await lookups(query.locale);
  const rows = store()
    .movements.filter((m) => !query.org_id || m.org_id === query.org_id)
    .filter((m) => !query.level_id || m.level_id === query.level_id)
    .filter((m) =>
      !query.kind
        ? true
        : query.kind === "transfer"
          ? m.kind === "transfer_in" || m.kind === "transfer_out"
          : m.kind === query.kind,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .map((m) => {
      const v = variants.get(m.variant_id);
      return {
        ...m,
        sku: v?.sku ?? m.variant_id,
        name: v?.name ?? m.variant_id,
        org_name: orgName(m.org_id),
      };
    });
  return samplePage(rows, { limit: query.limit ?? 30, cursor: query.cursor ?? null });
}

export interface AdjustInput {
  org_id: string;
  code: string;
  quantity: string;
  reason_code: string;
  note: string;
  serials: string;
  reference: string;
}

// Thay bằng POST /api/v1/inventory/adjustments (bước 42) khi core có. Lý do bắt buộc; số âm không
// được làm `on_hand` dưới 0; hàng theo serial phải ghi đủ serial; hàng theo lô trừ lô hết hạn trước.
// `reference` chống ghi hai lần khi bấm lại: cùng mã thì trả dòng đã ghi.
export async function adjustStock(
  input: AdjustInput,
): Promise<SampleOutcome<{ movement: Movement; replayed: boolean }>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const units = await warehouses();
  if (!units.some((u) => u.id === input.org_id)) errors.push(fieldError("org_id", "unknown"));
  const found = input.code.trim() ? variantByCodeSync(input.code) : null;
  if (!found) errors.push(fieldError("code", "catalog.variant_not_found"));
  const text = input.quantity.trim().replace("−", "-");
  const quantity = Number(text);
  if (!/^[+-]?\d{1,7}$/.test(text) || quantity === 0)
    errors.push(fieldError("quantity", "signed_quantity"));
  if (!input.reason_code) errors.push(fieldError("reason_code", "inventory.reason_required"));
  else if (!(REASON_CODES as readonly string[]).includes(input.reason_code))
    errors.push(fieldError("reason_code", "unknown"));
  if (!input.note.trim()) errors.push(fieldError("note", "required"));
  if (errors.length > 0 || !found) return invalid(errors);
  const reference = input.reference.trim();
  const replay = reference
    ? s.movements.find((m) => m.source_type === "adjustment" && m.source_id === reference)
    : undefined;
  if (replay) return { ok: true, data: { movement: { ...replay }, replayed: true } };
  const snapshot = (await allVariants()).data.find((v) => v.variant_id === found.variant.id);
  if (snapshot && !snapshot.track_inventory) {
    return fail(
      422,
      "inventory.not_tracked",
      "This product does not track stock (bundles count their components).",
    );
  }
  const level = levelFor(input.org_id, found.variant.id, snapshot);
  if (level.on_hand + quantity < 0) {
    return fail(
      409,
      "inventory.insufficient_stock",
      `Not enough stock: ${level.on_hand} on hand.`,
      [fieldError("quantity", "inventory.insufficient_stock", String(level.on_hand))],
    );
  }
  const serials = input.serials
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (snapshot?.serial_tracked) {
    if (serials.length !== Math.abs(quantity)) {
      return fail(
        422,
        "inventory.serials_required",
        `Enter ${Math.abs(quantity)} serial numbers.`,
        [fieldError("serials", "inventory.serials_required", String(Math.abs(quantity)))],
      );
    }
    for (const code of serials) {
      const known = s.serials.find((x) => x.variant_id === level.variant_id && x.serial === code);
      const ok =
        quantity < 0 ? known?.status === "in_stock" && known.org_id === level.org_id : !known;
      if (!ok)
        return fail(409, "inventory.serial_unavailable", `Serial ${code} is not available here.`, [
          fieldError("serials", "inventory.serial_unavailable", code),
        ]);
    }
  }
  const id = reference || newId("df");
  const movement = move(
    level,
    "adjustment",
    quantity,
    { type: "adjustment", id, label: id },
    {
      reason: input.reason_code as ReasonCode,
      note: input.note.trim(),
    },
  );
  if (snapshot?.serial_tracked) {
    for (const code of serials) {
      const known = s.serials.find((x) => x.variant_id === level.variant_id && x.serial === code);
      if (quantity < 0 && known)
        Object.assign(known, { status: "written_off", note: input.note.trim(), updated_at: now() });
      if (quantity > 0) {
        s.serials.push({
          id: newId("da"),
          variant_id: level.variant_id,
          serial: code,
          org_id: level.org_id,
          status: "in_stock",
          order_number: null,
          note: "",
          updated_at: now(),
        });
      }
    }
  }
  if (snapshot?.lot_tracked && quantity < 0) takeFromLots(level.id, -quantity);
  return { ok: true, data: { movement: { ...movement }, replayed: false } };
}

/** Trừ khỏi lô hết hạn sớm nhất trước (FEFO). */
function takeFromLots(levelId: string, quantity: number): void {
  let left = quantity;
  const lots = store()
    .lots.filter((l) => l.level_id === levelId && l.on_hand > 0)
    .sort((a, b) => (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999"));
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(lot.on_hand, left);
    lot.on_hand -= take;
    left -= take;
  }
}

// ---------------------------------------------------------------- Chuyển kho

export interface TransferRow extends StockTransfer {
  from_name: string;
  to_name: string;
  total_quantity: number;
  total_received: number;
}

async function transferRows(list: readonly StockTransfer[]): Promise<TransferRow[]> {
  const { orgName } = await lookups();
  return list.map((t) => ({
    ...structuredClone(t),
    from_name: orgName(t.from_org_id),
    to_name: orgName(t.to_org_id),
    total_quantity: t.lines.reduce((n, l) => n + l.quantity, 0),
    total_received: t.lines.reduce((n, l) => n + l.received_quantity, 0),
  }));
}

// Thay bằng GET /api/v1/inventory/transfers?status= (bước 42) khi core có. Mới trước.
export async function listTransfers(
  query: { status?: TransferStatus } = {},
): Promise<{ data: TransferRow[] }> {
  const list = store()
    .transfers.filter((t) => !query.status || t.status === query.status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { data: await transferRows(list) };
}

/** Một dòng "SKU × số lượng" (hay "SKU x 10", "SKU 10"); mỗi dòng một biến thể. */
export function parseLines(
  text: string,
  withCost = false,
): {
  lines: { code: string; quantity: number; cost: number | null; line: number }[];
  bad: number[];
} {
  const lines: { code: string; quantity: number; cost: number | null; line: number }[] = [];
  const bad: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const row = raw.trim();
    if (!row) return;
    const parts = row.split(/\s*[×xX*]\s*|\s+/).filter(Boolean);
    const [code, qty, cost] = parts;
    const quantity = Number(qty);
    const unit = cost === undefined ? null : Number(cost);
    const okCost = withCost
      ? unit !== null && Number.isInteger(unit) && unit >= 0
      : cost === undefined;
    if (!code || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000 || !okCost) {
      bad.push(index + 1);
      return;
    }
    lines.push({ code, quantity, cost: unit, line: index + 1 });
  });
  return { lines, bad };
}

function resolveLines(
  text: string,
  field: string,
  errors: NonNullable<Problem["errors"]>,
  withCost = false,
): { variant_id: string; quantity: number; cost: number | null }[] {
  const { lines, bad } = parseLines(text, withCost);
  if (bad.length > 0) errors.push(fieldError(field, "line_format", bad.join(", ")));
  if (lines.length === 0 && bad.length === 0) errors.push(fieldError(field, "required"));
  const out: { variant_id: string; quantity: number; cost: number | null }[] = [];
  const unknown: string[] = [];
  for (const l of lines) {
    const found = variantByCodeSync(l.code);
    if (!found) unknown.push(l.code);
    else out.push({ variant_id: found.variant.id, quantity: l.quantity, cost: l.cost });
  }
  if (unknown.length > 0) errors.push(fieldError(field, "unknown_sku", unknown.join(", ")));
  return out;
}

// Thay bằng POST /api/v1/inventory/transfers (bước 42) khi core có. Phiếu mới là bản nháp, chưa trừ.
export async function createTransfer(input: {
  from_org_id: string;
  to_org_id: string;
  lines: string;
  note: string;
}): Promise<SampleOutcome<StockTransfer>> {
  const s = store();
  const units = await warehouses();
  const errors: NonNullable<Problem["errors"]> = [];
  if (!units.some((u) => u.id === input.from_org_id))
    errors.push(fieldError("from_org_id", "unknown"));
  if (!units.some((u) => u.id === input.to_org_id)) errors.push(fieldError("to_org_id", "unknown"));
  if (input.from_org_id === input.to_org_id) errors.push(fieldError("to_org_id", "same_warehouse"));
  const lines = resolveLines(input.lines, "lines", errors);
  if (errors.length > 0) return invalid(errors);
  const transfer: StockTransfer = {
    id: newId("d5"),
    number: nextNumber(
      "CK",
      s.transfers.map((t) => t.number),
    ),
    from_org_id: input.from_org_id,
    to_org_id: input.to_org_id,
    status: "draft",
    note: input.note.trim(),
    reference: null,
    shipped_at: null,
    expected_on: null,
    received_at: null,
    created_at: now(),
    lines: lines.map((l) => {
      const level = s.levels.find(
        (x) => x.org_id === input.from_org_id && x.variant_id === l.variant_id,
      );
      return {
        id: newId("d4"),
        variant_id: l.variant_id,
        quantity: l.quantity,
        received_quantity: 0,
        unit_cost: level?.average_cost ?? ZERO,
        lot_code: null,
      };
    }),
  };
  s.transfers.unshift(transfer);
  return { ok: true, data: structuredClone(transfer) };
}

const TRANSFER_MOVES: Record<string, { from: TransferStatus[]; to: TransferStatus }> = {
  ship: { from: ["draft"], to: "in_transit" },
  cancel: { from: ["draft"], to: "cancelled" },
  close: { from: ["partially_received", "received"], to: "closed" },
};

function transition(from: string, to: string): SampleOutcome<never> {
  return fail(
    409,
    "inventory.invalid_transition",
    `Cannot move the document from ${from} to ${to}.`,
  );
}

// Thay bằng POST /api/v1/inventory/transfers/{id}/ship | /cancel | /close (bước 42) khi core có.
// Gửi đi: trừ kho nguồn (`transfer_out`), hàng thành "đang về" ở kho đích. Đóng: phần chưa nhận bỏ
// khỏi "đang về" (thiếu thì ghi điều chỉnh có lý do ở kho nguồn).
export async function changeTransfer(
  id: string,
  action: "ship" | "cancel" | "close",
): Promise<SampleOutcome<StockTransfer>> {
  const s = store();
  const transfer = s.transfers.find((t) => t.id === id);
  if (!transfer) return fail(404, "inventory.transfer_not_found", "Transfer not found.");
  const rule = TRANSFER_MOVES[action];
  if (!rule) return fail(404, "inventory.transfer_not_found", "Unknown action.");
  if (!rule.from.includes(transfer.status)) return transition(transfer.status, rule.to);
  if (action === "ship") {
    const short = transfer.lines.filter((l) => {
      const level = s.levels.find(
        (x) => x.org_id === transfer.from_org_id && x.variant_id === l.variant_id,
      );
      return !level || level.available < l.quantity;
    });
    if (short.length > 0) {
      const { variants } = await lookups();
      const names = short.map((l) => variants.get(l.variant_id)?.sku ?? l.variant_id).join(", ");
      return fail(409, "inventory.insufficient_stock", `Not enough stock for ${names}.`, [
        fieldError("lines", "inventory.insufficient_stock", names),
      ]);
    }
    for (const l of transfer.lines) {
      const source = levelFor(transfer.from_org_id, l.variant_id);
      move(source, "transfer_out", -l.quantity, {
        type: "transfer",
        id: transfer.id,
        label: transfer.number,
      });
      levelFor(transfer.to_org_id, l.variant_id).incoming += l.quantity;
    }
    transfer.shipped_at = now();
    transfer.expected_on = vietnamDay(Date.now() + 2 * DAY);
  }
  if (action === "close") {
    for (const l of transfer.lines) {
      const dest = levelFor(transfer.to_org_id, l.variant_id);
      dest.incoming = Math.max(0, dest.incoming - (l.quantity - l.received_quantity));
    }
  }
  transfer.status = rule.to;
  return { ok: true, data: structuredClone(transfer) };
}

// Thay bằng POST /api/v1/inventory/transfers/{id}/receive (bước 42) khi core có. `quantities` theo
// id dòng; trống = nhận đủ phần còn lại. Nhận nhiều hơn số gửi: `inventory.over_receipt`.
export async function receiveTransfer(
  id: string,
  quantities: Record<string, string> | null,
): Promise<SampleOutcome<StockTransfer>> {
  const s = store();
  const transfer = s.transfers.find((t) => t.id === id);
  if (!transfer) return fail(404, "inventory.transfer_not_found", "Transfer not found.");
  if (transfer.status !== "in_transit" && transfer.status !== "partially_received")
    return transition(transfer.status, "received");
  const plan: { line: TransferLine; quantity: number }[] = [];
  const errors: NonNullable<Problem["errors"]> = [];
  for (const line of transfer.lines) {
    const left = line.quantity - line.received_quantity;
    const raw = quantities ? (quantities[line.id] ?? "").trim() : String(left);
    if (raw === "") continue;
    if (!/^\d{1,7}$/.test(raw)) {
      errors.push(fieldError(`line.${line.id}`, "whole_number"));
      continue;
    }
    const quantity = Number(raw);
    if (quantity > left) {
      errors.push(fieldError(`line.${line.id}`, "inventory.over_receipt", String(left)));
      continue;
    }
    if (quantity > 0) plan.push({ line, quantity });
  }
  if (errors.length > 0) {
    const over = errors.find((e) => e.code === "inventory.over_receipt");
    return over
      ? fail(409, "inventory.over_receipt", "Receiving more than was sent.", errors)
      : invalid(errors);
  }
  if (plan.length === 0) return invalid([fieldError("lines", "required")]);
  for (const { line, quantity } of plan) {
    const dest = levelFor(transfer.to_org_id, line.variant_id);
    const cost = weightedAverage(
      dest.on_hand,
      Number(dest.average_cost.amount),
      quantity,
      Number(line.unit_cost.amount),
    );
    dest.average_cost = vnd(cost);
    move(
      dest,
      "transfer_in",
      quantity,
      { type: "transfer", id: transfer.id, label: transfer.number },
      { cost: line.unit_cost },
    );
    dest.incoming = Math.max(0, dest.incoming - quantity);
    line.received_quantity += quantity;
  }
  transfer.received_at = now();
  transfer.status = transfer.lines.every((l) => l.received_quantity >= l.quantity)
    ? "received"
    : "partially_received";
  return { ok: true, data: structuredClone(transfer) };
}

// ---------------------------------------------------------------- Kiểm kê

export interface CountRow extends StockCount {
  org_name: string;
  counted_lines: number;
  difference: number;
  plus: number;
  minus: number;
  missing_reason: number;
}

export function countDiff(line: CountLine): number {
  return line.counted === null || line.expected_at_count === null
    ? 0
    : line.counted - line.expected_at_count;
}

async function countRows(list: readonly StockCount[]): Promise<CountRow[]> {
  const { orgName } = await lookups();
  return list.map((c) => {
    const diffs = c.lines.map(countDiff);
    return {
      ...structuredClone(c),
      org_name: orgName(c.org_id),
      counted_lines: c.lines.filter((l) => l.counted !== null).length,
      difference: diffs.reduce((a, b) => a + b, 0),
      plus: diffs.filter((d) => d > 0).reduce((a, b) => a + b, 0),
      minus: diffs.filter((d) => d < 0).reduce((a, b) => a + b, 0),
      missing_reason: c.lines.filter((l) => countDiff(l) !== 0 && !l.reason_code).length,
    };
  });
}

// Thay bằng GET /api/v1/inventory/counts?status= (bước 42) khi core có. Mới trước.
export async function listCounts(): Promise<{ data: CountRow[] }> {
  return {
    data: await countRows(
      [...store().counts].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    ),
  };
}

// Thay bằng POST /api/v1/inventory/counts (bước 42) khi core có. Phiếu có một dòng cho mỗi biến thể
// đang có dòng tồn ở kho đó; chưa đếm dòng nào.
export async function createCount(input: {
  org_id: string;
  scope: string;
}): Promise<SampleOutcome<StockCount>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  if (!(await warehouses()).some((u) => u.id === input.org_id))
    errors.push(fieldError("org_id", "unknown"));
  if (!input.scope.trim()) errors.push(fieldError("scope", "required"));
  if (errors.length > 0) return invalid(errors);
  const count: StockCount = {
    id: newId("d8"),
    number: nextNumber(
      "KK",
      s.counts.map((c) => c.number),
    ),
    org_id: input.org_id,
    scope: input.scope.trim(),
    status: "open",
    created_at: now(),
    applied_at: null,
    lines: s.levels
      .filter((l) => l.org_id === input.org_id)
      .map((l) => ({
        id: newId("d7"),
        variant_id: l.variant_id,
        counted: null,
        expected_at_count: null,
        counted_at: null,
        reason_code: null,
      })),
  };
  s.counts.unshift(count);
  return { ok: true, data: structuredClone(count) };
}

// Thay bằng PUT /api/v1/inventory/counts/{id}/lines (bước 42) khi core có. Ghi số đếm của từng dòng
// kèm `on_hand` ngay lúc đếm (để hàng bán xen giữa không làm sai chênh lệch).
export async function putCountLines(
  id: string,
  lines: Record<string, { counted: string; reason: string }>,
): Promise<SampleOutcome<StockCount>> {
  const s = store();
  const count = s.counts.find((c) => c.id === id);
  if (!count) return fail(404, "inventory.count_not_found", "Stock count not found.");
  if (count.status !== "open") return transition(count.status, "open");
  const errors: NonNullable<Problem["errors"]> = [];
  for (const line of count.lines) {
    const entry = lines[line.id];
    if (!entry) continue;
    const text = entry.counted.trim();
    if (text && !/^\d{1,7}$/.test(text)) errors.push(fieldError(`line.${line.id}`, "whole_number"));
    if (entry.reason && !(REASON_CODES as readonly string[]).includes(entry.reason))
      errors.push(fieldError(`reason.${line.id}`, "unknown"));
  }
  if (errors.length > 0) return invalid(errors);
  for (const line of count.lines) {
    const entry = lines[line.id];
    if (!entry) continue;
    const text = entry.counted.trim();
    const counted = text === "" ? null : Number(text);
    if (counted !== line.counted) {
      const level = s.levels.find(
        (l) => l.org_id === count.org_id && l.variant_id === line.variant_id,
      );
      line.counted = counted;
      line.expected_at_count = counted === null ? null : (level?.on_hand ?? 0);
      line.counted_at = counted === null ? null : now();
    }
    line.reason_code = (entry.reason || null) as ReasonCode | null;
  }
  return { ok: true, data: structuredClone(count) };
}

// Thay bằng POST /api/v1/inventory/counts/{id}/apply | /cancel (bước 42) khi core có. Áp dụng ghi
// biến động `count` bằng đúng phần lệch vào tồn hiện tại (không ghi đè bằng số đếm); dòng lệch
// chưa có lý do: `inventory.reason_required`.
export async function changeCount(
  id: string,
  action: "apply" | "cancel",
): Promise<SampleOutcome<StockCount>> {
  const s = store();
  const count = s.counts.find((c) => c.id === id);
  if (!count) return fail(404, "inventory.count_not_found", "Stock count not found.");
  if (count.status !== "open")
    return transition(count.status, action === "apply" ? "applied" : "cancelled");
  if (action === "cancel") {
    count.status = "cancelled";
    return { ok: true, data: structuredClone(count) };
  }
  const missing = count.lines.filter((l) => countDiff(l) !== 0 && !l.reason_code);
  if (missing.length > 0) {
    const { variants } = await lookups();
    const names = missing.map((l) => variants.get(l.variant_id)?.sku ?? l.variant_id).join(", ");
    return fail(
      422,
      "inventory.reason_required",
      `Lines without a reason: ${names}.`,
      missing.map((l) => fieldError(`reason.${l.id}`, "inventory.reason_required")),
    );
  }
  for (const line of count.lines.filter((l) => countDiff(l) !== 0)) {
    const level = levelFor(count.org_id, line.variant_id);
    move(
      level,
      "count",
      countDiff(line),
      { type: "count", id: count.id, label: count.number },
      { reason: line.reason_code },
    );
  }
  count.status = "applied";
  count.applied_at = now();
  return { ok: true, data: structuredClone(count) };
}

// ---------------------------------------------------------------- Lô và serial

export function lotStatus(lot: Pick<Lot, "expires_on">, day: string = vietnamDay()): LotStatus {
  if (!lot.expires_on) return "fresh";
  if (lot.expires_on <= day) return "expired";
  return (Date.parse(lot.expires_on) - Date.parse(day)) / DAY <= 30 ? "expiring" : "fresh";
}

function lotRow(lot: Lot, level: LevelRow): LotRow {
  return {
    ...lot,
    sku: level.sku,
    name: level.name,
    org_id: level.org_id,
    org_name: level.org_name,
    status: lotStatus(lot),
  };
}

// Thay bằng GET /api/v1/inventory/lots?status= (dự kiến; đặc tả 42 có bảng `inventory_lots` nhưng chưa
// có endpoint danh sách) khi core có. Hết hạn sớm trước.
export async function listLots(locale = "vi"): Promise<{ data: LotRow[] }> {
  const s = store();
  const { variants, orgName } = await lookups(locale);
  return {
    data: s.lots
      .map((lot) => {
        const level = s.levels.find((l) => l.id === lot.level_id) as Level;
        return lotRow(lot, levelRow(level, variants, orgName));
      })
      .sort((a, b) => (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999")),
  };
}

// Thay bằng POST /api/v1/inventory/adjustments (bước 42, `lot_code`, lý do `expired`) khi core có:
// loại bỏ sớm cả phần còn của một lô.
export async function writeOffLot(id: string, note: string): Promise<SampleOutcome<Lot>> {
  const s = store();
  const lot = s.lots.find((l) => l.id === id);
  if (!lot) return fail(404, "inventory.lot_unavailable", "Lot not found.");
  if (lot.on_hand <= 0)
    return fail(409, "inventory.lot_unavailable", `Lot ${lot.lot_code} has nothing left.`);
  const level = s.levels.find((l) => l.id === lot.level_id) as Level;
  move(
    level,
    "adjustment",
    -lot.on_hand,
    { type: "lot", id: lot.id, label: lot.lot_code },
    { reason: "expired", note: note.trim(), lot: lot.lot_code },
  );
  lot.on_hand = 0;
  return { ok: true, data: { ...lot } };
}

// Thay bằng GET /api/v1/inventory/serials?variant_id=&status= (dự kiến; chưa có trong đặc tả 42) khi
// core có.
export async function listSerials(locale = "vi"): Promise<{
  data: (Serial & { sku: string; name: string; org_name: string })[];
}> {
  const { variants, orgName } = await lookups(locale);
  const rank: Record<SerialStatus, number> = { returned: 0, in_stock: 1, sold: 2, written_off: 3 };
  return {
    data: store()
      .serials.map((x) => ({
        ...x,
        sku: variants.get(x.variant_id)?.sku ?? "",
        name: variants.get(x.variant_id)?.name ?? "",
        org_name: orgName(x.org_id),
      }))
      .sort((a, b) => rank[a.status] - rank[b.status] || a.serial.localeCompare(b.serial)),
  };
}

// Thay bằng POST /api/v1/inventory/serials/{id}/restock | /write-off (mới) khi core có. Hàng khách
// trả về chờ kiểm: cho bán lại (biến động `return` +1 ở kho đang giữ) hay loại bỏ.
export async function decideSerial(
  id: string,
  action: "restock" | "write_off",
): Promise<SampleOutcome<Serial>> {
  const s = store();
  const serial = s.serials.find((x) => x.id === id);
  if (!serial) return fail(404, "inventory.serial_unavailable", "Serial not found.");
  if (serial.status !== "returned" || !serial.org_id)
    return fail(
      409,
      "inventory.invalid_transition",
      `Serial ${serial.serial} is ${serial.status}.`,
    );
  if (action === "restock") {
    const level = levelFor(serial.org_id, serial.variant_id);
    move(
      level,
      "return",
      1,
      { type: "serial", id: serial.id, label: serial.serial },
      { note: serial.order_number ?? "" },
    );
    serial.status = "in_stock";
  } else {
    serial.status = "written_off";
  }
  serial.updated_at = now();
  return { ok: true, data: { ...serial } };
}

// ---------------------------------------------------------------- Nhà cung cấp

/** Job ghi sổ cái chạy nền: phiếu mới tạo chờ 30 giây rồi coi như đã ghi (mô phỏng job của core). */
function runLedgerJobs(): void {
  const s = store();
  const due = Date.now();
  for (const doc of [...s.receipts, ...s.returns]) {
    const at = s.ledgerDue[doc.id];
    if (doc.ledger_status === "queued" && at !== undefined && at <= due) {
      doc.ledger_status = "posted";
      delete s.ledgerDue[doc.id];
    }
  }
}

function postedReceipts(): Receipt[] {
  runLedgerJobs();
  return store().receipts;
}

// Thay bằng GET /api/v1/inventory/suppliers (bước 42) + số dư phải trả từ sổ cái (bước 36) khi core
// có. Đang giao dịch trước.
export async function listSuppliers(): Promise<{ data: SupplierRow[] }> {
  const s = store();
  const receipts = postedReceipts();
  return {
    data: s.suppliers
      .map((supplier) => {
        const received = receipts
          .filter((r) => r.supplier_id === supplier.id)
          .reduce((n, r) => n + Number(r.total.amount), 0);
        const returned = s.returns
          .filter((r) => r.supplier_id === supplier.id)
          .reduce((n, r) => n + Number(r.total.amount), 0);
        const paid = s.payments
          .filter((p) => p.supplier_id === supplier.id)
          .reduce((n, p) => n + Number(p.amount.amount), 0);
        return {
          ...supplier,
          received: vnd(received),
          returned: vnd(returned),
          paid: vnd(paid),
          payable: vnd(received - returned - paid),
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
  };
}

export interface SupplierInput {
  code: string;
  name: string;
  tax_code: string;
  payment_terms_days: string;
  note: string;
}

// Thay bằng POST /api/v1/inventory/suppliers (bước 42) khi core có. Mã duy nhất trong khách.
export async function createSupplier(input: SupplierInput): Promise<SampleOutcome<Supplier>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(code)) errors.push(fieldError("code", "code_format"));
  if (!input.name.trim()) errors.push(fieldError("name", "required"));
  const tax = input.tax_code.trim();
  if (tax && !/^\d{10}(-\d{3})?$/.test(tax)) errors.push(fieldError("tax_code", "tax_code"));
  const terms = input.payment_terms_days.trim() || "0";
  if (!/^\d{1,3}$/.test(terms)) errors.push(fieldError("payment_terms_days", "whole_number"));
  if (errors.length > 0) return invalid(errors);
  if (s.suppliers.some((x) => x.code === code)) {
    return fail(409, "inventory.supplier_code_taken", `Supplier code ${code} already exists.`, [
      fieldError("code", "inventory.supplier_code_taken"),
    ]);
  }
  const supplier: Supplier = {
    id: newId("d6"),
    org_id: ORG.ROOT,
    code,
    name: input.name.trim(),
    note: input.note.trim(),
    tax_code: tax || null,
    contact_name: null,
    phone: null,
    email: null,
    address_line: null,
    payment_terms_days: Number(terms),
    currency: "VND",
    active: true,
    updated_at: now(),
  };
  s.suppliers.push(supplier);
  return { ok: true, data: { ...supplier } };
}

// Thay bằng PATCH /api/v1/inventory/suppliers/{id} `{active}` (bước 42) khi core có.
export async function setSupplierActive(
  id: string,
  active: boolean,
): Promise<SampleOutcome<{ supplier: Supplier; previous: boolean }>> {
  const supplier = store().suppliers.find((x) => x.id === id);
  if (!supplier) return fail(404, "inventory.supplier_not_found", "Supplier not found.");
  const previous = supplier.active;
  supplier.active = active;
  supplier.updated_at = now();
  return { ok: true, data: { supplier: { ...supplier }, previous } };
}

// ---------------------------------------------------------------- Đơn đặt mua, phiếu nhập, trả hàng

export interface PurchaseRow extends PurchaseOrder {
  supplier_name: string;
  org_name: string;
  quantity: number;
  received: number;
}

// Thay bằng GET /api/v1/inventory/purchase-orders?status= (bước 42) khi core có. Mới trước.
export async function listPurchaseOrders(): Promise<{ data: PurchaseRow[] }> {
  const s = store();
  const { orgName } = await lookups();
  return {
    data: [...s.purchaseOrders]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => ({
        ...structuredClone(p),
        supplier_name: s.suppliers.find((x) => x.id === p.supplier_id)?.name ?? p.supplier_id,
        org_name: orgName(p.org_id),
        quantity: p.lines.reduce((n, l) => n + l.quantity, 0),
        received: p.lines.reduce((n, l) => n + l.received_quantity, 0),
      })),
  };
}

export interface PurchaseInput {
  supplier_id: string;
  org_id: string;
  lines: string;
  expected_on: string;
}

// Thay bằng POST /api/v1/inventory/purchase-orders (bước 42) khi core có. Dòng viết
// "SKU × số lượng × giá nhập (đồng, chưa GTGT)". Đơn mới là bản nháp.
export async function createPurchaseOrder(
  input: PurchaseInput,
): Promise<SampleOutcome<PurchaseOrder>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const supplier = s.suppliers.find((x) => x.id === input.supplier_id);
  if (!supplier) errors.push(fieldError("supplier_id", "unknown"));
  else if (!supplier.active) errors.push(fieldError("supplier_id", "inventory.supplier_inactive"));
  if (!(await warehouses()).some((u) => u.id === input.org_id))
    errors.push(fieldError("org_id", "unknown"));
  if (input.expected_on && !/^\d{4}-\d{2}-\d{2}$/.test(input.expected_on))
    errors.push(fieldError("expected_on", "date"));
  const lines = resolveLines(input.lines, "lines", errors, true);
  if (errors.length > 0) return invalid(errors);
  const order: PurchaseOrder = {
    id: newId("dc"),
    number: nextNumber(
      "PO",
      s.purchaseOrders.map((p) => p.number),
    ),
    org_id: input.org_id,
    supplier_id: input.supplier_id,
    status: "draft",
    expected_on: input.expected_on || null,
    ordered_by: SAMPLE_ACTOR,
    note: "",
    total: vnd(lines.reduce((n, l) => n + l.quantity * (l.cost ?? 0), 0)),
    created_at: now(),
    lines: lines.map((l) => ({
      id: newId("db"),
      variant_id: l.variant_id,
      quantity: l.quantity,
      received_quantity: 0,
      unit_cost: vnd(l.cost ?? 0),
    })),
  };
  s.purchaseOrders.unshift(order);
  return { ok: true, data: structuredClone(order) };
}

// Thay bằng POST /api/v1/inventory/purchase-orders/{id}/order | /close | /cancel (bước 42) khi core
// có. Đặt hàng đưa số chưa nhận vào "đang về" của kho nhận; đóng / huỷ bỏ phần chưa nhận.
export async function changePurchaseOrder(
  id: string,
  action: "order" | "close" | "cancel",
): Promise<SampleOutcome<PurchaseOrder>> {
  const s = store();
  const order = s.purchaseOrders.find((p) => p.id === id);
  if (!order) return fail(404, "inventory.purchase_order_not_found", "Purchase order not found.");
  const rules: Record<typeof action, { from: PurchaseStatus[]; to: PurchaseStatus }> = {
    order: { from: ["draft"], to: "ordered" },
    close: { from: ["partially_received", "received"], to: "closed" },
    cancel: { from: ["draft", "ordered"], to: "cancelled" },
  };
  const rule = rules[action];
  if (!rule.from.includes(order.status)) return transition(order.status, rule.to);
  const wasOpen = order.status === "ordered" || order.status === "partially_received";
  if (action === "order") {
    for (const l of order.lines) levelFor(order.org_id, l.variant_id).incoming += l.quantity;
  } else if (wasOpen) {
    for (const l of order.lines) {
      const level = levelFor(order.org_id, l.variant_id);
      level.incoming = Math.max(0, level.incoming - (l.quantity - l.received_quantity));
    }
  }
  order.status = rule.to;
  return { ok: true, data: structuredClone(order) };
}

export interface ReceiptRow extends Receipt {
  supplier_name: string;
  org_name: string;
  purchase_order_number: string | null;
}

// Thay bằng GET /api/v1/inventory/receipts (bước 42) khi core có. Mới trước.
export async function listReceipts(): Promise<{ data: ReceiptRow[] }> {
  const s = store();
  const { orgName } = await lookups();
  return {
    data: [...postedReceipts()]
      .sort((a, b) => b.posted_at.localeCompare(a.posted_at))
      .map((r) => ({
        ...structuredClone(r),
        supplier_name: s.suppliers.find((x) => x.id === r.supplier_id)?.name ?? "—",
        org_name: orgName(r.org_id),
        purchase_order_number:
          s.purchaseOrders.find((p) => p.id === r.purchase_order_id)?.number ?? null,
      })),
  };
}

export interface ReceiptInput {
  /** Đơn đặt mua; trống = nhập thẳng (cần `supplier_id` và `org_id`). */
  purchase_order_id: string;
  supplier_id: string;
  org_id: string;
  reference: string;
  /** "SKU × số lượng" theo đơn (giá theo đơn), hay "SKU × số lượng × giá" khi nhập thẳng. */
  lines: string;
  /** "Mã lô hạn-dùng" (vd "NRC-2612 2027-06-30") cho hàng theo lô. */
  lot: string;
}

// Thay bằng POST /api/v1/inventory/receipts (bước 42) khi core có. `reference` bắt buộc
// (`submit_once`): bấm lại cùng mã thì trả phiếu cũ, không nhập hai lần. Mỗi phiếu cộng tồn, tính
// lại giá vốn bình quân, cập nhật đơn đặt mua và xếp job ghi sổ cái.
export async function createReceipt(
  input: ReceiptInput,
): Promise<SampleOutcome<{ receipt: Receipt; replayed: boolean }>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const reference = input.reference.trim();
  if (!reference) errors.push(fieldError("reference", "required"));
  const replay = reference ? s.receipts.find((r) => r.reference === reference) : undefined;
  if (replay) return { ok: true, data: { receipt: structuredClone(replay), replayed: true } };
  const order = input.purchase_order_id
    ? s.purchaseOrders.find((p) => p.id === input.purchase_order_id)
    : undefined;
  if (input.purchase_order_id && !order) errors.push(fieldError("purchase_order_id", "unknown"));
  if (order && order.status !== "ordered" && order.status !== "partially_received") {
    errors.push(fieldError("purchase_order_id", "inventory.invalid_transition"));
  }
  const supplierId = order?.supplier_id ?? input.supplier_id;
  const orgId = order?.org_id ?? input.org_id;
  if (!order) {
    if (!s.suppliers.some((x) => x.id === supplierId))
      errors.push(fieldError("supplier_id", "unknown"));
    if (!(await warehouses()).some((u) => u.id === orgId))
      errors.push(fieldError("org_id", "unknown"));
  }
  const lines = resolveLines(input.lines, "lines", errors, !order);
  const lot = input.lot.trim().split(/\s+/).filter(Boolean);
  if (lot.length > 0 && (lot.length > 2 || (lot[1] && !/^\d{4}-\d{2}-\d{2}$/.test(lot[1]))))
    errors.push(fieldError("lot", "lot_format"));
  const { data: snapshots } = await allVariants();
  const needsLot = lines.some(
    (l) => snapshots.find((v) => v.variant_id === l.variant_id)?.lot_tracked,
  );
  if (needsLot && lot.length === 0) errors.push(fieldError("lot", "inventory.lot_required"));
  if (order) {
    for (const l of lines) {
      const line = order.lines.find((x) => x.variant_id === l.variant_id);
      if (!line) errors.push(fieldError("lines", "not_on_order"));
      else if (l.quantity > line.quantity - line.received_quantity) {
        errors.push(
          fieldError(
            "lines",
            "inventory.over_receipt",
            String(line.quantity - line.received_quantity),
          ),
        );
      }
    }
  }
  if (errors.length > 0) {
    const over = errors.find((e) => e.code === "inventory.over_receipt");
    return over
      ? fail(409, "inventory.over_receipt", "Receiving more than was ordered.", errors)
      : invalid(errors);
  }
  const receiptLines: ReceiptLine[] = lines.map((l) => {
    const cost = order
      ? Number(order.lines.find((x) => x.variant_id === l.variant_id)?.unit_cost.amount ?? 0)
      : (l.cost ?? 0);
    const tracked = snapshots.find((v) => v.variant_id === l.variant_id)?.lot_tracked;
    return {
      variant_id: l.variant_id,
      quantity: l.quantity,
      unit_cost: vnd(cost),
      lot_code: tracked ? (lot[0] ?? null) : null,
      expires_on: tracked ? (lot[1] ?? null) : null,
      serials: [],
    };
  });
  const receipt: Receipt = {
    id: newId("dd"),
    number: nextNumber(
      "PN",
      s.receipts.map((r) => r.number),
    ),
    org_id: orgId,
    supplier_id: supplierId,
    purchase_order_id: order?.id ?? null,
    reference,
    total: vnd(receiptLines.reduce((n, l) => n + l.quantity * Number(l.unit_cost.amount), 0)),
    ledger_status: "queued",
    posted_at: now(),
    created_by: SAMPLE_ACTOR,
    lines: receiptLines,
  };
  for (const l of receiptLines) {
    const level = levelFor(
      orgId,
      l.variant_id,
      snapshots.find((v) => v.variant_id === l.variant_id),
    );
    level.average_cost = vnd(
      weightedAverage(
        level.on_hand,
        Number(level.average_cost.amount),
        l.quantity,
        Number(l.unit_cost.amount),
      ),
    );
    move(
      level,
      "receipt",
      l.quantity,
      { type: "receipt", id: receipt.id, label: receipt.number },
      { cost: l.unit_cost, lot: l.lot_code },
    );
    if (l.lot_code) {
      const existing = s.lots.find((x) => x.level_id === level.id && x.lot_code === l.lot_code);
      if (existing) existing.on_hand += l.quantity;
      else
        s.lots.push({
          id: newId("d9"),
          level_id: level.id,
          lot_code: l.lot_code,
          expires_on: l.expires_on,
          on_hand: l.quantity,
          received_at: now(),
          receipt_number: receipt.number,
        });
    }
    if (order) {
      const line = order.lines.find((x) => x.variant_id === l.variant_id) as PurchaseLine;
      line.received_quantity += l.quantity;
      level.incoming = Math.max(0, level.incoming - l.quantity);
    }
  }
  if (order)
    order.status = order.lines.every((l) => l.received_quantity >= l.quantity)
      ? "received"
      : "partially_received";
  s.receipts.unshift(receipt);
  s.ledgerDue[receipt.id] = Date.now() + 30_000;
  return { ok: true, data: { receipt: structuredClone(receipt), replayed: false } };
}

/** Nhận đủ phần còn lại của một đơn đặt mua (nút "Nhận đủ"): một phiếu nhập mới. */
export async function receivePurchaseOrder(
  id: string,
): Promise<SampleOutcome<{ receipt: Receipt; replayed: boolean }>> {
  const s = store();
  const order = s.purchaseOrders.find((p) => p.id === id);
  if (!order) return fail(404, "inventory.purchase_order_not_found", "Purchase order not found.");
  const { data: snapshots } = await allVariants();
  const lines = order.lines
    .filter((l) => l.quantity > l.received_quantity)
    .map(
      (l) =>
        `${snapshots.find((v) => v.variant_id === l.variant_id)?.sku ?? ""} × ${l.quantity - l.received_quantity}`,
    )
    .join("\n");
  const needsLot = order.lines.some(
    (l) => snapshots.find((v) => v.variant_id === l.variant_id)?.lot_tracked,
  );
  return createReceipt({
    purchase_order_id: id,
    supplier_id: "",
    org_id: "",
    reference: `${order.number}:${order.lines.reduce((n, l) => n + l.received_quantity, 0)}`,
    lines,
    lot: needsLot ? `${order.number}-LOT` : "",
  });
}

export interface ReturnRow extends SupplierReturn {
  supplier_name: string;
  receipt_number: string | null;
}

// Thay bằng GET /api/v1/inventory/supplier-returns (bước 42) khi core có. Mới trước.
export async function listSupplierReturns(): Promise<{ data: ReturnRow[] }> {
  runLedgerJobs();
  const s = store();
  return {
    data: [...s.returns]
      .sort((a, b) => b.posted_at.localeCompare(a.posted_at))
      .map((r) => ({
        ...structuredClone(r),
        supplier_name: s.suppliers.find((x) => x.id === r.supplier_id)?.name ?? r.supplier_id,
        receipt_number: s.receipts.find((x) => x.id === r.receipt_id)?.number ?? null,
      })),
  };
}

// Thay bằng POST /api/v1/inventory/supplier-returns (bước 42) khi core có. Trừ tồn ở kho của phiếu
// nhập (`supplier_return`), giá theo phiếu nhập; xếp job đảo bút toán phải trả.
export async function createSupplierReturn(input: {
  receipt_number: string;
  lines: string;
  reason: string;
}): Promise<SampleOutcome<SupplierReturn>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const receipt = s.receipts.find((r) => r.number === input.receipt_number.trim().toUpperCase());
  if (!receipt) errors.push(fieldError("receipt_number", "inventory.receipt_not_found"));
  if (!input.reason.trim()) errors.push(fieldError("reason", "required"));
  const lines = resolveLines(input.lines, "lines", errors);
  if (receipt) {
    for (const l of lines) {
      const got = receipt.lines.find((x) => x.variant_id === l.variant_id);
      const already = s.returns
        .filter((r) => r.receipt_id === receipt.id)
        .flatMap((r) => r.lines)
        .filter((x) => x.variant_id === l.variant_id)
        .reduce((n, x) => n + x.quantity, 0);
      if (!got) errors.push(fieldError("lines", "not_on_receipt"));
      else if (l.quantity > got.quantity - already)
        errors.push(fieldError("lines", "inventory.over_receipt", String(got.quantity - already)));
    }
  }
  if (errors.length > 0 || !receipt) return invalid(errors);
  for (const l of lines) {
    const level = levelFor(receipt.org_id, l.variant_id);
    if (level.available < l.quantity) {
      return fail(409, "inventory.insufficient_stock", "Not enough stock to return.", [
        fieldError("lines", "inventory.insufficient_stock", String(level.available)),
      ]);
    }
  }
  const ret: SupplierReturn = {
    id: newId("de"),
    number: nextNumber(
      "TH",
      s.returns.map((r) => r.number),
    ),
    org_id: receipt.org_id,
    supplier_id: receipt.supplier_id ?? "",
    receipt_id: receipt.id,
    reference: newId("de"),
    reason: input.reason.trim(),
    total: vnd(0),
    ledger_status: "queued",
    posted_at: now(),
    lines: [],
  };
  for (const l of lines) {
    const cost = receipt.lines.find((x) => x.variant_id === l.variant_id)?.unit_cost ?? ZERO;
    const level = levelFor(receipt.org_id, l.variant_id);
    move(
      level,
      "supplier_return",
      -l.quantity,
      { type: "supplier_return", id: ret.id, label: ret.number },
      { cost, note: ret.reason },
    );
    ret.lines.push({ variant_id: l.variant_id, quantity: l.quantity, unit_cost: cost });
  }
  ret.total = vnd(ret.lines.reduce((n, l) => n + l.quantity * Number(l.unit_cost.amount), 0));
  s.returns.unshift(ret);
  s.ledgerDue[ret.id] = Date.now() + 30_000;
  return { ok: true, data: structuredClone(ret) };
}

/** Phải trả và giá trị nhập tháng này (đầu tab Nhập hàng; dự kiến đọc từ sổ cái, bước 36). */
export async function purchasingStats(): Promise<{
  data: {
    payable: Money;
    queued: Money;
    open_orders: string[];
    received_month: Money;
    receipts_month: number;
  };
}> {
  const s = store();
  const receipts = postedReceipts();
  const { data: suppliers } = await listSuppliers();
  const month = vietnamDay().slice(0, 7);
  const inMonth = receipts.filter((r) => vietnamDay(Date.parse(r.posted_at)).startsWith(month));
  return {
    data: {
      payable: vnd(suppliers.reduce((n, x) => n + Number(x.payable.amount), 0)),
      queued: vnd(
        receipts
          .filter((r) => r.ledger_status === "queued")
          .reduce((n, r) => n + Number(r.total.amount), 0),
      ),
      open_orders: s.purchaseOrders
        .filter((p) => p.status === "ordered" || p.status === "partially_received")
        .map((p) => p.number),
      received_month: vnd(inMonth.reduce((n, r) => n + Number(r.total.amount), 0)),
      receipts_month: inMonth.length,
    },
  };
}
