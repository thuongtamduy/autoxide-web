import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { grantSupport, revokeSupport } from "@/app/(platform)/platform/support-actions";
import { GRANT_BADGE, StatusBadge } from "@/components/platform/common";
import { ConfirmAction } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { grantState, hoursLeft, type SupportGrant } from "@/lib/support";

type Option = { value: string; label: string };

/** Nút và hộp "Cấp quyền vào": chọn khách (hay khách cố định), nhân sự, role, căn cứ, thời hạn, lý do. */
export async function SupportGrantDialog({
  tenants,
  staff,
  roles,
  hours,
  triggerClass = "btn",
  allowed = true,
}: {
  /** Thời hạn chọn được (giờ), trần theo cấu hình của bản cài (`supportHours`). */
  hours: readonly number[];
  /** Khách cho vào hỗ trợ không; tắt thì căn cứ mặc định là yêu cầu của cơ quan có thẩm quyền. */
  allowed?: boolean;
  /** Khách chọn được; một khách thì ô chọn ẩn đi. */
  tenants: readonly Option[];
  staff: readonly Option[];
  roles: readonly Option[];
  triggerClass?: string;
}) {
  const t = await getTranslations("platform.support");
  const tp = await getTranslations("platform");
  const only = tenants.length === 1 ? tenants[0] : undefined;
  return (
    <FormDialog
      action={grantSupport}
      label={t("grant")}
      triggerClass={triggerClass}
      title={only ? t("grantTitleFor", { tenant: only.label }) : t("grantTitle")}
      intro={t("grantIntro", { max: Math.max(...hours) })}
      points={[t("grantSeen"), t("grantReadOnly"), t("grantOff")]}
      submit={t("submit")}
      done={t("granted")}
      fields={[
        only
          ? { kind: "hidden", name: "tenant_id", value: only.value }
          : { kind: "select", name: "tenant_id", label: t("tenant"), options: [...tenants] },
        { kind: "select", name: "staff_user_id", label: t("staff"), options: [...staff] },
        { kind: "select", name: "role_id", label: t("role"), options: [...roles] },
        {
          kind: "select",
          name: "basis",
          label: t("basis"),
          defaultValue: allowed ? "support" : "legal_request",
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
          options: hours.map((h) => ({
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
  );
}

/**
 * Bảng các lần cấp, gọn mỗi lần một dòng: ai được cấp (role), vào khách nào (khi có nhiều khách), trạng
 * thái và hạn (còn mấy giờ, đã vào chưa), căn cứ và lý do, nút thu hồi.
 */
export async function SupportGrantTable({
  grants,
  tenantName,
  roleName,
  manage,
}: {
  grants: readonly SupportGrant[];
  /** Có thì thêm cột khách (màn "Vào dữ liệu khách" xem nhiều khách). */
  tenantName?: (id: string) => string;
  roleName: (id: string) => string;
  manage: boolean;
}) {
  const t = await getTranslations("platform.support");
  const tp = await getTranslations("platform");
  const e = await getTranslations("emptyStates");
  const now = Date.now();
  if (grants.length === 0)
    return (
      <EmptyState icon="shield" title={t("none")}>
        {e("support.body")}
      </EmptyState>
    );
  return (
    <Table cards>
      <thead>
        <tr>
          <Th>{t("staff")}</Th>
          {tenantName ? <Th>{t("tenant")}</Th> : null}
          <Th>{t("validity")}</Th>
          <Th>{t("basisReason")}</Th>
          {manage ? (
            <Th>
              <span className="vh">{tp("tenant.actions")}</span>
            </Th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {grants.map((g) => {
          const state = grantState(g, now);
          const staff = g.staff_name ?? g.staff_user_id.slice(0, 8);
          return (
            <tr key={g.id}>
              <Td className="rt-title">
                <span className="cell2">
                  <b>{staff}</b>
                  <span className="sub">{roleName(g.role_id)}</span>
                </span>
              </Td>
              {tenantName ? (
                <Td label={t("tenant")}>
                  <Link href={`/platform/tenants/${g.tenant_id}`} className="open">
                    {tenantName(g.tenant_id)}
                  </Link>
                </Td>
              ) : null}
              <Td label={t("validity")}>
                <span className="cell2">
                  <StatusBadge className={GRANT_BADGE[state]} label={tp(`grantStatus.${state}`)} />
                  <span className="sub">
                    {state === "active" ? (
                      <>
                        {t("hoursLeft", { count: hoursLeft(g.expires_at, now) })} ·{" "}
                        <Time value={g.expires_at} />
                      </>
                    ) : state === "revoked" && g.revoked_at ? (
                      <>
                        {g.revoked_by_tenant ? t("revokedByTenant") : t("revokedAt")}{" "}
                        <Time value={g.revoked_at} />
                      </>
                    ) : (
                      <>
                        {t("endedAt")} <Time value={g.expires_at} />
                      </>
                    )}
                  </span>
                  <span className="sub">
                    {g.first_used_at ? (
                      <>
                        {t("firstUsed")} <Time value={g.first_used_at} />
                      </>
                    ) : (
                      t("notUsed")
                    )}
                  </span>
                </span>
              </Td>
              <Td label={t("basisReason")}>
                <span className="cell2">
                  <span>
                    {tp.has(`basis.${g.basis}`) ? tp(`basis.${g.basis}`) : g.basis}
                    {g.legal_reference ? (
                      <span className="sub mono"> · {g.legal_reference}</span>
                    ) : null}
                  </span>
                  <span className="sub pf-grant-reason" title={g.reason}>
                    {g.reason}
                  </span>
                </span>
              </Td>
              {manage ? (
                <Td className="rt-acts">
                  {state === "active" ? (
                    <ConfirmAction
                      action={revokeSupport}
                      id={`${g.tenant_id}|${g.id}`}
                      label={t("revoke")}
                      title={t("revokeTitle", {
                        staff,
                        tenant: tenantName ? tenantName(g.tenant_id) : t("thisTenant"),
                      })}
                      points={[t("revokeNow"), t("revokeAudit")]}
                      submit={t("revoke")}
                      done={t("revoked")}
                    />
                  ) : null}
                </Td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
