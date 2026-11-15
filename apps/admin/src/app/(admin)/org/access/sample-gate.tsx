import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { MessagePanel } from "@/components/message-panel";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";

/**
 * Cửa của một tab dữ liệu mẫu: tắt dữ liệu mẫu thì tab không tồn tại (404); thiếu permission
 * (của bước 34, admin có sẵn) thì báo như màn thật. Trả `null` khi được mở.
 */
export async function sampleGate(permission: string): Promise<ReactNode | null> {
  if (!sampleDataEnabled()) notFound();
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  return <MessagePanel title={t("forbiddenTitle")} message={t("forbidden", { permission })} />;
}

/** Role thật của core cho ô chọn của tab mẫu (`id|tên`); không đọc được role thì rỗng. */
export function roleOptions(
  roles: readonly { id: string; name: string }[] | null,
): { value: string; label: string }[] {
  return (roles ?? []).map((role) => ({ value: `${role.id}|${role.name}`, label: role.name }));
}
