import type { ModuleInfo } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { ModuleTable } from "@/components/module-table";
import { isForbidden, load } from "@/lib/core";
import { MODULES_READ } from "@/lib/permissions";

// Tab "Module" của Cài đặt chung: mọi module của core, theo thứ tự khởi động.
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
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="modules-h">
        <div className="block-head">
          <h2 id="modules-h" className="h2">
            {t("modules.title")}
          </h2>
        </div>
        <p className="fhint">{t("modules.description")}</p>
        <div className="card tcard">
          <ModuleTable modules={modules} />
        </div>
      </section>
    </div>
  );
}
