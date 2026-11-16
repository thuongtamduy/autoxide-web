import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type EditedRole, RoleEditor } from "@/components/access/role-editor";
import { MessagePanel } from "@/components/message-panel";
import { load } from "@/lib/core";
import { permissionCatalog } from "@/lib/permission-catalog";
import { ROLES_MANAGE } from "@/lib/permissions";
import { can } from "@/lib/viewer";

// Tạo role: tên, mô tả, chọn permission trong sổ permission của core. `?from=<id>` (nút "Nhân bản" ở
// trang một role): điền sẵn mô tả và permission của role đó, tên thêm đuôi `-copy`; người dùng sửa rồi
// tạo như thường (`POST /auth/roles`). Role không đọc được thì mở form trống.
export default async function NewRolePage(props: PageProps<"/org/access/roles/new">) {
  const t = await getTranslations();
  if (!(await can(ROLES_MANAGE))) {
    return (
      <MessagePanel
        title={t("errors.forbiddenTitle")}
        message={t("errors.forbidden", { permission: ROLES_MANAGE })}
      />
    );
  }
  const { from } = await props.searchParams;
  const [catalog, template] = await Promise.all([
    permissionCatalog(),
    typeof from === "string" ? copyOf(from) : Promise.resolve(undefined),
  ]);
  return (
    <div className="blocks">
      <nav className="back" aria-label={t("access.role.breadcrumb")}>
        <Link href="/org/access/roles" className="btn ghost sm">
          <span aria-hidden="true">←</span> {t("access.role.back")}
        </Link>
      </nav>
      <section className="block" aria-labelledby="role-h">
        <h2 id="role-h" className="h2">
          {template
            ? t("access.role.copyTitle", { name: template.source })
            : t("access.role.newTitle")}
        </h2>
        <RoleEditor catalog={catalog} {...(template ? { template: template.role } : {})} editable />
      </section>
    </div>
  );
}

/** Role nguồn của "Nhân bản"; không đọc được (đã xoá, thiếu quyền) thì `undefined`. */
async function copyOf(
  id: string,
): Promise<{ source: string; role: Omit<EditedRole, "id"> } | undefined> {
  try {
    const { data: role } = await load((client) =>
      client.GET("/api/v1/auth/roles/{id}", { params: { path: { id } } }),
    );
    return {
      source: role.name,
      role: {
        name: copyName(role.name),
        description: role.description,
        permissions: role.permissions,
      },
    };
  } catch (error) {
    // Hết phiên: `load` chuyển về trang đăng nhập bằng `redirect()`, phải để nó đi qua.
    unstable_rethrow(error);
    return undefined;
  }
}

/** Tên gợi ý cho bản sao: thêm `-copy` (vẫn đúng quy tắc tên của core); trùng hay quá dài thì core báo. */
function copyName(name: string): string {
  return `${name}-copy`;
}
