import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { coreClient, isForbidden, load } from "@/lib/core";
import { USERS_READ } from "@/lib/permissions";

type User = components["schemas"]["UserResponse"];
type Role = components["schemas"]["RoleResponse"];

/** Mỗi trang 25 người: mỗi người thêm một lời gọi lấy role (danh sách của core chưa kèm role). */
const PAGE_SIZE = 25;

/**
 * Role của từng người trên trang, gọi song song. Lời gọi nào lỗi thì người đó hiện "—" thay vì
 * làm hỏng cả trang.
 */
async function rolesOf(users: readonly User[]): Promise<Map<string, Role[] | null>> {
  const client = await coreClient();
  const entries = await Promise.all(
    users.map(async (user) => {
      try {
        const { data } = await client.GET("/api/v1/auth/users/{id}/roles", {
          params: { path: { id: user.id } },
        });
        return [user.id, data?.data ?? null] as const;
      } catch {
        return [user.id, null] as const;
      }
    }),
  );
  return new Map(entries);
}

function href(search: string, cursor?: string): string {
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (cursor) query.set("cursor", cursor);
  const text = query.toString();
  return text ? `/org/access/users?${text}` : "/org/access/users";
}

// Tab "Người dùng": tìm theo email hay tên (tham số `search` của core), pagination theo con trỏ.
export default async function UsersPage(props: PageProps<"/org/access/users">) {
  const t = await getTranslations();
  const params = await props.searchParams;
  const search = typeof params.search === "string" ? params.search.trim() : "";
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  let page: components["schemas"]["Page_UserResponse"];
  try {
    page = await load((client) =>
      client.GET("/api/v1/auth/users", {
        params: {
          query: { limit: PAGE_SIZE, ...(search ? { search } : {}), ...(cursor ? { cursor } : {}) },
        },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) {
      return (
        <MessagePanel
          title={t("errors.forbiddenTitle")}
          message={t("errors.forbidden", { permission: USERS_READ })}
        />
      );
    }
    throw error;
  }
  const roles = await rolesOf(page.data);
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      {params.deleted ? <Flash text={t("access.user.delete.done")} /> : null}
      <section className="block" aria-labelledby="users-h">
        <div className="block-head">
          <h2 id="users-h" className="h2">
            {t("access.users.title")}
          </h2>
        </div>
        <search aria-label={t("access.users.search")}>
          <form method="get" className="searchrow">
            <input
              className="inp"
              type="search"
              name="search"
              defaultValue={search}
              placeholder={t("access.users.searchHint")}
              aria-label={t("access.users.search")}
            />
            <button type="submit" className="btn">
              {t("access.users.find")}
            </button>
            {search ? (
              <Link className="btn ghost" href="/org/access/users">
                {t("access.users.clear")}
              </Link>
            ) : null}
          </form>
        </search>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">
              {search ? t("access.users.noMatch", { search }) : t("access.users.empty")}
            </p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("access.users.user")}</Th>
                  <Th>{t("access.users.roles")}</Th>
                  <Th>{t("access.users.status")}</Th>
                  <Th>{t("access.users.created")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((user) => {
                  const held = roles.get(user.id);
                  return (
                    <tr key={user.id}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link className="open" href={`/org/access/users/${user.id}`}>
                            {user.name || user.email}
                          </Link>
                          <span className="sub ell mono">{user.email}</span>
                        </span>
                      </Td>
                      <Td label={t("access.users.roles")}>
                        {held === null || held === undefined ? (
                          "—"
                        ) : held.length === 0 ? (
                          <span className="muted">{t("access.users.noRoles")}</span>
                        ) : (
                          <span className="tags">
                            {held.map((role) => (
                              <span key={role.id} className="tag mono">
                                {role.name}
                              </span>
                            ))}
                          </span>
                        )}
                      </Td>
                      <Td label={t("access.users.status")}>
                        <UserStatus user={user} labels={t} />
                      </Td>
                      <Td className="whitespace-nowrap" label={t("access.users.created")}>
                        <Time value={user.created_at} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
        {cursor || next ? (
          <nav className="pager" aria-label={t("access.pages")}>
            {cursor ? (
              <Link className="btn sm" href={href(search)}>
                {t("access.first")}
              </Link>
            ) : null}
            {next ? (
              <Link className="btn sm" href={href(search, next)}>
                {t("access.next")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

/** Nhãn trạng thái: đang dùng / đã khoá, kèm "chưa xác minh email" khi có. */
export function UserStatus({
  user,
  labels,
}: {
  user: User;
  labels: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (user.disabled_at) {
    return (
      <span className="badge b-arch">
        <span className="dot" />
        {labels("access.status.disabled")}
      </span>
    );
  }
  return (
    <span className="cell2">
      <span className="badge b-ok">
        <span className="dot" />
        {labels("access.status.active")}
      </span>
      {user.email_verified_at ? null : (
        <span className="sub">{labels("access.status.unverified")}</span>
      )}
    </span>
  );
}
