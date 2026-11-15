// Dữ liệu mẫu của màn "Kênh bán" (module `channels` của core, bước 48, chưa có). Màn dựng hoàn toàn bằng
// file này (W-006, W-019). Hình dạng theo đặc tả `docs/steps/48-channels.md` của core (mục "Trait và sổ
// bộ nối", "Phân bổ tồn", "Đơn từ kênh", "Đối soát tiền kênh trả", "Bảng dữ liệu", "API REST", "Mã lỗi");
// trường đặc tả chưa có ghi "dự kiến" và nằm trong bảng chỗ thiếu API.
//
// Một bộ dữ liệu cho cả ứng dụng:
// - tài khoản và liên kết gốc ở `sample/channel-accounts.ts` (màn Đơn hàng dùng cùng bộ đó để dựng đơn
//   nhập từ kênh: kênh, tài khoản, mã đơn trên kênh, giá kênh);
// - "Đơn từ kênh" là các đơn thật của `sample/orders.ts` có kênh Shopee / TikTok Shop, cộng vài đơn kênh
//   gửi về chưa nhập được (thiếu ánh xạ, nhập lỗi); ánh xạ xong thì nhập thành đơn mới ở màn Đơn hàng;
// - tồn bán được đọc từ `sample/inventory.ts`; giá web từ bảng giá của `sample/catalog.ts`;
// - bảng kê đối soát dựng từ đơn kênh đã hoàn tất; số "kênh còn nợ" khớp sổ cái.
//
// Khoá kết nối (token) không bao giờ được lưu ở đây — chỉ thời điểm đặt khoá, như kho secret theo khách
// của core (không đọc lại được). SĐT người mua do kênh che một phần. Tiền là `Money`; giờ lưu UTC.
import type { Problem } from "@autoxide/sdk";
import { type Money, pricesAt, type Ref, variantByCode } from "./catalog";
import {
  ACCOUNT_SEEDS,
  type AccountStatus,
  CHANNEL_KINDS,
  type ChannelKind,
  channelPrice,
  externalRef,
  INSTALLED_KINDS,
  LISTING_SEEDS,
  type ListingStatus,
  type PriceRule,
} from "./channel-accounts";
import { listLevels } from "./inventory";
import { importChannelOrder, num, type Order, ordersState, transitionOrder, vnd } from "./orders";
import { listUnits, type OrgUnit } from "./org";
import { vietnamDay } from "./tax";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 48

