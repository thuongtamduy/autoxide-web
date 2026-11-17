import { getTranslations } from "next-intl/server";
import {
  dryRunMigrations,
  migrateFleet,
  migratePlacement,
} from "@/app/(platform)/platform/actions";
import { runMigrations } from "@/app/(platform)/platform/fleet-actions";
import { Chips } from "@/components/engage/common";
import { PlatformHead, SCHEMA_BADGE, StatusBadge } from "@/components/platform/common";
import { MovePoll } from "@/components/platform/move";
import { PlacementStorageView } from "@/components/platform/storage";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { RowMenu } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { oneOf, type SearchParams } from "@/lib/engage";
import { PLACEMENTS_READ, TENANTS_MANAGE, TENANTS_OPERATE } from "@/lib/permissions";
import {
  type PlatformData,
  platformData,
  platformGate,
  platformRefused,
} from "@/lib/platform-server";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { getDryRuns } from "@/sample/platform";
import type { SchemaState, Store } from "@/sample/platform-data";

const STATES: readonly SchemaState[] = ["behind", "migrating", "ready"];
const ENDPOINTS =
  "POST /api/v1/plans/provisionings (bước 35): placement chỉ có trong luồng cấp phát mẫu";
const RUN_BADGE: Record<string, string> = {
  pending: "badge b-info",
  running: "badge b-info",
  done: "badge b-ok",
  failed: "badge b-bad",
};

/** Migration còn chờ của từng placement (chạy thử: core không đổi gì); rỗng khi core từ chối. */
async function dryRun(): Promise<Map<string, string[]>> {
  try {
    const answer = await load((c) =>
      c.POST("/api/v1/kernel/placements/migrations", { body: { dry_run: true } }),
    );
    const plan = answer.data as { pending?: { placement: string; migrations: string[] }[] };
    return new Map((plan.pending ?? []).map((p) => [p.placement, p.migrations]));
  } catch (error) {
    if (isForbidden(error)) return new Map();
    throw error;
  }
}

/** Các lượt chạy migration, mới trước; `null` khi core từ chối (thiếu `kernel.tenants.operate`). */
async function loadRuns() {
  try {
    return (await load((c) => c.GET("/api/v1/kernel/placements/migrations"))).data;
  } catch (error) {
    if (isForbidden(error)) return null;
    throw error;
  }
}

