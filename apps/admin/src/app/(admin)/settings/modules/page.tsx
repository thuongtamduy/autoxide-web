import type { ModuleInfo } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { ModuleTable } from "@/components/module-table";
import { Card, CardContent } from "@/components/ui/card";
import { isForbidden, load } from "@/lib/core";
import { MODULES_READ } from "@/lib/permissions";

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
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("modules.title")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("modules.description")}</p>
      </div>
      <Card>
        <CardContent className="p-0 pt-0">
          <ModuleTable modules={modules} />
        </CardContent>
      </Card>
    </div>
  );
}
