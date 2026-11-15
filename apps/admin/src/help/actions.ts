"use server";

// Ghi cờ giao diện (D-207 của core). SDK tự gắn `Idempotency-Key` cho lệnh ghi; PUT ghi đè nên gọi
// lại cũng an toàn. Trình duyệt chỉ gửi id của gợi ý, key và giá trị do máy chủ dựng.
import { send } from "@/lib/action";
import { DISMISSED, hintKey, isHintId, NEWS_FLAG } from "./flags";
import { latestVersion } from "./whats-new";

async function setFlag(key: string, value: string): Promise<boolean> {
  const outcome = await send((client) =>
    client.PUT("/api/v1/me/flags/{key}", { params: { path: { key } }, body: { value } }),
  );
  return outcome.ok;
}

/** Tắt một gợi ý cho tài khoản này, trên mọi thiết bị. */
export async function dismissHint(id: string): Promise<boolean> {
  if (!isHintId(id)) return false;
  return setFlag(hintKey(id), DISMISSED);
}

/** Đánh dấu đã xem "Có gì mới" tới tin mới nhất. */
export async function markNewsSeen(): Promise<boolean> {
  const version = latestVersion();
  return version ? setFlag(NEWS_FLAG, version) : true;
}