export const CAPABILITIES = [
  "listings",
  "price",
  "stock",
  "pull_orders",
  "webhooks",
  "fulfillment",
  "cancel",
  "settlements",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface Connector {
  kind: ChannelKind;
  installed: boolean;
  capabilities: Capability[];
  max_batch: number | null;
}

export interface ChannelAccount {
  id: string;
  kind: ChannelKind;
  name: string;
  org_id: string;
  org_name: string;
  warehouse_org_ids: string[];
  warehouse_names: string[];
  status: AccountStatus;
  /** Đã có khoá kết nối trong kho secret (không bao giờ trả khoá). */
  credentials_set_at: string | null;
  settings: { auto_cancel_oversold: boolean; order_pull_minutes: number };
  last_synced_at: string | null;
  status_changed_at: string;
  status_changed_by: Ref | null;
  status_reason: string | null;
  updated_at: string;
}

export interface Listing {
  id: string;
  account_id: string;
  account_name: string;
  kind: ChannelKind;
  variant_id: string;
  sku: string;
  name: string;
  external_sku: string;
  status: ListingStatus;
  price_rule: PriceRule;
  web_price: Money | null;
  channel_price: Money | null;
  last_error: string | null;
  last_pushed_at: string | null;
  last_pushed_stock: number | null;
  updated_at: string;
}

export interface Allocation {
  id: string;
  account_id: string;
  /** `null` = mặc định của tài khoản. */
  variant_id: string | null;
  mode: "share" | "reserved";
  share_bp: number;
  reserved_qty: number;
  buffer_qty: number;
  updated_at: string;
}

export interface StockPreviewRow {
  account_id: string;
  account_name: string;
  kind: ChannelKind;
  status: AccountStatus;
  available: number;
  mode: Allocation["mode"];
  share_bp: number;
  reserved_qty: number;
  buffer_qty: number;
  /** Số sẽ đẩy; `null` khi tài khoản không chạy (không đẩy). */
  push: number | null;
}

export type InboundStatus =
  | "received"
  | "needs_mapping"
  | "imported"
  | "oversold"
  | "conflict"
  | "failed";

export interface InboundLine {
  external_sku: string;
  title: string;
  quantity: number;
  unit_price: Money;
  /** SKU trong danh mục khi đã ánh xạ. */
  sku: string | null;
}

export interface InboundOrder {
  id: string;
  account_id: string;
  account_name: string;
  kind: ChannelKind;
  external_order_id: string;
  external_status: string;
  status: InboundStatus;
  order_id: string | null;
  order_number: string | null;
  buyer_masked: string;
  lines: InboundLine[];
  total: Money;
  conflict: string | null;
  attempts: number;
  last_error: string | null;
  /** Dự kiến: người đã đóng xung đột / xử lý đơn bán quá. */
  resolution: { by: Ref; at: string; note: string; action: string } | null;
  received_at: string;
  updated_at: string;
}

export type SettlementStatus = "imported" | "matched" | "mismatch" | "posted";

export interface SettlementFee {
  code: "fixed" | "payment" | "service";
  rate_bp: number;
  amount: Money;
}

export interface SettlementLine {
  id: string;
  settlement_id: string;
  external_order_id: string;
  order_id: string | null;
  order_number: string | null;
  revenue: Money;
  /** Số Autoxide ghi cho đơn (tiền đơn trừ hoàn); `null` khi không có đơn. */
  recorded: Money | null;
  fees_total: Money;
  subsidy: Money;
  net: Money;
  status: "matched" | "mismatch" | "resolved";
  reason: "refunded_but_paid" | "order_not_found" | null;
  note: string | null;
}

export interface Settlement {
  id: string;
  account_id: string;
  account_name: string;
  kind: ChannelKind;
  external_payout_id: string;
  period_from: string;
  period_to: string;
  revenue: Money;
  fees: SettlementFee[];
  subsidy: Money;
  payout: Money;
  line_count: number;
  mismatch_count: number;
  status: SettlementStatus;
  posted_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------- Đồ dùng chung

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

export const SAMPLE_ACTOR: Ref = { id: "01a1e000-0000-7000-8000-000000000f99", name: "Bạn" };
const HUY: Ref = { id: "01a1e000-0000-7000-8000-000000000f22", name: "Lê Quang Huy" };

/** Phí kênh trong bảng kê mẫu (phần vạn của doanh thu); con số là của bảng kê, không phải luật. */
const FEE_RATES: readonly [SettlementFee["code"], number][] = [
  ["fixed", 500],
  ["payment", 250],
  ["service", 200],
];

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

const accountNotFound = () => fail(404, "channels.account_not_found", "Channel account not found.");

function wholeNumber(text: string, min: number, max: number): number | null {
  const clean = text.replace(/[\s.,₫%]/g, "");
  if (!/^\d{1,12}$/.test(clean)) return null;
  const n = Number(clean);
  return n >= min && n <= max ? n : null;
}

// ---------------------------------------------------------------- Kho trong bộ nhớ

interface AccountRow extends Omit<ChannelAccount, "org_name" | "warehouse_names"> {}

interface Overlay {
  /** Mã đơn Autoxide của dòng (đơn bán quá / xung đột). */
  number: string;
  status: "oversold" | "conflict";
  external_status: string;
  conflict: string | null;
  received_at: string;
  resolution: InboundOrder["resolution"];
}

interface PendingInbound {
  id: string;
  account_id: string;
  external_order_id: string;
  external_status: string;
  status: "needs_mapping" | "failed" | "imported";
  buyer: string;
  lines: InboundLine[];
  method: "ewallet" | "cod";
  attempts: number;
  last_error: string | null;
  order_number: string | null;
  received_at: string;
  updated_at: string;
}

interface Store {
  accounts: AccountRow[];
  listings: Omit<Listing, "web_price" | "channel_price" | "name" | "account_name" | "kind">[];
  allocations: Allocation[];
  overlays: Overlay[];
  pending: PendingInbound[];
  settlements: Omit<
    Settlement,
    | "revenue"
    | "fees"
    | "subsidy"
    | "payout"
    | "line_count"
    | "mismatch_count"
    | "account_name"
    | "kind"
  >[];
  lines: Omit<SettlementLine, "net" | "fees_total">[];
  units: OrgUnit[];
  seq: number;
}

function isChannelOrder(o: Order): boolean {
  return o.channel_account !== null && o.external_ref !== null;
}

async function seed(): Promise<Store> {
  const [{ orders }, { data: units }] = await Promise.all([ordersState(), listUnits()]);
  const now = Date.now();
  const accounts: AccountRow[] = ACCOUNT_SEEDS.map((a) => ({
    id: a.id,
    kind: a.kind,
    name: a.name,
    org_id: a.org_id,
    warehouse_org_ids: a.warehouse_org_ids,
    status: a.status,
    credentials_set_at: a.status === "unavailable" ? null : new Date(now - 60 * DAY).toISOString(),
    settings: { auto_cancel_oversold: false, order_pull_minutes: 5 },
    last_synced_at:
      a.status === "unavailable"
        ? null
        : new Date(
            now - (a.status === "active" ? 18 * MINUTE : a.since_hours * HOUR),
          ).toISOString(),
    status_changed_at: new Date(now - (a.since_hours || 24 * 40) * HOUR).toISOString(),
    status_changed_by: a.status === "paused" ? HUY : null,
    status_reason:
      a.status === "paused"
        ? "Kiểm kê kho CN Cầu Giấy"
        : a.status === "reauth_required"
          ? "channels.credentials_invalid"
          : null,
    updated_at: new Date(now - (a.since_hours || 1) * HOUR).toISOString(),
  }));
  const { data: allVariants } = await Promise.all(
    [...new Set(LISTING_SEEDS.map((l) => l.sku))].map((sku) => variantByCode(sku)),
  ).then((list) => ({ data: list.map((x) => x.data).filter((x) => x !== null) }));
  const listings: Store["listings"] = LISTING_SEEDS.map((l, i) => ({
    id: uid("b3", i + 1),
    account_id: l.account_id,
    variant_id: allVariants.find((v) => v.sku === l.sku)?.variant_id ?? "",
    sku: l.sku,
    external_sku: l.external_sku,
    status: l.status,
    price_rule: l.price_rule,
    last_error: l.last_error ?? null,
    last_pushed_at: l.status === "live" ? new Date(now - 18 * MINUTE).toISOString() : null,
    last_pushed_stock: null,
    updated_at: new Date(now - 3 * DAY).toISOString(),
  }));
  const ni20 = allVariants.find((v) => v.sku === "NI20")?.variant_id ?? null;
  const [official, tiktok, hanoi] = ACCOUNT_SEEDS;
  const alloc = (
    n: number,
    account: string | undefined,
    variant: string | null,
    mode: Allocation["mode"],
    share: number,
    reserved: number,
    buffer: number,
  ): Allocation => ({
    id: uid("b4", n),
    account_id: account ?? "",
    variant_id: variant,
    mode,
    share_bp: share * 100,
    reserved_qty: reserved,
    buffer_qty: buffer,
    updated_at: new Date(now - 9 * DAY).toISOString(),
  });
  const allocations = [
    alloc(1, official?.id, null, "share", 60, 0, 2),
    alloc(2, tiktok?.id, null, "share", 30, 0, 1),
    alloc(3, tiktok?.id, ni20, "reserved", 0, 20, 0),
    alloc(4, hanoi?.id, null, "share", 40, 0, 1),
  ];

  // Đơn bán quá: đơn Official mới nhất còn chờ nhận / đã xác nhận (website bán cái cuối trước khi kênh kịp
  // đồng bộ). Xung đột: đơn Official đã hoàn tất mà kênh báo huỷ (thường là trả hàng qua kênh).
  const officialOrders = orders.filter((o) => o.channel_account?.id === official?.id);
  const oversold = officialOrders.find((o) =>
    ["awaiting_acceptance", "confirmed"].includes(o.status),
  );
  const conflicted = officialOrders.find((o) => o.status === "completed");
  const overlays: Overlay[] = [];
  if (oversold) {
    overlays.push({
      number: oversold.number,
      status: "oversold",
      external_status: "READY_TO_SHIP",
      conflict: null,
      received_at: oversold.placed_at,
      resolution: null,
    });
  }
  if (conflicted) {
    overlays.push({
      number: conflicted.number,
      status: "conflict",
      external_status: "CANCELLED",
      conflict: "orders.invalid_transition",
      received_at: new Date(now - 2 * HOUR - 20 * MINUTE).toISOString(),
      resolution: null,
    });
  }
  const today = vietnamDay(now);
  const unit = async (sku: string, accountId: string) => {
    const v = allVariants.find((x) => x.sku === sku);
    const listing = LISTING_SEEDS.find((l) => l.account_id === accountId && l.sku === sku);
    const account = ACCOUNT_SEEDS.find((a) => a.id === accountId);
    if (!v || !account) return 0;
    const web = num(
      (await pricesAt(account.org_id, [v.variant_id])).get(v.variant_id)?.price?.amount,
    );
    return listing ? channelPrice(listing.price_rule, web, today) : web;
  };
  const line = async (
    accountId: string,
    externalSku: string,
    title: string,
    quantity: number,
    sku: string | null,
    fallback: number,
  ): Promise<InboundLine> => ({
    external_sku: externalSku,
    title,
    quantity,
    unit_price: vnd(sku ? await unit(sku, accountId) : fallback),
    sku,
  });
  const pending: PendingInbound[] = [];
  if (official) {
    pending.push({
      id: uid("b5", 1),
      account_id: official.id,
      external_order_id: externalRef("shopee", 9087, today),
      external_status: "READY_TO_SHIP",
      status: "needs_mapping",
      buyer: "Phùng Thị Lan",
      lines: [
        await line(official.id, "CG26-SHP", "Chảo gang 26 cm", 1, "CG26", 0),
        await line(official.id, "CG28-SHP", "Chảo gang đúc 28cm có tay cầm", 1, null, 810_000),
      ],
      method: "ewallet",
      attempts: 1,
      last_error: "channels.mapping_incomplete",
      order_number: null,
      received_at: new Date(now - 41 * MINUTE).toISOString(),
      updated_at: new Date(now - 41 * MINUTE).toISOString(),
    });
    pending.push({
      id: uid("b5", 2),
      account_id: official.id,
      external_order_id: externalRef("shopee", 9091, today),
      external_status: "READY_TO_SHIP",
      status: "needs_mapping",
      buyer: "Kiều Văn Đạt",
      lines: [await line(official.id, "KB4-BE", "Khăn bếp cotton bộ 4 màu be", 2, null, 99_000)],
      method: "cod",
      attempts: 1,
      last_error: "channels.mapping_incomplete",
      order_number: null,
      received_at: new Date(now - 34 * MINUTE).toISOString(),
      updated_at: new Date(now - 34 * MINUTE).toISOString(),
    });
  }
  if (tiktok) {
    pending.push({
      id: uid("b5", 3),
      account_id: tiktok.id,
      external_order_id: "TT-57810044",
      external_status: "AWAITING_SHIPMENT",
      status: "failed",
      buyer: "Mạc Gia Bảo",
      lines: [await line(tiktok.id, "BD3-TTS", "Bộ dao bếp 3 món", 1, "DB3", 0)],
      method: "ewallet",
      attempts: 10,
      last_error: "channels.credentials_invalid",
      order_number: null,
      received_at: new Date(now - 12 * HOUR).toISOString(),
      updated_at: new Date(now - 9 * HOUR).toISOString(),
    });
  }

  // Bảng kê: đơn kênh đã hoàn tất của từng tài khoản, theo ngày hoàn tất. Official: nửa đầu đã ghi sổ,
  // nửa sau còn hai dòng lệch (đơn đã huỷ kênh vẫn trả tiền; đơn không có trong Autoxide).
  const settlements: Store["settlements"] = [];
  const lines: Store["lines"] = [];
  let lineSeq = 0;
  const addLine = (
    settlementId: string,
    o: Order | null,
    external: string,
    revenue: number,
    subsidy: number,
    reason: SettlementLine["reason"],
  ) => {
    lineSeq += 1;
    lines.push({
      id: uid("b7", lineSeq),
      settlement_id: settlementId,
      external_order_id: external,
      order_id: o?.id ?? null,
      order_number: o?.number ?? null,
      revenue: vnd(revenue),
      recorded: o ? vnd(o.status === "cancelled" ? 0 : num(o.total) - num(o.refunded)) : null,
      subsidy: vnd(subsidy),
      status: reason ? "mismatch" : "matched",
      reason,
      note: null,
    });
  };
  const day = (iso: string | null) => vietnamDay(Date.parse(iso ?? new Date(now).toISOString()));
  let payoutSeq = 0;
  for (const account of [official, hanoi]) {
    if (!account) continue;
    const done = orders
      .filter(
        (o) => o.channel_account?.id === account.id && o.status === "completed" && o.completed_at,
      )
      .filter((o) => o.number !== conflicted?.number)
      .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));
    const chunks =
      account === official
        ? [done.slice(0, Math.ceil(done.length / 2)), done.slice(Math.ceil(done.length / 2))]
        : [done];
    for (const [i, chunk] of chunks.entries()) {
      if (chunk.length === 0) continue;
      payoutSeq += 1;
      const id = uid("b6", payoutSeq);
      const last = account === official && i === 1;
      const from = day(chunk[0]?.completed_at ?? null);
      const to = day(chunk.at(-1)?.completed_at ?? null);
      settlements.push({
        id,
        account_id: account.id,
        external_payout_id: `PO-${to.replaceAll("-", "").slice(2)}${String(payoutSeq).padStart(2, "0")}`,
        period_from: from,
        period_to: to,
        status: last ? "mismatch" : "posted",
        posted_at: last ? null : new Date(Date.parse(`${to}T03:00:00Z`) + 2 * DAY).toISOString(),
        created_at: new Date(Date.parse(`${to}T03:00:00Z`) + DAY).toISOString(),
      });
      for (const [k, o] of chunk.entries()) {
        addLine(id, o, o.external_ref ?? "", num(o.total), last && k === 0 ? 30_000 : 0, null);
      }
      if (last) {
        const cancelled = officialOrders.find((o) => o.status === "cancelled");
        if (cancelled) {
          addLine(
            id,
            cancelled,
            cancelled.external_ref ?? "",
            num(cancelled.total),
            0,
            "refunded_but_paid",
          );
        }
        addLine(id, null, externalRef("shopee", 188, "2026-10-15"), 540_000, 0, "order_not_found");
      }
    }
  }
  return { accounts, listings, allocations, overlays, pending, settlements, lines, units, seq: 0 };
}

