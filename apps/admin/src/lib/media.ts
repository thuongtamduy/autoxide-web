// Phần thuần (không gọi mạng) của Thư viện media: bộ lọc trên địa chỉ, địa chỉ ảnh qua máy chủ của
// giao diện, định dạng kích thước, và câu báo lỗi tải lên theo `code` của core (docs/MEDIA.md của
// core). Dùng được cả ở máy chủ lẫn trình duyệt.
import type { components } from "@autoxide/sdk";

type Schemas = components["schemas"];
export type MediaItem = Schemas["MediaItemResponse"];
export type MediaFolder = Schemas["FolderResponse"];
export type MediaTag = Schemas["TagResponse"];
export type MediaVariant = Schemas["VariantResponse"];
export type AltSuggestion = Schemas["AltSuggestionResponse"];
export type PublicMedia = Schemas["PublicMedia"];
export type LibrarySummary = Schemas["LibrarySummaryResponse"];

/** Số tệp mỗi trang của lưới. */
export const MEDIA_PAGE_SIZE = 48;

/** Nhóm loại tệp của nút "Lọc"; mỗi nhóm là một giá trị `type` của `GET /api/v1/media`. */
export const MEDIA_KINDS = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  pdf: "application/pdf",
} as const;
export type MediaKind = keyof typeof MEDIA_KINDS;

export interface MediaFilters {
  /** `root` hay id của thư mục; không có = mọi thư mục. */
  folder?: string | undefined;
  kind?: MediaKind | undefined;
  q?: string | undefined;
  tag?: string | undefined;
  /** Chỉ ảnh thiếu alt (`alt_missing=true`: core lọc cả thư viện, không tính ảnh trang trí). */
  noAlt?: boolean | undefined;
  visibility?: "public" | "private" | undefined;
  /** Thùng rác. */
  trash?: boolean | undefined;
  view?: "grid" | "table" | undefined;
  /** Tệp đang mở ở khung chi tiết. */
  item?: string | undefined;
  cursor?: string | undefined;
}

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text ? text : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Đọc bộ lọc từ địa chỉ; giá trị lạ thì bỏ qua. */
export function parseMediaFilters(params: SearchParams): MediaFilters {
  const filters: MediaFilters = {};
  const folder = one(params, "folder");
  if (folder === "root" || isUuid(folder)) filters.folder = folder;
  const kind = one(params, "kind");
  if (kind && kind in MEDIA_KINDS) filters.kind = kind as MediaKind;
  const q = one(params, "q")?.slice(0, 200);
  if (q) filters.q = q;
  const tag = one(params, "tag")?.slice(0, 50);
  if (tag) filters.tag = tag;
  if (one(params, "alt") === "missing") filters.noAlt = true;
  const visibility = one(params, "visibility");
  if (visibility === "public" || visibility === "private") filters.visibility = visibility;
  if (one(params, "trash") === "1") filters.trash = true;
  if (one(params, "view") === "table") filters.view = "table";
  const item = one(params, "item");
  if (isUuid(item)) filters.item = item;
  const cursor = one(params, "cursor");
  if (cursor) filters.cursor = cursor;
  return filters;
}

/**
 * Địa chỉ của thư viện với bộ lọc đã đổi. Đổi bộ lọc thì về trang đầu (con trỏ chỉ đúng với bộ
 * lọc đã tạo ra nó), trừ khi `change` đưa con trỏ mới hay chỉ đổi tệp đang mở.
 */
export function mediaHref(filters: MediaFilters, change: Partial<MediaFilters> = {}): string {
  const next: MediaFilters = { ...filters, ...change };
  const keys = Object.keys(change);
  if (!keys.includes("cursor") && !(keys.length === 1 && keys[0] === "item")) {
    delete next.cursor;
  }
  const query = new URLSearchParams();
  if (next.folder) query.set("folder", next.folder);
  if (next.kind) query.set("kind", next.kind);
  if (next.q) query.set("q", next.q);
  if (next.tag) query.set("tag", next.tag);
  if (next.noAlt) query.set("alt", "missing");
  if (next.visibility) query.set("visibility", next.visibility);
  if (next.trash) query.set("trash", "1");
  if (next.view === "table") query.set("view", "table");
  if (next.cursor) query.set("cursor", next.cursor);
  if (next.item) query.set("item", next.item);
  const text = query.toString();
  return text ? `/content/media?${text}` : "/content/media";
}

/**
 * Tham số gửi `GET /api/v1/media`: mới tải lên trước, kèm tên người tải lên (`include=uploader`,
 * core tra tên cho cả trang một lần).
 */
export function mediaQuery(filters: MediaFilters) {
  return {
    limit: MEDIA_PAGE_SIZE,
    sort: "created_at" as const,
    order: "desc" as const,
    include: "uploader" as const,
    ...(filters.noAlt ? { alt_missing: true } : {}),
    ...(filters.folder ? { folder_id: filters.folder } : {}),
    ...(filters.kind ? { type: MEDIA_KINDS[filters.kind] } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.tag ? { tag: filters.tag } : {}),
    ...(filters.visibility ? { visibility: filters.visibility } : {}),
    ...(filters.trash ? { trashed: true } : {}),
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
  };
}

// ---------------------------------------------------------------- Loại, kích thước

/** Ảnh raster: trình duyệt hiện được, có biến thể, AI gợi ý alt được (trừ AVIF). */
export function isRaster(contentType: string): boolean {
  return ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"].includes(contentType);
}

/** Ảnh nói chung (cả SVG): cần alt. */
export function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

