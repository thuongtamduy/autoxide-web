// Dữ liệu mẫu của màn "Việc và hoạt động" cho phần core chưa có API (W-006, W-020):
// - trạng thái riêng của từng người với một việc: hoãn tới giờ, giao cho người khác (bảng
//   `kernel_work_states` của bước 51 P10, `POST /api/v1/me/work/{key}/snooze`, `…/assign`);
// - mục đã ghim (chưa có trong lộ trình của core: bước 51 ghi "ghim" ngoài phạm vi);
// - tuỳ chọn thông báo của người dùng (module `notifications`, bước 37 / 52).
//
// Việc thì không lưu ở đây: việc tính từ dữ liệu của phân hệ (`src/work/sources.ts`). Lệnh ghi đổi một
// kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import type { WorkState } from "@/work/registry";
import { PRODUCT_ID } from "./catalog";
import { SAMPLE_UNIT_IDS } from "./org";
import type { SampleOutcome } from "./settings";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Hoãn tối đa 30 ngày (dự kiến): lâu hơn thì việc dễ bị quên hẳn. */
export const MAX_SNOOZE_MS = 30 * DAY;

interface StateRow extends WorkState {
  user_id: string;
  updated_at: string;
}

/** Một mục đã ghim: một view (danh sách đã lọc) hay một bản ghi. Ghim là của riêng người dùng. */
export interface Pin {
  id: string;
  kind: "view" | "seller" | "product" | "page";
  /** Tên của bản ghi hay view (dữ liệu, không dịch). */
  name: string;
  /** Nhóm điều hướng (phân hệ) của mục. */
  group: string;
  href: string;
  created_at: string;
}

/** Tuỳ chọn thông báo của một người (dự kiến `GET/PUT /api/v1/me/notification-preferences`). */
export interface NotificationPrefs {
  /** Khi có người nhắc tên (@) trong ghi chú: trong ứng dụng và email. */
  mention: boolean;
  /** Khi được giao việc: trong ứng dụng. */
  assigned: boolean;
  /** Khi agent gửi yêu cầu duyệt: trong ứng dụng và email. */
  approval: boolean;
  /** Bản tóm tắt hằng ngày lúc 8:00 (giờ Việt Nam) qua email. */
  digest: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  mention: true,
  assigned: true,
  approval: true,
  digest: false,
};

interface Store {
  states: StateRow[];
  pins: Map<string, Pin[]>;
  /** Mục vừa bỏ ghim, để Hoàn tác ghim lại đúng mục cũ. */
  unpinned: Map<string, Pin[]>;
  prefs: Map<string, NotificationPrefs>;
}

const KEY = "autoxide.sample.work.1";
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= { states: [], pins: new Map(), unpinned: new Map(), prefs: new Map() };
  return holder[KEY];
}

export function resetSampleWork(): void {
  (globalThis as Holder)[KEY] = {
    states: [],
    pins: new Map(),
    unpinned: new Map(),
    prefs: new Map(),
  };
}

function failed(status: number, code: string, detail: string): SampleOutcome<never> {
  return { ok: false, problem: { type: "about:blank", title: "Error", status, code, detail } };
}

function invalid(field: string, code: string, detail: string): SampleOutcome<never> {
  const problem: Problem = {
    type: "about:blank",
    title: "Unprocessable Entity",
    status: 422,
    code: "validation_failed",
    detail: "The request has invalid fields.",
    errors: [{ field, code, detail }],
  };
  return { ok: false, problem };
}

function row(userId: string, key: string): StateRow {
  const s = store();
  let found = s.states.find((x) => x.user_id === userId && x.key === key);
  if (!found) {
    found = {
      key,
      user_id: userId,
      snoozed_until: null,
      assignee: null,
      updated_at: new Date().toISOString(),
    };
    s.states.push(found);
  }
  return found;
}

function view(x: StateRow): WorkState {
  return { key: x.key, snoozed_until: x.snoozed_until, assignee: x.assignee };
}

/** Khoá việc hợp lệ: `<nguồn>:<id>`, nguồn là `<module>.<việc>`. */
export function isWorkKey(key: string): boolean {
  return /^[a-z_]+\.[a-z_]+:[A-Za-z0-9_-]+$/.test(key);
}

// Thay bằng trạng thái đi kèm từng việc của GET /api/v1/kernel/work (bước 51 P10) khi core có.
export async function listWorkStates(userId: string): Promise<{ data: WorkState[] }> {
  return {
    data: store()
      .states.filter((x) => x.user_id === userId)
      .map(view),
  };
}

/**
 * Thay bằng POST /api/v1/me/work/{key}/snooze `{until}` (bước 51 P10) khi core có. Hoãn tới một thời
 * điểm trong tương lai, tối đa 30 ngày; trả trạng thái cũ để Hoàn tác.
 */
export async function snoozeWork(
  userId: string,
  key: string,
  until: string,
  now = Date.now(),
): Promise<SampleOutcome<{ state: WorkState; previous: string | null }>> {
  if (!isWorkKey(key)) return failed(404, "kernel.work_not_found", "No work item has this key.");
  const at = Date.parse(until);
  if (!Number.isFinite(at) || at <= now || at > now + MAX_SNOOZE_MS) {
    return invalid("until", "work_snooze_invalid", "Pick a time within the next 30 days.");
  }
  const x = row(userId, key);
  const previous = x.snoozed_until;
  x.snoozed_until = new Date(at).toISOString();
  x.updated_at = new Date(now).toISOString();
  return { ok: true, data: { state: view(x), previous } };
}