const KEY = Symbol.for("autoxide.sample.channels");
type Holder = { [KEY]?: Promise<Store> };

function store(): Promise<Store> {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Dựng lại kho mẫu (test). */
export function resetSampleChannels(): void {
  (globalThis as Holder)[KEY] = seed();
}

function unitName(s: Store, id: string): string {
  return s.units.find((u) => u.id === id)?.name ?? id;
}

function accountView(s: Store, a: AccountRow): ChannelAccount {
  return {
    ...a,
    org_name: unitName(s, a.org_id),
    warehouse_names: a.warehouse_org_ids.map((id) => unitName(s, id)),
  };
}

// ---------------------------------------------------------------- Bộ nối, tài khoản

// Thay bằng GET /api/v1/channels/connectors (bước 48).
export async function listConnectors(): Promise<{ data: Connector[] }> {
  return {
    data: CHANNEL_KINDS.map((kind) => ({
      kind,
      installed: INSTALLED_KINDS.includes(kind),
      capabilities:
        kind === "shopee"
          ? [...CAPABILITIES]
          : kind === "tiktok_shop"
            ? CAPABILITIES.filter((c) => c !== "cancel")
            : [],
      max_batch: kind === "shopee" ? 50 : kind === "tiktok_shop" ? 20 : null,
    })),
  };
}

// Thay bằng GET /api/v1/channels/accounts (bước 48).
export async function listAccounts(): Promise<{ data: ChannelAccount[] }> {
  const s = await store();
  return { data: s.accounts.map((a) => accountView(s, a)) };
}

export async function getAccount(id: string): Promise<ChannelAccount | null> {
  const s = await store();
  const a = s.accounts.find((x) => x.id === id);
  return a ? accountView(s, a) : null;
}

// Thay bằng POST /api/v1/channels/accounts (bước 48): khoá kết nối ghi vào kho secret của khách rồi gọi
// `verify` của bộ nối; trả 201. Khoá không bao giờ được trả lại hay ghi log.
export async function connectAccount(input: {
  kind: string;
  name: string;
  org_id: string;
  token: string;
}): Promise<SampleOutcome<ChannelAccount>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const kind = (CHANNEL_KINDS as readonly string[]).includes(input.kind)
    ? (input.kind as ChannelKind)
    : null;
  if (!kind) errors.push(fieldError("kind", "unknown"));
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) errors.push(fieldError("name", "required"));
  else if (name.length > 60) errors.push(fieldError("name", "too_long"));
  const unit = s.units.find(
    (u) => u.id === input.org_id && (u.unit_type === "store" || u.unit_type === "tenant"),
  );
  if (!unit) errors.push(fieldError("org_id", "unknown"));
  const token = input.token.trim();
  if (!token) errors.push(fieldError("token", "required"));
  if (errors.length > 0) return invalid(errors);
  if (kind && !INSTALLED_KINDS.includes(kind)) {
    return fail(422, "channels.connector_unavailable", `No connector installed for ${kind}.`, [
      fieldError("kind", "channels.connector_unavailable", kind),
    ]);
  }
  if (
    s.accounts.some(
      (a) =>
        a.kind === kind &&
        a.name.toLowerCase() === name.toLowerCase() &&
        a.status !== "disconnected",
    )
  ) {
    return fail(409, "channels.account_exists", `${name} is already connected.`, [
      fieldError("name", "channels.account_exists", name),
    ]);
  }
  // Bộ nối mẫu: kênh từ chối khoá ngắn hơn 24 ký tự hay có khoảng trắng (như `verify` thất bại).
  if (token.length < 24 || /\s/.test(token)) {
    return fail(422, "channels.credentials_invalid", "The channel rejected the credentials.", [
      fieldError("token", "channels.credentials_invalid"),
    ]);
  }
  s.seq += 1;
  const now = new Date().toISOString();
  const row: AccountRow = {
    id: uid("b2", 100 + s.seq),
    kind: kind ?? "shopee",
    name,
    org_id: unit?.id ?? "",
    warehouse_org_ids: unit?.unit_type === "store" ? [unit.id] : [],
    status: "active",
    credentials_set_at: now,
    settings: { auto_cancel_oversold: false, order_pull_minutes: 5 },
    last_synced_at: null,
    status_changed_at: now,
    status_changed_by: SAMPLE_ACTOR,
    status_reason: null,
    updated_at: now,
  };
  s.accounts.push(row);
  s.allocations.push({
    id: uid("b4", 100 + s.seq),
    account_id: row.id,
    variant_id: null,
    mode: "share",
    share_bp: 0,
    reserved_qty: 0,
    buffer_qty: 0,
    updated_at: now,
  });
  return { ok: true, data: accountView(s, row) };
}