/** Nhóm của một tệp, để chọn biểu tượng và nhãn loại. */
export function kindOf(contentType: string): MediaKind | "other" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType === "application/pdf") return "pdf";
  return "other";
}

/** Đuôi tệp in hoa để hiện trên ô (`JPG`, `MP4`); lấy từ tên, không có thì từ loại. */
export function extOf(item: Pick<MediaItem, "name" | "content_type">): string {
  const dot = item.name.lastIndexOf(".");
  if (dot > 0 && dot < item.name.length - 1) return item.name.slice(dot + 1).toUpperCase();
  return (item.content_type.split("/")[1] ?? "").toUpperCase();
}

/**
 * Ảnh cần alt mà chưa có: ảnh, `alt` mặc định trống, không đánh dấu trang trí — đúng điều kiện của
 * bộ lọc `alt_missing` và số `images_missing_alt` của core (D-267 của core).
 */
export function missingAlt(item: Pick<MediaItem, "content_type" | "alt" | "decorative">): boolean {
  return isImage(item.content_type) && item.alt.trim() === "" && !item.decorative;
}

/** Kích thước tệp dễ đọc: `312 KB`, `1,8 MB` (theo ngôn ngữ giao diện). */
export function formatBytes(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  return `${number} ${units[unit]}`;
}

// ---------------------------------------------------------------- Địa chỉ ảnh

/**
 * Địa chỉ của nội dung tệp qua route của giao diện (`/media/{id}/content`): máy chủ của giao diện
 * gọi core với token trong cookie, nên trình duyệt không cần token. `width` chọn bản nhỏ gần nhất
 * không nhỏ hơn (bản nhỏ chưa làm thì core trả bản gốc).
 */
export function mediaSrc(
  item: Pick<MediaItem, "id" | "version_id" | "variants">,
  width?: number,
): string {
  const query = new URLSearchParams({ v: item.version_id });
  if (width) {
    const variant = item.variants.find((v) => v.width >= width) ?? item.variants.at(-1);
    if (variant) query.set("w", String(variant.width));
  }
  return `/media/${item.id}/content?${query.toString()}`;
}

/**
 * Địa chỉ core trả cho người đọc (`/api/v1/media/{id}/content?v=…&w=…`) thành route của giao diện
 * (`/media/{id}/content?…`), vì trình duyệt không gọi thẳng core. Địa chỉ tuyệt đối (core đặt CDN
 * hay tên miền công khai) giữ nguyên; địa chỉ lạ thì rỗng (không tải gì).
 */
export function publicMediaSrc(url: string): string {
  const match = url.match(/^\/api\/v1\/media\/([0-9a-f-]{36})\/content(\?[^#]*)?$/);
  if (match?.[1] && isUuid(match[1])) return `/media/${match[1]}/content${match[2] ?? ""}`;
  return /^https:\/\//.test(url) ? url : "";
}

/** Địa chỉ khi chỉ có id (thân bài, ảnh đại diện): không có phiên bản, core cache ngắn. */
export function mediaIdSrc(id: string): string {
  return `/media/${id}/content`;
}

// ---------------------------------------------------------------- Lỗi tải lên

/** Giới hạn tải lên người vận hành đặt (`media` của `GET /kernel/client-config`). */
export interface UploadLimits {
  maxBytes: number;
  /** Loại cho phép: `image/png` hay cả nhóm `audio/*`. */
  allowedTypes: readonly string[];
}

/**
 * Tệp chắc chắn bị core từ chối thì báo ngay, khỏi gửi cả tệp lên rồi mới biết: quá cỡ, hay loại
 * trình duyệt báo không nằm trong danh sách. Loại trống (trình duyệt không biết) thì để core tự
 * nhận diện từ nội dung. Trả khoá câu của `media.upload.codes`, hay `null` khi gửi được.
 */
export function uploadBlock(
  file: { size: number; type: string },
  limits: UploadLimits | null | undefined,
): "tooLarge" | "typeNotAllowed" | null {
  if (!limits) return null;
  if (limits.maxBytes > 0 && file.size > limits.maxBytes) return "tooLarge";
  const type = file.type.toLowerCase();
  if (!type || limits.allowedTypes.length === 0) return null;
  const allowed = limits.allowedTypes.some((pattern) => {
    const p = pattern.toLowerCase();
    return p.endsWith("/*") ? type.startsWith(p.slice(0, -1)) : type === p;
  });
  return allowed ? null : "typeNotAllowed";
}

/** Mã lỗi tải lên của core → khoá câu trong `media.upload.codes` (câu của core vẫn hiện kèm). */
export const UPLOAD_CODES: Readonly<Record<string, string>> = {
  "media.too_large": "tooLarge",
  payload_too_large: "tooLarge",
  "media.type_not_allowed": "typeNotAllowed",
  "media.content_mismatch": "contentMismatch",
  "media.unknown_type": "unknownType",
  "media.invalid_image": "invalidImage",
  "media.svg_active_content": "svgActive",
  "media.invalid_content_type": "invalidType",
  "media.upload_interrupted": "interrupted",
  precondition_failed: "conflict",
  permission_denied: "forbidden",
};

/** Khoá câu báo cho một lỗi tải lên; mã lạ thì `other` (hiện `detail` của core). */
export function uploadErrorKey(code: string): string {
  return UPLOAD_CODES[code] ?? "other";
}

/** Tên tệp core nhận: 1 đến 255 ký tự, không có `/` hay `\`. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[/\\]/g, "-").trim();
  return (cleaned || "file").slice(0, 255);
}
