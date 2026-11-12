// Cấu hình đọc từ biến môi trường, một chỗ duy nhất (xem `.env.example`).
//
// Không có `import "server-only"`: proxy cũng dùng file này. Không file nào của trình duyệt
// import nó — biến không có tiền tố `NEXT_PUBLIC_` nên Next.js cũng không đưa xuống.

/** Gốc của core, không có `/api/v1` và không có `/` ở cuối. */
export function coreUrl(): string {
  return (process.env.AUTOXIDE_API_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
}

/** Cookie phiên chỉ gửi qua HTTPS. */
export function secureCookies(): boolean {
  const value = process.env.AUTOXIDE_WEB_SECURE_COOKIES;
  if (value === undefined || value === "") {
    return process.env.NODE_ENV === "production";
  }
  return value === "true" || value === "1";
}
