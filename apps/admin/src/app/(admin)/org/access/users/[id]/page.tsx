import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  DeleteUserDialog,
  EndSessionsDialog,
  FirstPasswordDialog,
  RemoveMfaDialog,
  RemovePasskeyDialog,
  ResetMailButton,
} from "@/components/access/user-admin";
import { RenameForm, RolesForm, StatusControl, UnitRolesForm } from "@/components/access/user-edit";
import { MessagePanel } from "@/components/message-panel";
import { Icon } from "@/components/shell/icon";
import { Flash } from "@/components/ui/flash";
import { Time } from "@/components/ui/time";
import { allRoles } from "@/lib/access";
import { getClientConfig } from "@/lib/client-config";
import { isForbidden, isNotFound, load, loadTagged } from "@/lib/core";
import { ordered } from "@/lib/org";
import { loadUnits } from "@/lib/org-server";
import {
  API_KEYS_MANAGE,
  PASSKEYS_MANAGE,
  ROLES_MANAGE,
  ROLES_READ,
  USERS_MANAGE,
  USERS_READ,
} from "@/lib/permissions";
import { can } from "@/lib/viewer";

type User = components["schemas"]["UserResponse"];
type Role = components["schemas"]["RoleResponse"];
type Passkey = components["schemas"]["PasskeyResponse"];

