import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Chips } from "@/components/engage/common";
import { BACKUP_BADGE, PlatformHead, StatusBadge } from "@/components/platform/common";
import { SampleBadge } from "@/components/sample-badge";
import { Icon } from "@/components/shell/icon";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { oneOf, type SearchParams } from "@/lib/engage";
import { formatBytes, formatCount } from "@/lib/format";
import { OPS_READ, TENANTS_READ } from "@/lib/permissions";
import { roughAge } from "@/lib/platform";
import { can } from "@/lib/viewer";
import { getOpsStatus, listAlerts, listBackups, listTenants } from "@/sample/platform";
import type { BackupRecord } from "@/sample/platform-data";

const BACKUP_STATES: readonly BackupRecord["status"][] = ["succeeded", "failed"];
const ENDPOINTS = "GET /api/v1/kernel/ops/backlog, GET /api/v1/kernel/ops/backups (bước 39)";

// Màn "Sức khoẻ" (dữ liệu mẫu, W-014): tồn đọng job và event theo database và module, khách nhiều
// job chờ nhất (chỗ tra theo khách, vì `tenant_id` không làm nhãn số đo), backup gần nhất, cảnh báo.
export default async function HealthPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await sampleGate(OPS_READ);
  if (gate) return gate;
  const t = await getTranslations("platform.health");
  const tp = await getTranslations();
  const locale = await getLocale();
  const backupState = oneOf(await props.searchParams, "backup", BACKUP_STATES);
  const [{ data: ops }, { data: alerts }, backups, { data: tenants }, tenantsRead] =
    await Promise.all([
      getOpsStatus(),
      listAlerts(),
      listBackups(backupState ? { status: backupState } : {}),
      listTenants(),
      can(TENANTS_READ),
    ]);
  const allBackups = await listBackups();
  const now = Date.now();
  const age = (seconds: number) => {
    const { unit, count } = roughAge(seconds);
    return tp(`duration.${unit}`, { count });
  };
  const rows = ops.databases
    .flatMap((db) => db.backlog.map((m) => ({ db: db.database_key, ...m })))
    .sort((a, b) => b.jobs_pending - a.jobs_pending);
  const sum = (pick: (r: (typeof rows)[number]) => number) =>
    rows.reduce((total, r) => total + pick(r), 0);
  const oldestJob = Math.max(0, ...rows.map((r) => r.jobs_oldest_pending_seconds));
  const oldestEvent = Math.max(0, ...rows.map((r) => r.events_oldest_pending_seconds));
  // Bản backup thành công cũ nhất trong số "bản tốt mới nhất" của từng database.
  const lastGood = ops.databases.map((db) => {
    const good = allBackups.data.find(
      (b) => b.database_key === db.database_key && b.status === "succeeded",
    );
    return good ? (now - Date.parse(good.started_at)) / 1000 : Number.POSITIVE_INFINITY;
  });
  const worstBackup = Math.max(...lastGood);
  const kpis: [string, string, string][] = [
    [
      t("kpiJobs"),
      formatCount(
        sum((r) => r.jobs_pending),
        locale,
      ),
      t("kpiJobsSub", { age: age(oldestJob) }),
    ],
    [
      t("kpiDead"),
      formatCount(
        sum((r) => r.jobs_dead),
        locale,
      ),
      t("kpiDeadSub"),
    ],
    [
      t("kpiEvents"),
      formatCount(
        sum((r) => r.events_pending),
        locale,
      ),
      t("kpiEventsSub", { age: age(oldestEvent) }),
    ],
    [t("kpiBackup"), Number.isFinite(worstBackup) ? age(worstBackup) : "—", t("kpiBackupSub")],
  ];
  const tenantName = (id: string) => tenants.find((x) => x.id === id)?.name ?? id;
  return (
    <div className="page">
      <PlatformHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("description")}
        step="39"
        endpoint={ENDPOINTS}
      />
      <section className="kpis pf-kpis" aria-label={t("kpiLabel")}>
        {kpis.map(([label, value, sub]) => (
          <div key={label} className="card kpi">
            <span className="kpi-label">{label}</span>
            <b className="kpi-value">{value}</b>
            <span className="kpi-sub">{sub}</span>
          </div>
        ))}
      </section>

      <section className="block" aria-labelledby="pf-alerts-h">
        <div className="block-head">
          <h2 id="pf-alerts-h" className="h2">
            {t("alerts")}
          </h2>
          <SampleBadge step="mới" endpoint="GET /api/v1/kernel/ops/alerts" />
        </div>
        <ul className="card list">
          {alerts.map((alert) => (
            <li key={`${alert.name}${alert.database_key}`} className="item">
              <span className={alert.severity === "critical" ? "sq-ic bad" : "sq-ic warn"}>
                <Icon name="warn" />
              </span>
              <span className="item-main">
                <b className="item-title">
                  {alert.name} · <span className="mono">{alert.database_key}</span>
                </b>
                <span className="item-meta">{alert.summary}</span>
                <span className="item-meta">
                  {t("action")} <span className="mono">{alert.action}</span>
                </span>
                <span className="item-meta">
                  {t("since")} <Time value={alert.since} />
                </span>
              </span>
              <StatusBadge
                className={alert.severity === "critical" ? "badge b-bad" : "badge b-warn"}
                label={t(`severity.${alert.severity}`)}
              />
            </li>
          ))}
        </ul>
        {alerts.length === 0 ? <p className="empty">{t("noAlerts")}</p> : null}
      </section>

      <div className="blocks">
        <section className="block half" aria-labelledby="pf-backlog-h">
          <h2 id="pf-backlog-h" className="h2">
            {t("backlog")}
          </h2>
          <div className="card tcard">
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("colModule")}</Th>
                  <Th className="r">{t("colJobs")}</Th>
                  <Th className="r">{t("colDead")}</Th>
                  <Th className="r">{t("colEvents")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.db}/${r.module}`}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b className="mono">{r.db}</b>
                        <span className="sub mono">{r.module}</span>
                      </span>
                    </Td>
                    <Td label={t("colJobs")} className="r">
                      {formatCount(r.jobs_pending, locale)}
                    </Td>
                    <Td label={t("colDead")} className={r.jobs_dead > 0 ? "r tone-bad" : "r"}>
                      {formatCount(r.jobs_dead, locale)}
                    </Td>
                    <Td label={t("colEvents")} className="r">
                      {formatCount(r.events_pending, locale)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <p className="fhint">{t("backlogAbout")}</p>
        </section>

        <section className="block half" aria-labelledby="pf-top-h">
          <h2 id="pf-top-h" className="h2">
            {t("top")}
          </h2>
          <div className="card tcard">
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("colTenant")}</Th>
                  <Th>{t("colDatabase")}</Th>
                  <Th className="r">{t("colJobs")}</Th>
                </tr>
              </thead>
              <tbody>
                {ops.top_tenants.map((row) => (
                  <tr key={`${row.database_key}/${row.tenant_id}`}>
                    <Td className="rt-title">
                      {tenantsRead ? (
                        <Link href={`/platform/tenants/${row.tenant_id}`} className="open">
                          {tenantName(row.tenant_id)}
                        </Link>
                      ) : (
                        tenantName(row.tenant_id)
                      )}
                    </Td>
                    <Td label={t("colDatabase")}>
                      <span className="mono">{row.database_key}</span>
                    </Td>
                    <Td label={t("colJobs")} className="r">
                      {formatCount(row.jobs_pending, locale)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <p className="fhint">{t("topAbout")}</p>
        </section>
      </div>

      <section className="block" aria-labelledby="pf-backup-h">
        <h2 id="pf-backup-h" className="h2">
          {t("backups")}
        </h2>
        <Chips
          label={t("backupFilter")}
          chips={[
            {
              href: "/platform/health",
              label: tp("platform.all"),
              on: !backupState,
              count: allBackups.data.length,
            },
            ...BACKUP_STATES.map((s) => ({
              href: `/platform/health?backup=${s}`,
              label: t(`backup.${s}`),
              on: s === backupState,
              count: allBackups.data.filter((b) => b.status === s).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("colDatabase")}</Th>
                <Th>{t("colStarted")}</Th>
                <Th className="r">{t("colSize")}</Th>
                <Th>{t("colNote")}</Th>
                <Th>{t("colStatus")}</Th>
              </tr>
            </thead>
            <tbody>
              {backups.data.map((b) => (
                <tr key={b.id}>
                  <Td className="rt-title">
                    <b className="mono">{b.database_key}</b>
                  </Td>
                  <Td label={t("colStarted")}>
                    <Time value={b.started_at} />
                  </Td>
                  <Td label={t("colSize")} className="r">
                    {b.size_bytes === null ? "—" : formatBytes(b.size_bytes, locale)}
                  </Td>
                  <Td label={t("colNote")}>
                    {b.error ? (
                      <span className="mono tone-bad">{b.error}</span>
                    ) : (
                      t("tables", { tables: b.tables ?? 0, version: b.autoxide_version })
                    )}
                  </Td>
                  <Td label={t("colStatus")}>
                    <StatusBadge
                      className={BACKUP_BADGE[b.status]}
                      label={t(`backup.${b.status}`)}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("backupCli")}</p>
      </section>
    </div>
  );
}