// Thay bằng POST /api/v1/channels/accounts/{id}/pause | /resume (bước 48). Đảo được.
export async function setAccountRunning(
  id: string,
  running: boolean,
): Promise<SampleOutcome<ChannelAccount>> {
  const s = await store();
  const a = s.accounts.find((x) => x.id === id);
  if (!a) return accountNotFound();
  const allowed = running ? a.status === "paused" : a.status === "active";
  if (!allowed) {
    return fail(409, "channels.invalid_account_state", `The account is ${a.status}.`);
  }
  const now = new Date().toISOString();
  a.status = running ? "active" : "paused";
  a.status_changed_at = now;
  a.status_changed_by = SAMPLE_ACTOR;
  a.status_reason = null;
  a.updated_at = now;
  return { ok: true, data: accountView(s, a) };
}

// Thay bằng PUT /api/v1/channels/accounts/{id} {credentials} (bước 48): khoá mới ghi vào kho secret và
// kiểm với kênh; tài khoản `reauth_required` chạy lại, job kéo đơn tiếp từ con trỏ cũ.
export async function reconnectAccount(
  id: string,
  tokenText: string,
): Promise<SampleOutcome<ChannelAccount>> {
  const s = await store();
  const a = s.accounts.find((x) => x.id === id);
  if (!a) return accountNotFound();
  const token = tokenText.trim();
  if (!token) return invalid([fieldError("token", "required")]);
  if (a.status === "unavailable" || a.status === "disconnected") {
    return fail(422, "channels.connector_unavailable", `No connector installed for ${a.kind}.`);
  }
  if (token.length < 24 || /\s/.test(token)) {
    return fail(422, "channels.credentials_invalid", "The channel rejected the credentials.", [
      fieldError("token", "channels.credentials_invalid"),
    ]);
  }
  const now = new Date().toISOString();
  a.credentials_set_at = now;
  a.status = "active";
  a.status_changed_at = now;
  a.status_changed_by = SAMPLE_ACTOR;
  a.status_reason = null;
  a.last_synced_at = now;
  a.updated_at = now;
  return { ok: true, data: accountView(s, a) };
}

// Thay bằng POST /api/v1/channels/accounts/{id}/disconnect (bước 48): xoá khoá, giữ lịch sử. Không đảo được.
export async function disconnectAccount(id: string): Promise<SampleOutcome<ChannelAccount>> {
  const s = await store();
  const a = s.accounts.find((x) => x.id === id);
  if (!a) return accountNotFound();
  if (a.status === "disconnected")
    return fail(409, "channels.invalid_account_state", "Already disconnected.");
  const now = new Date().toISOString();
  a.status = "disconnected";
  a.credentials_set_at = null;
  a.status_changed_at = now;
  a.status_changed_by = SAMPLE_ACTOR;
  a.updated_at = now;
  return { ok: true, data: accountView(s, a) };
}

// Thay bằng POST /api/v1/channels/accounts/{id}/sync (bước 48) cho từng tài khoản đang chạy (job).
export async function syncAll(): Promise<SampleOutcome<{ accounts: number }>> {
  const s = await store();
  const now = new Date().toISOString();
  const running = s.accounts.filter((a) => a.status === "active");
  for (const a of running) a.last_synced_at = now;
  return { ok: true, data: { accounts: running.length } };
}

// ---------------------------------------------------------------- Liên kết sản phẩm

export type ListingChip = "live" | "pending" | "error" | "draft";

// Thay bằng GET /api/v1/channels/accounts/{id}/listings (bước 48), gộp mọi tài khoản (dự kiến).
export async function listListings(chip: ListingChip | null = null): Promise<{ data: Listing[] }> {
  const s = await store();
  const today = vietnamDay();
  const out: Listing[] = [];
  for (const l of s.listings) {
    if (
      chip &&
      !(chip === "error" ? l.status === "error" || l.status === "rejected" : l.status === chip)
    )
      continue;
    const a = s.accounts.find((x) => x.id === l.account_id);
    if (!a) continue;
    const { data: v } = await variantByCode(l.sku);
    const web = num((await pricesAt(a.org_id, [l.variant_id])).get(l.variant_id)?.price?.amount);
    out.push({
      ...l,
      account_name: a.name,
      kind: a.kind,
      name: v ? `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}` : l.sku,
      web_price: web ? vnd(web) : null,
      channel_price: web ? vnd(channelPrice(l.price_rule, web, today)) : null,
    });
  }
  return { data: out };
}

/** Quy tắc giá đọc từ form: theo bảng giá, % (âm = giảm), hay giá cố định từ một ngày. */
function readPriceRule(
  mode: string,
  value: string,
  from: string,
): PriceRule | { error: string; field: string } {
  if (mode === "price_list") return { kind: "price_list" };
  if (mode === "markup") {
    const m = /^([+-−]?)(\d{1,2})(?:[.,](\d))?$/.exec(value.trim().replace("%", ""));
    if (!m) return { error: value.trim() ? "channels.markup_invalid" : "required", field: "value" };
    const bp =
      (Number(m[2]) * 100 + Number(m[3] ?? 0) * 10) * (m[1] === "-" || m[1] === "−" ? -1 : 1);
    if (bp === 0 || bp < -5000) return { error: "channels.markup_invalid", field: "value" };
    return { kind: "markup", markup_bp: bp, rounding_minor: 1000 };
  }
  if (mode === "fixed") {
    const amount = wholeNumber(value, 1000, 1_000_000_000);
    if (amount === null)
      return { error: value.trim() ? "number_invalid" : "required", field: "value" };
    const day = /^\d{4}-\d{2}-\d{2}$/.test(from.trim()) ? from.trim() : null;
    if (!day) return { error: from.trim() ? "date_invalid" : "required", field: "from" };
    return { kind: "fixed", amount, effective_from: day };
  }
  return { error: "unknown", field: "mode" };
}

// Thay bằng PUT /api/v1/channels/accounts/{id}/listings/{variant_id} (bước 48): liên kết mã và giá riêng.
// Một mã kênh chỉ gắn với một biến thể trên mỗi tài khoản (`channels.sku_taken`).
export async function linkListing(input: {
  account_id: string;
  sku: string;
  external_sku: string;
  mode: string;
  value: string;
  from: string;
}): Promise<SampleOutcome<Listing>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const a = s.accounts.find((x) => x.id === input.account_id);
  if (!a) errors.push(fieldError("account_id", "unknown"));
  const { data: v } = await variantByCode(input.sku.trim());
  if (!input.sku.trim()) errors.push(fieldError("sku", "required"));
  else if (!v) errors.push(fieldError("sku", "channels.variant_not_found", input.sku.trim()));
  const ext = input.external_sku.trim().toUpperCase();
  if (!ext) errors.push(fieldError("external_sku", "required"));
  else if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(ext))
    errors.push(fieldError("external_sku", "channels.external_sku_invalid"));
  const rule = readPriceRule(input.mode, input.value, input.from);
  if ("error" in rule) errors.push(fieldError(rule.field, rule.error));
  if (errors.length > 0) return invalid(errors);
  if (a && (a.status === "unavailable" || a.status === "disconnected")) {
    return fail(422, "channels.connector_unavailable", `No connector installed for ${a.kind}.`);
  }
  const taken = s.listings.find(
    (l) => l.account_id === a?.id && l.external_sku === ext && l.variant_id !== v?.variant_id,
  );
  if (taken) {
    return fail(409, "channels.sku_taken", `${ext} is linked to another product on this account.`, [
      fieldError("external_sku", "channels.sku_taken", ext),
    ]);
  }
  const now = new Date().toISOString();
  let row = s.listings.find((l) => l.account_id === a?.id && l.variant_id === v?.variant_id);
  if (row) {
    row.external_sku = ext;
    row.price_rule = rule as PriceRule;
    row.updated_at = now;
  } else {
    s.seq += 1;
    row = {
      id: uid("b3", 100 + s.seq),
      account_id: a?.id ?? "",
      variant_id: v?.variant_id ?? "",
      sku: v?.sku ?? "",
      external_sku: ext,
      status: "draft",
      price_rule: rule as PriceRule,
      last_error: null,
      last_pushed_at: null,
      last_pushed_stock: null,
      updated_at: now,
    };
    s.listings.push(row);
  }
  const { data } = await listListings();
  const out = data.find((x) => x.id === row?.id);
  return out
    ? { ok: true, data: out }
    : fail(404, "channels.listing_not_found", "Listing not found.");
}

