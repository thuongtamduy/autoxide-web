import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  renameTenant,
  resumeCoreTenant,
  setCoreTenantReadOnly,
  startMove,
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
import { MovePlanForm, MovePoll } from "@/components/platform/move";
import { PlacementStorageView } from "@/components/platform/storage";
import { TenantSettingsList } from "@/components/settings/tenant-settings";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { type Outcome, send } from "@/lib/action";
import { initialsOf } from "@/lib/initials";
import { TENANTS_MANAGE, TENANTS_MOVE } from "@/lib/permissions";
import { moveFinished, moveSteps, moveTargets } from "@/lib/platform";
import type { PlatformData } from "@/lib/platform-server";
import { can } from "@/lib/viewer";
import { PLATFORM_TENANT_ID, type TenantStatus } from "@/sample/platform-data";
import { TenantExportSection, TenantPlanSection, TenantSupportSection } from "./tenant-plan";

type CoreTenant = components["schemas"]["Tenant"];
type TenantSetting = components["schemas"]["TenantSettingState"];
type TenantMove = components["schemas"]["TenantMove"];
type TenantMovePlan = components["schemas"]["TenantMovePlan"];

/** Tham số trên địa chỉ của trang: đích đang chạy thử, hay lượt dời đang theo dõi. */
export interface MoveSearch {
  move_to?: string | undefined;
  keep_source?: string | undefined;
  move?: string | undefined;
}

