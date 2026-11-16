// Hàm thuần của tab "Tên miền" (W-032): đọc `TenantDomain` của core (D-291, D-293 của core) thành
// điều người quản trị cần làm tiếp. Không gọi core; trang đọc dữ liệu rồi gọi các hàm này.
import type { components } from "@autoxide/sdk";
import type { FormState } from "./form";

export type TenantDomain = components["schemas"]["TenantDomain"];

/** Core đổi tên miền `pending` thành `failed` sau chừng này ngày kể từ lần đổi trạng thái. */
export const PENDING_DAYS = 7;
/** Tên miền đã xác minh thành `failed` khi chừng này lần kiểm hằng ngày liên tiếp không thấy bản ghi. */
export const MAX_FAILED_CHECKS = 3;

const DAY_MS = 86_400_000;

/**
 * Hạn của tên miền đang chờ: `updated_at` (lần đổi trạng thái) cộng 7 ngày; `null` khi không chờ.
 * Core tính đúng như vậy (D-291 mục 3), nên giao diện báo trước được ngày tên miền sẽ hỏng.
 */
export function pendingExpiresAt(
  domain: Pick<TenantDomain, "status" | "updated_at">,
): string | null {
  if (domain.status !== "pending") return null;
  const at = Date.parse(domain.updated_at);
  return Number.isNaN(at) ? null : new Date(at + PENDING_DAYS * DAY_MS).toISOString();
}

/** Việc người quản trị nên làm với tên miền, theo trạng thái core trả. */
export type DomainNext =
  /** Đặt bản ghi TXT rồi bấm "Kiểm tra ngay". */
  | "set_record"
  /** Đã xác minh, bản ghi vẫn thấy: giữ nguyên bản ghi. */
  | "keep_record"
  /** Đã xác minh nhưng lần kiểm hằng ngày gần đây không thấy bản ghi: đặt lại trước khi hỏng. */
  | "restore_record"
  /** Hỏng: sửa bản ghi rồi kiểm tra lại (core nhận xác minh lại tên miền `failed`). */
  | "fix_record";

export function domainNext(domain: Pick<TenantDomain, "status" | "failed_checks">): DomainNext {
  if (domain.status === "verified") {
    return domain.failed_checks > 0 ? "restore_record" : "keep_record";
  }
  return domain.status === "failed" ? "fix_record" : "set_record";
}

/**
 * Có nên hiện nút "Kiểm tra ngay": tên miền đã xác minh và bản ghi vẫn thấy thì core trả nguyên
 * trạng thái mà không tra DNS (D-291), nút chỉ làm người dùng tưởng có kiểm.
 */
export function canVerify(domain: Pick<TenantDomain, "status" | "failed_checks">): boolean {
  return domainNext(domain) !== "keep_record";
}

/** Thứ tự hiện: cần làm trước (hỏng, sắp mất, đang chờ), rồi đã xác minh; cùng nhóm thì mới trước. */
export function sortDomains<
  T extends Pick<TenantDomain, "status" | "failed_checks" | "created_at">,
>(list: readonly T[]): T[] {
  const rank: Record<DomainNext, number> = {
    fix_record: 0,
    restore_record: 1,
    set_record: 2,
    keep_record: 3,
  };
  return [...list].sort(
    (a, b) => rank[domainNext(a)] - rank[domainNext(b)] || b.created_at.localeCompare(a.created_at),
  );
}

/**
 * Bản cài một khách trả 409 `tenant_single_mode` khi thêm tên miền: thay câu của core (nói về việc
 * thêm khách) bằng lời giải thích nên làm gì với tên miền; vẫn giữ `code` để rẽ nhánh.
 */
export function explainSingleMode(state: FormState, explanation: string): FormState {
  return state.code === "tenant_single_mode" ? { ...state, error: explanation } : state;
}
