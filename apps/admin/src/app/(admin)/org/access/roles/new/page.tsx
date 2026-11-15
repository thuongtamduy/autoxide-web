import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RoleEditor } from "@/components/access/role-editor";
import { MessagePanel } from "@/components/message-panel";
import { load } from "@/lib/core";
import { ROLES_MANAGE } from "@/lib/permissions";
import { can } from "@/lib/viewer";

// Tạo role: tên, mô tả, chọn permission trong sổ permission của core.
export default async function NewRolePage() {
  const t = await getTranslations();
  if (!(await can(ROLES_MANAGE))) {
    return (
      <MessagePanel
        title={t("errors.forbiddenTitle")}
        message={t("errors.forbidden", { permission: ROLES_MANAGE })}
      />
    );
  }
  const { data: catalog } = await load((client) => client.GET("/api/v1/auth/permissions"));
  return (
    <div className="blocks">
      <nav className="back" aria-label={t("access.role.breadcrumb")}>
        <Link href="/org/access/roles" className="btn ghost sm">
          <span aria-hidden="true">←</span> {t("access.role.back")}
        </Link>
      </nav>
      <section className="block" aria-labelledby="role-h">
        <h2 id="role-h" className="h2">
          {t("access.role.newTitle")}
        </h2>
        <RoleEditor catalog={catalog} editable />
      </section>
    </div>
  );
}
