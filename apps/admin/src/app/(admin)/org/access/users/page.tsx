import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { AutoFilter } from "@/components/ui/auto-filter";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { Flash } from "@/components/ui/flash";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { USERS_MANAGE, USERS_READ } from "@/lib/permissions";
import { type Keep, readSort, withQuery } from "@/lib/table";
import { can } from "@/lib/viewer";
import { bulkDisableUsers, bulkEnableUsers, changeUser, disableUser } from "../actions";

type User = components["schemas"]["UserResponse"];

const BASE = "/org/access/users";
const PAGE_SIZE = 50;
const STATUSES = ["active", "disabled"] as const;
type Status = (typeof STATUSES)[number];

function href(keep: Keep, search: string, status: Status | null, cursor?: string): string {
  return withQuery(BASE, keep, { search, status, cursor });
}

// Tab "Người dùng": tìm theo email hay tên (`search`), lọc đang dùng / đã khoá (`status`), role của
// từng người đi cùng danh sách (`include=roles`) — một lời gọi cho cả trang, pagination theo con trỏ.
// Bộ bảng (W-058): chọn nhiều để khoá / mở (lặp lệnh từng cái của core), "⋯" trên dòng (mở, đổi role,
// khoá hỏi lại / mở có Hoàn tác), sắp theo ngày tạo bằng `order` của core. Core chưa có lệnh gửi lại
// thư xác minh cho người khác, nên menu không có mục đó.
export default async function UsersPage(props: PageProps<"/org/access/users">) {
  const t = await getTranslations();
  const params = await props.searchParams;
  const search = typeof params.search === "string" ? params.search.trim() : "";
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const status = STATUSES.find((s) => s === params.status) ?? null;
  // Core chỉ sắp theo thời gian tạo (`order`), nên chỉ cột "Tạo lúc" sắp được.
  const sort = readSort(params, ["created"], { field: "created", dir: "desc" });
  const order = typeof params.sort === "string" ? sort.dir : undefined;
  const sorted: Keep = order ? { sort: "created", dir: order } : {};
  let page: components["schemas"]["Page_UserResponse"];
  try {
    page = await load((client) =>
      client.GET("/api/v1/auth/users", {
        params: {
          query: {
            limit: PAGE_SIZE,
            include: "roles",
            ...(search ? { search } : {}),
            ...(status ? { status } : {}),
            ...(order ? { order } : {}),
            ...(cursor ? { cursor } : {}),
          },
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
  const next = page.pagination.next_cursor;
  const manage = await can(USERS_MANAGE);
  const s = (key: string, values?: Record<string, string>) =>
    t(`access.user.status.${key}`, values);
  const bulk: BulkActionSpec[] = manage
    ? [
        {
          key: "disable",
          label: s("disable"),
          tone: "danger",
          run: bulkDisableUsers,
          confirm: {
            title: t("access.users.bulkDisableTitle"),
            points: [s("disableNow"), s("disableKeep"), s("disableUndo")],
            submit: s("disableSubmit"),
          },
        },
        { key: "enable", label: s("enable"), run: bulkEnableUsers },
      ]
    : [];
  const who = (user: User) => user.name || user.email;
  // "⋯" của một dòng: mở, đổi role (ở trang của người đó), khoá (hỏi lại) hay mở khoá (có Hoàn tác).
  const menu = (user: User): RowMenuItem[] => [
    { label: t("access.users.open"), href: `${BASE}/${user.id}` },
    ...(manage
      ? [
          { label: t("access.users.changeRoles"), href: `${BASE}/${user.id}#roles-h` },
          user.disabled_at
            ? {
                label: s("enable"),
                change: {
                  action: changeUser,
                  id: user.id,
                  expect: user.updated_at,
                  value: "active",
                  done: s("enabled"),
                  undo: { label: t("access.users.undo"), done: t("access.users.undone") },
                },
              }
            : {
                label: s("disable"),
                danger: true,
                dialog: (
                  <ConfirmAction
                    action={disableUser}
                    id={user.id}
                    label={s("disable")}
                    title={s("disableTitle", { who: who(user) })}
                    points={[s("disableNow"), s("disableKeep"), s("disableUndo")]}
                    submit={s("disableSubmit")}
                    done={s("disabled")}
                  />
                ),
              },
        ]
      : []),
  ];
  return (
    <div className="blocks">
      {params.deleted ? <Flash text={t("access.user.delete.done")} /> : null}
      <section className="block" aria-labelledby="users-h">
        <div className="block-head">
          <h2 id="users-h" className="h2">
            {t("access.users.title")}
          </h2>
        </div>
        <nav className="chips" aria-label={t("access.users.byStatus")}>
          {[null, ...STATUSES].map((value) => {
            const on = value === status;
            return (
              <Link
                key={value ?? "all"}
                className={on ? "chip on" : "chip"}
                href={href(sorted, search, value)}
                aria-current={on ? "page" : undefined}
              >
                {value ? t(`access.status.${value}`) : t("access.users.all")}
              </Link>
            );
          })}
        </nav>
        <search aria-label={t("access.users.search")}>
          <form method="get" className="searchrow">
            <AutoFilter />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            {order ? <input type="hidden" name="sort" value="created" /> : null}
            {order ? <input type="hidden" name="dir" value={order} /> : null}
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
              <Link className="btn ghost" href={href(sorted, "", status)}>
                {t("access.users.clear")}
              </Link>
            ) : null}
          </form>
        </search>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">
              {search
                ? t("access.users.noMatch", { search })
                : status
                  ? t("access.users.noStatus")
                  : t("access.users.empty")}
            </p>
          ) : (
            <BulkTable ids={page.data.map((user) => user.id)} actions={bulk}>
              <Table cards>
                <thead>
                  <tr>
                    {manage ? <SelectAllTh /> : null}
                    <Th>{t("access.users.user")}</Th>
                    <Th>{t("access.users.roles")}</Th>
                    <Th>{t("access.users.status")}</Th>
                    <Th>{t("access.users.lastSignIn")}</Th>
                    <SortTh
                      field="created"
                      sort={sort}
                      base={BASE}
                      keep={{ search, status }}
                      first="desc"
                    >
                      {t("access.users.created")}
                    </SortTh>
                    <Th>
                      <span className="vh">{t("access.users.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((user) => {
                    const held = user.roles;
                    return (
                      <tr key={user.id}>
                        {manage ? <SelectTd id={user.id} name={who(user)} /> : null}
                        <Td className="rt-title">
                          <span className="cell2">
                            <Link className="open" href={`${BASE}/${user.id}`}>
                              {who(user)}
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
                        <Td className="whitespace-nowrap" label={t("access.users.lastSignIn")}>
                          {user.last_sign_in_at ? (
                            <Time value={user.last_sign_in_at} />
                          ) : (
                            <span className="muted">{t("access.users.neverSignedIn")}</span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap" label={t("access.users.created")}>
                          <Time value={user.created_at} />
                        </Td>
                        <Td className="rt-acts">
                          <RowMenu
                            label={t("table.moreFor", { name: who(user) })}
                            items={menu(user)}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        <Pager
          first={cursor ? href(sorted, search, status) : null}
          next={next ? href(sorted, search, status, next) : null}
        />
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