export type ListingAction = "publish" | "retry" | "delist";

// Thay bằng POST /api/v1/channels/accounts/{id}/listings/{variant_id}/publish (bước 48; gỡ bán là dự kiến
// `…/delist`). Đăng là job: trạng thái sang "đang đăng", kết quả về sau vài phút.
export async function changeListing(
  id: string,
  action: ListingAction,
): Promise<SampleOutcome<Listing>> {
  const s = await store();
  const l = s.listings.find((x) => x.id === id);
  if (!l) return fail(404, "channels.listing_not_found", "Listing not found.");
  const a = s.accounts.find((x) => x.id === l.account_id);
  const ok =
    (action === "publish" && l.status === "draft") ||
    (action === "retry" && (l.status === "error" || l.status === "rejected")) ||
    (action === "delist" && l.status === "live");
  if (!ok) return fail(409, "channels.invalid_listing_state", `The listing is ${l.status}.`);
  if (action !== "delist" && a?.status !== "active") {
    return fail(409, "channels.account_paused", "The channel account is not running.");
  }
  l.status = action === "delist" ? "delisted" : "pending";
  l.last_error = null;
  l.updated_at = new Date().toISOString();
  const { data } = await listListings();
  const out = data.find((x) => x.id === id);
  return out
    ? { ok: true, data: out }
    : fail(404, "channels.listing_not_found", "Listing not found.");
}

// ---------------------------------------------------------------- Phân bổ tồn

// Thay bằng GET /api/v1/channels/accounts/{id}/allocations (bước 48), gộp mọi tài khoản (dự kiến).
export async function listAllocations(): Promise<{
  data: (Allocation & {
    account_name: string;
    kind: ChannelKind;
    status: AccountStatus;
    variant_name: string | null;
  })[];
}> {
  const s = await store();
  const out = [];
  for (const al of s.allocations) {
    const a = s.accounts.find((x) => x.id === al.account_id);
    if (!a || a.status === "unavailable" || a.status === "disconnected") continue;
    let variantName: string | null = null;
    if (al.variant_id) {
      const sku = s.listings.find((l) => l.variant_id === al.variant_id)?.sku ?? "";
      const { data: v } = await variantByCode(sku);
      variantName = v?.name ?? sku;
    }
    out.push({
      ...al,
      account_name: a.name,
      kind: a.kind,
      status: a.status,
      variant_name: variantName,
    });
  }
  return { data: out };
}

/** Phân bổ áp cho một (tài khoản, biến thể): dòng riêng của biến thể, không có thì mặc định. */
function allocationFor(s: Store, accountId: string, variantId: string): Allocation | null {
  return (
    s.allocations.find((a) => a.account_id === accountId && a.variant_id === variantId) ??
    s.allocations.find((a) => a.account_id === accountId && a.variant_id === null) ??
    null
  );
}

async function availableAt(variantId: string, orgIds: readonly string[]): Promise<number> {
  const { data } = await listLevels({ limit: 5000 });
  return data
    .filter((l) => l.variant_id === variantId && orgIds.includes(l.org_id))
    .reduce((s, l) => s + Math.max(0, l.available), 0);
}

/**
 * Số đẩy cho mỗi kênh (đặc tả 48, "Phân bổ tồn"): `reserved` = phần giữ thật; `share` =
 * floor((khả dụng − Σ phần giữ của mọi kênh) × tỉ lệ) − đệm, không âm. Hàm thuần (test kiểm Σ ≤ khả dụng).
 */
export function pushQuantities(
  available: number,
  rules: readonly Pick<Allocation, "mode" | "share_bp" | "reserved_qty" | "buffer_qty">[],
): number[] {
  const reservedTotal = rules
    .filter((r) => r.mode === "reserved")
    .reduce((s, r) => s + r.reserved_qty, 0);
  const pool = Math.max(0, available - reservedTotal);
  return rules.map((r) =>
    r.mode === "reserved"
      ? Math.min(r.reserved_qty, available)
      : Math.max(0, Math.floor((pool * r.share_bp) / 10_000) - r.buffer_qty),
  );
}

// Thay bằng GET /api/v1/channels/accounts/{id}/stock-preview?variant_id= (bước 48), gộp mọi tài khoản
// (dự kiến). Website bán được phần không giữ riêng cho kênh nào.
export async function stockPreview(variantId: string): Promise<{
  rows: StockPreviewRow[];
  available: number;
  reserved: number;
  website: number;
}> {
  const s = await store();
  const live = s.accounts.filter((a) => a.status !== "unavailable" && a.status !== "disconnected");
  const warehouses = [...new Set(live.flatMap((a) => a.warehouse_org_ids))];
  const available = await availableAt(variantId, warehouses);
  const rows: StockPreviewRow[] = [];
  for (const a of live) {
    const al = allocationFor(s, a.id, variantId);
    if (!al) continue;
    const own = await availableAt(variantId, a.warehouse_org_ids);
    // Phần giữ của các tài khoản khác dùng chung kho.
    const others = live
      .filter(
        (b) => b.id !== a.id && b.warehouse_org_ids.some((w) => a.warehouse_org_ids.includes(w)),
      )
      .map((b) => allocationFor(s, b.id, variantId))
      .filter((x): x is Allocation => x !== null && x.mode === "reserved");
    const [push] = pushQuantities(own, [al, ...others]);
    rows.push({
      account_id: a.id,
      account_name: a.name,
      kind: a.kind,
      status: a.status,
      available: own,
      mode: al.mode,
      share_bp: al.share_bp,
      reserved_qty: al.reserved_qty,
      buffer_qty: al.buffer_qty,
      push: a.status === "active" ? (push ?? 0) : null,
    });
  }
  const reserved = rows
    .filter((r) => r.mode === "reserved")
    .reduce((sum, r) => sum + Math.min(r.reserved_qty, r.available), 0);
  return { rows, available, reserved, website: Math.max(0, available - reserved) };
}

