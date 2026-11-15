import "server-only";

// Đọc cờ giao diện của người đang đăng nhập một lần cho mỗi request: khung (chấm "Có gì mới") và trang
// (thẻ giới thiệu) dùng chung một lần gọi nhờ `cache` của React.
import { cache } from "react";
import { coreClient } from "@/lib/core";
import { type Flags, flagMap } from "./flags";

/**
 * Cờ của người xem. Lỗi gì cũng trả `null` (gợi ý vẫn hiện, trang không hỏng): cờ chỉ để bớt làm
 * phiền, không đáng chặn một trang. Không chuyển về đăng nhập ở đây; `getMe` của khung lo việc đó.
 */
export const myFlags = cache(async (): Promise<Flags> => {
  try {
    const client = await coreClient();
    const { data, response } = await client.GET("/api/v1/me/flags");
    return response.ok && data ? flagMap(data.data) : null;
  } catch {
    return null;
  }
});
