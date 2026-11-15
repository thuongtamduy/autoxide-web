// Hoạt động gần đây: câu đọc được dựng từ nhật ký audit THẬT của core (`GET /api/v1/audit`), hàm thuần.
// Như `EventInfo::activity` của bước 51 P5: chỉ event có câu hoạt động mới hiện (đăng nhập, đổi mật khẩu
// là việc riêng của từng người, xem ở Tài khoản › Phiên đăng nhập). Câu nằm ở `messages/*.json` →
// `work.activity.actions.<module>_<việc>`, điền `{actor}` (người làm) và `{what}` (tên bản ghi khi
// audit có). Khi core có `GET /api/v1/audit/activity` (câu đã dịch, lọc theo quyền đọc từng bản ghi)
// thì đọc thẳng từ đó.
import { parseSubject } from "@/lib/audit";

interface AuditLike {
  id: string;
  module: string;
  action: string;
  actor_kind: string;
  actor_user_id?: string | null;
  actor_api_key_id?: string | null;
  subject?: string | null;
  before?: unknown;
  after?: unknown;
  occurred_at: string;
}

/** Event có câu hoạt động: nhóm điều hướng (nhãn, biểu tượng) và link tới bản ghi khi có. */
const ACTIONS: Record<string, { group: string; link?: (id: string) => string }> = {
  "auth.user_created": { group: "org", link: (id) => `/org/access/users/${id}` },
  "auth.user_updated": { group: "org", link: (id) => `/org/access/users/${id}` },
  "auth.user_disabled": { group: "org", link: (id) => `/org/access/users/${id}` },
  "auth.user_deleted": { group: "org" },
  "auth.user_roles_changed": { group: "org", link: (id) => `/org/access/users/${id}` },
  "auth.role_created": { group: "org", link: (id) => `/org/access/roles/${id}` },
  "auth.role_updated": { group: "org", link: (id) => `/org/access/roles/${id}` },
  "auth.role_deleted": { group: "org" },
  "auth.api_key_created": { group: "settings" },
  "auth.api_key_revoked": { group: "settings" },
  "content.entry_created": { group: "content", link: (id) => `/content/${id}` },
  "content.entry_published": { group: "content", link: (id) => `/content/${id}` },
  "content.entry_unpublished": { group: "content", link: (id) => `/content/${id}` },
  "content.entry_archived": { group: "content", link: (id) => `/content/${id}` },
  "content.entry_restored": { group: "content", link: (id) => `/content/${id}` },
  "content.entry_deleted": { group: "content" },
  "content.entry_moved": { group: "content", link: (id) => `/content/${id}` },
  "content.review_requested": { group: "content", link: (id) => `/content/${id}` },
  "content.review_withdrawn": { group: "content", link: (id) => `/content/${id}` },
  "content.schedule_created": { group: "content" },
  "content.term_changed": { group: "content", link: () => "/content/structure/terms" },
  "content.menu_changed": { group: "content", link: () => "/content/structure/menus" },
  "content.redirect_changed": { group: "content", link: () => "/content/structure/redirects" },
  "content.author_changed": { group: "content", link: () => "/content/structure/authors" },
  "media.item_uploaded": { group: "content", link: (id) => `/content/media?item=${id}` },
  "media.item_updated": { group: "content", link: (id) => `/content/media?item=${id}` },
  "media.item_trashed": { group: "content" },
  "media.item_restored": { group: "content", link: (id) => `/content/media?item=${id}` },
  "media.item_purged": { group: "content" },
  "forms.form_created": { group: "mkt", link: (id) => `/marketing/forms/${id}` },
  "forms.form_updated": { group: "mkt", link: (id) => `/marketing/forms/${id}` },
  "forms.form_deleted": { group: "mkt" },
  "forms.submission_received": { group: "mkt" },
  "forms.submission_status_changed": { group: "mkt" },
  "newsletter.campaign_created": { group: "mkt" },
  "newsletter.campaign_scheduled": { group: "mkt" },
  "newsletter.campaign_sent": { group: "mkt" },
  "newsletter.campaign_cancelled": { group: "mkt" },
  "newsletter.subscribers_imported": { group: "mkt" },
  "newsletter.subscription_confirmed": { group: "mkt" },
  "newsletter.subscription_unsubscribed": { group: "mkt" },
  "comments.comment_created": { group: "mkt", link: (id) => `/marketing/comments/${id}` },
  "comments.comment_status_changed": { group: "mkt", link: (id) => `/marketing/comments/${id}` },
  "comments.comment_published": { group: "mkt", link: (id) => `/marketing/comments/${id}` },
  "comments.comment_deleted": { group: "mkt" },
  "comments.ban_created": { group: "mkt", link: () => "/marketing/comments/bans" },
  "webhooks.endpoint_created": { group: "settings", link: () => "/settings/webhooks" },
  "webhooks.endpoint_updated": { group: "settings", link: () => "/settings/webhooks" },
  "webhooks.endpoint_deleted": { group: "settings" },
};

/** Một dòng hoạt động đã dựng, chưa dịch. */
export interface ActivityLine {
  id: string;
  at: string;
  group: string;
  /** Khoá câu: `actions.<module>_<việc>` dưới `work.activity`. */
  key: string;
  actor: { kind: "user"; id: string } | { kind: "system" | "public" | "key" };
  /** Tên bản ghi lấy từ audit (`title`, `name`); rỗng khi không có. */
  what: string;
  href: string | null;
}

function nameIn(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const field of ["title", "name", "display_name", "key"]) {
    const text = record[field];
    if (typeof text === "string" && text.trim()) return text.trim().slice(0, 120);
  }
  return "";
}

/** Câu hoạt động của một mục audit; `null` khi event không có câu (không hiện). */
export function activityOf(entry: AuditLike): ActivityLine | null {
  const info = ACTIONS[entry.action];
  if (!info) return null;
  const subject = parseSubject(entry.subject);
  const actor: ActivityLine["actor"] = entry.actor_user_id
    ? { kind: "user", id: entry.actor_user_id }
    : entry.actor_api_key_id
      ? { kind: "key" }
      : { kind: entry.actor_kind === "public" ? "public" : "system" };
  return {
    id: entry.id,
    at: entry.occurred_at,
    group: info.group,
    key: `actions.${entry.action.replace(".", "_")}`,
    actor,
    what: nameIn(entry.after) || nameIn(entry.before),
    href: info.link && subject ? info.link(subject.id) : null,
  };
}

/** Các dòng có câu, giữ thứ tự mới nhất trước, tối đa `limit`. */
export function activityLines(entries: readonly AuditLike[], limit: number): ActivityLine[] {
  const out: ActivityLine[] = [];
  for (const entry of entries) {
    const line = activityOf(entry);
    if (line) out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}
