/**
 * Chữ để so khi tìm: chữ thường, bỏ dấu tiếng Việt (kể cả "đ"), bỏ khoảng trắng hai đầu — gõ
 * "phan quyen" vẫn thấy "Phân quyền".
 */
export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/đ/g, "d").replace(/[̀-ͯ]/g, "").trim();
}
