// Tên dễ hiểu cho một phiên đăng nhập từ header `User-Agent` mà core lưu ("Chrome trên macOS").
// Chỉ chạy ở máy chủ: `userAgentFromString` là bộ đọc User-Agent có sẵn trong Next.js.
import { userAgentFromString } from "next/server";

export interface Device {
  browser?: string;
  os?: string;
}

/** `null` khi không đọc ra trình duyệt hay hệ điều hành nào (vd ứng dụng gọi API). */
export function deviceOf(userAgent: string | null | undefined): Device | null {
  if (!userAgent) {
    return null;
  }
  const parsed = userAgentFromString(userAgent);
  const device: Device = {};
  if (parsed.browser.name) device.browser = parsed.browser.name;
  if (parsed.os.name) device.os = parsed.os.name;
  return device.browser || device.os ? device : null;
}