// Chi tiết một khách của core (bước 33, W-027, W-032, W-035): tên, trạng thái, nơi lưu (kèm nơi lưu
// file của placement), cây khách, cấu hình theo khách (`…/tenants/{id}/settings`); đổi tên, tạm khoá
// / mở lại, bật / tắt chỉ đọc bằng `PATCH /kernel/tenants/{id}` kèm `If-Match`; dời sang placement khác (`POST …/move`: chạy thử trước, rồi chạy thật bằng job, theo dõi
// ở `GET …/moves/{move_id}`). Thuê bao và hạn mức, xuất dữ liệu, quyền vào hỗ trợ: `tenant-plan.tsx`
// (đợt 3b).
export async function CoreTenantView({
  tenant,
  etag,
  data,
  settings,
  search,
}: {
  tenant: CoreTenant;
  etag: string | null;
  data: PlatformData;
  /** Cấu hình theo khách của khách này; `null` khi core từ chối đọc. */
  settings: TenantSetting[] | null;
  search: MoveSearch;
}) {
  const t = await getTranslations("platform");
  const [manage, mover] = await Promise.all([can(TENANTS_MANAGE), can(TENANTS_MOVE)]);
  const platform = tenant.id === PLATFORM_TENANT_ID;
  const status = tenant.status as TenantStatus;
  const placement = data.placements.find((p) => p.name === tenant.placement) ?? null;
  const parent = data.tenants.find((x) => x.id === tenant.parent_id) ?? null;
  const children = data.tenants.filter((x) => x.parent_id === tenant.id && x.source === "core");
  const tag = { tenant_id: tenant.id, etag: etag ?? "" };
  const readOnly = tenant.read_only === true;
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
          {readOnly ? (
            <span data-testid="read-only-badge">
              <StatusBadge className="badge b-warn" label={t("readOnly.badge")} />
            </span>
          ) : null}
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
                  [t("tenant.files"), <PlacementStorageView key="f" storage={placement.storage} />],
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

      {settings ? (
        <section className="block" aria-labelledby="pf-t-settings">
          <h2 id="pf-t-settings" className="h2">
            {t("tenant.settings")}
          </h2>
          <p className="fhint">{t("tenant.settingsAbout")}</p>
          <TenantSettingsList settings={settings} tenantId={tenant.id} editable={manage} />
        </section>
      ) : null}

      {mover && !platform ? (
        <MoveSection tenant={tenant} status={status} data={data} search={search} />
      ) : null}

      {platform ? null : <TenantPlanSection tenant={tenant} />}

      <div className="blocks">
        {platform ? null : <TenantSupportSection tenant={tenant} />}
        <TenantExportSection tenant={tenant} />
      </div>

      {manage && !platform ? (
        <section className="block" aria-labelledby="pf-t-ro">
          <h2 id="pf-t-ro" className="h2">
            {t("readOnly.title")}
          </h2>
          <div className="card padded pf-stack" data-testid="read-only-block">
            <p className="fhint">{readOnly ? t("readOnly.isOn") : t("readOnly.about")}</p>
            <div className="eg-acts">
              {readOnly ? (
                <ConfirmButton
                  action={setCoreTenantReadOnly}
                  fields={{ ...tag, mode: "off" }}
                  label={t("readOnly.turnOff")}
                  title={t("readOnly.offTitle", { tenant: tenant.name })}
                  points={[t("readOnly.offWrites"), t("readOnly.offJobs")]}
                  submit={t("readOnly.turnOff")}
                  done={t("readOnly.offDone", { tenant: tenant.name })}
                  danger={false}
                />
              ) : (
                <ConfirmButton
                  action={setCoreTenantReadOnly}
                  fields={{ ...tag, mode: "on" }}
                  label={t("readOnly.turnOn")}
                  title={t("readOnly.onTitle", { tenant: tenant.name })}
                  points={[
                    t("readOnly.onKeeps"),
                    t("readOnly.onBlocks"),
                    t("readOnly.onJobs"),
                    t("readOnly.onNotSuspend"),
                    t("readOnly.onUndo"),
                  ]}
                  submit={t("readOnly.turnOn")}
                  done={t("readOnly.onDone", { tenant: tenant.name })}
                />
              )}
            </div>
          </div>
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

/**
 * Khối "Dời sang placement khác" (W-032): theo dõi lượt dời (`?move=`), kết quả chạy thử của đích
 * đang chọn (`?move_to=`), form chọn đích. Chỉ cho người có `kernel.tenants.move`; khách nền tảng
 * không dời được nên không có khối này.
 */
async function MoveSection({
  tenant,
  status,
  data,
  search,
}: {
  tenant: CoreTenant;
  status: string;
  data: PlatformData;
  search: MoveSearch;
}) {
  const t = await getTranslations("platform.tenant.move");
  const tp = await getTranslations("platform");
  const targets = moveTargets(data.placements, tenant.placement);
  const keepSource = search.keep_source === "1";
  const [moving, plan] = await Promise.all([
    search.move
      ? send((client) =>
          client.GET("/api/v1/kernel/tenants/{id}/moves/{move_id}", {
            params: { path: { id: tenant.id, move_id: search.move ?? "" } },
          }),
        )
      : Promise.resolve(null),
    // Chạy thử không đổi gì ở core: gọi mỗi lần dựng trang để kế hoạch luôn đúng lúc này.
    search.move_to && !search.move
      ? send((client) =>
          client.POST("/api/v1/kernel/tenants/{id}/move", {
            params: { path: { id: tenant.id } },
            body: { to: search.move_to ?? "", dry_run: true, keep_source: keepSource },
          }),
        )
      : Promise.resolve(null),
  ]);
  const canPlan = status === "active" || status === "moving";
  return (
    <section className="block" aria-labelledby="pf-t-move">
      <h2 id="pf-t-move" className="h2">
        {t("title")}
      </h2>
      <div className="card padded pf-stack">
        <p className="fhint">{t("about")}</p>
        {status === "moving" ? (
          <p className="note warn" data-testid="moving-note">
            {t("movingNow")}
          </p>
        ) : null}
        {moving ? (
          moving.ok ? (
            <MoveStatus tenant={tenant} move={moving.data.data} />
          ) : (
            <p className="note warn" data-code={moving.problem.code}>
              {moving.problem.detail}
            </p>
          )
        ) : null}
        {plan ? <MovePlanView tenant={tenant} plan={plan} /> : null}
        {canPlan && targets.length > 0 ? (
          <MovePlanForm
            action={`/platform/tenants/${tenant.id}`}
            targets={targets.map((p) => ({
              name: p.name,
              label: t("target", {
                name: p.name,
                kind: tp(`placementKind.${p.kind}`),
                backend: tp(`backend.${p.backend}`),
              }),
            }))}
            to={search.move_to}
            keepSource={keepSource}
          />
        ) : null}
        {canPlan && targets.length === 0 ? <p className="fhint">{t("noTargets")}</p> : null}
        <p className="fhint">{t("cli", { slug: tenant.slug })}</p>
      </div>
    </section>
  );
}

/** Kết quả chạy thử: lý do chặn, số dòng theo bảng, số file, thời gian khách nhận 503; nút chạy thật. */
async function MovePlanView({
  tenant,
  plan,
}: {
  tenant: CoreTenant;
  plan: Outcome<{ data: TenantMovePlan | TenantMove }>;
}) {
  const t = await getTranslations("platform.tenant.move");
  if (!plan.ok) {
    return (
      <p className="note warn" data-code={plan.problem.code}>
        {plan.problem.detail}
      </p>
    );
  }
  const result = plan.data.data;
  // Chạy thử luôn trả kế hoạch (200); lượt dời (201) chỉ khi gửi `dry_run: false`.
  if (!("blocking" in result)) return null;
  return (
    <div className="pf-plan-note" data-testid="move-plan">
      <h3 className="pf-move-h">{t("planTitle", { from: result.from, to: result.to })}</h3>
      <Facts
        items={[
          [t("planRows"), t("planRowsValue", { rows: result.rows, tables: result.tables.length })],
          [t("planFiles"), result.files > 0 ? String(result.files) : t("planNoFiles")],
          [t("planSettle"), t("planSettleValue", { seconds: result.settle_seconds })],
          [t("planSource"), result.keep_source ? t("sourceKept") : t("sourceDeleted")],
        ]}
      />
      {result.resumes ? <p className="note">{t("resumes")}</p> : null}
      {result.ready ? (
        <p className="note">{t("ready")}</p>
      ) : (
        <div className="note warn">
          <p>{t("blocked")}</p>
          <ul className="pf-blockers">
            {result.blocking.map((blocker) => (
              <li key={blocker.code} data-code={blocker.code}>
                {blocker.message} <span className="sub mono">{blocker.code}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.tables.length > 0 ? (
        <details>
          <summary>{t("planTables", { count: result.tables.length })}</summary>
          <Table>
            <thead>
              <tr>
                <Th>{t("table")}</Th>
                <Th className="r">{t("rows")}</Th>
              </tr>
            </thead>
            <tbody>
              {result.tables.map((row) => (
                <tr key={row.table}>
                  <Td>
                    <span className="mono">{row.table}</span>
                  </Td>
                  <Td className="r">{row.rows}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </details>
      ) : null}
      {result.ready ? (
        <div className="eg-acts">
          <FormDialog
            action={startMove}
            label={result.resumes ? t("resume") : t("run")}
            triggerClass="btn sm pri"
            danger
            title={t("runTitle", { tenant: tenant.name, to: result.to })}
            points={[
              t("run503", { seconds: result.settle_seconds }),
              t("runCopy"),
              result.keep_source ? t("runKeep", { from: result.from }) : t("runDelete"),
              t("runBig", { slug: tenant.slug, to: result.to }),
            ]}
            submit={result.resumes ? t("resume") : t("runSubmit")}
            done={t("runDone", { tenant: tenant.name })}
            fields={[
              { kind: "hidden", name: "tenant_id", value: tenant.id },
              { kind: "hidden", name: "to", value: result.to },
              { kind: "hidden", name: "keep_source", value: result.keep_source ? "1" : "" },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Trạng thái của một lượt dời; còn chạy thì trang tự làm mới. */
async function MoveStatus({ tenant, move }: { tenant: CoreTenant; move: TenantMove }) {
  const t = await getTranslations("platform.tenant.move");
  const finished = moveFinished(move.state);
  return (
    <div className="pf-plan-note" data-testid="move-status" data-state={move.state}>
      <h3 className="pf-move-h">{t("statusTitle", { from: move.from, to: move.to })}</h3>
      <ol className="pf-steps" aria-label={t("steps")}>
        {moveSteps(move.state).map((step) => (
          <li key={step.state} data-phase={step.phase}>
            {t(`state.${step.state}`)}
          </li>
        ))}
      </ol>
      <p>
        {t.has(`stateAbout.${move.state}`)
          ? t(`stateAbout.${move.state}`, { tenant: tenant.name, from: move.from, to: move.to })
          : move.state}
      </p>
      {move.rows > 0 ? (
        <p className="fhint">{t("copied", { rows: move.rows, tables: move.tables.length })}</p>
      ) : null}
      {move.error ? (
        <p className="note warn">
          {t("stopped", { error: move.error })} {t("resumeHow")}
        </p>
      ) : null}
      {move.state === "done" && move.keep_source ? (
        <p className="fhint">{t("purge", { slug: tenant.slug, from: move.from })}</p>
      ) : null}
      <p className="fhint">
        {t("started")} <Time value={move.created_at} />
        {move.finished_at ? (
          <>
            {" · "}
            {t("finished")} <Time value={move.finished_at} />
          </>
        ) : null}
      </p>
      {finished ? null : (
        <>
          <p className="fhint">{t("polling")}</p>
          <MovePoll />
        </>
      )}
    </div>
  );
}
