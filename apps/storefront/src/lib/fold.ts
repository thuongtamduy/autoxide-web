/**
 * Chữ để so khi tìm: chữ thường, bỏ dấu tiếng Việt (kể cả "đ"), bỏ khoảng trắng hai đầu — gõ
 * "chao gang" vẫn thấy "Chảo gang". Chép từ `apps/admin/src/lib/fold.ts` (không import chéo app).
 */
export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/đ/g, "d").replace(/[̀-ͯ]/g, "").trim();
}

/** Tên có chứa chữ cần tìm không (bỏ dấu); khớp đúng dấu xếp trước khi sắp (`matchRank`). */
export function matches(name: string, query: string): boolean {
  const q = fold(query);
  return q !== "" && fold(name).includes(q);
}

/** 0 khi khớp đúng dấu, 1 khi chỉ khớp lúc bỏ dấu — để xếp kết quả khớp đúng dấu lên trước. */
export function matchRank(name: string, query: string): number {
  return name.toLowerCase().includes(query.trim().toLowerCase()) ? 0 : 1;
}
