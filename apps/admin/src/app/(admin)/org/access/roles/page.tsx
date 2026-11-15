import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { ROLES_MANAGE, ROLES_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";

// Tab "Role": mỗi role một dòng (tên, mô tả, số permission, dựng sẵn hay tự tạo). Mở một role để
// xem và sửa permission của nó.
export default async function RolesPage(props: PageProps<"/org/access/roles">) {
  const t = await getTranslations();
  const params = await props.searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  let page: components["schemas"]["Page_RoleResponse"];
  try {
    page = await load((client) =>
      client.GET("/api/v1/auth/roles", {
        params: { query: { limit: 50, order: "asc", ...(cursor ? { cursor } : {}) } },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) {
      return (
        <MessagePanel
          title={t("errors.forbiddenTitle")}
          message={t("errors.forbidden", { permission: ROLES_READ })}
        />
      );
    }
    throw error;
  }
  const manage = await can(ROLES_MANAGE);
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      {params.deleted ? <Flash text={t("access.role.deleted")} /> : null}
      <section className="block" aria-labelledby="roles-h">
        <div className="block-head">
          <h2 id="roles-h" className="h2">
            {t("access.roles.title")}
          </h2>
          {manage ? (
            <Link className="btn sm" href="/org/access/roles/new">
              {t("access.roles.create")}
            </Link>
          ) : null}
        </div>
        <p className="fhint">{t("access.roles.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("access.roles.role")}</Th>
                <Th>{t("access.roles.permissions")}</Th>
                <Th>{t("access.roles.kind")}</Th>
                <Th>{t("access.users.created")}</Th>
              </tr>
            </thead>
            <tbody>
              {page.data.map((role) => (
                <tr key={role.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <Link className="open mono" href={`/org/access/roles/${role.id}`}>
                        {role.name}
                      </Link>
                      {role.description ? <span className="sub">{role.description}</span> : null}
                    </span>
                  </Td>
                  <Td label={t("access.roles.permissions")}>
                    {role.all_permissions
                      ? t("access.roles.every")
                      : t("access.roles.count", { count: role.permissions.length })}
                  </Td>
                  <Td label={t("access.roles.kind")}>
                    <span className={role.all_permissions ? "badge b-info" : "badge b-draft"}>
                      <span className="dot" />
                      {role.all_permissions ? t("access.roles.builtin") : t("access.roles.custom")}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap" label={t("access.users.created")}>
                    <Time value={role.created_at} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        {cursor || next ? (
          <nav className="pager" aria-label={t("access.pages")}>
            {cursor ? (
              <Link className="btn sm" href="/org/access/roles">
                {t("access.first")}
              </Link>
            ) : null}
            {next ? (
              <Link
                className="btn sm"
                href={`/org/access/roles?cursor=${encodeURIComponent(next)}`}
              >
                {t("access.next")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