// Thay bằng PUT /api/v1/channels/accounts/{id}/allocations[/{variant_id}] (bước 48). Tổng tỉ lệ của các
// tài khoản dùng chung kho không quá 100% (`channels.allocation_invalid`); giữ riêng cần đủ tồn
// (`channels.allocation_unavailable`, báo số giữ được).
export async function saveAllocation(input: {
  id: string;
  mode: string;
  share: string;
  reserved: string;
  buffer: string;
}): Promise<SampleOutcome<Allocation>> {
  const s = await store();
  const al = s.allocations.find((x) => x.id === input.id);
  if (!al) return fail(404, "channels.allocation_not_found", "Allocation not found.");
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  if (input.mode !== "share" && input.mode !== "reserved")
    errors.push(fieldError("mode", "unknown"));
  const share = wholeNumber(input.share || "0", 0, 100);
  if (share === null) errors.push(fieldError("share", "channels.allocation_invalid"));
  const reserved = wholeNumber(input.reserved || "0", 0, 100_000);
  if (reserved === null) errors.push(fieldError("reserved", "channels.allocation_invalid"));
  const buffer = wholeNumber(input.buffer || "0", 0, 1000);
  if (buffer === null) errors.push(fieldError("buffer", "channels.allocation_invalid"));
  if (input.mode === "share" && share === 0)
    errors.push(fieldError("share", "channels.allocation_invalid"));
  if (input.mode === "reserved" && !reserved)
    errors.push(fieldError("reserved", "channels.allocation_invalid"));
  if (input.mode === "reserved" && al.variant_id === null)
    errors.push(fieldError("mode", "channels.reserved_needs_variant"));
  if (errors.length > 0) return invalid(errors);
  const account = s.accounts.find((a) => a.id === al.account_id);
  if (input.mode === "share" && account) {
    const sharing = s.accounts.filter(
      (b) =>
        b.id !== account.id &&
        b.status !== "disconnected" &&
        b.status !== "unavailable" &&
        b.warehouse_org_ids.some((w) => account.warehouse_org_ids.includes(w)),
    );
    const others = sharing
      .map(
        (b) =>
          s.allocations.find((x) => x.account_id === b.id && x.variant_id === al.variant_id) ??
          s.allocations.find((x) => x.account_id === b.id && x.variant_id === null),
      )
      .filter((x): x is Allocation => x !== undefined && x.mode === "share")
      .reduce((sum, x) => sum + x.share_bp, 0);
    if (others + (share ?? 0) * 100 > 10_000) {
      return fail(422, "channels.allocation_invalid", "Shares exceed 100%.", [
        fieldError("share", "channels.share_over", String(100 - others / 100)),
      ]);
    }
  }
  if (input.mode === "reserved" && account && al.variant_id) {
    const have = await availableAt(al.variant_id, account.warehouse_org_ids);
    if ((reserved ?? 0) > have) {
      return fail(
        409,
        "channels.allocation_unavailable",
        `Only ${have} of ${reserved} can be held.`,
        [fieldError("reserved", "channels.allocation_unavailable", String(have))],
      );
    }
  }
  al.mode = input.mode as Allocation["mode"];
  al.share_bp = input.mode === "share" ? (share ?? 0) * 100 : 0;
  al.reserved_qty = input.mode === "reserved" ? (reserved ?? 0) : 0;
  al.buffer_qty = buffer ?? 0;
  al.updated_at = new Date().toISOString();
  return { ok: true, data: al };
}

// ---------------------------------------------------------------- Đơn từ kênh

function accountOf(s: Store, id: string): AccountRow | undefined {
  return s.accounts.find((a) => a.id === id);
}

function maskBuyer(name: string): string {
  const parts = name.split(" ");
  return parts.map((p, i) => (i === parts.length - 1 ? p : `${p[0] ?? ""}***`)).join(" ");
}

async function inboundRows(): Promise<InboundOrder[]> {
  const [s, { orders }] = await Promise.all([store(), ordersState()]);
  const out: InboundOrder[] = [];
  const byNumber = new Map(orders.map((o) => [o.number, o]));
  const fromOrder = (o: Order): InboundOrder => {
    const a = accountOf(s, o.channel_account?.id ?? "");
    const overlay = s.overlays.find((x) => x.number === o.number);
    return {
      id: `in-${o.id}`,
      account_id: a?.id ?? "",
      account_name: a?.name ?? "",
      kind: a?.kind ?? "shopee",
      external_order_id: o.external_ref ?? "",
      external_status: overlay?.external_status ?? externalStatus(o),
      status: overlay && !overlay.resolution ? overlay.status : "imported",
      order_id: o.id,
      order_number: o.number,
      buyer_masked: maskBuyer(o.buyer.name),
      lines: o.lines.map((l) => ({
        external_sku:
          s.listings.find((x) => x.account_id === a?.id && x.variant_id === l.variant_id)
            ?.external_sku ?? l.sku,
        title: l.name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        sku: l.sku,
      })),
      total: o.total,
      conflict: overlay?.conflict ?? null,
      attempts: 1,
      last_error: null,
      resolution: overlay?.resolution ?? null,
      received_at: overlay?.received_at ?? o.placed_at,
      updated_at: overlay?.resolution?.at ?? overlay?.received_at ?? o.updated_at,
    };
  };
  for (const o of orders) if (isChannelOrder(o)) out.push(fromOrder(o));
  for (const p of s.pending) {
    if (p.order_number && byNumber.has(p.order_number)) continue;
    const a = accountOf(s, p.account_id);
    out.push({
      id: p.id,
      account_id: p.account_id,
      account_name: a?.name ?? "",
      kind: a?.kind ?? "shopee",
      external_order_id: p.external_order_id,
      external_status: p.external_status,
      status: p.status,
      order_id: null,
      order_number: null,
      buyer_masked: maskBuyer(p.buyer),
      lines: p.lines,
      total: vnd(p.lines.reduce((sum, l) => sum + num(l.unit_price) * l.quantity, 0)),
      conflict: null,
      attempts: p.attempts,
      last_error: p.last_error,
      resolution: null,
      received_at: p.received_at,
      updated_at: p.updated_at,
    });
  }
  return out.sort((a, b) => b.received_at.localeCompare(a.received_at));
}

function externalStatus(o: Order): string {
  switch (o.status) {
    case "cancelled":
      return "CANCELLED";
    case "completed":
      return "COMPLETED";
    case "delivered":
      return "DELIVERED";
    case "shipping":
    case "delivery_failed":
      return "SHIPPED";
    default:
      return "READY_TO_SHIP";
  }
}

export type InboundChip = "needs_mapping" | "oversold" | "conflict" | "failed" | "imported";
/** Trạng thái cần người xử lý (số trên tab). */
export const INBOUND_OPEN: readonly InboundStatus[] = [
  "needs_mapping",
  "oversold",
  "conflict",
  "failed",
];

// Thay bằng GET /api/v1/channels/inbound-orders?status= (bước 48). Mặc định: việc cần xử lý trước.
export async function listInbound(
  chip: InboundChip | null = null,
): Promise<{ data: InboundOrder[] }> {
  const rows = await inboundRows();
  if (chip) return { data: rows.filter((r) => r.status === chip) };
  const rank = (r: InboundOrder) => (INBOUND_OPEN.includes(r.status) ? 0 : 1);
  return {
    data: [...rows].sort((a, b) => rank(a) - rank(b) || b.received_at.localeCompare(a.received_at)),
  };
}

// Dự kiến: số liệu đầu tab (bước 51): đơn nhận hôm nay, đã nhập, thiếu ánh xạ, xung đột / lỗi.
export async function inboundStats(): Promise<{
  today: number;
  imported_today: number;
  needs_mapping: number;
  oversold: number;
  conflict_failed: number;
  open: number;
}> {
  const rows = await inboundRows();
  const day = vietnamDay();
  const todays = rows.filter((r) => vietnamDay(Date.parse(r.received_at)) === day);
  return {
    today: todays.length,
    imported_today: todays.filter((r) => r.order_id !== null).length,
    needs_mapping: rows.filter((r) => r.status === "needs_mapping").length,
    oversold: rows.filter((r) => r.status === "oversold").length,
    conflict_failed: rows.filter((r) => r.status === "conflict" || r.status === "failed").length,
    open: rows.filter((r) => INBOUND_OPEN.includes(r.status)).length,
  };
}

