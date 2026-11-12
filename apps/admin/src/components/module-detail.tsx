import type { ModuleInfo } from "@autoxide/sdk";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { splitDuration } from "@/lib/duration";

/** Mọi thứ một module khai, theo từng nhóm. */
export function ModuleDetail({ module }: { module: ModuleInfo }) {
  const t = useTranslations("modules");
  const td = useTranslations("duration");
  const pending = module.migrations.filter((migration) => migration.applied === false);

  return (
    <div className="grid gap-5">
      <Section title={t("migrations")} count={module.migrations.length}>
        {pending.length > 0 && <p className="mb-3 text-sm text-warning">{t("pendingHint")}</p>}
        <List
          empty={module.migrations.length === 0}
          head={[t("migration"), t("status")]}
          rows={module.migrations.map((migration) => [
            <Code key="n">{migration.name}</Code>,
            migration.applied === true ? (
              <Badge key="s" tone="success">
                {t("applied")}
              </Badge>
            ) : migration.applied === false ? (
              <Badge key="s" tone="warning">
                {t("pending")}
              </Badge>
            ) : (
              <span key="s">—</span>
            ),
          ])}
        />
      </Section>

      <Section title={t("permissions")} count={module.permissions.length}>
        <List
          empty={module.permissions.length === 0}
          head={[t("name"), t("descriptionColumn")]}
          rows={module.permissions.map((permission) => [
            <Code key="n">{permission.name}</Code>,
            permission.description,
          ])}
        />
      </Section>

      <Section title={t("tools")} count={module.tools.length}>
        <List
          empty={module.tools.length === 0}
          head={[t("name"), t("descriptionColumn"), t("permissions")]}
          rows={module.tools.map((tool) => [
            <div key="n" className="flex flex-col items-start gap-1">
              <Code>{tool.name}</Code>
              <div className="flex gap-1">
                {tool.read_only && <Badge>{t("readOnly")}</Badge>}
                {tool.destructive && <Badge tone="danger">{t("destructive")}</Badge>}
              </div>
            </div>,
            tool.description,
            tool.permissions.length === 0 ? (
              <span key="p" className="text-muted-foreground">
                {t("anySignedIn")}
              </span>
            ) : (
              <div key="p" className="flex flex-col gap-1">
                {tool.permissions.map((permission) => (
                  <Code key={permission}>{permission}</Code>
                ))}
              </div>
            ),
          ])}
        />
      </Section>

      <Section title={t("events")} count={module.events.length}>
        <List
          empty={module.events.length === 0}
          head={[t("name"), t("descriptionColumn")]}
          rows={module.events.map((event) => [
            <Code key="n">{event.name}</Code>,
            event.description,
          ])}
        />
      </Section>

      <Section title={t("subscriptions")} count={module.subscriptions.length}>
        {module.subscriptions.length === 0 ? (
          <None />
        ) : (
          <div className="flex flex-wrap gap-2">
            {module.subscriptions.map((event) =>
              event === "*" ? (
                <Badge key={event} tone="primary">
                  {t("allEvents")}
                </Badge>
              ) : (
                <Code key={event}>{event}</Code>
              ),
            )}
          </div>
        )}
      </Section>

      <Section title={t("jobs")} count={module.jobs.length}>
        {module.jobs.length === 0 ? (
          <None />
        ) : (
          <div className="flex flex-wrap gap-2">
            {module.jobs.map((job) => (
              <Code key={job}>{job}</Code>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("schedules")} count={module.schedules.length}>
        <List
          empty={module.schedules.length === 0}
          head={[t("name"), t("kind"), t("interval")]}
          rows={module.schedules.map((schedule) => {
            const { unit, count } = splitDuration(schedule.every_seconds);
            return [
              <Code key="n">{schedule.name}</Code>,
              <Code key="k">{schedule.kind}</Code>,
              t("every", { duration: td(unit, { count }) }),
            ];
          })}
        />
      </Section>

      <Section title={t("deprecations")} count={module.deprecations.length}>
        <List
          empty={module.deprecations.length === 0}
          head={["", t("since"), t("sunset"), t("successor")]}
          rows={module.deprecations.map((deprecation) => [
            <Code key="e">
              {deprecation.method} {deprecation.path}
            </Code>,
            deprecation.since,
            deprecation.sunset ?? "—",
            deprecation.successor ? <Code key="s">{deprecation.successor}</Code> : "—",
          ])}
        />
      </Section>

      <Section title={t("languages")} count={module.languages.length + 1}>
        <div className="flex flex-wrap gap-2">
          <Badge>en</Badge>
          {module.languages.map((language) => (
            <Badge key={language}>{language}</Badge>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <CardTitle>{title}</CardTitle>
        <Badge>{count}</Badge>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function List({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: boolean }) {
  if (empty) {
    return <None />;
  }
  return (
    <Table>
      <thead>
        <tr>
          {head.map((cell, index) => (
            // Cột cố định theo vị trí, không đổi thứ tự.
            // biome-ignore lint/suspicious/noArrayIndexKey: xem trên.
            <Th key={index}>{cell}</Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: dòng giữ đúng thứ tự core trả.
          <tr key={index}>
            {row.map((cell, column) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cột cố định theo vị trí.
              <Td key={column}>{cell}</Td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function None() {
  const t = useTranslations("modules");
  return <p className="text-sm text-muted-foreground">{t("noneDeclared")}</p>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>;
}
