import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DeleteRoleDialog } from "@/components/access/delete-role";
import { RoleEditor } from "@/components/access/role-editor";
import { MessagePanel } from "@/components/message-panel";
import { Flash } from "@/components/ui/flash";
import { isForbidden, isNotFound, load, loadTagged } from "@/lib/core";
import { ROLES_MANAGE, ROLES_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";

type Role = components["schemas"]["RoleResponse"];

// Một role: xem và sửa permission. Role dựng sẵn `admin` (`all_permissions`) cấp mọi permission,
// kể cả permission thêm sau; core không cho sửa hay xoá nó (`auth.role_builtin`), nên chỉ hiện.
export default async function RolePage(props: PageProps<"/org/access/roles/[id]">) {
  const t = await getTranslations();
  const { id } = await props.params;
  const { created } = await props.searchParams;
  let role: Role;
  let etag: string | null;
  let catalog: components["schemas"]["PermissionResponse"][];
  try {
    [
      {
        data: { data: role },
        etag,
      },
      { data: catalog },
    ] = await Promise.all([
      loadTagged((client) => client.GET("/api/v1/auth/roles/{id}", { params: { path: { id } } })),
      load((client) => client.GET("/api/v1/auth/permissions")),
    ]);
  } catch (error) {
    if (isForbidden(error)) {
      return (
        <MessagePanel
          title={t("errors.forbiddenTitle")}
          message={t("errors.forbidden", { permission: ROLES_READ })}
        />
      );
    }
    if (isNotFound(error)) {
      return (
        <MessagePanel title={t("errors.notFoundTitle")} message={t("access.role.notFound")}>
          <Link className="btn" href="/org/access/roles">
            {t("access.role.back")}
          </Link>
        </MessagePanel>
      );
    }
    throw error;
  }
  const manage = await can(ROLES_MANAGE);
  return (
    <div className="blocks">
      {created ? <Flash text={t("access.role.created")} /> : null}
      <nav className="back" aria-label={t("access.role.breadcrumb")}>
        <Link href="/org/access/roles" className="btn ghost sm">
          <span aria-hidden="true">←</span> {t("access.role.back")}
        </Link>
      </nav>
      <section className="block" aria-labelledby="role-h">
        <div className="block-head">
          <h2 id="role-h" className="h2 mono">
            {role.name}
          </h2>
          {manage && !role.all_permissions ? (
            <DeleteRoleDialog id={role.id} name={role.name} />
          ) : null}
        </div>
        {role.all_permissions ? (
          <p className="note">{t("access.role.builtinNote")}</p>
        ) : (
          <RoleEditor
            catalog={catalog}
            role={{
              id: role.id,
              name: role.name,
              description: role.description,
              permissions: role.permissions,
            }}
            etag={etag}
            editable={manage}
          />
        )}
      </section>
    </div>
  );
}