// Màn "Đội database": placement THẬT của core (`GET /kernel/placements`, bước 33) — dùng chung hay
// riêng, backend, trạng thái migration, nơi lưu file riêng (`storage`, D-293; không bao giờ có khoá)
// — và số khách trên mỗi placement. Dời khách nằm ở trang của từng khách (W-032). Migrate placement của
// core bằng `POST /kernel/placements/migrations` (D-334): từng placement hay mọi placement, chạy bằng job;
// các lượt chạy ở `GET …/migrations`. Placement chỉ có trong dữ liệu mẫu giữ nút mẫu cũ (W-014). Bộ bảng
// (W-058): dòng hiện tối đa một nút (Migrate, hay Chạy thử với placement mẫu), việc còn lại vào "⋯";
// danh sách ngắn, không sắp, không phân trang. Không có thao tác hàng loạt: core chạy migration bằng
// job, từng placement hay cả đội (nút "Migrate cả đội" ở đầu trang).
export default async function FleetPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await platformGate(PLACEMENTS_READ);
  if (gate) return gate;
  const t = await getTranslations("platform.fleet");
  const tp = await getTranslations("platform");
  const tt = await getTranslations("table");
  const state = oneOf(await props.searchParams, "state", STATES);
  const sample = sampleDataEnabled();
  let data: PlatformData;
  try {
    data = await platformData();
  } catch (error) {
    const refused = await platformRefused(error);
    if (refused) return refused;
    throw error;
  }
  const { placements: all, tenants } = data;
  const [dryRuns, manage, operate] = await Promise.all([
    sample
      ? getDryRuns().then((r) => r.data)
      : Promise.resolve<Store["dryRuns"]>({ fleet: null, placements: {} }),
    can(TENANTS_MANAGE),
    can(TENANTS_OPERATE),
  ]);
  const runs = operate ? await loadRuns() : null;
  const running = runs?.some((run) => run.status === "pending" || run.status === "running");
  // Placement của core còn migration chờ (trừ `main`, máy chủ tự migrate khi khởi động). Tên các
  // migration chờ lấy bằng chạy thử (`dry_run`: core không đổi gì) để hộp xác nhận nêu đúng việc sẽ chạy.
  const coreBehind = all.filter(
    (p) => p.source === "core" && !p.control && p.schema_state === "behind",
  );
  const pending = operate && coreBehind.length > 0 ? await dryRun() : new Map<string, string[]>();
  const pendingOf = (p: { name: string; source: string; pending_migrations: string[] }) =>
    p.source === "core" ? (pending.get(p.name) ?? []) : p.pending_migrations;
  const coreTenants = tenants.filter((x) => coreBehind.some((p) => p.id === x.placement_id)).length;
  const placements = all.filter((p) => !state || p.schema_state === state);
  // Chỉ placement mẫu chạy được migration bằng nút (mẫu); placement của core dùng CLI.
  const behind = all.filter((p) => p.schema_state === "behind" && p.source === "sample");
  const fleet = dryRuns.fleet;
  return (
    <div className="page">
      <PlatformHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("description")}
        step={sample ? "35" : undefined}
        endpoint={sample ? ENDPOINTS : undefined}
        actions={
          <>
            {operate && coreBehind.length > 0 && !running ? (
              <ConfirmAction
                action={runMigrations}
                id=""
                label={t("runAll")}
                title={t("runAllTitle")}
                points={[
                  ...coreBehind.map((p) =>
                    t("migrateOne", { name: p.name, list: pendingOf(p).join(", ") || "—" }),
                  ),
                  t("runOrderApi"),
                  t("run503", { count: coreTenants }),
                  t("runStop"),
                  t("runResume"),
                ]}
                submit={t("runAllSubmit")}
                done={t("runAllStarted")}
              />
            ) : null}
            {manage && behind.length > 0 ? (
              <InlineAction
                action={dryRunMigrations}
                id=""
                label={t("dryRunAll")}
                done={t("dryRunDone")}
              />
            ) : null}
          </>
        }
      />
      <p className="note">{t("apiNote")}</p>

      {runs && runs.length > 0 ? (
        <section className="block" aria-labelledby="pf-fleet-runs">
          <h2 id="pf-fleet-runs" className="h2">
            {t("runsTitle")}
          </h2>
          {running ? (
            <>
              <p className="note">{t("runsRunning")}</p>
              <MovePoll />
            </>
          ) : null}
          <ul className="card padded pf-stack" data-testid="migration-runs">
            {runs.slice(0, 10).map((run) => (
              <li key={run.id}>
                <StatusBadge
                  className={RUN_BADGE[run.status] ?? "badge"}
                  label={
                    t.has(`runStatus.${run.status}`) ? t(`runStatus.${run.status}`) : run.status
                  }
                />{" "}
                <b className="mono">{run.placement ?? t("runEvery")}</b> ·{" "}
                <Time value={run.created_at} />
                {run.applied.map((a) => (
                  <span key={a.placement} className="sub mono">
                    {" · "}
                    {a.placement}:{" "}
                    {a.migrations.length > 0 ? a.migrations.join(", ") : t("runNothing")}
                  </span>
                ))}
                {run.error ? <span className="sub tone-warn"> · {run.error}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {fleet ? (
        <section className="block" aria-labelledby="pf-fleet-plan">
          <h2 id="pf-fleet-plan" className="h2">
            {t("planTitle")}
          </h2>
          <div className="card padded pf-stack">
            <p className="fhint">
              {t("planAt")} <Time value={fleet.at} />
            </p>
            <ul className="pf-children">
              {fleet.placements.map((p) => (
                <li key={p.id}>
                  <b className="mono">{p.name}</b>:{" "}
                  <span className="mono">{p.migrations.join(", ")}</span>
                </li>
              ))}
            </ul>
            <p>{t("planTenants", { count: fleet.tenants })}</p>
            {manage ? (
              <div className="eg-acts">
                <FormDialog
                  action={migrateFleet}
                  label={t("runAll")}
                  triggerClass="btn sm pri"
                  danger
                  title={t("runAllTitle")}
                  intro={t("runAllIntro")}
                  points={[
                    t("runOrder"),
                    t("run503", { count: fleet.tenants }),
                    t("runStop"),
                    t("runResume"),
                  ]}
                  submit={t("runAllSubmit")}
                  done={t("runAllDone")}
                  fields={[
                    {
                      kind: "text",
                      name: "confirm",
                      label: t("confirm"),
                      mono: true,
                      hint: t("confirmHint"),
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="block" aria-labelledby="pf-fleet-h">
        <h2 id="pf-fleet-h" className="h2">
          {t("listTitle")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <Chips
          label={t("filter")}
          chips={[
            { href: "/platform/fleet", label: tp("all"), on: !state, count: all.length },
            ...STATES.map((s) => ({
              href: `/platform/fleet?state=${s}`,
              label: tp(`schema.${s}`),
              on: s === state,
              count: all.filter((p) => p.schema_state === s).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("colPlacement")}</Th>
                <Th>{t("colKind")}</Th>
                <Th className="r">{t("colTenants")}</Th>
                <Th>{t("colStorage")}</Th>
                <Th>{t("colChecked")}</Th>
                <Th>{t("colMigration")}</Th>
                <Th>
                  <span className="vh">{tp("tenant.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {placements.map((p) => {
                const count = tenants.filter((x) => x.placement_id === p.id).length;
                const planned = dryRuns.placements[p.id];
                return (
                  <tr key={p.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b className="mono">{p.name}</b>
                        {p.source === "sample" ? (
                          <span className="tag">{tp("tenants.sampleRow")}</span>
                        ) : null}
                        <span className="sub">{p.control ? t("control") : p.location}</span>
                      </span>
                    </Td>
                    <Td label={t("colKind")}>
                      <span className="cell2">
                        <span>{tp(`placementKind.${p.kind}`)}</span>
                        <span className="sub">{tp(`backend.${p.backend}`)}</span>
                      </span>
                    </Td>
                    <Td label={t("colTenants")} className="r">
                      {count}
                    </Td>
                    <Td label={t("colStorage")}>
                      {p.source === "core" ? <PlacementStorageView storage={p.storage} /> : "—"}
                    </Td>
                    <Td label={t("colChecked")}>
                      {p.schema_checked_at ? <Time value={p.schema_checked_at} /> : "—"}
                    </Td>
                    <Td label={t("colMigration")}>
                      <span className="cell2">
                        <StatusBadge
                          className={SCHEMA_BADGE[p.schema_state]}
                          label={tp(`schema.${p.schema_state}`)}
                        />
                        {pendingOf(p).length > 0 ? (
                          <span className="sub mono">{pendingOf(p).join(", ")}</span>
                        ) : null}
                        {planned ? (
                          <span className="sub">
                            {t("triedAt")} <Time value={planned.at} />
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      {operate &&
                      p.source === "core" &&
                      !p.control &&
                      p.schema_state === "behind" &&
                      !running ? (
                        <ConfirmAction
                          action={runMigrations}
                          id={p.name}
                          label={t("migrate")}
                          title={t("migrateTitle", { name: p.name })}
                          points={[
                            t("migrateList", { list: pendingOf(p).join(", ") || "—" }),
                            t("run503", { count }),
                            t("runStop"),
                          ]}
                          submit={t("migrate")}
                          done={t("migrateQueued", { name: p.name })}
                        />
                      ) : null}
                      {manage && p.schema_state === "behind" && p.source === "sample" ? (
                        <span className="row-acts">
                          <InlineAction
                            action={dryRunMigrations}
                            id={p.id}
                            label={t("dryRun")}
                            ariaLabel={t("dryRunOf", { name: p.name })}
                            done={t("dryRunOne", {
                              name: p.name,
                              list: p.pending_migrations.join(", "),
                            })}
                          />
                          {planned || fleet ? (
                            <RowMenu
                              label={tt("moreFor", { name: p.name })}
                              items={[
                                {
                                  label: t("migrate"),
                                  danger: true,
                                  dialog: (
                                    <ConfirmAction
                                      action={migratePlacement}
                                      id={p.id}
                                      label={t("migrate")}
                                      title={t("migrateTitle", { name: p.name })}
                                      points={[
                                        t("migrateList", { list: p.pending_migrations.join(", ") }),
                                        t("run503", { count }),
                                        t("runStop"),
                                      ]}
                                      submit={t("migrate")}
                                      done={t("migrateDone", { name: p.name })}
                                    />
                                  ),
                                },
                              ]}
                            />
                          ) : null}
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {placements.length === 0 ? <p className="empty">{t("none")}</p> : null}
        </div>
        <p className="fhint">{t("createCli")}</p>
      </section>
    </div>
  );
}
