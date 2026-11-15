import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ApiKeyCreator } from "@/components/settings/api-key-form";
import { grantable } from "@/lib/api-keys";
import { isForbidden } from "@/lib/core";
import { coreUrl } from "@/lib/env";
import { permissionCatalog } from "@/lib/permission-catalog";
import type { PermissionInfo } from "@/lib/permission-groups";
import { getMe } from "@/lib/viewer";

/**
 * Sổ permission để lấy mô tả; cần `auth.roles.read`. Không đọc được thì `null` (bộ chọn vẫn có
 * tên permission của người tạo, không có mô tả).
 */
async function catalog(): Promise<PermissionInfo[] | null> {
  try {
    return await permissionCatalog();
  } catch (error) {
    if (isForbidden(error)) return null;
    throw error;
  }
}

// Tạo API key: bộ chọn permission dùng chung với màn Role, chỉ bày những permission người tạo
// đang có (core từ chối phần còn lại bằng `not_granted`).
export default async function NewApiKeyPage() {
  const t = await getTranslations("settings.apiKeys");
  const [me, all] = await Promise.all([getMe(), catalog()]);
  return (
    <div className="blocks">
      <nav className="back" aria-label={t("breadcrumb")}>
        <Link href="/settings/api-keys" className="btn ghost sm">
          <span aria-hidden="true">←</span> {t("back")}
        </Link>
      </nav>
      <section className="block" aria-labelledby="newkey-h">
        <h2 id="newkey-h" className="h2">
          {t("newTitle")}
        </h2>
        <p className="fhint">{t("newAbout")}</p>
        <ApiKeyCreator catalog={grantable(all, me)} coreUrl={coreUrl()} />
      </section>
    </div>
  );
}
