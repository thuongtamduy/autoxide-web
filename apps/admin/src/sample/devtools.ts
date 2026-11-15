// Dữ liệu mẫu của màn "Nhà phát triển" cho phần core chưa có API (bước 52, bàn kỹ thuật): nhật ký
// request theo khách và event theo bản ghi. Hình dạng theo `docs/steps/52-admin-experience.md` của
// core: nhật ký có đường dẫn mẫu (không có ID thật), không có thân request hay header xác thực.
// Nội dung lấy từ bản thiết kế (Bếp Mộc). Bản mẫu chỉ đọc, không có lệnh ghi.

const SECOND = 1000;

function at(offset: number): string {
  return new Date(Date.now() + offset).toISOString();
}

/** Một request (`GET /api/v1/kernel/requests`). */
export interface RequestLogEntry {
  id: string;
  at: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Đường dẫn mẫu, vd `/api/v1/orders/{id}`. */
  route: string;
  status: number;
  code: string | null;
  duration_ms: number;
  /** Ai gọi: API key (tên) hay người dùng; `null` khi chưa đăng nhập. */
  actor: { kind: "api_key" | "user"; id: string; name: string; agent: boolean } | null;
  idempotency_key: string | null;
}

/** Một event của một bản ghi (`GET /api/v1/kernel/records/{kind}/{id}/events`). */
export interface RecordEvent {
  id: string;
  name: string;
  occurred_at: string;
  summary: string;
  /** Mọi bên nhận (module, webhook) đã nhận. */
  delivered: boolean;
}

const id = (n: string) => `01a1e000-0000-7000-8000-0000000d${n}`;

const KEYS = {
  website: { kind: "api_key" as const, id: id("k001"), name: "website-bepmoc", agent: false },
  cskh: { kind: "api_key" as const, id: id("k002"), name: "cskh-bot", agent: true },
  kho: { kind: "api_key" as const, id: id("k004"), name: "dong-bo-kho", agent: false },
};

function entry(
  n: string,
  seconds: number,
  method: RequestLogEntry["method"],
  route: string,
  status: number,
  code: string | null,
  ms: number,
  actor: RequestLogEntry["actor"],
): RequestLogEntry {
  return {
    id: id(`00${n}`),
    at: at(-seconds * SECOND),
    method,
    route,
    status,
    code,
    duration_ms: ms,
    actor,
    idempotency_key: method === "GET" ? null : `sample-${n}`,
  };
}

const REQUESTS: RequestLogEntry[] = [
  entry("08", 48, "POST", "/api/v1/orders/checkout", 201, null, 182, KEYS.website),
  entry("07", 51, "GET", "/api/v1/catalog/public/products", 200, null, 24, KEYS.website),
  entry("06", 69, "POST", "/api/v1/orders/{id}/refunds", 202, "approval_required", 41, KEYS.cskh),
  entry(
    "05",
    80,
    "PATCH",
    "/api/v1/inventory/levels/{id}",
    409,
    "inventory.version_conflict",
    12,
    KEYS.kho,
  ),
  entry("04", 98, "POST", "/api/v1/orders/checkout", 422, "orders.quote_expired", 35, KEYS.website),
  entry("03", 122, "GET", "/api/v1/kernel/work", 200, null, 88, KEYS.cskh),
  entry(
    "02",
    150,
    "POST",
    "/api/v1/inventory/sync",
    502,
    "inventory.upstream_unreachable",
    5003,
    KEYS.kho,
  ),
  entry("01", 229, "GET", "/api/v1/content/public/entries", 304, null, 6, KEYS.website),
];

export type StatusClass = "4xx" | "5xx";

/**
 * Thay bằng GET /api/v1/kernel/requests?status_class=&api_key_id= (bước 52) khi core có. Mới
 * nhất trước.
 */
export async function listRequests(
  query: { status_class?: StatusClass; api_key_id?: string } = {},
): Promise<{ data: RequestLogEntry[] }> {
  const low = query.status_class === "4xx" ? 400 : query.status_class === "5xx" ? 500 : 0;
  const list = REQUESTS.filter(
    (r) =>
      (!low || (r.status >= low && r.status < low + 100)) &&
      (!query.api_key_id || r.actor?.id === query.api_key_id),
  );
  return { data: structuredClone(list) };
}

/** API key có trong nhật ký, để chọn khi lọc (thay bằng `GET /auth/api-keys` của khách khi có). */
export function requestKeys(): { id: string; name: string }[] {
  return Object.values(KEYS).map(({ id: keyId, name }) => ({ id: keyId, name }));
}

/** Loại bản ghi có event (sổ đối tượng của bước 51, D-123). */
export const RECORD_KINDS = ["orders.order", "catalog.product", "auth.user"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

const EVENTS: Record<string, RecordEvent[]> = {
  "orders.order:BM-2611-0412": [
    ev("04", -3 * 3600, "orders.fulfillment_requested", "Yêu cầu giao từ CN Quận 3"),
    ev("03", -3 * 3600 - 1, "orders.order_confirmed", "CN Quận 3 xác nhận"),
    ev("02", -4 * 3600, "ledger.payment_captured", "Đối tác báo thanh toán 1.240.000 ₫"),
    ev("01", -4 * 3600 - 40, "orders.order_placed", "Đặt qua website, 2 dòng hàng"),
  ],
};

function ev(n: string, seconds: number, name: string, summary: string): RecordEvent {
  return { id: id(`e0${n}`), name, occurred_at: at(seconds * SECOND), summary, delivered: true };
}

/** Mã bản ghi mẫu có event, để gợi ý trong ô nhập. */
export const SAMPLE_RECORD = { kind: "orders.order" as RecordKind, id: "BM-2611-0412" };

/**
 * Thay bằng GET /api/v1/kernel/records/{kind}/{id}/events (bước 52) khi core có. Mới nhất trước;
 * bản ghi không có event (hay không tồn tại) trả danh sách rỗng.
 */
export async function listRecordEvents(
  kind: string,
  recordId: string,
): Promise<{ data: RecordEvent[] }> {
  return { data: structuredClone(EVENTS[`${kind}:${recordId.trim()}`] ?? []) };
}
