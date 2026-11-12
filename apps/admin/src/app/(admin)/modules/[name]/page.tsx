import { ApiError, type ModuleInfo } from "@autoxide/sdk";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { ModuleDetail } from "@/components/module-detail";
import { Badge } from "@/components/ui/badge";
import { isForbidden, load } from "@/lib/core";
import { MODULES_READ } from "@/lib/permissions";

export default async function ModulePage(props: PageProps<"/modules/[name]">) {
  const { name } = await props.params;
  const t = await getTranslations();
  let module: ModuleInfo;
  try {
    ({ data: module } = await load((client) =>
      client.GET("/api/v1/kernel/modules/{name}", { params: { path: { name } } }),
    ));
  } catch (error) {
    if (isForbidden(error)) {
      return (
        <MessagePanel
          title={t("errors.forbiddenTitle")}
          message={t("errors.forbidden", { permission: MODULES_READ })}
        />
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link href="/modules" className="text-sm text-primary hover:underline">
          ← {t("modules.back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold">{module.name}</h1>
          {module.internal && <Badge>{t("modules.internal")}</Badge>}
          <Badge>
            {t("modules.position")} {module.position}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("modules.apiPath")}{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            /api/v1/{module.name}
          </code>
        </p>
      </div>
      <ModuleDetail module={module} />
    </div>
  );
}