async function importPending(s: Store, p: PendingInbound): Promise<SampleOutcome<InboundOrder>> {
  const a = accountOf(s, p.account_id);
  if (!a) return accountNotFound();
  if (a.status !== "active") {
    return fail(409, "channels.account_paused", "The channel account is not running.");
  }
  const missing = p.lines.filter((l) => !l.sku);
  if (missing.length > 0) {
    return fail(422, "channels.mapping_incomplete", "Some lines are not linked.", [
      fieldError(
        "sku",
        "channels.mapping_incomplete",
        missing.map((l) => l.external_sku).join(", "),
      ),
    ]);
  }
  const made = await importChannelOrder({
    account_id: a.id,
    external_ref: p.external_order_id,
    buyer: p.buyer,
    items: p.lines.map((l) => [l.sku ?? "", l.quantity] as const),
    method: p.method,
    placed_at: p.received_at,
  });
  if (!made.ok) return made;
  p.status = "imported";
  p.order_number = made.data.order.number;
  p.attempts += 1;
  p.last_error = null;
  p.updated_at = new Date().toISOString();
  const row = (await inboundRows()).find((r) => r.order_id === made.data.order.id);
  return row
    ? { ok: true, data: row }
    : fail(404, "channels.inbound_not_found", "Inbound order not found.");
}

// Thay bằng POST /api/v1/channels/inbound-orders/{id}/mapping (bước 48): gắn dòng với biến thể, lưu liên
// kết cho tài khoản (đơn sau tự khớp), rồi nhập lại ngay khi đủ mọi dòng.
export async function mapInbound(
  id: string,
  input: { external_sku: string; sku: string },
): Promise<SampleOutcome<InboundOrder>> {
  const s = await store();
  const p = s.pending.find((x) => x.id === id);
  if (p?.status !== "needs_mapping")
    return fail(404, "channels.inbound_not_found", "Inbound order not found.");
  const line = p.lines.find((l) => l.external_sku === input.external_sku);
  if (!line) return invalid([fieldError("external_sku", "unknown")]);
  const { data: v } = await variantByCode(input.sku.trim());
  if (!input.sku.trim()) return invalid([fieldError("sku", "required")]);
  if (!v) return invalid([fieldError("sku", "channels.variant_not_found", input.sku.trim())]);
  const taken = s.listings.find(
    (l) =>
      l.account_id === p.account_id &&
      l.variant_id === v.variant_id &&
      l.external_sku !== line.external_sku,
  );
  if (taken && taken.status === "live") {
    return fail(
      409,
      "channels.sku_taken",
      "This product already has another code on this account.",
      [fieldError("sku", "channels.variant_linked", taken.external_sku)],
    );
  }
  line.sku = v.sku;
  s.seq += 1;
  const existing = s.listings.find(
    (l) => l.account_id === p.account_id && l.variant_id === v.variant_id,
  );
  if (existing) {
    existing.external_sku = line.external_sku;
    existing.status = "live";
  } else {
    s.listings.push({
      id: uid("b3", 100 + s.seq),
      account_id: p.account_id,
      variant_id: v.variant_id,
      sku: v.sku,
      external_sku: line.external_sku,
      status: "live",
      price_rule: { kind: "price_list" },
      last_error: null,
      last_pushed_at: null,
      last_pushed_stock: null,
      updated_at: new Date().toISOString(),
    });
  }
  if (p.lines.some((l) => !l.sku)) {
    p.updated_at = new Date().toISOString();
    const row = (await inboundRows()).find((r) => r.id === id);
    return row
      ? { ok: true, data: row }
      : fail(404, "channels.inbound_not_found", "Inbound order not found.");
  }
  return importPending(s, p);
}

// Thay bằng POST /api/v1/channels/inbound-orders/{id}/retry (bước 48).
export async function retryInbound(id: string): Promise<SampleOutcome<InboundOrder>> {
  const s = await store();
  const p = s.pending.find((x) => x.id === id);
  if (!p || p.status === "imported")
    return fail(404, "channels.inbound_not_found", "Inbound order not found.");
  return importPending(s, p);
}

export type ResolveAction = "keep" | "cancel_on_channel" | "close_conflict";

// Thay bằng POST /api/v1/channels/inbound-orders/{id}/resolve (bước 48). Đơn bán quá: giữ đơn chờ nhập
// hàng, hoặc huỷ trên kênh với lý do hết hàng (đơn ở Autoxide chuyển huỷ, hoàn tiền qua kênh). Xung đột:
// đóng kèm ghi chú. Không đảo được.
export async function resolveInbound(
  id: string,
  action: ResolveAction,
  note: string,
): Promise<SampleOutcome<InboundOrder>> {
  const s = await store();
  const rows = await inboundRows();
  const row = rows.find((r) => r.id === id);
  if (!row?.order_number)
    return fail(404, "channels.inbound_not_found", "Inbound order not found.");
  const overlay = s.overlays.find((x) => x.number === row.order_number && !x.resolution);
  if (!overlay) return fail(409, "channels.inbound_resolved", "Already resolved.");
  const okAction =
    (overlay.status === "oversold" && (action === "keep" || action === "cancel_on_channel")) ||
    (overlay.status === "conflict" && action === "close_conflict");
  if (!okAction)
    return fail(409, "channels.invalid_resolution", "This action does not fit the inbound order.");
  const text = note.trim();
  if (action === "close_conflict" && !text) return invalid([fieldError("note", "required")]);
  if (text.length > 300) return invalid([fieldError("note", "too_long")]);
  if (action === "cancel_on_channel" && row.order_id) {
    const out = await transitionOrder(row.order_id, "cancelled", {
      reason: "channel_out_of_stock",
    });
    if (!out.ok) return out;
  }
  overlay.resolution = { by: SAMPLE_ACTOR, at: new Date().toISOString(), note: text, action };
  const next = (await inboundRows()).find((r) => r.id === id);
  return next
    ? { ok: true, data: next }
    : fail(404, "channels.inbound_not_found", "Inbound order not found.");
}

// ---------------------------------------------------------------- Đối soát

function feesOf(revenue: number): SettlementFee[] {
  return FEE_RATES.map(([code, bp]) => ({
    code,
    rate_bp: bp,
    amount: vnd(Math.round((revenue * bp) / 10_000)),
  }));
}

function settlementView(s: Store, x: Store["settlements"][number]): Settlement {
  const lines = s.lines.filter((l) => l.settlement_id === x.id);
  const revenue = lines.reduce((sum, l) => sum + num(l.revenue), 0);
  const fees = feesOf(revenue);
  const subsidy = lines.reduce((sum, l) => sum + num(l.subsidy), 0);
  const a = accountOf(s, x.account_id);
  const mismatch = lines.filter((l) => l.status === "mismatch").length;
  return {
    ...x,
    account_name: a?.name ?? "",
    kind: a?.kind ?? "shopee",
    revenue: vnd(revenue),
    fees,
    subsidy: vnd(subsidy),
    payout: vnd(revenue - fees.reduce((sum, f) => sum + num(f.amount), 0) + subsidy),
    line_count: lines.length,
    mismatch_count: mismatch,
    status: x.status === "posted" ? "posted" : mismatch > 0 ? "mismatch" : "matched",
  };
}

// Thay bằng GET /api/v1/channels/settlements (bước 48).
export async function listSettlements(): Promise<{ data: Settlement[] }> {
  const s = await store();
  return {
    data: s.settlements
      .map((x) => settlementView(s, x))
      .sort((a, b) => b.period_to.localeCompare(a.period_to)),
  };
}

// Thay bằng GET /api/v1/channels/settlements/{id} (bước 48): dòng của bảng kê.
export async function settlementLines(
  filter: { settlement_id?: string; status?: SettlementLine["status"] } = {},
): Promise<{ data: SettlementLine[] }> {
  const s = await store();
  return {
    data: s.lines
      .filter((l) => !filter.settlement_id || l.settlement_id === filter.settlement_id)
      .filter((l) => !filter.status || l.status === filter.status)
      .map((l) => {
        const fees = feesOf(num(l.revenue)).reduce((sum, f) => sum + num(f.amount), 0);
        return { ...l, fees_total: vnd(fees), net: vnd(num(l.revenue) - fees + num(l.subsidy)) };
      }),
  };
}

