import { getTranslations } from "next-intl/server";
import {
  dryRunMigrations,
  migrateFleet,
  migratePlacement,
} from "@/app/(platform)/platform/actions";
import { Chips } from "@/components/engage/common";
import { PlatformHead, SCHEMA_BADGE, StatusBadge } from "@/components/platform/common";
import { PlacementStorageView } from "@/components/platform/storage";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { oneOf, type SearchParams } from "@/lib/engage";
import { PLACEMENTS_READ, TENANTS_MANAGE } from "@/lib/permissions";
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
  "mới: POST /api/v1/kernel/placements/migrations {placement_id?, dry_run} (core mới có CLI autoxide migrate up --all)";

// Màn "Đội database": placement THẬT của core (`GET /kernel/placements`, bước 33) — dùng chung hay
// riêng, backend, trạng thái migration, nơi lưu file riêng (`storage`, D-293; không bao giờ có khoá)
// — và số khách trên mỗi placement. Dời khách nằm ở trang của từng khách (W-032). Core chưa có API chạy
// migration (chỉ CLI `autoxide migrate up --all`): nút chạy thử / migrate là dữ liệu mẫu (W-014), chỉ
// cho placement mẫu khi bật dữ liệu mẫu.
export default async function FleetPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await platformGate(PLACEMENTS_READ);
  if (gate) return gate;
  const t = await getTranslations("platform.fleet");
  const tp = await getTranslations("platform");
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
  const [dryRuns, manage] = await Promise.all([
    sample
      ? getDryRuns().then((r) => r.data)
      : Promise.resolve<Store["dryRuns"]>({ fleet: null, placements: {} }),
    can(TENANTS_MANAGE),
  ]);
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
        step={sample ? "mới" : undefined}
        endpoint={sample ? ENDPOINTS : undefined}
        actions={
          manage && behind.length > 0 ? (
            <InlineAction
              action={dryRunMigrations}
              id=""
              label={t("dryRunAll")}
              done={t("dryRunDone")}
            />
          ) : undefined
        }
      />
      <p className="note warn">
        <b>{t("cliStrong")}</b> {t("cliText")}
      </p>

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
                        {p.pending_migrations.length > 0 ? (
                          <span className="sub mono">{p.pending_migrations.join(", ")}</span>
                        ) : null}
                        {planned ? (
                          <span className="sub">
                            {t("triedAt")} <Time value={planned.at} />
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      {manage && p.schema_state === "behind" && p.source === "sample" ? (
                        <div className="eg-acts">
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
                          ) : null}
                        </div>
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
