import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { TipHeading } from "@/components/help/info-tip";
import { SampleBadge } from "@/components/sample-badge";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { DEVTOOLS_READ } from "@/lib/permissions";
import { listRequests, requestKeys, type StatusClass } from "@/sample/devtools";

const CLASSES: StatusClass[] = ["4xx", "5xx"];

function statusBadge(status: number): string {
  if (status >= 500) return "badge b-bad";
  if (status >= 400) return "badge b-warn";
  return "badge b-ok";
}

/** Địa chỉ của tab với bộ lọc (bỏ tham số rỗng). */
function href(statusClass?: string, key?: string): string {
  const query = new URLSearchParams();
  if (statusClass) query.set("status", statusClass);
  if (key) query.set("key", key);
  const text = query.toString();
  return text ? `/settings/developers/requests?${text}` : "/settings/developers/requests";
}

// Tab "Request" (dữ liệu mẫu, chờ nhật ký request theo khách của bước 52): đường dẫn mẫu, mã trạng
// thái, `code` lỗi, thời gian xử lý, API key. Không lưu thân request, token hay mật khẩu.
export default async function RequestsPage(props: PageProps<"/settings/developers/requests">) {
  const gate = await sampleGate(DEVTOOLS_READ);
  if (gate) return gate;
  const t = await getTranslations("settings.developers");
  const params = await props.searchParams;
  const current = CLASSES.find((c) => c === params.status);
  const keys = requestKeys();
  const key = keys.find((k) => k.id === params.key)?.id;
  const { data } = await listRequests({
    ...(current ? { status_class: current } : {}),
    ...(key ? { api_key_id: key } : {}),
  });
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="req-h">
        <div className="block-head">
          <TipHeading id="req-h" tip="idempotency">
            {t("requests")}
          </TipHeading>
          <SampleBadge step="52" endpoint="GET /api/v1/kernel/requests" />
        </div>
        <p className="fhint">{t("requestsAbout")}</p>
        <div className="filters">
          <nav className="chips" aria-label={t("filter")}>
            <Link className={current ? "chip" : "chip on"} href={href(undefined, key)}>
              {t("anyStatus")}
            </Link>
            {CLASSES.map((c) => (
              <Link key={c} className={current === c ? "chip on" : "chip"} href={href(c, key)}>
                {t(`class.${c}`)}
              </Link>
            ))}
          </nav>
          <form method="get" action="/settings/developers/requests" className="inline-row">
            {current ? <input type="hidden" name="status" value={current} /> : null}
            <label className="fld">
              <span className="lab">{t("apiKey")}</span>
              <select className="inp" name="key" defaultValue={key ?? ""}>
                <option value="">{t("anyKey")}</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn">
              {t("apply")}
            </button>
          </form>
        </div>
        <div className="card tcard">
          {data.length === 0 ? (
            <p className="empty">{t("noRequests")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("when")}</Th>
                  <Th>{t("route")}</Th>
                  <Th>{t("status")}</Th>
                  <Th>{t("code")}</Th>
                  <Th className="text-right">ms</Th>
                  <Th>{t("apiKey")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="whitespace-nowrap" label={t("when")}>
                      <Time value={entry.at} />
                    </Td>
                    <Td className="rt-title">
                      <span className="mono">
                        <b>{entry.method}</b> {entry.route}
                      </span>
                    </Td>
                    <Td label={t("status")}>
                      <span className={statusBadge(entry.status)}>{entry.status}</span>
                    </Td>
                    <Td label={t("code")}>
                      <span className="mono">{entry.code ?? "—"}</span>
                    </Td>
                    <Td className="text-right tabular-nums" label="ms">
                      {entry.duration_ms}
                    </Td>
                    <Td label={t("apiKey")}>
                      {entry.actor
                        ? `${entry.actor.name}${entry.actor.agent ? ` (${t("agent")})` : ""}`
                        : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
