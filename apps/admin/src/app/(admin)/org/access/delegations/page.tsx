import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { DelegateDialog } from "@/components/access/team-forms";
import { MessagePanel } from "@/components/message-panel";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { allRoles } from "@/lib/access";
import { load } from "@/lib/core";
import { type DelegationStatus, delegationStatus } from "@/lib/org";
import { DELEGATIONS_MANAGE, DELEGATIONS_READ, ROLES_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { bulkRevokeDelegations, revokeDelegation } from "../team-actions";

const BADGE: Record<DelegationStatus, string> = {
  active: "badge b-ok",
  expired: "badge b-arch",
  revoked: "badge b-arch",
};

// Tab "Uỷ quyền" (`/auth/delegations`, bước 34 của core, D-310): role của khách này dùng được ở
// khách con. Chỉ khách cha hay nhà vận hành thu hồi được. Khách cấp dưới (tên, để chọn khi uỷ quyền)
// từ `GET /auth/delegations/tenants` (D-333 của core); khách không có trong đó (khách cha của uỷ quyền
// nhận) hiện bằng ID. Bộ bảng (W-058): chọn nhiều uỷ quyền đi đang hiệu lực để thu hồi (lặp lệnh từng
// cái của core); core không phân trang danh sách này nên không có bộ phân trang.
export default async function DelegationsPage() {
  if (!(await can(DELEGATIONS_READ))) {
    const errors = await getTranslations("errors");
    return (
      <MessagePanel
        title={errors("forbiddenTitle")}
        message={errors("forbidden", { permission: DELEGATIONS_READ })}
      />
    );
  }
  const t = await getTranslations("access.delegations");
  const [outgoing, incoming, manage, roles, children] = await Promise.all([
    load((c) =>
      c.GET("/api/v1/auth/delegations", { params: { query: { direction: "outgoing" } } }),
    ),
    load((c) =>
      c.GET("/api/v1/auth/delegations", { params: { query: { direction: "incoming" } } }),
    ),
    can(DELEGATIONS_MANAGE),
    (await can(ROLES_READ)) ? allRoles() : Promise.resolve(null),
    (await can(DELEGATIONS_MANAGE))
      ? load((c) => c.GET("/api/v1/auth/delegations/tenants")).then((r) => r.data)
      : Promise.resolve([]),
  ]);
  const childName = new Map(children.map((c) => [c.id, c.name]));
  const roleName = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const now = Date.now();
  const bulk: BulkActionSpec[] = [
    {
      key: "revoke",
      label: t("revoke"),
      tone: "danger",
      run: bulkRevokeDelegations,
      confirm: {
        title: t("bulkRevokeTitle"),
        points: [t("revokeNow"), t("revokeAudit")],
        submit: t("revokeSubmit"),
      },
    },
  ];
  const sections = [
    { id: "out", title: t("title"), rows: outgoing.data, own: true },
    { id: "in", title: t("incoming"), rows: incoming.data, own: false },
  ];
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="del-h">
        <div className="block-head">
          <h2 id="del-h" className="h2">
            {t("heading")}
          </h2>
          {manage ? (
            <DelegateDialog
              roles={(roles ?? [])
                .filter((role) => !role.all_permissions)
                .map((role) => ({ value: role.id, label: role.name }))}
              childTenants={children.map((c) => ({ value: c.id, label: `${c.name} · ${c.slug}` }))}
            />
          ) : null}
        </div>
        <p className="note">
          <b>{t("auditStrong")}</b> {t("audit")}
        </p>
      </section>
      {sections.map((section) => (
        <section key={section.id} className="block" aria-labelledby={`del-${section.id}-h`}>
          <h2 id={`del-${section.id}-h`} className="h2">
            {section.title}
          </h2>
          <div className="card tcard">
            {section.rows.length === 0 ? (
              <p className="empty">{t("empty")}</p>
            ) : (
              <BulkSection
                ids={
                  section.own && manage
                    ? section.rows
                        .filter((d) => delegationStatus(d, now) === "active")
                        .map((d) => d.id)
                    : []
                }
                bulk={bulk}
              >
                {(selectable) => (
                  <Table cards>
                    <thead>
                      <tr>
                        {selectable.length > 0 ? <SelectAllTh /> : null}
                        <Th>{section.own ? t("child") : t("parent")}</Th>
                        <Th>{t("role")}</Th>
                        <Th>{t("expiresAt")}</Th>
                        <Th>{t("state")}</Th>
                        <Th>
                          <span className="vh">{t("actions")}</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((delegation) => {
                        const status = delegationStatus(delegation, now);
                        const tenant = section.own
                          ? (childName.get(delegation.child_tenant_id) ??
                            delegation.child_tenant_id)
                          : delegation.parent_tenant_id;
                        const role =
                          roleName.get(delegation.role_id) ?? delegation.role_id.slice(0, 8);
                        return (
                          <tr key={delegation.id}>
                            {selectable.length > 0 ? (
                              selectable.includes(delegation.id) ? (
                                <SelectTd id={delegation.id} name={`${role} · ${tenant}`} />
                              ) : (
                                <Td className="t-sel" />
                              )
                            ) : null}
                            <Td className="rt-title">
                              <span className="cell2">
                                <b className="mono ell">{tenant}</b>
                                <span className="sub">{delegation.reason}</span>
                              </span>
                            </Td>
                            <Td label={t("role")}>
                              <span className="mono">
                                {section.own ? role : delegation.role_id.slice(0, 8)}
                              </span>
                            </Td>
                            <Td className="whitespace-nowrap" label={t("expiresAt")}>
                              {delegation.expires_at ? (
                                <Time value={delegation.expires_at} />
                              ) : (
                                t("noExpiry")
                              )}
                            </Td>
                            <Td label={t("state")}>
                              <span className={BADGE[status]}>
                                <span className="dot" />
                                {t(`status.${status}`)}
                              </span>
                            </Td>
                            <Td className="rt-acts">
                              {section.own && manage && status === "active" ? (
                                <ConfirmAction
                                  action={revokeDelegation}
                                  id={delegation.id}
                                  label={t("revoke")}
                                  title={t("revokeTitle", { role, child: tenant })}
                                  points={[t("revokeNow"), t("revokeAudit")]}
                                  submit={t("revokeSubmit")}
                                  done={t("revoked")}
                                />
                              ) : null}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </BulkSection>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Bảng có chọn nhiều khi có dòng chọn được (uỷ quyền đi đang hiệu lực); không thì bảng thường. */
function BulkSection({
  ids,
  bulk,
  children,
}: {
  ids: string[];
  bulk: BulkActionSpec[];
  children: (selectable: string[]) => ReactNode;
}) {
  if (ids.length === 0) return <>{children(ids)}</>;
  return (
    <BulkTable ids={ids} actions={bulk}>
      {children(ids)}
    </BulkTable>
  );
}
