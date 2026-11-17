import type { components } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";
import { bulkRevokeApiKeys, revokeApiKey } from "@/app/(admin)/settings/actions";
import { TipHeading } from "@/components/help/info-tip";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Pager } from "@/components/ui/pager";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { withQuery } from "@/lib/table";

const BASE = "/settings/api-keys";

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
  const e = await getTranslations("emptyStates");
  const now = Date.now();
  const next = page.pagination.next_cursor;
  // Bộ bảng (W-058): chọn nhiều để thu hồi (lặp lệnh từng cái của core); dòng giữ một nút Thu hồi.
  const bulk: BulkActionSpec[] = [
    {
      key: "revoke",
      label: k("revoke"),
      tone: "danger",
      run: bulkRevokeApiKeys,
      confirm: {
        title: k("bulkRevokeTitle"),
        points: [k("revoke401"), k("revokeAgents"), k("revokeNoUndo")],
        submit: k("revokeSubmit"),
      },
    },
  ];
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="keys-h">
        <div className="block-head">
          <TipHeading id="keys-h" tip="agent_keys">
            {k("title")}
          </TipHeading>
        </div>
        <p className="fhint">{k("about")}</p>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <EmptyState icon="key" title={k("empty")}>
              {e("apiKeys.body")}
            </EmptyState>
          ) : (
            <BulkTable ids={page.data.map((key) => key.id)} actions={bulk}>
              <Table cards>
                <thead>
                  <tr>
                    <SelectAllTh />
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
                        <SelectTd id={key.id} name={key.name} />
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
            </BulkTable>
          )}
        </div>
        <Pager
          first={cursor ? BASE : null}
          next={next ? withQuery(BASE, { cursor: next }) : null}
        />
      </section>
    </div>
  );
}
