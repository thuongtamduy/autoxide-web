// Gom hộp việc và số đếm từ sổ nguồn (bước 51 P2 của core), hàm thuần để test được với nguồn giả.
// Luật như core: chỉ chạy nguồn người xem có permission; mỗi nguồn có hạn thời gian, nguồn lỗi hay quá
// hạn thì bỏ qua và ghi vào `incomplete` thay vì làm hỏng cả hộp; việc sắp theo mức gấp rồi theo hạn.
import type { NavGroup } from "@/nav/nav";
import type { Severity, WorkBox, WorkContext, WorkCounts, WorkItem, WorkSource } from "./types";

/** Hạn thời gian mỗi nguồn. Core mặc định 300 ms; ở đây gồm cả một lượt gọi core qua mạng. */
export const SOURCE_TIMEOUT_MS = 2_000;

/**
 * Khai một nguồn từ một hàm đọc duy nhất: `count` và `items` dùng chung một lần đọc cho mỗi ngữ cảnh
 * (một request), để số đếm trên menu và hộp việc không gọi core hai lần.
 */
export function defineSource(
  spec: Omit<WorkSource, "count" | "items"> & {
    load: (ctx: WorkContext) => Promise<{ count: number; items: WorkItem[] }>;
  },
): WorkSource {
  const memo = new WeakMap<WorkContext, Promise<{ count: number; items: WorkItem[] }>>();
  const read = (ctx: WorkContext) => {
    let found = memo.get(ctx);
    if (!found) {
      found = spec.load(ctx);
      memo.set(ctx, found);
    }
    return found;
  };
  const { load: _load, ...rest } = spec;
  return {
    ...rest,
    count: async (ctx) => (await read(ctx)).count,
    items: async (ctx, limit) => (await read(ctx)).items.slice(0, limit),
  };
}

/** Điều kiện để thấy một nguồn việc, một số liệu hay một bước thiết lập. */
interface Gate {
  permission: readonly string[] | null;
  module?: string;
  sample?: unknown;
}

/** Nguồn người xem dùng được: có permission, module đã cài (nguồn thật) hay đang bật dữ liệu mẫu. */
export function visibleSources<T extends Gate>(sources: readonly T[], ctx: WorkContext): T[] {
  return sources.filter((source) => {
    if (source.permission && !ctx.can(source.permission)) return false;
    if (source.sample) return ctx.sample;
    if (source.module && ctx.modules !== null && !ctx.modules.includes(source.module)) return false;
    return true;
  });
}

class TimedOut extends Error {}

