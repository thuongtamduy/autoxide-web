import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InviteDialog } from "@/components/access/sample-forms";
import { SampleBadge } from "@/components/sample-badge";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { allRoles } from "@/lib/access";
import { INVITATIONS_MANAGE, ROLES_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { type InvitationStatus, listInvitations, listUnits } from "@/sample/org";
import { resendInvite, revokeInvite } from "../sample-actions";
import { roleOptions, sampleGate } from "../sample-gate";

const STATUSES: InvitationStatus[] = ["pending", "expired", "accepted", "revoked"];
const BADGE: Record<InvitationStatus, string> = {
  pending: "badge b-warn",
  expired: "badge b-arch",
  accepted: "badge b-ok",
  revoked: "badge b-arch",
};

// Tab "Lời mời" (dữ liệu mẫu, chờ `/auth/invitations` của bước 34). Role để chọn là role thật.
export default async function InvitationsPage(props: PageProps<"/org/access/invitations">) {
  const gate = await sampleGate(INVITATIONS_MANAGE);
  if (gate) return gate;
  const t = await getTranslations("access.invitations");
  const { status } = await props.searchParams;
  const current = STATUSES.find((s) => s === status);
  const [page, { data: units }, roles] = await Promise.all([
    listInvitations(current ? { status: current } : {}),
    listUnits(),
    (await can(ROLES_READ)) ? allRoles() : Promise.resolve(null),
  ]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="inv-h">
        <div className="block-head">
          <h2 id="inv-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="34" endpoint="GET/POST /api/v1/auth/invitations" />
          <InviteDialog
            units={units.map((u) => ({ value: u.id, label: u.name }))}
            roles={roleOptions(roles)}
          />
        </div>
        <p className="fhint">{t("about")}</p>
        <nav className="chips" aria-label={t("filter")}>
          <Link
            className={current ? "chip" : "chip on"}
            href="/org/access/invitations"
            aria-current={current ? undefined : "page"}
          >
            {t("all")}
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              className={current === s ? "chip on" : "chip"}
              href={`/org/access/invitations?status=${s}`}
              aria-current={current === s ? "page" : undefined}
            >
              {t(`status.${s}`)}
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("email")}</Th>
                  <Th>{t("roleAt")}</Th>
                  <Th>{t("by")}</Th>
                  <Th>{t("expiresAt")}</Th>
                  <Th>{t("state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((invitation) => (
                  <tr key={invitation.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b className="mono ell">{invitation.email}</b>
                        {invitation.name ? <span className="sub">{invitation.name}</span> : null}
                      </span>
                    </Td>
                    <Td label={t("roleAt")}>
                      <span className="cell2">
                        <span className="mono">
                          {invitation.roles.map((r) => r.name).join(", ")}
                        </span>
                        <span className="sub">{unitName.get(invitation.org_id) ?? "—"}</span>
                      </span>
                    </Td>
                    <Td label={t("by")}>{invitation.invited_by.name}</Td>
                    <Td className="whitespace-nowrap" label={t("expiresAt")}>
                      {invitation.status === "pending" || invitation.status === "expired" ? (
                        <Time value={invitation.expires_at} />
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td label={t("state")}>
                      <span className={BADGE[invitation.status]}>
                        <span className="dot" />
                        {t(`status.${invitation.status}`)}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      <span className="row-acts">
                        {invitation.status === "pending" || invitation.status === "expired" ? (
                          <InlineAction
                            action={resendInvite}
                            id={invitation.id}
                            label={t("resend")}
                            ariaLabel={t("resendLabel", { email: invitation.email })}
                            done={t("resent", { email: invitation.email })}
                          />
                        ) : null}
                        {invitation.status === "pending" ? (
                          <ConfirmAction
                            action={revokeInvite}
                            id={invitation.id}
                            label={t("revoke")}
                            title={t("revokeTitle", { email: invitation.email })}
                            points={[t("revokeLink"), t("revokeAgain")]}
                            submit={t("revokeSubmit")}
                            done={t("revoked")}
                          />
                        ) : null}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
