import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { revokeAnyApiKey } from "@/app/(admin)/settings/actions";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { API_KEYS_MANAGE } from "@/lib/permissions";
import { can } from "@/lib/viewer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tab "Key của mọi người" (cần `auth.api_keys.manage`): quản trị viên xem key của mọi tài khoản và
// thu hồi key bị lộ hay không còn dùng (`GET/DELETE /auth/all-api-keys`). Core không bao giờ trả
// secret; chỉ có phần đầu để nhận ra. `?user=<id>` chỉ hiện key của một người (từ trang người dùng).
export default async function AllApiKeysPage(props: PageProps<"/settings/api-keys/all">) {
  if (!(await can(API_KEYS_MANAGE))) notFound();
  const t = await getTranslations();
  const params = await props.searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const user = typeof params.user === "string" && UUID.test(params.user) ? params.user : undefined;
  const page: components["schemas"]["Page_ManagedApiKeyResponse"] = await load((client) =>
    client.GET("/api/v1/auth/all-api-keys", {
      params: {
        query: { limit: 50, ...(cursor ? { cursor } : {}), ...(user ? { user_id: user } : {}) },
      },
    }),
  );
  const k = (key: string, values?: Record<string, string>) => t(`settings.apiKeys.${key}`, values);
  const base = user ? `/settings/api-keys/all?user=${user}` : "/settings/api-keys/all";
  const now = Date.now();
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="allkeys-h">
        <div className="block-head">
          <h2 id="allkeys-h" className="h2">
            {k("allTitle")}
          </h2>
          {user ? (
            <Link className="btn sm" href="/settings/api-keys/all">
              {k("allUsers")}
            </Link>
          ) : null}
        </div>
        <p className="fhint">{k("allAbout")}</p>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{k("allEmpty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{k("owner")}</Th>
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
                  const owner = key.user_name ?? k("ownerGone");
                  return (
                    <tr key={key.id}>
                      <Td label={k("owner")}>
                        <span className="cell2">
                          <Link href={`/org/access/users/${key.user_id}`}>{owner}</Link>
                          {key.user_email ? <span className="sub">{key.user_email}</span> : null}
                        </span>
                      </Td>
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
                          action={revokeAnyApiKey}
                          id={key.id}
                          label={k("revoke")}
                          title={k("revokeOtherTitle", { name: key.name, owner })}
                          points={[k("revoke401"), k("revokeAgents"), k("revokeAudit")]}
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
              <Link className="btn sm" href={base}>
                {t("access.first")}
              </Link>
            ) : null}
            {next ? (
              <Link
                className="btn sm"
                href={`${base}${user ? "&" : "?"}cursor=${encodeURIComponent(next)}`}
              >
                {t("access.next")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
