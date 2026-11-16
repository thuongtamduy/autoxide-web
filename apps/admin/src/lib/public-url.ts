// Địa chỉ công khai của core cho người và agent ở ngoài (trang kết nối MCP, lệnh `curl` mẫu): giá
// trị người vận hành đặt (`AUTOXIDE_HTTP_PUBLIC_URL`, đọc qua `GET /kernel/client-config`). Chưa đặt
// thì dùng địa chỉ trang quản trị đang gọi core (`AUTOXIDE_API_URL`) — có thể chỉ dùng được trong
// mạng nội bộ, nên trang nói rõ khi nào là địa chỉ nào.
import "server-only";

import { getClientConfig } from "./client-config";
import { coreUrl } from "./env";

export interface PublicUrl {
  url: string;
  /** `true` khi người vận hành đã đặt địa chỉ công khai; `false` khi đang dùng địa chỉ nội bộ. */
  configured: boolean;
}

export async function publicApiUrl(): Promise<PublicUrl> {
  const configured = (await getClientConfig())?.kernel?.public_url;
  return configured
    ? { url: configured.replace(/\/+$/, ""), configured: true }
    : { url: coreUrl(), configured: false };
}
