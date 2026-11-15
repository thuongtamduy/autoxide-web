// Dữ liệu mẫu của Thư viện media, cho phần bản thiết kế mà core chưa có API (W-006):
// - alt theo từng ngôn ngữ của một tệp: core chỉ có một `alt` cho mỗi tệp (docs/MEDIA.md: "alt
//   theo ngôn ngữ nằm trong khối ảnh của thân bài"); chưa có ở bước nào của lộ trình ("mới").
//   Hình dạng đoán: `GET /api/v1/media/{id}/alts` → `{ data: { media_id, alts: [{ locale, alt,
//   decorative }] } }`, `PUT` cùng địa chỉ thay cả danh sách.
// `alt` của chính tệp (ngôn ngữ mặc định) luôn đọc và ghi ở core thật. Lệnh ghi đổi kho trong bộ
// nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { SampleOutcome } from "./content";

/** Alt của một tệp ở một ngôn ngữ. */
export interface LocalizedAlt {
  locale: string;
  alt: string;
  /** Ảnh chỉ để trang trí: alt để trống có chủ ý (khác "chưa có alt"). */
  decorative: boolean;
}

export interface MediaAlts {
  media_id: string;
  alts: LocalizedAlt[];
}

const store = new Map<string, LocalizedAlt[]>();

const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

// Thay bằng GET /api/v1/media/{id}/alts (mới) khi core có.
export async function getMediaAlts(mediaId: string): Promise<{ data: MediaAlts }> {
  return { data: { media_id: mediaId, alts: [...(store.get(mediaId) ?? [])] } };
}

// Thay bằng PUT /api/v1/media/{id}/alts (mới) khi core có.
export async function putMediaAlts(
  mediaId: string,
  alts: readonly LocalizedAlt[],
): Promise<SampleOutcome<MediaAlts>> {
  const errors: { field: string; code: string; detail: string }[] = [];
  alts.forEach((entry, index) => {
    if (!LOCALE.test(entry.locale)) {
      errors.push({ field: `alts[${index}].locale`, code: "unknown", detail: "unknown language" });
    }
    if (entry.alt.length > 1000) {
      errors.push({ field: `alts[${index}].alt`, code: "too_long", detail: "is too long" });
    }
  });
  if (errors.length > 0) {
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Unprocessable Entity",
        status: 422,
        code: "validation_failed",
        detail: "The request has invalid fields.",
        errors,
      },
    };
  }
  const cleaned = alts.map((entry) => ({
    locale: entry.locale,
    alt: entry.decorative ? "" : entry.alt.trim(),
    decorative: entry.decorative,
  }));
  store.set(mediaId, cleaned);
  return { ok: true, data: { media_id: mediaId, alts: cleaned } };
}

/** Chỉ cho test: về kho trống. */
export function resetMediaAlts(): void {
  store.clear();
}
