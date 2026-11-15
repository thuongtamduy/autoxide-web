import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SampleBadge } from "@/components/sample-badge";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { sampleDataEnabled } from "@/sample";
import { listToolCalls, type ToolCallResult } from "@/sample/agent";

const BADGE: Record<ToolCallResult, string> = {
  ok: "badge b-ok",
  approval_required: "badge b-info",
  forbidden: "badge b-bad",
  error: "badge b-bad",
};

// Tab "Nhật ký gọi tool MCP" (dữ liệu mẫu, chờ bước 51/52): agent gọi tool nào, với key nào, kết
// quả ra sao. Không ghi thân tham số có dữ liệu cá nhân.
export default async function ToolCallsPage() {
  if (!sampleDataEnabled()) notFound();
  const t = await getTranslations("settings.calls");
  const { data } = await listToolCalls();
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="calls-h">
        <div className="block-head">
          <h2 id="calls-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="51" endpoint="GET /api/v1/kernel/tool-calls" />
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("when")}</Th>
                <Th>{t("tool")}</Th>
                <Th>{t("key")}</Th>
                <Th>{t("args")}</Th>
                <Th>{t("result")}</Th>
                <Th className="text-right">ms</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((call) => (
                <tr key={call.id}>
                  <Td className="whitespace-nowrap" label={t("when")}>
                    <Time value={call.at} />
                  </Td>
                  <Td className="rt-title">
                    <b className="mono">{call.tool}</b>
                  </Td>
                  <Td label={t("key")}>{call.api_key.name}</Td>
                  <Td label={t("args")}>{call.summary}</Td>
                  <Td label={t("result")}>
                    <span className={BADGE[call.result]}>
                      <span className="dot" />
                      {t(`results.${call.result}`)}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums" label="ms">
                    {call.duration_ms}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
