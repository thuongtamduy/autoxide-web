import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { load } from "@/lib/core";
import { formatBytes, formatCount } from "@/lib/format";
import { BILLING_READ } from "@/lib/permissions";
import { isBytes, type LimitUse, tightest, usagePercent } from "@/lib/plans";
import { loadEntitlements, loadOwnSubscription } from "@/lib/plans-server";
import { can } from "@/lib/viewer";

// Thẻ "Gói của bạn" ở Tổng quan (bước 35 của core): tên gói, trạng thái, hạn mức gần chạm nhất và
// các hạn mức đang vượt (sau khi hạ gói). Đọc `GET /plans/entitlements` (hạn mức kèm mức dùng),
// `/plans/subscription` và `/plans/catalog` (tên gói). Không hiện khi người xem thiếu
// `plans.billing.read`, khi bản cài không có module `plans`, hay khi khách không bị gói giới hạn.
export async function PlanCard() {
  if (!(await can(BILLING_READ))) return null;
  const entitlements = await loadEntitlements();
  if (!entitlements || entitlements.unrestricted) return null;
  const [t, tp, locale, sub, catalog] = await Promise.all([
    getTranslations("dashboard.plan"),
    getTranslations("settings.plan"),
    getLocale(),
    loadOwnSubscription(),
    load((c) => c.GET("/api/v1/plans/catalog")).then((r) => r.data),
  ]);
  const label = (key: string) => {
    const id = `limits.${key.replaceAll(".", "_")}`;
    return tp.has(id) ? tp(id) : key;
  };
  const amount = (limit: LimitUse) => {
    const fmt = (n: number) =>
      isBytes(limit.key) ? formatBytes(n, locale) : formatCount(n, locale);
    return `${fmt(limit.used)} / ${limit.max === null || limit.max === undefined ? tp("unlimited") : fmt(limit.max)}`;
  };
  const over = entitlements.limits.filter((l) => l.over_limit);
  const closest = tightest(entitlements.limits);
  const plan = catalog.find((p) => p.id === sub?.plan_id);
  const status = sub && tp.has(`status.${sub.status}`) ? tp(`status.${sub.status}`) : sub?.status;
  return (
    <section className="card dash-card" aria-labelledby="dash-plan-h">
      <div className="dash-head">
        <h2 id="dash-plan-h" className="h2">
          {t("title")}
        </h2>
        <Link className="btn ghost sm" href="/settings/plan">
          {t("open")}
        </Link>
      </div>
      <p className="dash-rev-head">
        <b data-testid="dash-plan">{sub ? (plan?.name ?? t("unknownPlan")) : tp("noPlan")}</b>
        {status ? <span className="dash-hint">{status}</span> : null}
      </p>
      {entitlements.access === "read_only" ? <p className="note warn">{t("readOnly")}</p> : null}
      {over.length > 0 ? (
        <p className="note warn" data-testid="dash-plan-over">
          {t("over", { list: over.map((l) => `${label(l.key)} ${amount(l)}`).join(", ") })}
        </p>
      ) : null}
      {closest ? (
        <div className="meter">
          <div className="meter-head">
            <span className="ell">{label(closest.key)}</span>
            <b className={closest.over_limit ? "tone-warn" : undefined}>{amount(closest)}</b>
          </div>
          <progress
            className={usagePercent(closest) >= 80 ? "bar hi" : "bar"}
            max={100}
            value={usagePercent(closest)}
            aria-label={label(closest.key)}
          />
          <span className="dash-hint">{t("closest")}</span>
        </div>
      ) : (
        <p className="dash-hint">{tp("noLimits")}</p>
      )}
    </section>
  );
}
