import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { Time } from "@/components/ui/time";
import { auditHref } from "@/lib/audit";
import { isForbidden, isNotFound, load } from "@/lib/core";
import { AUDIT_READ } from "@/lib/permissions";
import { actorName } from "../actors";

/** Giá trị JSON của mục audit, thụt lề cho dễ đọc; không có thì `null`. */
function pretty(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value, null, 2);
}

// Một mục audit: ai, lúc nào, việc gì, bản ghi nào; trạng thái trước / sau và chi tiết khác.
export default async function AuditEntryPage(props: PageProps<"/settings/audit/[id]">) {
  const { id } = await props.params;
  const t = await getTranslations();
  let entry: components["schemas"]["AuditEntryResponse"];
  try {
    ({ data: entry } = await load((client) =>
      client.GET("/api/v1/audit/{id}", { params: { path: { id } } }),
    ));
  } catch (error) {
    if (isForbidden(error)) {
      return (
        <MessagePanel
          title={t("errors.forbiddenTitle")}
          message={t("errors.forbidden", { permission: AUDIT_READ })}
        />
      );
    }
    if (isNotFound(error)) notFound();
    throw error;
  }
  const name = await actorName(entry.actor_user_id);
  const a = (key: string) => t(`settings.audit.${key}`);
  const parts: [string, string | null][] = [
    [a("before"), pretty(entry.before)],
    [a("after"), pretty(entry.after)],
    [a("details"), pretty(entry.details)],
  ];
  const actor = entry.actor_user_id;
  return (
    <div className="blocks">
      <nav className="back" aria-label={a("breadcrumb")}>
        <Link href="/settings/audit" className="btn ghost sm">
          <span aria-hidden="true">←</span> {a("back")}
        </Link>
      </nav>
      <section className="block" aria-labelledby="entry-h">
        <h2 id="entry-h" className="h2 mono">
          {entry.action}
        </h2>
        <dl className="card kv">
          <div>
            <dt>{a("when")}</dt>
            <dd>
              <Time value={entry.occurred_at} />
            </dd>
          </div>
          <div>
            <dt>{a("actor")}</dt>
            <dd>
              {actor ? (
                <Link href={auditHref("/settings/audit", { actor_user_id: actor })}>
                  {name ?? actor}
                </Link>
              ) : (
                a(`kind.${entry.actor_kind}`)
              )}
              {entry.actor_api_key_id ? ` · ${a("viaKey")} ${entry.actor_api_key_id}` : ""}
            </dd>
          </div>
          <div>
            <dt>{a("module")}</dt>
            <dd className="mono">{entry.module}</dd>
          </div>
          <div>
            <dt>{a("subject")}</dt>
            <dd className="mono">
              {entry.subject ? (
                <Link href={auditHref("/settings/audit", { subject: entry.subject })}>
                  {entry.subject}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        {parts
          .filter(([, text]) => text !== null)
          .map(([label, text]) => (
            <div className="fld" key={label}>
              <span className="lab">{label}</span>
              <pre className="json mono">{text}</pre>
            </div>
          ))}
      </section>
    </div>
  );
}
