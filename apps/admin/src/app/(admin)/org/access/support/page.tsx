import { getTranslations } from "next-intl/server";
import { SupportToggle } from "@/components/access/team-forms";
import { MessagePanel } from "@/components/message-panel";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { type DelegationStatus, delegationStatus } from "@/lib/org";
import { rootUnit } from "@/lib/org-server";
import { SETTINGS_WRITE, SUPPORT_ACCESS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { revokeGrant } from "../team-actions";

const BADGE: Record<DelegationStatus, string> = {
  active: "badge b-warn",
  expired: "badge b-arch",
  revoked: "badge b-arch",
};

// Tab "Quyền vào hỗ trợ" (`/auth/support-access`, bước 34 của core, D-313): nhân sự của nhà vận hành
// chỉ vào dữ liệu của khách khi được cấp có lý do và có hạn. Mọi lần cấp hiện ở đây; việc đã làm nằm
// trong nhật ký với `access.kind = support` (Luật Bảo vệ dữ liệu cá nhân 2025: khách là bên kiểm soát
// dữ liệu). Bật / tắt là cài đặt `auth.support_access` ở nút gốc.
export default async function SupportPage() {
  if (!(await can(SUPPORT_ACCESS_READ))) {
    const errors = await getTranslations("errors");
    return (
      <MessagePanel
        title={errors("forbiddenTitle")}
        message={errors("forbidden", { permission: SUPPORT_ACCESS_READ })}
      />
    );
  }
  const t = await getTranslations("access.support");
  const root = await rootUnit();
  const [grants, write, settings] = await Promise.all([
    load((c) => c.GET("/api/v1/auth/support-access")).then((r) => r.data),
    can(SETTINGS_WRITE),
    root
      ? load((c) =>
          c.GET("/api/v1/organizations/units/{id}/settings", { params: { path: { id: root.id } } }),
        ).then((r) => r.data)
      : Promise.resolve([]),
  ]);
  const enabled = settings.find((s) => s.key === "auth.support_access")?.value !== false;
  const now = Date.now();
  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="allow-h">
        <div className="block-head">
          <h2 id="allow-h" className="h2">
            {t("allowTitle")}
          </h2>
        </div>
        {write && root ? (
          <SupportToggle enabled={enabled} />
        ) : (
          <p className="note">{enabled ? t("isOn") : t("isOff")}</p>
        )}
      </section>
      <section className="block half" aria-labelledby="revoke-h">
        <h2 id="revoke-h" className="h2">
          {t("revokeNoteTitle")}
        </h2>
      </section>
      <section className="block" aria-labelledby="grants-h">
        <div className="block-head">
          <h2 id="grants-h" className="h2">
            {t("grants")}
          </h2>
        </div>
        <div className="card tcard">
          {grants.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
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
                {grants.map((grant) => {
                  const status = delegationStatus(grant, now);
                  const staff = t("staffId", { id: grant.staff_user_id.slice(0, 8) });
                  return (
                    <tr key={grant.id}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <b>{staff}</b>
                          <span className="sub">
                            {grant.first_used_at ? (
                              <>
                                {t("firstUsed")} <Time value={grant.first_used_at} />
                              </>
                            ) : (
                              t("notUsed")
                            )}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("basis")}>
                        <span className="cell2">
                          <span>
                            {t(
                              `basisKind.${grant.basis === "legal_request" ? "legal_request" : "support"}`,
                            )}
                          </span>
                          <span className="sub">
                            {grant.reason}
                            {grant.legal_reference ? ` · ${grant.legal_reference}` : ""}
                          </span>
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
                        {status === "active" && grant.basis !== "legal_request" ? (
                          <ConfirmAction
                            action={revokeGrant}
                            id={grant.id}
                            label={t("revoke")}
                            title={t("revokeTitle", { name: staff })}
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
        </div>
      </section>
    </div>
  );
}
