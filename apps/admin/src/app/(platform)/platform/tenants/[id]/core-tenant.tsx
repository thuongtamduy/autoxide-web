import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  renameTenant,
  resumeCoreTenant,
  suspendCoreTenant,
} from "@/app/(platform)/platform/tenant-actions";
import { ConfirmButton } from "@/components/engage/actions";
import { Back, Facts } from "@/components/engage/common";
import {
  PlatformHead,
  SCHEMA_BADGE,
  StatusBadge,
  TENANT_BADGE,
} from "@/components/platform/common";
import { SampleBadge } from "@/components/sample-badge";
import { FormDialog } from "@/components/ui/form-dialog";
import { Time } from "@/components/ui/time";
import { initialsOf } from "@/lib/initials";
import { TENANTS_MANAGE } from "@/lib/permissions";
import type { PlatformData } from "@/lib/platform-server";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { PLATFORM_TENANT_ID, type TenantStatus } from "@/sample/platform-data";

type CoreTenant = components["schemas"]["Tenant"];

const PENDING =
  "GET /api/v1/plans/tenants/{id}/subscription, …/usage, …/overrides (bước 35); GET/POST /api/v1/auth/support-grants (bước 34); mới: POST /api/v1/kernel/tenants/{id}/move, …/exports";

// Chi tiết một khách của core (bước 33, W-027): tên, trạng thái, nơi lưu, cây khách; đổi tên, tạm
// khoá / mở lại bằng `PATCH /kernel/tenants/{id}` kèm `If-Match`. Thuê bao, hạn mức, dời khách,
// xuất dữ liệu và quyền vào hỗ trợ chưa có API (bước 34, 35 và mục "mới" của bảng thiếu API).
export async function CoreTenantView({
  tenant,
  etag,
  data,
}: {
  tenant: CoreTenant;
  etag: string | null;
  data: PlatformData;
}) {
  const t = await getTranslations("platform");
  const manage = await can(TENANTS_MANAGE);
  const sample = sampleDataEnabled();
  const platform = tenant.id === PLATFORM_TENANT_ID;
  const status = tenant.status as TenantStatus;
  const placement = data.placements.find((p) => p.name === tenant.placement) ?? null;
  const parent = data.tenants.find((x) => x.id === tenant.parent_id) ?? null;
  const children = data.tenants.filter((x) => x.parent_id === tenant.id && x.source === "core");
  const tag = { tenant_id: tenant.id, etag: etag ?? "" };
  return (
    <div className="page">
      <Back href="/platform" label={t("tenant.back")} />
      <PlatformHead
        crumb={t("tenant.crumb", { slug: tenant.slug })}
        title={tenant.name}
        description={t("tenant.coreDescription")}
        actions={
          manage ? (
            <FormDialog
              action={renameTenant}
              label={t("tenant.rename")}
              title={t("tenant.renameTitle", { tenant: tenant.name })}
              submit={t("tenant.renameSubmit")}
              done={t("tenant.renamed")}
              fields={[
                { kind: "hidden", name: "tenant_id", value: tenant.id },
                { kind: "hidden", name: "etag", value: etag ?? "" },
                {
                  kind: "text",
                  name: "name",
                  label: t("newTenant.name"),
                  defaultValue: tenant.name,
                },
              ]}
            />
          ) : undefined
        }
      />

      <section className="block" aria-labelledby="pf-t-sum">
        <div className="block-head pf-who">
          <span className="tav" aria-hidden="true">
            {platform ? "AX" : initialsOf(tenant.name)}
          </span>
          <h2 id="pf-t-sum" className="h2">
            {t("tenant.summary")}
          </h2>
          <StatusBadge
            className={TENANT_BADGE[status] ?? "badge"}
            label={t.has(`tenantStatus.${status}`) ? t(`tenantStatus.${status}`) : status}
          />
        </div>
        <div className="card padded">
          <Facts
            items={[
              [
                t("tenant.slug"),
                <span className="mono" key="slug">
                  {tenant.slug}
                </span>,
              ],
              [t("tenant.created"), <Time key="c" value={tenant.created_at} date />],
              [t("tenant.updated"), <Time key="u" value={tenant.updated_at} />],
              [
                t("tenant.id"),
                <span className="mono sub-id" key="id">
                  {tenant.id}
                </span>,
              ],
            ]}
          />
          {platform ? <p className="note">{t("tenant.platformNote")}</p> : null}
        </div>
      </section>

      <div className="blocks">
        <section className="block half" aria-labelledby="pf-t-place">
          <h2 id="pf-t-place" className="h2">
            {t("tenant.place")}
          </h2>
          <div className="card padded pf-stack">
            {placement ? (
              <Facts
                items={[
                  [t("tenant.placeKind"), t(`placementKind.${placement.kind}`)],
                  [
                    t("tenant.placement"),
                    <span className="mono" key="p">
                      {placement.name}
                    </span>,
                  ],
                  [t("tenant.backend"), t(`backend.${placement.backend}`)],
                  [
                    t("tenant.schema"),
                    <StatusBadge
                      key="s"
                      className={SCHEMA_BADGE[placement.schema_state]}
                      label={t(`schema.${placement.schema_state}`)}
                    />,
                  ],
                ]}
              />
            ) : (
              <p className="mono">{tenant.placement}</p>
            )}
            {placement?.schema_state === "behind" ? (
              <p className="note warn">
                {t("tenant.behindCore")} <Link href="/platform/fleet">{t("tenant.fleetOpen")}</Link>
              </p>
            ) : null}
            <p className="fhint">{t("tenant.placeAbout")}</p>
          </div>
        </section>

        <section className="block half" aria-labelledby="pf-t-tree">
          <h2 id="pf-t-tree" className="h2">
            {t("tenant.tree")}
          </h2>
          <div className="card padded pf-stack">
            <Facts
              items={[
                [
                  t("tenant.parent"),
                  parent ? (
                    <Link key="p" href={`/platform/tenants/${parent.id}`}>
                      {parent.name}
                    </Link>
                  ) : (
                    t("tenant.noParent")
                  ),
                ],
                [t("tenant.childCount"), String(children.length)],
              ]}
            />
            {children.length > 0 ? (
              <ul className="pf-children">
                {children.map((child) => (
                  <li key={child.id}>
                    <Link href={`/platform/tenants/${child.id}`}>{child.name}</Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="fhint">{t("tenant.treeAbout")}</p>
          </div>
        </section>
      </div>

      {sample ? (
        <section className="block" aria-labelledby="pf-t-pending">
          <div className="block-head">
            <h2 id="pf-t-pending" className="h2">
              {t("tenant.pendingTitle")}
            </h2>
            <SampleBadge step="35" endpoint={PENDING} />
          </div>
          <p className="fhint">{t("tenant.pendingAbout")}</p>
        </section>
      ) : null}

      {manage && !platform ? (
        <section className="block pf-danger" aria-labelledby="pf-t-danger">
          <h2 id="pf-t-danger" className="h2">
            {t("tenant.danger")}
          </h2>
          <div className="card padded pf-stack">
            {status === "suspended" ? (
              <>
                <p>{t("tenant.suspendedNow")}</p>
                <div className="eg-acts">
                  <ConfirmButton
                    action={resumeCoreTenant}
                    fields={tag}
                    label={t("tenant.reactivate")}
                    title={t("tenant.reactivateTitle", { tenant: tenant.name })}
                    points={[t("tenant.reactivateBack")]}
                    submit={t("tenant.reactivate")}
                    done={t("tenant.reactivated", { tenant: tenant.name })}
                    danger={false}
                  />
                </div>
              </>
            ) : status === "active" ? (
              <>
                <p className="fhint">{t("tenant.suspendAbout")}</p>
                <div className="eg-acts">
                  <FormDialog
                    action={suspendCoreTenant}
                    label={t("tenant.suspend")}
                    triggerClass="btn sm danger"
                    danger
                    title={t("tenant.suspendTitle", { tenant: tenant.name })}
                    points={[
                      t("tenant.suspendStops"),
                      t("tenant.suspendNotReadOnly"),
                      t("tenant.suspendUndo"),
                    ]}
                    submit={t("tenant.suspendSubmit")}
                    done={t("tenant.suspended", { tenant: tenant.name })}
                    fields={[
                      { kind: "hidden", name: "tenant_id", value: tenant.id },
                      { kind: "hidden", name: "etag", value: etag ?? "" },
                      {
                        kind: "check",
                        name: "acknowledged",
                        label: t("tenant.suspendAck", { tenant: tenant.name }),
                      },
                    ]}
                  />
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
