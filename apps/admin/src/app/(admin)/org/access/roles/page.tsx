import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ConfirmButton } from "@/components/engage/actions";
import { MessagePanel } from "@/components/message-panel";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Flash } from "@/components/ui/flash";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { ROLES_MANAGE, ROLES_READ } from "@/lib/permissions";
import { readSort, withQuery } from "@/lib/table";
import { can } from "@/lib/viewer";
import { bulkDeleteRoles, deleteRole } from "../actions";

type Role = components["schemas"]["RoleResponse"];

const BASE = "/org/access/roles";

// Tab "Role": mỗi role một dòng (tên, mô tả, số permission, dựng sẵn hay tự tạo). Mở một role để
// xem và sửa permission của nó. Bộ bảng (W-058): chọn nhiều để xoá (lặp lệnh từng cái của core; role
// dựng sẵn core từ chối), "⋯" trên dòng (mở, xoá), sắp theo ngày tạo bằng `order` của core (mặc định
// cũ trước), phân trang theo con trỏ.
export default async function RolesPage(props: PageProps<"/org/access/roles">) {
  const t = await getTranslations();
  const params = await props.searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const sort = readSort(params, ["created"], { field: "created", dir: "asc" });
  const keep = typeof params.sort === "string" ? { sort: "created", dir: sort.dir } : {};
  let page: components["schemas"]["Page_RoleResponse"];
  try {
    page = await load((client) =>
      client.GET("/api/v1/auth/roles", {
        params: { query: { limit: 50, order: sort.dir, ...(cursor ? { cursor } : {}) } },
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
  const [manage, counts] = await Promise.all([can(ROLES_MANAGE), roleCounts()]);
  const next = page.pagination.next_cursor;
  const d = (key: string, values?: Record<string, string>) =>
    t(`access.role.delete.${key}`, values);
  const bulk: BulkActionSpec[] = manage
    ? [
        {
          key: "delete",
          label: d("open"),
          tone: "danger",
          run: bulkDeleteRoles,
          confirm: {
            title: t("access.roles.bulkDeleteTitle"),
            points: [d("holders"), t("access.roles.bulkBuiltin"), d("noUndo")],
            submit: d("submit"),
          },
        },
      ]
    : [];
  // "⋯" của một dòng: mở (xem, sửa permission), xoá (role dựng sẵn không xoá được).
  const menu = (role: Role): RowMenuItem[] => [
    { label: t("access.roles.open"), href: `${BASE}/${role.id}` },
    ...(manage && !role.all_permissions
      ? [
          {
            label: d("open"),
            danger: true,
            dialog: (
              <ConfirmButton
                action={deleteRole}
                fields={{ id: role.id }}
                label={d("open")}
                title={d("title", { name: role.name })}
                points={[d("holders"), d("noUndo")]}
                submit={d("submit")}
              />
            ),
          },
        ]
      : []),
  ];
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
          <BulkTable
            ids={page.data.filter((role) => !role.all_permissions).map((role) => role.id)}
            actions={bulk}
          >
            <Table cards>
              <thead>
                <tr>
                  {manage ? <SelectAllTh /> : null}
                  <Th>{t("access.roles.role")}</Th>
                  <Th>{t("access.roles.permissions")}</Th>
                  <Th>{t("access.roles.kind")}</Th>
                  {counts ? <Th className="r">{t("access.roles.members")}</Th> : null}
                  <SortTh field="created" sort={sort} base={BASE} keep={keep}>
                    {t("access.users.created")}
                  </SortTh>
                  <Th>
                    <span className="vh">{t("access.users.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((role) => (
                  <tr key={role.id}>
                    {manage ? (
                      role.all_permissions ? (
                        <Td className="t-sel">
                          <span className="vh">{t("access.roles.builtin")}</span>
                        </Td>
                      ) : (
                        <SelectTd id={role.id} name={role.name} />
                      )
                    ) : null}
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link className="open mono" href={`${BASE}/${role.id}`}>
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
                        {role.all_permissions
                          ? t("access.roles.builtin")
                          : t("access.roles.custom")}
                      </span>
                    </Td>
                    {counts ? (
                      <Td className="r" label={t("access.roles.members")}>
                        {counts.get(role.id) ?? 0}
                      </Td>
                    ) : null}
                    <Td className="whitespace-nowrap" label={t("access.users.created")}>
                      <Time value={role.created_at} />
                    </Td>
                    <Td className="rt-acts">
                      <RowMenu label={t("table.moreFor", { name: role.name })} items={menu(role)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </BulkTable>
        </div>
        <Pager
          first={cursor ? withQuery(BASE, keep) : null}
          next={next ? withQuery(BASE, keep, { cursor: next }) : null}
        />
      </section>
    </div>
  );
}

/**
 * Số người giữ mỗi role (`GET /auth/roles/counts`, D-334 của core; cần `auth.users.read`); `null` khi
 * core từ chối thì bỏ cột.
 */
async function roleCounts(): Promise<Map<string, number> | null> {
  try {
    const answer = await load((client) => client.GET("/api/v1/auth/roles/counts"));
    return new Map(answer.data.map((c) => [c.role_id, c.members]));
  } catch (error) {
    if (isForbidden(error)) return null;
    throw error;
  }
}
