import type { ModuleInfo } from "@autoxide/sdk";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";

/** Bảng mọi module, theo thứ tự khởi động. */
export function ModuleTable({ modules }: { modules: ModuleInfo[] }) {
  const t = useTranslations("modules");
  if (modules.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-16">{t("position")}</Th>
          <Th>{t("name")}</Th>
          <Th className="text-right">{t("permissions")}</Th>
          <Th className="text-right">{t("events")}</Th>
          <Th className="text-right">{t("jobs")}</Th>
          <Th className="text-right">{t("tools")}</Th>
          <Th className="text-right">{t("migrations")}</Th>
        </tr>
      </thead>
      <tbody>
        {modules.map((module) => (
          <tr key={module.name} className="hover:bg-muted/60">
            <Td className="tabular-nums text-muted-foreground">{module.position}</Td>
            <Td>
              <div className="flex items-center gap-2">
                <Link
                  href={`/modules/${encodeURIComponent(module.name)}`}
                  className="font-mono font-medium text-primary hover:underline"
                >
                  {module.name}
                </Link>
                {module.internal && <Badge>{t("internal")}</Badge>}
              </div>
            </Td>
            <Td className="text-right tabular-nums">{module.permissions.length}</Td>
            <Td className="text-right tabular-nums">{module.events.length}</Td>
            <Td className="text-right tabular-nums">{module.jobs.length}</Td>
            <Td className="text-right tabular-nums">{module.tools.length}</Td>
            <Td className="text-right tabular-nums">{module.migrations.length}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
