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