// Thay bằng POST /api/v1/channels/settlement-lines/{id}/resolve (bước 48): đóng dòng lệch kèm ghi chú. Không
// đảo được (ghi người xử lý vào dòng đối soát).
export async function resolveSettlementLine(
  id: string,
  note: string,
): Promise<SampleOutcome<SettlementLine>> {
  const s = await store();
  const l = s.lines.find((x) => x.id === id);
  if (!l) return fail(404, "channels.settlement_line_not_found", "Settlement line not found.");
  if (l.status !== "mismatch")
    return fail(409, "channels.settlement_line_resolved", "Already resolved.");
  const text = note.trim();
  if (!text) return invalid([fieldError("note", "required")]);
  if (text.length > 300) return invalid([fieldError("note", "too_long")]);
  l.status = "resolved";
  l.note = text;
  const { data } = await settlementLines();
  const out = data.find((x) => x.id === id);
  return out
    ? { ok: true, data: out }
    : fail(404, "channels.settlement_line_not_found", "Settlement line not found.");
}

// Dự kiến: POST /api/v1/channels/settlements/{id}/post (bước 48; đặc tả ghi sổ bằng job khi khớp hết).
// Bút toán: phí (Nợ chi phí kênh / Có phải thu kênh), tiền về ngân hàng, trợ giá. Không đảo được.
export async function postSettlement(id: string): Promise<SampleOutcome<Settlement>> {
  const s = await store();
  const x = s.settlements.find((y) => y.id === id);
  if (!x) return fail(404, "channels.settlement_not_found", "Settlement not found.");
  const view = settlementView(s, x);
  if (view.status === "posted") return fail(409, "channels.settlement_posted", "Already posted.");
  if (view.mismatch_count > 0) {
    return fail(409, "channels.settlement_mismatch", "Resolve every mismatched line first.");
  }
  x.status = "posted";
  x.posted_at = new Date().toISOString();
  return { ok: true, data: settlementView(s, x) };
}

// Thay bằng GET /api/v1/channels/settlements/summary (bước 48): phải thu kênh trong sổ cái = tiền đơn kênh
// (trừ huỷ, hoàn) − doanh thu của các dòng bảng kê đã ghi sổ.
export async function settlementSummary(): Promise<{
  receivable: Money;
  paid_30d: Money;
  fees_30d: Money;
  open_mismatches: number;
  /** Tiền đơn kênh kênh đã thu (trừ huỷ, hoàn) và phần đã ghi sổ qua bảng kê: khớp sổ cái. */
  collected: Money;
  posted: Money;
  by_account: { account_id: string; account_name: string; kind: ChannelKind; receivable: Money }[];
}> {
  const [s, { orders }] = await Promise.all([store(), ordersState()]);
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const views = s.settlements.map((x) => settlementView(s, x));
  let collected = 0;
  let postedAll = 0;
  const by_account = s.accounts
    .filter((a) => a.kind === "shopee" || a.kind === "tiktok_shop")
    .map((a) => {
      const owed = orders
        .filter(
          (o) =>
            o.channel_account?.id === a.id &&
            o.status !== "cancelled" &&
            o.payments.some((p) => p.status === "succeeded"),
        )
        .reduce((sum, o) => sum + num(o.paid) - num(o.refunded), 0);
      const posted = s.lines
        .filter(
          (l) => l.order_id && views.find((v) => v.id === l.settlement_id)?.status === "posted",
        )
        .filter((l) => s.settlements.find((x) => x.id === l.settlement_id)?.account_id === a.id)
        .reduce((sum, l) => sum + num(l.recorded), 0);
      collected += owed;
      postedAll += posted;
      return {
        account_id: a.id,
        account_name: a.name,
        kind: a.kind,
        receivable: vnd(owed - posted),
      };
    });
  const recent = views.filter((v) => v.status === "posted" && (v.posted_at ?? "") >= since);
  return {
    receivable: vnd(by_account.reduce((sum, a) => sum + num(a.receivable), 0)),
    paid_30d: vnd(recent.reduce((sum, v) => sum + num(v.payout), 0)),
    fees_30d: vnd(
      recent.reduce((sum, v) => sum + v.fees.reduce((t, f) => t + num(f.amount), 0), 0),
    ),
    open_mismatches: s.lines.filter((l) => l.status === "mismatch").length,
    collected: vnd(collected),
    posted: vnd(postedAll),
    by_account,
  };
}

// ---------------------------------------------------------------- Báo cáo theo kênh

export interface ChannelReportRow {
  key: string;
  channel: string;
  account_id: string | null;
  label: string;
  orders: number;
  revenue: Money;
  cancelled_or_returned: number;
  fees: Money | null;
  net: Money | null;
  awaiting_statement: number;
}

// Thay bằng GET /api/v1/channels/reports/channels?from&to (bước 48, cần thêm `orders.reports.read`).
// Doanh thu theo ngày đặt (gồm thuế, trừ đơn huỷ và tiền đã hoàn); phí và thực nhận theo bảng kê có kỳ nằm
// trong khoảng. Đơn của người bán trên sàn là doanh thu của người bán, không tính ở đây.
export async function channelReport(
  from: string,
  to: string,
): Promise<{ rows: ChannelReportRow[]; marketplace_orders: number }> {
  const [s, { orders }] = await Promise.all([store(), ordersState()]);
  const inRange = orders.filter((o) => {
    const d = vietnamDay(Date.parse(o.placed_at));
    return d >= from && d <= to;
  });
  const views = s.settlements.map((x) => settlementView(s, x));
  const group = (
    key: string,
    channel: string,
    accountId: string | null,
    label: string,
    list: Order[],
  ): ChannelReportRow => {
    const kept = list.filter((o) => o.status !== "cancelled");
    const statements = accountId
      ? views.filter(
          (v) => v.account_id === accountId && v.period_from >= from && v.period_to <= to,
        )
      : [];
    const settled = new Set(
      s.lines
        .filter((l) => statements.some((v) => v.id === l.settlement_id))
        .map((l) => l.order_id),
    );
    return {
      key,
      channel,
      account_id: accountId,
      label,
      orders: list.length,
      revenue: vnd(kept.reduce((sum, o) => sum + num(o.total) - num(o.refunded), 0)),
      cancelled_or_returned: list.filter((o) => o.status === "cancelled" || num(o.refunded) > 0)
        .length,
      fees: accountId
        ? vnd(statements.reduce((sum, v) => sum + v.fees.reduce((t, f) => t + num(f.amount), 0), 0))
        : null,
      net: accountId ? vnd(statements.reduce((sum, v) => sum + num(v.payout), 0)) : null,
      awaiting_statement: accountId ? kept.filter((o) => !settled.has(o.id)).length : 0,
    };
  };
  const rows: ChannelReportRow[] = [
    group(
      "web",
      "web",
      null,
      "bepmoc.vn",
      inRange.filter((o) => o.channel === "web"),
    ),
    group(
      "pos",
      "pos",
      null,
      "",
      inRange.filter((o) => o.channel === "pos"),
    ),
  ];
  for (const a of s.accounts) {
    const list = inRange.filter((o) => o.channel_account?.id === a.id);
    if (list.length === 0 && (a.status === "unavailable" || a.status === "disconnected")) continue;
    rows.push(group(a.id, a.kind, a.id, a.name, list));
  }
  return { rows, marketplace_orders: inRange.filter((o) => o.channel === "marketplace").length };
}

/** Ngày mặc định của báo cáo: 30 ngày gần nhất (giờ Việt Nam). */
export function defaultReportRange(now = Date.now()): { from: string; to: string } {
  return { from: vietnamDay(now - 29 * DAY), to: vietnamDay(now) };
}

/** Kho của tài khoản để chọn khi kết nối (cửa hàng, gốc). */
export async function ownerOptions(): Promise<OrgUnit[]> {
  const s = await store();
  return s.units.filter((u) => u.unit_type === "store" || u.unit_type === "tenant");
}
