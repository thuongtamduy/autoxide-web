import type { ModuleInfo } from "@autoxide/sdk";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";

/** Trạng thái của một module với khách đang xem. */
export type ModuleState = "always" | "on" | "off";

/**
 * `always` khi không gói nào tắt được module; `on` khi gói của khách bật nó (hoặc không biết gói:
 * `enabled` là `null`, khi đó không đoán là tắt — core vẫn tự từ chối `module_not_enabled`).
 */
export function moduleState(module: ModuleInfo, enabled: readonly string[] | null): ModuleState {
  if (module.always_enabled) return "always";
  if (enabled === null || enabled.includes(module.name)) return "on";
  return "off";
}

const TONE: Record<ModuleState, string> = { always: "", on: "b-ok", off: "b-warn" };

/**
 * Danh sách module như trang tiện ích của Shopify, Stripe: mỗi module một dòng có tên dễ đọc, một câu
 * mô tả, trạng thái; số đếm kỹ thuật (thứ tự khởi động, permission, event, job, công cụ MCP, migration)
 * nằm trong phần "Chi tiết kỹ thuật" thu gọn. Tên dễ đọc và mô tả lấy theo tên module trong
 * `modules.names.*` / `modules.blurbs.*`; module lạ thì hiện tên mã. Xếp theo tên dễ đọc.
 */
export function ModuleList({
  modules,
  enabled = null,
}: {
  modules: ModuleInfo[];
  enabled?: readonly string[] | null;
}) {
  const t = useTranslations("modules");
  if (modules.length === 0) {
    return <EmptyState icon="grid" title={t("empty")} />;
  }
  const label = (name: string) => (t.has(`names.${name}`) ? t(`names.${name}`) : name);
  const sorted = [...modules].sort((a, b) => label(a.name).localeCompare(label(b.name)));
  return (
    <ul className="card list se-mods">
      {sorted.map((module) => {
        const state = moduleState(module, enabled);
        const counts: [string, number][] = [
          [t("position"), module.position],
          [t("permissions"), module.permissions.length],
          [t("events"), module.events.length],
          [t("jobs"), module.jobs.length],
          [t("tools"), module.tools.length],
          [t("migrations"), module.migrations.length],
        ];
        return (
          <li key={module.name} className="item se-mod">
            <span className={`sq-ic${state === "off" ? "" : " info"}`} aria-hidden="true">
              {label(module.name).slice(0, 1).toUpperCase()}
            </span>
            <div className="item-main">
              <span className="item-title se-mod-title">
                <Link href={`/settings/modules/${encodeURIComponent(module.name)}`}>
                  {label(module.name)}
                </Link>
                <span className="mono se-code">{module.name}</span>
              </span>
              <span className="item-meta">
                {t.has(`blurbs.${module.name}`) ? t(`blurbs.${module.name}`) : t("noBlurb")}
              </span>
              <details className="se-tech">
                <summary>{t("technical")}</summary>
                <dl>
                  {counts.map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd className="num">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </div>
            <span className="se-mod-state">
              {module.internal ? <span className="badge">{t("internal")}</span> : null}
              <span className={`badge ${TONE[state]}`}>
                <span className="dot" />
                {t(`state.${state}`)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
