import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { grantAccess, revokeAccess } from "@/app/(platform)/platform/actions";
import { Chips } from "@/components/engage/common";
import { GRANT_BADGE, PlatformHead, StatusBadge } from "@/components/platform/common";
import { ConfirmAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { oneOf, type SearchParams } from "@/lib/engage";
import { SUPPORT_GRANT } from "@/lib/permissions";
import {
  type GrantStatus,
  listGrants,
  listTenants,
  platformGrantStatus,
  SUPPORT_MAX_HOURS,
  supportEnabled,
} from "@/sample/platform";
import { SAMPLE_TENANT_ID, STAFF, SUPPORT_ROLES } from "@/sample/platform-data";

const STATES: readonly GrantStatus[] = ["active", "expired", "revoked"];
const ENDPOINTS =
  "GET /api/v1/auth/support-grants?tenant_id=, POST /api/v1/auth/support-grants, DELETE /api/v1/auth/support-grants/{id} (bước 34)";

// Màn "Vào dữ liệu khách" (dữ liệu mẫu, W-014): nhân sự nền tảng chỉ vào dữ liệu một khách khi được
// cấp quyền có lý do và thời hạn (tối đa 8 giờ); khách thấy mọi lần cấp và lần vào. Khách tắt hỗ trợ
// thì chỉ cấp được theo yêu cầu bằng văn bản của cơ quan có thẩm quyền.
export default async function SupportPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await sampleGate(SUPPORT_GRANT);
  if (gate) return gate;
  const t = await getTranslations("platform.support");
  const tp = await getTranslations("platform");
  const state = oneOf(await props.searchParams, "status", STATES);
  const [{ data: all }, { data: tenants }] = await Promise.all([listGrants(), listTenants()]);
  const customers = tenants.filter((x) => !x.is_platform && x.status !== "provisioning");
  const off = (
    await Promise.all(customers.map(async (x) => ((await supportEnabled(x.id)) ? null : x.name)))
  ).filter((name): name is string => name !== null);
  const grants = all.filter((g) => !state || platformGrantStatus(g) === state);
  const name = (id: string) => tenants.find((x) => x.id === id)?.name ?? id;
  return (
    <div className="page">
      <PlatformHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("description")}
        step="34"
        endpoint={ENDPOINTS}
        actions={
          <FormDialog
            action={grantAccess}
            label={t("grant")}
            triggerClass="btn pri"
            title={t("grantTitle")}
            intro={t("grantIntro", { max: SUPPORT_MAX_HOURS })}
            points={[t("grantSeen"), t("grantReadOnly"), t("grantOff")]}
            submit={t("submit")}
            done={t("granted")}
            fields={[
              {
                kind: "select",
                name: "tenant_id",
                label: t("tenant"),
                options: customers.map((x) => ({ value: x.id, label: x.name })),
              },
              {
                kind: "select",
                name: "staff_user_id",
                label: t("staff"),
                options: Object.values(STAFF).map((s) => ({ value: s.id, label: s.name })),
              },
              {
                kind: "select",
                name: "role_id",
                label: t("role"),
                options: SUPPORT_ROLES.map((r) => ({ value: r.id, label: r.name })),
              },
              {
                kind: "select",
                name: "basis",
                label: t("basis"),
                options: [
                  { value: "support", label: tp("basis.support") },
                  { value: "legal_request", label: tp("basis.legal_request") },
                ],
              },
              {
                kind: "select",
                name: "hours",
                label: t("hours"),
                defaultValue: "1",
                options: [1, 4, SUPPORT_MAX_HOURS].map((h) => ({
                  value: String(h),
                  label: t("hoursOption", { count: h }),
                })),
              },
              {
                kind: "text",
                name: "legal_reference",
                label: t("legal"),
                mono: true,
                hint: t("legalHint"),
              },
              { kind: "textarea", name: "reason", label: tp("reason"), hint: t("reasonHint") },
            ]}
          />
        }
      />
      <p className="note">
        {t("basisLaw")} {t("review")}
      </p>
      {off.length > 0 ? (
        <p className="note warn">{t("offList", { list: off.join(", ") })}</p>
      ) : null}

      <section className="block" aria-labelledby="pf-grants-h">
        <h2 id="pf-grants-h" className="h2">
          {t("listTitle")}
        </h2>
        <Chips
          label={t("filter")}
          chips={[
            { href: "/platform/support", label: tp("all"), on: !state, count: all.length },
            ...STATES.map((s) => ({
              href: `/platform/support?status=${s}`,
              label: tp(`grantStatus.${s}`),
              on: s === state,
              count: all.filter((g) => platformGrantStatus(g) === s).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("tenant")}</Th>
                <Th>{t("staff")}</Th>
                <Th>{t("basisReason")}</Th>
                <Th>{t("expires")}</Th>
                <Th>{t("colStatus")}</Th>
                <Th>
                  <span className="vh">{tp("tenant.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => {
                const status = platformGrantStatus(g);
                return (
                  <tr key={g.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link href={`/platform/tenants/${g.tenant_id}`} className="open">
                          {name(g.tenant_id)}
                        </Link>
                        {g.tenant_id === SAMPLE_TENANT_ID ? (
                          <Link href="/org/access/support" className="sub">
                            {t("tenantView")}
                          </Link>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={t("staff")}>
                      <span className="cell2">
                        <span>{g.staff.name}</span>
                        <span className="sub mono">{g.role.name}</span>
                      </span>
                    </Td>
                    <Td label={t("basisReason")}>
                      <span className="cell2">
                        <b>{tp(`basis.${g.basis}`)}</b>
                        <span className="sub">{g.reason}</span>
                        {g.legal_reference ? (
                          <span className="sub mono">{g.legal_reference}</span>
                        ) : null}
                      </span>
                    </Td>
                    <Td label={t("expires")}>
                      <Time value={g.revoked_at ?? g.expires_at} />
                    </Td>
                    <Td label={t("colStatus")}>
                      <StatusBadge
                        className={GRANT_BADGE[status]}
                        label={tp(`grantStatus.${status}`)}
                      />
                    </Td>
                    <Td className="rt-acts">
                      {status === "active" ? (
                        <ConfirmAction
                          action={revokeAccess}
                          id={g.id}
                          label={t("revoke")}
                          title={t("revokeTitle", {
                            staff: g.staff.name,
                            tenant: name(g.tenant_id),
                          })}
                          points={[t("revokeNow"), t("revokeAudit")]}
                          submit={t("revoke")}
                          done={t("revoked")}
                        />
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {grants.length === 0 ? <p className="empty">{t("none")}</p> : null}
        </div>
      </section>
    </div>
  );
}
