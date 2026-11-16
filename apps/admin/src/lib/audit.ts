// Bộ lọc của nhật ký audit đọc từ địa chỉ trang (`?module=&action=&subject=&actor=&cursor=`):
// chỉ giữ giá trị có nghĩa, để gửi đúng tham số cho `GET /api/v1/audit` và dựng lại link.

export interface AuditFilter {
  module?: string;
  action?: string;
  subject?: string;
  actor_user_id?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(value: string | string[] | undefined): string {
  return (typeof value === "string" ? value : "").trim();
}

/** Bộ lọc từ `searchParams`. `actor` không phải UUID thì bỏ (core sẽ trả 400). */
export function auditFilter(params: Record<string, string | string[] | undefined>): AuditFilter {
  const filter: AuditFilter = {};
  const module = one(params.module);
  const action = one(params.action);
  const subject = one(params.subject);
  const actor = one(params.actor);
  if (module) filter.module = module;
  if (action) filter.action = action;
  if (subject) filter.subject = subject;
  if (UUID.test(actor)) filter.actor_user_id = actor;
  return filter;
}

/** Chuỗi truy vấn của trang cho bộ lọc (và con trỏ, nếu có), bắt đầu bằng `?` hay rỗng. */
export function auditHref(base: string, filter: AuditFilter, cursor?: string): string {
  const query = new URLSearchParams();
  if (filter.module) query.set("module", filter.module);
  if (filter.action) query.set("action", filter.action);
  if (filter.subject) query.set("subject", filter.subject);
  if (filter.actor_user_id) query.set("actor", filter.actor_user_id);
  if (cursor) query.set("cursor", cursor);
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}

/** `auth.user:0190…` → `{ kind: "auth.user", id: "0190…" }`; không đúng dạng thì `null`. */
export function parseSubject(
  subject: string | null | undefined,
): { kind: string; id: string } | null {
  if (!subject) return null;
  const colon = subject.lastIndexOf(":");
  if (colon <= 0 || colon === subject.length - 1) return null;
  return { kind: subject.slice(0, colon), id: subject.slice(colon + 1) };
}

/**
 * Tên người làm theo id, từ `actor_name` mà core trả kèm mỗi mục khi gọi `include=actor`. Mục không
 * có tên (tài khoản đã xoá, hệ thống làm) không có trong bảng: giao diện hiện mã rút gọn.
 */
export function actorNames(
  entries: readonly { actor_user_id?: string | null; actor_name?: string | null }[],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const entry of entries) {
    if (entry.actor_user_id && entry.actor_name) names.set(entry.actor_user_id, entry.actor_name);
  }
  return names;
}
