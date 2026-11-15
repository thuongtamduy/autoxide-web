// Dữ liệu mẫu của Thư viện media, cho phần bản thiết kế mà core chưa có API (W-006):
// - cờ "ảnh chỉ để trang trí" của một tệp (alt để trống có chủ ý, khác "chưa có alt"); chưa có ở
//   bước nào của lộ trình ("mới"). Hình dạng đoán: trường `decorative` của tệp, sửa bằng `PATCH`.
// Alt của tệp (`alt`) và alt theo từng ngôn ngữ (`alts`, `PUT/DELETE /media/{id}/alts/{locale}`)
// đọc và ghi ở core thật (W-021). Lệnh ghi đổi kho trong bộ nhớ của tiến trình máy chủ; khởi động
// lại thì về ban đầu.

const store = new Set<string>();

// Thay bằng trường `decorative` của tệp khi core có.
export async function getMediaDecorative(mediaId: string): Promise<{ data: boolean }> {
  return { data: store.has(mediaId) };
}

// Thay bằng `PATCH /api/v1/media/{id}` với `decorative` khi core có.
export async function putMediaDecorative(
  mediaId: string,
  decorative: boolean,
): Promise<{ data: boolean }> {
  if (decorative) store.add(mediaId);
  else store.delete(mediaId);
  return { data: decorative };
}

/** Chỉ cho test: về kho trống. */
export function resetMediaDecorative(): void {
  store.clear();
}
