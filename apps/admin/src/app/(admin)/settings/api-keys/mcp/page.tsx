import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/ui/secret-once";
import { publicApiUrl } from "@/lib/public-url";

// Tab "Kết nối MCP": địa chỉ endpoint MCP của core (`/mcp`, Streamable HTTP, theo README của core)
// và cách cấu hình agent. Địa chỉ là địa chỉ công khai core công bố (`GET /kernel/client-config`);
// core chưa đặt thì dùng địa chỉ trang quản trị gọi core và nói rõ điều đó.
export default async function McpPage() {
  const t = await getTranslations("settings.mcp");
  const base = await publicApiUrl();
  const endpoint = `${base.url}/mcp`;
  const claude = `claude mcp add --transport http autoxide ${endpoint} --header "Authorization: Bearer <api key>"`;
  const json = JSON.stringify(
    {
      mcpServers: {
        autoxide: {
          type: "http",
          url: endpoint,
          headers: { Authorization: "Bearer <api key>" },
        },
      },
    },
    null,
    2,
  );
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="mcp-h">
        <h2 id="mcp-h" className="h2">
          {t("title")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <div className="card padded dlg-form">
          <div className="fld">
            <span className="lab">{t("endpoint")}</span>
            <code className="secret mono" data-testid="mcp-endpoint">
              {endpoint}
            </code>
            <CopyButton text={endpoint} />
            <span className="fhint">
              {base.configured ? t("endpointPublic") : t("endpointHint")}
            </span>
          </div>
          <ol className="steps">
            <li>
              {t("step1")}{" "}
              <Link href="/settings/api-keys/new" className="open">
                {t("step1Link")}
              </Link>
            </li>
            <li>{t("step2")}</li>
            <li>{t("step3")}</li>
          </ol>
          <div className="fld">
            <span className="lab">{t("claude")}</span>
            <pre className="json mono">{claude}</pre>
            <CopyButton text={claude} />
          </div>
          <div className="fld">
            <span className="lab">{t("generic")}</span>
            <pre className="json mono">{json}</pre>
            <CopyButton text={json} />
          </div>
        </div>
        <ul className="note dlg-list">
          <li>{t("rulePermissions")}</li>
          <li>{t("ruleSame")}</li>
          <li>{t("ruleAudit")}</li>
        </ul>
      </section>
    </div>
  );
}