// Trang một người dùng: hồ sơ, trạng thái, role, thao tác của quản trị viên. Nút nào người xem
// không có permission thì không hiện (core vẫn kiểm ở mỗi lời gọi). "Đặt mật khẩu đầu tiên" chỉ hiện
// khi tài khoản chưa có mật khẩu (`has_password`), "Tắt xác thực hai bước" chỉ khi đang bật
// (`mfa_enabled`).
export default async function UserPage(props: PageProps<"/org/access/users/[id]">) {
  const t = await getTranslations();
  const { id } = await props.params;
  const { created } = await props.searchParams;
  let user: User;
  let etag: string | null;
  let held: Role[];
  try {
    [
      {
        data: { data: user },
        etag,
      },
      { data: held },
    ] = await Promise.all([
      loadTagged((client) => client.GET("/api/v1/auth/users/{id}", { params: { path: { id } } })),
      load((client) => client.GET("/api/v1/auth/users/{id}/roles", { params: { path: { id } } })),
    ]);
  } catch (error) {
    if (isForbidden(error)) {
      return (
        <MessagePanel
          title={t("errors.forbiddenTitle")}
          message={t("errors.forbidden", { permission: USERS_READ })}
        />
      );
    }
    if (isNotFound(error)) {
      return (
        <MessagePanel title={t("errors.notFoundTitle")} message={t("access.user.notFound")}>
          <Link className="btn" href="/org/access/users">
            {t("access.user.back")}
          </Link>
        </MessagePanel>
      );
    }
    throw error;
  }
  const [manage, assign, readRoles, passkeysManage, keysManage] = await Promise.all([
    can(USERS_MANAGE),
    can(ROLES_MANAGE),
    can(ROLES_READ),
    can(PASSKEYS_MANAGE),
    can(API_KEYS_MANAGE),
  ]);
  const passkeys = passkeysManage ? await passkeysOf(id) : null;
  // Máy chủ chưa gửi thư thật (chỉ ghi ra tệp): báo trước khi quản trị viên bấm "Gửi thư đặt lại".
  const mailOff = (await getClientConfig())?.mail?.sends === false;
  const roles = assign && readRoles ? await allRoles() : null;
  // Role ở các nút khác gốc (bước 34): chỉ khi đọc được cây; gốc là phần "Role" ở trên.
  const units = await loadUnits();
  const root = units?.find((u) => u.parent_id === null);
  const unitMemberships =
    units && root
      ? (
          await load((client) =>
            client.GET("/api/v1/auth/users/{id}/memberships", { params: { path: { id } } }),
          )
        ).data.filter((m) => m.org_id !== root.id)
      : null;
  const who = user.name || user.email;
  const target = { id: user.id, email: user.email, who };
  const disabled = Boolean(user.disabled_at);
  return (
    <div className="blocks">
      {created ? <Flash text={t("access.create.done")} /> : null}
      <nav className="back" aria-label={t("access.user.breadcrumb")}>
        <Link href="/org/access/users" className="btn ghost sm">
          <span aria-hidden="true">←</span> {t("access.user.back")}
        </Link>
      </nav>
      <section className="block half" aria-labelledby="user-h">
        <h2 id="user-h" className="h2">
          {who}
        </h2>
        <dl className="card kv">
          <div>
            <dt>{t("access.user.email")}</dt>
            <dd className="mono" data-testid="user-email">
              {user.email}
            </dd>
            <dd className="fhint">
              {user.email_verified_at ? (
                <>
                  {t("access.user.verifiedOn")} <Time value={user.email_verified_at} />
                </>
              ) : (
                t("access.status.unverified")
              )}
            </dd>
          </div>
          <div>
            <dt>{t("access.users.lastSignIn")}</dt>
            <dd data-testid="user-last-sign-in">
              {user.last_sign_in_at ? (
                <Time value={user.last_sign_in_at} />
              ) : (
                t("access.users.neverSignedIn")
              )}
            </dd>
          </div>
          <div>
            <dt>{t("access.user.signIn")}</dt>
            <dd data-testid="user-sign-in">
              {user.has_password ? t("access.user.hasPassword") : t("access.user.noPassword")} ·{" "}
              {user.mfa_enabled ? t("access.user.mfaOn") : t("access.user.mfaOff")}
            </dd>
            {keysManage ? (
              <dd>
                <Link href={`/settings/api-keys/all?user=${user.id}`}>
                  {t("access.user.apiKeys")}
                </Link>
              </dd>
            ) : null}
          </div>
          <div>
            <dt>{t("access.users.created")}</dt>
            <dd>
              <Time value={user.created_at} />
            </dd>
          </div>
          <div>
            <dt>{t("access.user.updated")}</dt>
            <dd>
              <Time value={user.updated_at} />
            </dd>
          </div>
        </dl>
        {manage ? <RenameForm id={user.id} name={user.name} etag={etag} /> : null}
      </section>

      <section className="block half" aria-labelledby="status-h">
        <h2 id="status-h" className="h2">
          {t("access.user.status.title")}
        </h2>
        <div className="card list">
          <div className="item">
            <span className={disabled ? "sq-ic" : "sq-ic ok"}>
              <Icon name={disabled ? "warn" : "check"} />
            </span>
            <span className="item-main">
              <span className="item-title">
                {disabled ? t("access.status.disabled") : t("access.status.active")}
              </span>
              <span className="item-meta">
                {user.disabled_at ? (
                  <>
                    {t("access.user.status.since")} <Time value={user.disabled_at} />
                  </>
                ) : (
                  t("access.user.status.activeHint")
                )}
              </span>
            </span>
            {manage ? (
              <span className="item-acts">
                <StatusControl id={user.id} disabled={disabled} who={who} />
              </span>
            ) : null}
          </div>
        </div>

        <h2 id="roles-h" className="h2">
          {t("access.user.roles.title")}
        </h2>
        <p className="fhint">{t("access.user.roles.about")}</p>
        {roles ? (
          <RolesForm
            id={user.id}
            roles={roles.map((role) => ({
              id: role.id,
              name: role.name,
              description: role.description,
              all: role.all_permissions,
            }))}
            held={held.map((role) => role.id)}
          />
        ) : (
          <div className="card list">
            {held.length === 0 ? (
              <p className="empty">{t("access.users.noRoles")}</p>
            ) : (
              held.map((role) => (
                <div key={role.id} className="item">
                  <span className="item-main">
                    <span className="item-title mono">{role.name}</span>
                    <span className="item-meta">{role.description}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        )}
        {units && unitMemberships ? (
          <>
            <h2 id="units-h" className="h2">
              {t("access.user.units.heading")}
            </h2>
            <p className="fhint">{t("access.user.units.about")}</p>
            {roles ? (
              <UnitRolesForm
                id={user.id}
                units={ordered(units)
                  .filter(({ unit }) => unit.parent_id !== null && unit.status === "active")
                  .map(({ unit, depth }) => ({
                    value: unit.id,
                    label: `${"— ".repeat(Math.max(depth - 1, 0))}${unit.name}`,
                  }))}
                roles={roles.map((role) => ({
                  id: role.id,
                  name: role.name,
                  description: role.description,
                  all: role.all_permissions,
                }))}
                held={unitMemberships.map((m) => ({
                  org_id: m.org_id,
                  name: units.find((u) => u.id === m.org_id)?.name ?? m.org_id,
                  role_ids: m.roles.map((r) => r.id),
                }))}
              />
            ) : (
              <div className="card list">
                {unitMemberships.length === 0 ? (
                  <p className="empty">{t("access.user.units.none")}</p>
                ) : (
                  unitMemberships.map((m) => (
                    <div key={m.org_id} className="item">
                      <span className="item-main">
                        <span className="item-title">
                          {units.find((u) => u.id === m.org_id)?.name ?? m.org_id}
                        </span>
                        <span className="item-meta mono">
                          {m.roles.map((r) => r.name).join(", ")}
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        ) : null}
      </section>

      {manage ? (
        <section className="block" aria-labelledby="admin-h">
          <h2 id="admin-h" className="h2">
            {t("access.admin.title")}
          </h2>
          <p className="fhint">{t("access.admin.about")}</p>
          {mailOff ? <p className="note warn">{t("access.admin.mailOff")}</p> : null}
          <div className="card list">
            <AdminRow title={t("access.admin.reset.title")} meta={t("access.admin.reset.meta")}>
              <ResetMailButton target={target} />
            </AdminRow>
            {user.has_password ? null : (
              <AdminRow
                title={t("access.admin.password.row")}
                meta={t("access.admin.password.meta")}
              >
                <FirstPasswordDialog target={target} />
              </AdminRow>
            )}
            <AdminRow title={t("access.admin.sessions.row")} meta={t("access.admin.sessions.meta")}>
              <EndSessionsDialog target={target} />
            </AdminRow>
            {user.mfa_enabled ? (
              <AdminRow title={t("access.admin.mfa.row")} meta={t("access.admin.mfa.meta")}>
                <RemoveMfaDialog target={target} />
              </AdminRow>
            ) : null}
            <AdminRow title={t("access.user.delete.row")} meta={t("access.user.delete.meta")}>
              <DeleteUserDialog target={target} />
            </AdminRow>
          </div>
        </section>
      ) : null}

      {passkeys ? (
        <section className="block" aria-labelledby="passkeys-h">
          <h2 id="passkeys-h" className="h2">
            {t("access.admin.passkeys.title")}
          </h2>
          <p className="fhint">{t("access.admin.passkeys.about")}</p>
          {passkeys === "forbidden" ? (
            <p className="card empty">{t("access.admin.passkeys.forbidden")}</p>
          ) : passkeys.length === 0 ? (
            <p className="card empty">{t("access.admin.passkeys.none")}</p>
          ) : (
            <div className="card list">
              {passkeys.map((passkey) => (
                <div key={passkey.id} className="item">
                  <span className="item-main">
                    <span className="item-title">{passkey.name}</span>
                    <span className="item-meta">
                      {passkey.authenticator ? `${passkey.authenticator} · ` : ""}
                      {t("access.admin.passkeys.created")} <Time value={passkey.created_at} /> ·{" "}
                      {t("access.admin.passkeys.lastUsed")}{" "}
                      {passkey.last_used_at ? (
                        <Time value={passkey.last_used_at} />
                      ) : (
                        t("access.admin.passkeys.never")
                      )}
                    </span>
                  </span>
                  <span className="item-acts">
                    <RemovePasskeyDialog
                      target={target}
                      passkey={{ id: passkey.id, name: passkey.name }}
                    />
                  </span>
                </div>
              ))}
              {passkeys.length > 1 ? (
                <div className="item">
                  <span className="item-main" />
                  <span className="item-acts">
                    <RemovePasskeyDialog target={target} />
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

/**
 * Passkey của một người (`auth.passkeys.manage`). Core từ chối (403) khi người đó có permission mà người
 * xem không có: hiện câu giải thích thay vì làm hỏng cả trang.
 */
async function passkeysOf(id: string): Promise<Passkey[] | "forbidden"> {
  try {
    const { data } = await load((client) =>
      client.GET("/api/v1/auth/users/{id}/passkeys", {
        params: { path: { id }, query: { limit: 50 } },
      }),
    );
    return data;
  } catch (error) {
    if (isForbidden(error)) return "forbidden";
    throw error;
  }
}

function AdminRow({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <div className="item">
      <span className="item-main">
        <span className="item-title">{title}</span>
        <span className="item-meta">{meta}</span>
      </span>
      <span className="item-acts">{children}</span>
    </div>
  );
}
