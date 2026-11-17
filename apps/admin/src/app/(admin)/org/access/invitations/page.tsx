import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InviteDialog } from "@/components/access/team-forms";
import { MessagePanel } from "@/components/message-panel";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { allRoles } from "@/lib/access";
import { load } from "@/lib/core";
import { type InvitationStatus, invitationStatus, ordered } from "@/lib/org";
import { loadUnits, loadUser } from "@/lib/org-server";
import { INVITATIONS_MANAGE, ROLES_READ, USERS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { resendInvite, revokeInvite } from "../team-actions";

const STATUSES: InvitationStatus[] = ["pending", "expired", "accepted", "revoked"];
const BADGE: Record<InvitationStatus, string> = {
  pending: "badge b-warn",
  expired: "badge b-arch",
  accepted: "badge b-ok",
  revoked: "badge b-arch",
};

// Tab "Lời mời" (`/auth/invitations`, bước 34 của core, D-312). Core chỉ có ba trạng thái
// (`pending`, `accepted`, `revoked`); "hết hạn" là lời mời `pending` đã quá `expires_at` — chip đó
// đọc các lời mời đang chờ rồi lọc ở đây.
export default async function InvitationsPage(props: PageProps<"/org/access/invitations">) {
  if (!(await can(INVITATIONS_MANAGE))) {
    const errors = await getTranslations("errors");
    return (
      <MessagePanel
        title={errors("forbiddenTitle")}
        message={errors("forbidden", { permission: INVITATIONS_MANAGE })}
      />
    );
  }
  const t = await getTranslations("access.invitations");
  const { status } = await props.searchParams;
  const current = STATUSES.find((s) => s === status);
  const asked = current === "expired" ? "pending" : current;
  const now = Date.now();
  const [page, units, roles, readUsers] = await Promise.all([
    load((client) =>
      client.GET("/api/v1/auth/invitations", {
        params: { query: { limit: 200, ...(asked ? { status: asked } : {}) } },
      }),
    ),
    loadUnits(),
    (await can(ROLES_READ)) ? allRoles() : Promise.resolve(null),
    can(USERS_READ),
  ]);
  const rows = page.data.filter((i) => !current || invitationStatus(i, now) === current);
  const unitName = new Map((units ?? []).map((u) => [u.id, u.name]));
  const roleName = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const inviters = new Map(
    readUsers
      ? await Promise.all(
          [...new Set(rows.map((i) => i.invited_by).filter((id): id is string => Boolean(id)))].map(
            async (id) => [id, (await loadUser(id))?.name ?? null] as const,
          ),
        )
      : [],
  );
  const unitOptions = units
    ? ordered(units)
        .filter(({ unit }) => unit.status === "active")
        .map(({ unit, depth }) => ({ value: unit.id, label: `${"— ".repeat(depth)}${unit.name}` }))
    : [];
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="inv-h">
        <div className="block-head">
          <h2 id="inv-h" className="h2">
            {t("title")}
          </h2>
          <InviteDialog
            units={unitOptions}
            roles={(roles ?? []).map((role) => ({ value: role.id, label: role.name }))}
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
          {rows.length === 0 ? (
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
                {rows.map((invitation) => {
                  const state = invitationStatus(invitation, now);
                  return (
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
                            {invitation.role_ids.map((id) => roleName.get(id) ?? id).join(", ")}
                          </span>
                          <span className="sub">{unitName.get(invitation.org_id) ?? "—"}</span>
                        </span>
                      </Td>
                      <Td label={t("by")}>
                        {(invitation.invited_by && inviters.get(invitation.invited_by)) ?? "—"}
                      </Td>
                      <Td className="whitespace-nowrap" label={t("expiresAt")}>
                        {state === "pending" || state === "expired" ? (
                          <Time value={invitation.expires_at} />
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td label={t("state")}>
                        <span className={BADGE[state]}>
                          <span className="dot" />
                          {t(`status.${state}`)}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        <span className="row-acts">
                          {state === "pending" || state === "expired" ? (
                            <InlineAction
                              action={resendInvite}
                              id={invitation.id}
                              label={t("resend")}
                              ariaLabel={t("resendLabel", { email: invitation.email })}
                              done={t("resent", { email: invitation.email })}
                            />
                          ) : null}
                          {state === "pending" ? (
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
