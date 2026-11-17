import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SampleBadge } from "@/components/sample-badge";
import { formatBytes, formatCount } from "@/lib/format";
import { isBytes, usagePercent } from "@/lib/plans";
import type { GrantStatus } from "@/sample/platform";
import type {
  BackupRecord,
  PlanStatus,
  ProvisionStatus,
  SchemaState,
  SubscriptionStatus,
  TenantStatus,
  TenantUsage,
} from "@/sample/platform-data";

// Khối dùng chung của mặt điều khiển nền tảng (Server Component, W-014): đầu trang có nhãn dữ liệu
// mẫu, màu nhãn trạng thái, thanh mức dùng. Cùng lớp CSS của khung (`.phead`, `.badge`, `.meter`).

/** Đầu trang của một màn trong mặt điều khiển: dòng phạm vi, h1, mô tả, nhãn mẫu, nút chính. */
export function PlatformHead({
  crumb,
  title,
  description,
  step,
  endpoint,
  actions,
}: {
  crumb: string;
  title: string;
  description: string;
  /** Bước của core mà phần dữ liệu mẫu của màn đang chờ; không có = màn chỉ có dữ liệu thật. */
  step?: string | undefined;
  endpoint?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <section className="phead">
      <div className="phead-main">
        <span className="crumb ell">{crumb}</span>
        <h1 className="h1">{title}</h1>
        <p className="pdesc">{description}</p>
        {step ? (
          <span>
            <SampleBadge step={step} endpoint={endpoint ?? ""} />
          </span>
        ) : null}
      </div>
      {actions ? <div className="headacts eg-headacts">{actions}</div> : null}
    </section>
  );
}

export const TENANT_BADGE: Record<TenantStatus, string> = {
  provisioning: "badge b-info",
  active: "badge b-ok",
  suspended: "badge b-bad",
  maintenance: "badge b-warn",
  moving: "badge b-info",
};

export const SUB_BADGE: Record<SubscriptionStatus, string> = {
  trialing: "badge b-info",
  active: "badge b-ok",
  past_due: "badge b-warn",
  suspended: "badge b-bad",
  canceled: "badge b-arch",
  deleted: "badge b-arch",
};

export const PLAN_BADGE: Record<PlanStatus, string> = {
  draft: "badge b-draft",
  active: "badge b-ok",
  retired: "badge b-arch",
};

export const SCHEMA_BADGE: Record<SchemaState, string> = {
  ready: "badge b-ok",
  behind: "badge b-warn",
  migrating: "badge b-info",
};

export const PROVISION_BADGE: Record<ProvisionStatus, string> = {
  running: "badge b-info",
  failed: "badge b-bad",
  done: "badge b-ok",
};

export const GRANT_BADGE: Record<GrantStatus, string> = {
  active: "badge b-warn",
  expired: "badge b-arch",
  revoked: "badge b-arch",
};

export const BACKUP_BADGE: Record<BackupRecord["status"], string> = {
  succeeded: "badge b-ok",
  failed: "badge b-bad",
  running: "badge b-info",
};

/** Nhãn trạng thái có chấm màu. */
export function StatusBadge({ className, label }: { className: string; label: string }) {
  return (
    <span className={className}>
      <span className="dot" />
      {label}
    </span>
  );
}

/**
 * Một hạn mức đem hiện: dữ liệu mẫu (`TenantUsage`, có `unit`) hay của core (`LimitUse`, đo bằng
 * byte khi khoá kết thúc bằng `bytes`).
 */
export type MeterUsage = {
  key: string;
  used: number;
  max?: number | null | undefined;
  unit?: TenantUsage["unit"];
  over_limit?: boolean;
};

/** Số đã dùng / tối đa của một hạn mức theo đơn vị của nó. */
export function usageText(usage: MeterUsage, locale: string, unlimited: string): string {
  const bytes = usage.unit === "bytes" || (usage.unit === undefined && isBytes(usage.key));
  const show = (n: number) => (bytes ? formatBytes(n, locale) : formatCount(n, locale));
  return `${show(usage.used)} / ${usage.max === null || usage.max === undefined ? unlimited : show(usage.max)}`;
}

/** Thanh mức dùng một hạn mức; từ 85 % hay khi đang vượt thì tô cảnh báo. */
export async function UsageMeter({
  usage,
  compact = false,
}: {
  usage: MeterUsage;
  compact?: boolean;
}) {
  const t = await getTranslations("platform");
  const locale = await getLocale();
  const ratio = usagePercent(usage);
  const warn = ratio >= 85 || usage.over_limit === true;
  const id = `limits.${usage.key.replaceAll(".", "_")}`;
  const name = t.has(id) ? t(id) : usage.key;
  return (
    <div className={compact ? "meter pf-meter compact" : "meter pf-meter"}>
      <div className="meter-head">
        <span className="ell">{name}</span>
        <b className={warn ? "tone-warn" : undefined}>{usageText(usage, locale, t("unlimited"))}</b>
      </div>
      <progress className={warn ? "bar hi" : "bar"} max={100} value={ratio} aria-label={name} />
    </div>
  );
}
