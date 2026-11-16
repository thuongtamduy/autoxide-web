// Cấu hình của core cho giao diện (`GET /kernel/client-config`): ngôn ngữ, giới hạn tải lên, địa
// chỉ công khai… do người vận hành đặt. Đọc thay cho việc đoán giá trị mặc định của core.
import "server-only";

import type { AutoxideClient, components } from "@autoxide/sdk";
import { cookies } from "next/headers";
import { cache } from "react";
import { FALLBACK_CONTENT_LOCALES } from "./content";
import { anonymousClient, coreClient } from "./core";
import { ACCESS_COOKIE } from "./session";

/**
 * Hình dạng mô tả ở `ClientConfigResponse`. Envelope trong `openapi.json` khai `data` là object tự
 * do (mỗi module góp một phần), và module không cài thì vắng phần của nó — nên mọi phần là tuỳ chọn.
 */
export type ClientConfig = Partial<components["schemas"]["ClientConfigResponse"]>;

/**
 * Đọc cấu hình bằng `client`; `null` khi core không trả lời hay trả lỗi (401 vì token hết hạn, 403
 * khách tạm khoá, 503…).
 */
async function fetchConfig(client: AutoxideClient): Promise<ClientConfig | null> {
  try {
    const { data } = await client.GET("/api/v1/kernel/client-config");
    return (data?.data as ClientConfig | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Cấu hình của core, theo khách của request (D-296 của core: khách tự đặt ngôn ngữ nội dung,
 * `media.alt_locales`… thì thay giá trị chung). Đã đăng nhập (`signedIn`) thì gọi bằng token — core
 * nhận ra khách từ credential, kể cả khi trang quản trị không gửi header khách; lỗi thì gọi lại như
 * khách (`anonymous`, kèm khách theo tên miền / lựa chọn lúc đăng nhập). `null` khi cả hai không
 * được. Tách khỏi `getClientConfig` để test không cần cookie.
 */
export async function readClientConfig(
  signedIn: (() => Promise<AutoxideClient>) | null,
  anonymous: () => Promise<AutoxideClient>,
): Promise<ClientConfig | null> {
  if (signedIn) {
    const own = await signedIn()
      .then(fetchConfig)
      .catch(() => null);
    if (own) return own;
  }
  return anonymous()
    .then(fetchConfig)
    .catch(() => null);
}

/**
 * Cấu hình của core, đọc một lần cho mỗi request (`cache` của React gộp các lời gọi trong cùng
 * một lần render). Endpoint không bắt đăng nhập. `null` khi core không trả được (core cũ chưa có
 * endpoint, mất mạng) — nơi gọi khi đó dùng giá trị mặc định của mình, trang vẫn dựng được.
 */
export const getClientConfig = cache(async (): Promise<ClientConfig | null> => {
  const signedIn = (await cookies()).get(ACCESS_COOKIE)?.value ? coreClient : null;
  return readClientConfig(signedIn, anonymousClient);
});

/**
 * Ngôn ngữ của nội dung và menu theo cấu hình của core; core cũ hay không trả lời thì giá trị mặc
 * định của core (`en`, `vi`).
 */
export async function contentLocales(): Promise<{
  content: string[];
  contentDefault: string;
  menus: string[];
}> {
  const config = await getClientConfig();
  const content = config?.content?.locales?.length
    ? config.content.locales
    : [...FALLBACK_CONTENT_LOCALES];
  const contentDefault = config?.content?.default_locale ?? content[0] ?? "en";
  const menus = config?.menus?.locales?.length ? config.menus.locales : content;
  return { content, contentDefault, menus };
}

/** Ngôn ngữ của giao diện nếu nội dung có ngôn ngữ đó, không thì ngôn ngữ mặc định của nội dung. */
export async function contentLocaleFor(uiLocale: string): Promise<string> {
  const { content, contentDefault } = await contentLocales();
  return content.includes(uiLocale) ? uiLocale : contentDefault;
}