/** Thay bằng DELETE /api/v1/me/work/{key}/snooze (bước 51 P10): việc hiện lại ngay. */
export async function unsnoozeWork(
  userId: string,
  key: string,
  restore: string | null = null,
): Promise<SampleOutcome<{ state: WorkState; previous: string | null }>> {
  if (!isWorkKey(key)) return failed(404, "kernel.work_not_found", "No work item has this key.");
  const x = row(userId, key);
  const previous = x.snoozed_until;
  x.snoozed_until = restore;
  x.updated_at = new Date().toISOString();
  return { ok: true, data: { state: view(x), previous } };
}

/**
 * Thay bằng POST /api/v1/me/work/{key}/assign `{user_id}` (bước 51 P10) khi core có. Người nhận phải
 * có permission của nguồn ở nút của việc (`allowed`, giao diện kiểm theo role của người đó); `null` =
 * bỏ giao. Trả người được giao trước để Hoàn tác.
 */
export async function assignWork(
  userId: string,
  key: string,
  assignee: { id: string; name: string } | null,
  allowed: boolean,
): Promise<SampleOutcome<{ state: WorkState; previous: WorkState["assignee"] }>> {
  if (!isWorkKey(key)) return failed(404, "kernel.work_not_found", "No work item has this key.");
  if (assignee && !allowed) {
    return invalid(
      "user_id",
      "work_assignee_forbidden",
      "This person has no permission to handle this work.",
    );
  }
  const x = row(userId, key);
  const previous = x.assignee;
  x.assignee = assignee;
  x.updated_at = new Date().toISOString();
  return { ok: true, data: { state: view(x), previous } };
}

// ---------------------------------------------------------------- Ghim

function seedPins(): Pin[] {
  // Mới ghim trước: mỗi mục ghim sớm hơn mục trước một giờ.
  const at = (n: number) => new Date(Date.now() - 3 * DAY - n * HOUR).toISOString();
  return [
    {
      id: "pin-orders-awaiting",
      kind: "view",
      name: "Đơn chờ nhận",
      group: "sales",
      href: "/sales/orders?status=awaiting_acceptance",
      created_at: at(0),
    },
    {
      id: "pin-seller-nhana",
      kind: "seller",
      name: "Gia Dụng Nhà Na",
      group: "market",
      href: `/market?open=${SAMPLE_UNIT_IDS.sellers[0]}`,
      created_at: at(1),
    },
    {
      id: "pin-product-pan",
      kind: "product",
      name: "Chảo gang 30 cm",
      group: "catalog",
      href: `/catalog/products/${PRODUCT_ID.castIronPan}`,
      created_at: at(2),
    },
  ];
}

function pinsOf(userId: string): Pin[] {
  const s = store();
  let list = s.pins.get(userId);
  if (!list) {
    list = seedPins();
    s.pins.set(userId, list);
  }
  return list;
}

// Thay bằng GET /api/v1/me/pins (chưa có trong lộ trình của core) khi core có. Mới ghim trước.
export async function listPins(userId: string): Promise<{ data: Pin[] }> {
  return { data: structuredClone(pinsOf(userId)) };
}

/** Thay bằng DELETE /api/v1/me/pins/{id}: trả mục vừa bỏ để Hoàn tác. */
export async function unpin(userId: string, pinId: string): Promise<SampleOutcome<Pin>> {
  const list = pinsOf(userId);
  const index = list.findIndex((p) => p.id === pinId);
  const found = list[index];
  if (!found) return failed(404, "kernel.pin_not_found", "This pin no longer exists.");
  list.splice(index, 1);
  const s = store();
  s.unpinned.set(userId, [found, ...(s.unpinned.get(userId) ?? [])].slice(0, 20));
  return { ok: true, data: structuredClone(found) };
}

/** Hoàn tác bỏ ghim: ghim lại đúng mục cũ (thay bằng POST /api/v1/me/pins). */
export async function restorePin(userId: string, pinId: string): Promise<SampleOutcome<Pin>> {
  const s = store();
  const removed = s.unpinned.get(userId) ?? [];
  const pin = removed.find((p) => p.id === pinId);
  if (!pin) return failed(404, "kernel.pin_not_found", "This pin no longer exists.");
  s.unpinned.set(
    userId,
    removed.filter((p) => p.id !== pinId),
  );
  const list = pinsOf(userId);
  if (!list.some((p) => p.id === pin.id)) {
    list.push(pin);
    list.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  }
  return { ok: true, data: structuredClone(pin) };
}

// ---------------------------------------------------------------- Tuỳ chọn thông báo

// Thay bằng GET /api/v1/me/notification-preferences (module `notifications`, bước 37 / 52) khi core có.
export async function getNotificationPrefs(userId: string): Promise<{ data: NotificationPrefs }> {
  return { data: { ...(store().prefs.get(userId) ?? DEFAULT_PREFS) } };
}

/** Thay bằng PUT /api/v1/me/notification-preferences (bước 37 / 52) khi core có. */
export async function saveNotificationPrefs(
  userId: string,
  prefs: NotificationPrefs,
): Promise<SampleOutcome<NotificationPrefs>> {
  store().prefs.set(userId, { ...prefs });
  return { ok: true, data: { ...prefs } };
}
