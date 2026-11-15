import { getTranslations } from "next-intl/server";
import { SupportToggle } from "@/components/access/sample-forms";
import { SampleBadge } from "@/components/sample-badge";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { SETTINGS_WRITE, SUPPORT_ACCESS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { type GrantStatus, getSupportAccess, grantStatus } from "@/sample/org";
import { revokeGrant } from "../sample-actions";
import { sampleGate } from "../sample-gate";

const BADGE: Record<GrantStatus, string> = {
  active: "badge b-warn",
  expired: "badge b-arch",
  revoked: "badge b-arch",
};

// Tab "Quyền vào hỗ trợ" (dữ liệu mẫu, chờ `/auth/support-access` của bước 34): nhân sự của nhà
// vận hành chỉ vào dữ liệu của khách khi được cấp có lý do và có hạn. Mọi lần cấp và lần vào
// hiện ở đây (Luật Bảo vệ dữ liệu cá nhân 2025: khách là bên kiểm soát dữ liệu).
export default async function SupportPage() {
  const gate = await sampleGate(SUPPORT_ACCESS_READ);
  if (gate) return gate;
  const t = await getTranslations("access.support");
  const [{ data: access }, write] = await Promise.all([getSupportAccess(), can(SETTINGS_WRITE)]);
  const now = Date.now();
  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="allow-h">
        <div className="block-head">
          <h2 id="allow-h" className="h2">
            {t("allowTitle")}
          </h2>
          <SampleBadge
            step="34"
            endpoint="GET /api/v1/auth/support-access · PUT …/settings/auth.support_access"
          />
        </div>
        {write ? (
          <SupportToggle enabled={access.enabled} />
        ) : (
          <p className="note">{access.enabled ? t("isOn") : t("isOff")}</p>
        )}
      </section>
      <section className="block half" aria-labelledby="revoke-h">
        <h2 id="revoke-h" className="h2">
          {t("revokeNoteTitle")}
        </h2>
        <p className="note warn">{t("revokeNote")}</p>
      </section>
      <section className="block" aria-labelledby="grants-h">
        <div className="block-head">
          <h2 id="grants-h" className="h2">
            {t("grants")}
          </h2>
        </div>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("staff")}</Th>
                <Th>{t("basis")}</Th>
                <Th>{t("time")}</Th>
                <Th>{t("state")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {access.grants.map((grant) => {
                const status = grantStatus(grant, now);
                return (
                  <tr key={grant.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{grant.staff.name}</b>
                        <span className="sub mono">{grant.role.name}</span>
                      </span>
                    </Td>
                    <Td label={t("basis")}>
                      <span className="cell2">
                        <span>{t(`basisKind.${grant.basis}`)}</span>
                        <span className="sub">
                          {grant.reason}
                          {grant.legal_reference ? ` · ${grant.legal_reference}` : ""}
                        </span>
                        {grant.visits.length > 0 ? (
                          <details className="visits">
                            <summary>{t("visits", { count: grant.visits.length })}</summary>
                            <ul>
                              {grant.visits.map((visit) => (
                                <li key={visit.at}>
                                  <Time value={visit.at} /> — {visit.text}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={t("time")}>
                      <span className="cell2">
                        <Time value={grant.starts_at} />
                        <span className="sub">
                          {t("until")} <Time value={grant.expires_at} />
                        </span>
                      </span>
                    </Td>
                    <Td label={t("state")}>
                      <span className={BADGE[status]}>
                        <span className="dot" />
                        {t(`status.${status}`)}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      {status === "active" ? (
                        <ConfirmAction
                          action={revokeGrant}
                          id={grant.id}
                          label={t("revoke")}
                          title={t("revokeTitle", { name: grant.staff.name })}
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
