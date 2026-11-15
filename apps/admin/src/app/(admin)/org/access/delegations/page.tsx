import { getTranslations } from "next-intl/server";
import { DelegateDialog } from "@/components/access/sample-forms";
import { SampleBadge } from "@/components/sample-badge";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { allRoles } from "@/lib/access";
import { DELEGATIONS_MANAGE, DELEGATIONS_READ, ROLES_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import {
  type DelegationStatus,
  delegationStatus,
  listDelegations,
  SAMPLE_CHILD_TENANTS,
} from "@/sample/org";
import { revokeDelegationAction } from "../sample-actions";
import { roleOptions, sampleGate } from "../sample-gate";

const BADGE: Record<DelegationStatus, string> = {
  active: "badge b-ok",
  expired: "badge b-arch",
  revoked: "badge b-arch",
};

// Tab "Uỷ quyền" (dữ liệu mẫu, chờ `/auth/delegations` của bước 34): role của khách này dùng
// được ở khách con. Chỉ khách cha hay nhà vận hành thu hồi được.
export default async function DelegationsPage() {
  const gate = await sampleGate(DELEGATIONS_READ);
  if (gate) return gate;
  const t = await getTranslations("access.delegations");
  const [page, manage, roles] = await Promise.all([
    listDelegations(),
    can(DELEGATIONS_MANAGE),
    (await can(ROLES_READ)) ? allRoles() : Promise.resolve(null),
  ]);
  const now = Date.now();
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="del-h">
        <div className="block-head">
          <h2 id="del-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="34" endpoint="GET/POST/DELETE /api/v1/auth/delegations" />
          {manage ? (
            <DelegateDialog
              tenants={SAMPLE_CHILD_TENANTS.map((c) => ({ value: c.id, label: c.name }))}
              roles={roleOptions(roles)}
            />
          ) : null}
        </div>
        <p className="note">
          <b>{t("auditStrong")}</b> {t("audit")}
        </p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("child")}</Th>
                <Th>{t("role")}</Th>
                <Th>{t("unit")}</Th>
                <Th>{t("expiresAt")}</Th>
                <Th>{t("state")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {page.data.map((delegation) => {
                const status = delegationStatus(delegation, now);
                return (
                  <tr key={delegation.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{delegation.child_tenant.name}</b>
                        <span className="sub">{delegation.reason}</span>
                      </span>
                    </Td>
                    <Td label={t("role")}>
                      <span className="mono">{delegation.role.name}</span>
                    </Td>
                    <Td label={t("unit")}>{delegation.org.name}</Td>
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
                      {manage && status === "active" ? (
                        <ConfirmAction
                          action={revokeDelegationAction}
                          id={delegation.id}
                          label={t("revoke")}
                          title={t("revokeTitle", {
                            role: delegation.role.name,
                            child: delegation.child_tenant.name,
                          })}
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
        </div>
      </section>
    </div>
  );
}
