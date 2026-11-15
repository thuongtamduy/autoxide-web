"use server";

import { routing } from "@/i18n/routing";
import { publicClient, visitorChain } from "./core";

// Token chống spam cho form công khai (`GET /api/v1/antispam/token?scope=`): core muốn lấy token
// mỗi lần form hiện ra, không để trong HTML đã cache. Form xin token khi người đọc bắt đầu điền
// (focus vào ô đầu), nên khoảng cách tới lúc gửi giống người thật.

/** Token mới cho `scope` (vd `newsletter:subscribe`, `comments:content.entry`); lỗi thì `null`. */
export async function formToken(scope: string, locale: string): Promise<string | null> {
  if (!/^[a-z0-9_.:-]{1,64}$/.test(scope)) return null;
  const language = (routing.locales as readonly string[]).includes(locale) ? locale : "vi";
  try {
    const { data } = await publicClient(language, await visitorChain()).GET(
      "/api/v1/antispam/token",
      {
        params: { query: { scope } },
      },
    );
    return data?.data.token ?? null;
  } catch {
    return null;
  }
}
