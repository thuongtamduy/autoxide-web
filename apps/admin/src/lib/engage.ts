// Phần thuần (không gọi mạng) dùng chung cho phân hệ Tiếp thị: biểu mẫu, bản tin, bình luận
// (module `forms`, `newsletter`, `comments` của core). Dùng được cả ở máy chủ lẫn trình duyệt.

import type { components } from "@autoxide/sdk";
import type { FormState } from "./form";

/** Dữ liệu một module giữ về một email (yêu cầu của chủ dữ liệu). */
export type DataFound =
  | components["schemas"]["EmailDataResponse"]
  | components["schemas"]["NewsletterEmailData"]
  | components["schemas"]["CommentsEmailData"];

/** Trạng thái của màn "Dữ liệu theo email": email vừa tra và dữ liệu tìm được. */
export interface DataState extends FormState {
  email?: string;
  found?: DataFound;
}

/** Kết quả của một lệnh đổi trạng thái đảo được: đủ để nút Hoàn tác làm ngược lại. */
export interface ChangeState extends FormState {
  /** `updated_at` mới của bản ghi, để lệnh sau (Hoàn tác) kiểm phiên bản. */
  updated?: string;
  /** Trạng thái trước khi đổi. */
  previous?: string;
}

// Permission của ba module, đúng tên core khai (`Module::permissions`).
export const FORMS_READ = "forms.read";
export const FORMS_MANAGE = "forms.manage";
export const FORMS_REVIEW = "forms.review";
export const FORMS_EXPORT = "forms.export";
export const NEWSLETTER_READ = "newsletter.read";
export const NEWSLETTER_MANAGE = "newsletter.manage";
export const NEWSLETTER_SEND = "newsletter.send";
export const NEWSLETTER_EXPORT = "newsletter.export";
export const COMMENTS_READ = "comments.read";
export const COMMENTS_MODERATE = "comments.moderate";
export const COMMENTS_MANAGE = "comments.manage";
export const COMMENTS_EXPORT = "comments.export";

/** Số dòng mỗi trang của các danh sách trong phân hệ. */
export const PAGE_SIZE = 25;

export type SearchParams = Record<string, string | string[] | undefined>;

/** Một giá trị chữ của địa chỉ (`?status=new`), đã cắt khoảng trắng; trống thì `undefined`. */
export function one(params: SearchParams, key: string, max = 200): string | undefined {
  const value = params[key];
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text ? text.slice(0, max) : undefined;
}

/** Giá trị của địa chỉ nếu nằm trong danh sách cho phép, không thì `undefined`. */
export function oneOf<T extends string>(
  params: SearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = one(params, key);
  return allowed.find((item) => item === value);
}

/** Đường dẫn kèm tham số; tham số trống thì bỏ, để địa chỉ gọn và mở thẳng được. */
export function hrefWith(base: string, params: Record<string, string | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}

/** Chữ theo ngôn ngữ giao diện; thiếu thì lấy ngôn ngữ kia, như core làm. */
export function pickText(
  text: { en?: string | null; vi?: string | null } | null | undefined,
  locale: string,
): string {
  if (!text) return "";
  const first = locale === "vi" ? text.vi : text.en;
  const second = locale === "vi" ? text.en : text.vi;
  return (first || second || "").trim();
}

/** Cắt chữ dài cho một ô của bảng: gộp khoảng trắng, thêm "…" khi bị cắt. */
export function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Các dòng không trống của một ô nhiều dòng (mỗi dòng một email, một origin…). */
export function lines(text: string): string[] {
  return text
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Giờ của ô `datetime-local` (giờ địa phương của trình duyệt, không có múi) thành ISO 8601 UTC
 * cho core. Chạy ở trình duyệt, nơi biết múi giờ của người xem. Sai định dạng thì `null`.
 */
export function localToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Ngược lại: thời điểm ISO thành giá trị cho ô `datetime-local`, theo giờ của máy đang chạy. */
export function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Định dạng số theo ngôn ngữ (8.940 / 8,940). */
export function count(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}
