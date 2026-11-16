// Cấu hình của core cho giao diện (`GET /kernel/client-config`): ngôn ngữ, giới hạn tải lên, địa
// chỉ công khai… do người vận hành đặt. Đọc thay cho việc đoán giá trị mặc định của core.
import "server-only";

import type { components } from "@autoxide/sdk";
import { cache } from "react";
import { FALLBACK_CONTENT_LOCALES } from "./content";
import { anonymousClient } from "./core";

/**
 * Hình dạng mô tả ở `ClientConfigResponse`. Envelope trong `openapi.json` khai `data` là object tự
 * do (mỗi module góp một phần), và module không cài thì vắng phần của nó — nên mọi phần là tuỳ chọn.
 */
export type ClientConfig = Partial<components["schemas"]["ClientConfigResponse"]>;

/**
 * Cấu hình của core, đọc một lần cho mỗi request (`cache` của React gộp các lời gọi trong cùng
 * một lần render). Endpoint không cần đăng nhập. `null` khi core không trả được (core cũ chưa có
 * endpoint, mất mạng) — nơi gọi khi đó dùng giá trị mặc định của mình, trang vẫn dựng được.
 */
export const getClientConfig = cache(async (): Promise<ClientConfig | null> => {
  try {
    const { data } = await (await anonymousClient()).GET("/api/v1/kernel/client-config");
    return (data?.data as ClientConfig | undefined) ?? null;
  } catch {
    return null;
  }
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