/** Chờ `promise` tối đa `ms`; quá hạn thì ném lỗi (lời gọi vẫn chạy nốt nhưng kết quả bị bỏ). */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimedOut(`timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const RANK: Record<Severity, number> = { blocking: 0, attention: 1, info: 2 };

/** Mức gấp trước; cùng mức thì hạn gần trước, việc không có hạn sau cùng; rồi theo khoá cho ổn định. */
export function compareWork(a: WorkItem, b: WorkItem): number {
  const rank = RANK[a.severity] - RANK[b.severity];
  if (rank !== 0) return rank;
  if (a.due_at !== b.due_at) {
    if (a.due_at === null) return 1;
    if (b.due_at === null) return -1;
    return a.due_at.localeCompare(b.due_at);
  }
  return a.key.localeCompare(b.key);
}

/** Gom việc từ mọi nguồn người xem dùng được. */
export async function collectWork(
  sources: readonly WorkSource[],
  ctx: WorkContext,
  { limit = 50, timeoutMs = SOURCE_TIMEOUT_MS }: { limit?: number; timeoutMs?: number } = {},
): Promise<WorkBox> {
  const shown = visibleSources(sources, ctx);
  const results = await Promise.allSettled(
    shown.map((source) => withTimeout(source.items(ctx, limit), timeoutMs)),
  );
  const data: WorkItem[] = [];
  const incomplete: string[] = [];
  results.forEach((result, index) => {
    const source = shown[index];
    if (!source) return;
    if (result.status === "fulfilled") data.push(...result.value);
    else incomplete.push(source.id);
  });
  return { data: data.sort(compareWork).slice(0, limit), incomplete };
}

/** Số đếm theo nguồn (cho menu), cùng luật permission và hạn thời gian như hộp việc. */
export async function collectCounts(
  sources: readonly WorkSource[],
  ctx: WorkContext,
  { timeoutMs = SOURCE_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<WorkCounts> {
  const shown = visibleSources(sources, ctx);
  const results = await Promise.allSettled(
    shown.map((source) => withTimeout(source.count(ctx), timeoutMs)),
  );
  const data: Record<string, number> = {};
  const incomplete: string[] = [];
  results.forEach((result, index) => {
    const source = shown[index];
    if (!source) return;
    if (result.status === "fulfilled") data[source.id] = result.value;
    else incomplete.push(source.id);
  });
  return { data, incomplete };
}

/** Ngày lịch theo giờ Việt Nam (UTC+7, không đổi giờ theo mùa) — "hôm nay" của cửa hàng. */
export function vietnamDayOf(at: number): string {
  return new Date(at + 7 * 3_600_000).toISOString().slice(0, 10);
}

export type Bucket = "overdue" | "today" | "soon";
export const BUCKETS: readonly Bucket[] = ["overdue", "today", "soon"];

/** Quá hạn (hạn đã qua), Hôm nay (hạn trong ngày hay không có hạn), Sắp tới (hạn từ ngày mai). */
export function bucketOf(item: Pick<WorkItem, "due_at">, now: number): Bucket {
  if (item.due_at === null) return "today";
  const due = Date.parse(item.due_at);
  if (due < now) return "overdue";
  return vietnamDayOf(due) === vietnamDayOf(now) ? "today" : "soon";
}

/** Trạng thái riêng của người xem với một việc (bảng `kernel_work_states` của P10). */
export interface WorkState {
  key: string;
  snoozed_until: string | null;
  assignee: { id: string; name: string } | null;
}

export type ItemState = "open" | "assigned" | "snoozed";

export interface WorkRow extends WorkItem {
  state: ItemState;
  snoozed_until: string | null;
  assignee: { id: string; name: string } | null;
}

/**
 * Gắn trạng thái hoãn / giao vào việc. Hoãn đã hết hạn thì việc hiện lại; trạng thái của việc không
 * còn (bản ghi đã xử lý) thì bị bỏ qua — core dọn bằng job.
 */
export function withStates(
  items: readonly WorkItem[],
  states: readonly WorkState[],
  now: number,
): WorkRow[] {
  const byKey = new Map(states.map((state) => [state.key, state]));
  return items.map((item) => {
    const state = byKey.get(item.key);
    const snoozed =
      state?.snoozed_until && Date.parse(state.snoozed_until) > now ? state.snoozed_until : null;
    const assignee = state?.assignee ?? null;
    return {
      ...item,
      snoozed_until: snoozed,
      assignee,
      state: snoozed ? "snoozed" : assignee ? "assigned" : "open",
    };
  });
}

/** Việc theo nhóm hạn, giữ thứ tự gấp trong mỗi nhóm; nhóm trống thì bỏ. */
export function groupByBucket<T extends Pick<WorkItem, "due_at">>(
  items: readonly T[],
  now: number,
): { bucket: Bucket; items: T[] }[] {
  return BUCKETS.map((bucket) => ({
    bucket,
    items: items.filter((item) => bucketOf(item, now) === bucket),
  })).filter((group) => group.items.length > 0);
}

/**
 * Số đếm trên menu theo màn (`NavItem.counter` của bước 51): màn khai `counter` là danh sách nguồn
 * thì cộng số của các nguồn đó; `"work"` (màn Việc và hoạt động) là số việc đang chờ.
 */
export function navCounts(
  nav: readonly NavGroup[],
  counts: Readonly<Record<string, number>>,
  workItems: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of nav) {
    for (const page of group.pages) {
      if (!page.counter) continue;
      const value =
        page.counter === "work"
          ? workItems
          : page.counter.reduce((sum, source) => sum + (counts[source] ?? 0), 0);
      if (value > 0) out[page.id] = value;
    }
  }
  return out;
}

export const SNOOZE_PRESETS = ["1h", "3h", "tomorrow", "monday"] as const;
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number];

/**
 * Thời điểm hết hoãn của một lựa chọn: 1 giờ, 3 giờ, 9:00 sáng mai, 9:00 thứ Hai tới (giờ Việt Nam —
 * giờ làm việc của cửa hàng). Trả ISO UTC.
 */
export function snoozeUntil(preset: SnoozePreset, now: number): string {
  const hour = 3_600_000;
  if (preset === "1h") return new Date(now + hour).toISOString();
  if (preset === "3h") return new Date(now + 3 * hour).toISOString();
  const today = vietnamDayOf(now);
  // 9:00 giờ Việt Nam = 2:00 UTC của cùng ngày lịch.
  const nineAm = (day: string, plus: number) =>
    new Date(Date.parse(`${day}T02:00:00Z`) + plus * 24 * hour).toISOString();
  if (preset === "tomorrow") return nineAm(today, 1);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Chủ nhật
  const days = (8 - weekday) % 7 || 7;
  return nineAm(today, days);
}
