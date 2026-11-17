import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { grantSupport, revokeSupport } from "@/app/(platform)/platform/support-actions";
import { GRANT_BADGE, StatusBadge } from "@/components/platform/common";
import { ConfirmAction } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { grantState, type SupportGrant } from "@/lib/support";

/**
 * Thời hạn chọn được khi cấp quyền vào. 8 giờ là mặc định của core
 * (`AUTOXIDE_AUTH_SUPPORT_ACCESS_MAX_HOURS`); bản cài đặt trần thấp hơn thì core từ chối
 * `auth.support_duration_exceeded` và câu báo hiện ở ô thời hạn.
 */
export const SUPPORT_HOURS = [1, 4, 8] as const;

type Option = { value: string; label: string };

/** Nút và hộp "Cấp quyền vào": chọn khách (hay khách cố định), nhân sự, role, căn cứ, thời hạn, lý do. */
export async function SupportGrantDialog({
  tenants,
  staff,
  roles,
  triggerClass = "btn",
}: {
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
      intro={t("grantIntro", { max: Math.max(...SUPPORT_HOURS) })}
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
          options: SUPPORT_HOURS.map((h) => ({
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

/** Bảng các lần cấp: khách (khi có nhiều khách), nhân sự, căn cứ và lý do, hạn, trạng thái, thu hồi. */
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
          {tenantName ? <Th>{t("tenant")}</Th> : null}
          <Th>{t("staff")}</Th>
          <Th>{t("basisReason")}</Th>
          <Th>{t("expires")}</Th>
          <Th>{t("colStatus")}</Th>
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
              {tenantName ? (
                <Td className="rt-title">
                  <Link href={`/platform/tenants/${g.tenant_id}`} className="open">
                    {tenantName(g.tenant_id)}
                  </Link>
                </Td>
              ) : null}
              <Td label={t("staff")}>
                <span className="cell2">
                  <span>{staff}</span>
                  <span className="sub">{roleName(g.role_id)}</span>
                </span>
              </Td>
              <Td label={t("basisReason")}>
                <span className="cell2">
                  <b>{tp.has(`basis.${g.basis}`) ? tp(`basis.${g.basis}`) : g.basis}</b>
                  <span className="sub">{g.reason}</span>
                  {g.legal_reference ? <span className="sub mono">{g.legal_reference}</span> : null}
                </span>
              </Td>
              <Td label={t("expires")}>
                <span className="cell2">
                  <Time value={g.expires_at} />
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
              <Td label={t("colStatus")}>
                <span className="cell2">
                  <StatusBadge className={GRANT_BADGE[state]} label={tp(`grantStatus.${state}`)} />
                  {g.revoked_by_tenant ? <span className="sub">{t("revokedByTenant")}</span> : null}
                </span>
              </Td>
              {manage ? (
                <Td>
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
