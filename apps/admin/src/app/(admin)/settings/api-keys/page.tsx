import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { revokeApiKey } from "@/app/(admin)/settings/actions";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";

// Tab "API key": key của chính người đăng nhập (core không cho xem key của người khác). Khoá chỉ
// hiện một lần lúc tạo; ở đây chỉ có phần đầu để nhận ra.
export default async function ApiKeysPage(props: PageProps<"/settings/api-keys">) {
  const t = await getTranslations();
  const params = await props.searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const page: components["schemas"]["Page_ApiKeyResponse"] = await load((client) =>
    client.GET("/api/v1/auth/api-keys", {
      params: { query: { limit: 50, ...(cursor ? { cursor } : {}) } },
    }),
  );
  const k = (key: string, values?: Record<string, string>) => t(`settings.apiKeys.${key}`, values);
  const now = Date.now();
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="keys-h">
        <div className="block-head">
          <h2 id="keys-h" className="h2">
            {k("title")}
          </h2>
        </div>
        <p className="fhint">{k("about")}</p>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{k("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{k("name")}</Th>
                  <Th>{k("permissions")}</Th>
                  <Th>{k("lastUsed")}</Th>
                  <Th>{k("expires")}</Th>
                  <Th>
                    <span className="vh">{k("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((key) => {
                  const expired =
                    key.expires_at !== null &&
                    key.expires_at !== undefined &&
                    Date.parse(key.expires_at) <= now;
                  return (
                    <tr key={key.id}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <b className="mono">{key.name}</b>
                          <span className="sub mono">{key.prefix}…</span>
                        </span>
                      </Td>
                      <Td label={k("permissions")}>
                        <span className="tags">
                          {key.permissions.map((p) => (
                            <span key={p} className="tag mono">
                              {p}
                            </span>
                          ))}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap" label={k("lastUsed")}>
                        {key.last_used_at ? <Time value={key.last_used_at} /> : k("neverUsed")}
                      </Td>
                      <Td className="whitespace-nowrap" label={k("expires")}>
                        {key.expires_at ? (
                          <span className={expired ? "badge b-arch" : undefined}>
                            {expired ? `${k("expired")} · ` : ""}
                            <Time value={key.expires_at} date />
                          </span>
                        ) : (
                          k("noExpiry")
                        )}
                      </Td>
                      <Td className="rt-acts">
                        <ConfirmAction
                          action={revokeApiKey}
                          id={key.id}
                          label={k("revoke")}
                          title={k("revokeTitle", { name: key.name })}
                          points={[k("revoke401"), k("revokeAgents"), k("revokeNoUndo")]}
                          submit={k("revokeSubmit")}
                          done={k("revoked", { name: key.name })}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
        {cursor || next ? (
          <nav className="pager" aria-label={t("access.pages")}>
            {cursor ? (
              <Link className="btn sm" href="/settings/api-keys">
                {t("access.first")}
              </Link>
            ) : null}
            {next ? (
              <Link
                className="btn sm"
                href={`/settings/api-keys?cursor=${encodeURIComponent(next)}`}
              >
                {t("access.next")}
              </Link>
            ) : null}
          </nav>
        ) : null}
        <p className="note">{k("kindNote")}</p>
      </section>
    </div>
  );
}
