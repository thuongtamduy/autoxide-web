// Cài đặt theo khách của core chia hai loại (D-297 của core): nhóm `connection` là kết nối tới đối
// tác (máy chủ thư, nhà cung cấp AI, cổng thanh toán… — tên `<module>.connection.<loại>.<trường>`),
// còn lại là cấu hình nghiệp vụ (ngôn ngữ, kiểm duyệt bình luận…). Core cũ không có `group`: coi
// như cấu hình nghiệp vụ.

export const CONNECTION_GROUP = "connection";

export function splitSettings<T extends { group?: string | null }>(
  settings: readonly T[],
): { connection: T[]; business: T[] } {
  const connection: T[] = [];
  const business: T[] = [];
  for (const setting of settings) {
    (setting.group === CONNECTION_GROUP ? connection : business).push(setting);
  }
  return { connection, business };
}

/**
 * Loại kết nối của một cài đặt nhóm `connection`: `mail.connection.smtp.url` → `mail.smtp`. Tên
 * không đúng dạng thì `null`.
 */
export function connectionKind(name: string): string | null {
  const parts = name.split(".");
  if (parts.length < 4 || parts[1] !== CONNECTION_GROUP) return null;
  return `${parts[0]}.${parts[2]}`;
}

// ---------------------------------------------------------------- Màn "Kết nối đối tác"

/** Loại đối tác, theo thứ tự hiện trên màn (như Shopify "Apps & sales channels"). */
export const CONNECTION_CATEGORIES = [
  "email",
  "messaging",
  "payment",
  "einvoice",
  "shipping",
  "ai",
  "other",
] as const;
export type ConnectionCategory = (typeof CONNECTION_CATEGORIES)[number];

const CATEGORY_OF_MODULE: Record<string, ConnectionCategory> = {
  mail: "email",
  sms: "messaging",
  zalo: "messaging",
  payments: "payment",
  invoices: "einvoice",
  einvoice: "einvoice",
  shipping: "shipping",
  delivery: "shipping",
  ai: "ai",
};

/** Loại đối tác của một module (`mail` → `email`); module lạ vào `other`. */
export function connectionCategory(module: string): ConnectionCategory {
  return Object.hasOwn(CATEGORY_OF_MODULE, module)
    ? (CATEGORY_OF_MODULE[module] ?? "other")
    : "other";
}

/** Một kết nối: các cài đặt `<module>.connection.<loại>.*` cùng loại. */
export interface ConnectionGroup<T> {
  /** `<module>.<loại>`, vd `mail.smtp`; cũng là đường dẫn khoá chữ `kinds.<kind>` trong messages. */
  kind: string;
  module: string;
  category: ConnectionCategory;
  settings: T[];
}

/**
 * Gom cài đặt nhóm `connection` theo kết nối (`mail.connection.smtp.url` và `….from` → `mail.smtp`),
 * giữ thứ tự xuất hiện. Tên không đúng dạng thì thành một kết nối riêng mang chính tên đó.
 */
export function groupConnections<T extends { name: string }>(
  settings: readonly T[],
): ConnectionGroup<T>[] {
  const groups = new Map<string, ConnectionGroup<T>>();
  for (const setting of settings) {
    const kind = connectionKind(setting.name) ?? setting.name;
    const module = kind.split(".")[0] ?? kind;
    let group = groups.get(kind);
    if (!group) {
      group = { kind, module, category: connectionCategory(module), settings: [] };
      groups.set(kind, group);
    }
    group.settings.push(setting);
  }
  return [...groups.values()];
}

/**
 * Đường dẫn khoá chữ của một ô trong messages: `mail.connection.smtp.url` → `mail.smtp.url` (bỏ
 * chữ `connection`); cài đặt nghiệp vụ giữ nguyên tên (`comments.max_links`).
 */
export function settingMessageKey(name: string): string {
  const parts = name.split(".");
  return parts[1] === CONNECTION_GROUP && parts.length >= 4
    ? [parts[0], ...parts.slice(2)].join(".")
    : name;
}

/** Trạng thái hiện trên thẻ kết nối. */
export type ConnectionStatus = "connected" | "unset" | "error";

/**
 * Có cài đặt nào đặt riêng thì "đã kết nối"; lần kiểm tra gần nhất lỗi thì "lỗi" (chỉ dữ liệu mẫu
 * có kiểm tra). Không đặt gì: dùng cấu hình chung của máy chủ.
 */
export function connectionStatus(
  settings: readonly { is_set: boolean }[],
  lastCheck?: { ok: boolean } | null,
): ConnectionStatus {
  if (lastCheck && !lastCheck.ok) return "error";
  return settings.some((s) => s.is_set) ? "connected" : "unset";
}

/** Một ô của hộp thoại cài đặt: tên của core và trạng thái hiện tại (secret không có giá trị). */
export interface SettingField {
  name: string;
  secret: boolean;
  is_set: boolean;
  value?: string | null | undefined;
}

export type SettingChange =
  | { name: string; secret: boolean; op: "set"; value: string }
  | { name: string; secret: boolean; op: "remove" };

/**
 * Việc cần gửi lên core sau khi người dùng bấm Lưu, mỗi cài đặt một lệnh (`PUT` / `DELETE
 * /kernel/settings/{name}`):
 * - secret: để trống là giữ giá trị đang dùng (không bao giờ điền lại), nhập thì thay;
 * - ô thường: không đổi thì thôi; xoá trắng ô đã đặt là gỡ (về cấu hình chung của máy chủ).
 */
export function planChanges(
  fields: readonly SettingField[],
  read: (name: string) => string,
): SettingChange[] {
  const changes: SettingChange[] = [];
  for (const field of fields) {
    const raw = read(field.name);
    if (field.secret) {
      if (raw.trim() !== "")
        changes.push({ name: field.name, secret: true, op: "set", value: raw });
      continue;
    }
    const value = raw.trim();
    const current = field.is_set ? (field.value ?? "") : "";
    if (value === current) continue;
    changes.push(
      value === ""
        ? { name: field.name, secret: false, op: "remove" }
        : { name: field.name, secret: false, op: "set", value },
    );
  }
  return changes;
}
