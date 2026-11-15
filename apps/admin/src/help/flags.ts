// Cờ giao diện theo người dùng (`/api/v1/me/flags`, D-207 của core): gợi ý đã tắt và "Có gì mới" đã
// xem lưu ở core theo tài khoản, nên đổi máy hay trình duyệt cũng không hiện lại. Hàm thuần ở đây để
// test; phần gọi core ở `server.ts`, Server Action ở `actions.ts`.

/** Cờ của một gợi ý đã tắt: `hint.<id>` = `dismissed`. */
export const HINT_PREFIX = "hint.";
export const DISMISSED = "dismissed";
/** Phiên bản mới nhất của "Có gì mới" người dùng đã xem: `whatsnew.seen` = `<version>`. */
export const NEWS_FLAG = "whatsnew.seen";

/**
 * Gợi ý tắt được (thẻ giới thiệu tính năng mới). Chỉ những id này được ghi thành cờ: Server Action
 * là endpoint công khai, không nhận key tuỳ ý từ trình duyệt.
 */
export const HINTS = ["saved_views"] as const;
export type HintId = (typeof HINTS)[number];

export function isHintId(value: unknown): value is HintId {
  return typeof value === "string" && (HINTS as readonly string[]).includes(value);
}

export function hintKey(id: HintId): string {
  return `${HINT_PREFIX}${id}`;
}

/** Cờ của người xem theo key; `null` khi không đọc được từ core (khi đó mọi gợi ý vẫn hiện). */
export type Flags = ReadonlyMap<string, string> | null;

export function flagMap(list: readonly { key: string; value: string }[]): Map<string, string> {
  return new Map(list.map((flag) => [flag.key, flag.value]));
}

/** Gợi ý đã tắt chưa. Không đọc được cờ thì coi như chưa tắt (hiện gợi ý, không làm hỏng trang). */
export function hintDismissed(flags: Flags, id: HintId): boolean {
  return flags?.get(hintKey(id)) === DISMISSED;
}

/** Phiên bản "Có gì mới" đã xem; `null` khi chưa xem lần nào hoặc không đọc được cờ. */
export function newsSeen(flags: Flags): string | null {
  return flags?.get(NEWS_FLAG) ?? null;
}
