import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { MessagePanel } from "@/components/message-panel";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";

/**
 * Cửa của hai màn Sản phẩm và Tồn kho: dựng hoàn toàn bằng dữ liệu mẫu (W-006), nên tắt dữ liệu
 * mẫu thì màn không tồn tại (404); thiếu permission dự kiến của bước 41 / 42 thì báo như màn thật.
 * Trả `null` khi được mở.
 */
export async function commerceGate(
  permission: string | readonly string[],
): Promise<ReactNode | null> {
  if (!sampleDataEnabled()) notFound();
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  const name = typeof permission === "string" ? permission : permission.join(", ");
  return (
    <MessagePanel title={t("forbiddenTitle")} message={t("forbidden", { permission: name })} />
  );
}
