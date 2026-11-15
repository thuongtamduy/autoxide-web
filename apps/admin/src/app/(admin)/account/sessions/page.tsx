import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EndOthersDialog, EndSessionButton } from "@/components/account/sessions";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { deviceOf } from "@/lib/device";
import { SESSION_COOKIE } from "@/lib/session";

// Tab "Phiên đăng nhập": mỗi thiết bị một dòng, phiên đang dùng được đánh dấu (nhận ra nhờ
// `session_id` cất trong cookie khi đăng nhập / làm mới token).
export default async function SessionsPage(props: PageProps<"/account/sessions">) {
  const t = await getTranslations("account.sessions");
  const { cursor } = await props.searchParams;
  const page = await load((client) =>
    client.GET("/api/v1/auth/me/sessions", {
      params: { query: { limit: 50, ...(typeof cursor === "string" ? { cursor } : {}) } },
    }),
  );
  const current = (await cookies()).get(SESSION_COOKIE)?.value;
  const sessions = page.data;
  const others = sessions.filter((session) => session.id !== current).length;
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="sessions-h">
        <div className="block-head">
          <h2 id="sessions-h" className="h2">
            {t("title")}
          </h2>
          <EndOthersDialog others={current ? others : 0} />
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("device")}</Th>
                <Th>{t("started")}</Th>
                <Th>{t("lastActive")}</Th>
                <Th>{t("expires")}</Th>
                <Th>{t("status")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const device = deviceOf(session.user_agent);
                const name = device
                  ? device.browser && device.os
                    ? t("on", { browser: device.browser, os: device.os })
                    : (device.browser ?? device.os ?? "")
                  : t("unknownDevice");
                const mine = session.id === current;
                return (
                  <tr key={session.id} data-current={mine ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{name}</b>
                        {session.user_agent ? (
                          <span className="sub ell" title={session.user_agent}>
                            {session.user_agent}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap" label={t("started")}>
                      <Time value={session.started_at} />
                    </Td>
                    <Td className="whitespace-nowrap" label={t("lastActive")}>
                      <Time value={session.last_active_at} />
                    </Td>
                    <Td className="whitespace-nowrap" label={t("expires")}>
                      <Time value={session.expires_at} />
                    </Td>
                    <Td label={t("status")}>
                      <span className={mine ? "badge b-info" : "badge b-ok"}>
                        <span className="dot" />
                        {mine ? t("current") : t("active")}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      {mine ? null : <EndSessionButton id={session.id} device={name} />}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        {current ? null : <p className="note">{t("unknownCurrent")}</p>}
        {cursor || next ? (
          <nav className="pager" aria-label={t("pages")}>
            {cursor ? (
              <Link className="btn sm" href="/account/sessions">
                {t("first")}
              </Link>
            ) : null}
            {next ? (
              <Link
                className="btn sm"
                href={`/account/sessions?cursor=${encodeURIComponent(next)}`}
              >
                {t("more")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
