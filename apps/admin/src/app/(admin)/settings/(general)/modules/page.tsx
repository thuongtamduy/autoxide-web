import type { ModuleInfo } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { ModuleList } from "@/components/module-list";
import { getClientConfig } from "@/lib/client-config";
import { isForbidden, load } from "@/lib/core";
import { MODULES_READ } from "@/lib/permissions";
import { enabledModuleNames } from "@/lib/plans-server";

// Tab "Module" của Cài đặt chung: mọi module của core, mỗi module một dòng có tên dễ đọc, mô tả và
// trạng thái với gói của khách. Core không trả phiên bản riêng của từng module (module biên dịch
// cùng máy chủ), nên hiện phiên bản máy chủ (`kernel.version` của client-config) ở đầu danh sách.
export default async function ModulesPage() {
  const t = await getTranslations();
  let modules: ModuleInfo[];
  try {
    ({ data: modules } = await load((client) => client.GET("/api/v1/kernel/modules")));
  } catch (error) {
    if (isForbidden(error)) {
      return (
        <MessagePanel
          title={t("errors.forbiddenTitle")}
          message={t("errors.forbidden", { permission: MODULES_READ })}
        />
      );
    }
    throw error;
  }
  const [enabled, config] = await Promise.all([enabledModuleNames(modules), getClientConfig()]);
  const version = config?.kernel?.version ?? null;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="modules-h">
        <div className="block-head">
          <h2 id="modules-h" className="h2">
            {t("modules.title")}
          </h2>
        </div>
        <p className="fhint">
          {t("modules.description")}
          {version ? ` ${t("modules.serverVersion", { version })}` : null}
        </p>
        <ModuleList modules={modules} enabled={enabled} />
      </section>
    </div>
  );
}
