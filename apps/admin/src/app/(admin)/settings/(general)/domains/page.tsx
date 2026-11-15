import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { SampleBadge } from "@/components/sample-badge";
import { AddDomainDialog } from "@/components/settings/sample-forms";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { DOMAINS_MANAGE } from "@/lib/permissions";
import { type DomainStatus, listDomains } from "@/sample/settings";
import { revokeDomainAction, verifyDomainAction } from "../../sample-actions";

const STATUSES: Exclude<DomainStatus, "revoked">[] = ["verified", "pending", "failed"];
const BADGE: Record<DomainStatus, string> = {
  verified: "badge b-ok",
  pending: "badge b-warn",
  failed: "badge b-bad",
  revoked: "badge b-arch",
};

// Tab "Tên miền" (dữ liệu mẫu, chờ `/api/v1/kernel/domains` của bước 33): thêm tên miền, đặt bản
// ghi TXT để chứng minh sở hữu, kiểm lại, gỡ.
export default async function DomainsPage(props: PageProps<"/settings/domains">) {
  const gate = await sampleGate(DOMAINS_MANAGE);
  if (gate) return gate;
  const t = await getTranslations("settings.domains");
  const { status } = await props.searchParams;
  const current = STATUSES.find((s) => s === status);
  const [{ data: domains }, { data: all }] = await Promise.all([
    listDomains(current ? { status: current } : {}),
    listDomains(),
  ]);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="domains-h">
        <div className="block-head">
          <h2 id="domains-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge
            step="33"
            endpoint="GET/POST/DELETE /api/v1/kernel/domains, POST /{id}/verify"
          />
          <AddDomainDialog />
        </div>
        <p className="fhint">{t("about")}</p>
        <nav className="chips" aria-label={t("filter")}>
          <Link
            className={current ? "chip" : "chip on"}
            href="/settings/domains"
            aria-current={current ? undefined : "page"}
          >
            {t("all")} <span className="cnt">{all.length}</span>
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              className={current === s ? "chip on" : "chip"}
              href={`/settings/domains?status=${s}`}
              aria-current={current === s ? "page" : undefined}
            >
              {t(`status.${s}`)}{" "}
              <span className="cnt">{all.filter((d) => d.status === s).length}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {domains.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("domain")}</Th>
                  <Th>{t("unit")}</Th>
                  <Th>{t("note")}</Th>
                  <Th>{t("checked")}</Th>
                  <Th>{t("state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {domains.map((domain) => (
                  <tr key={domain.id}>
                    <Td className="rt-title">
                      <b className="mono">{domain.domain}</b>
                    </Td>
                    <Td label={t("unit")}>{domain.org_name ?? t("noUnit")}</Td>
                    <Td label={t("note")}>
                      {domain.status === "verified" && domain.verified_at ? (
                        <>
                          {t("verifiedSince")} <Time value={domain.verified_at} date />
                        </>
                      ) : (
                        <span className="cell2">
                          <span className="sub">{t("txt")}</span>
                          <code className="mono txt">{domain.txt_name}</code>
                          <code className="mono txt">{domain.txt_value}</code>
                          {domain.check_error ? (
                            <span className="sub">{domain.check_error}</span>
                          ) : null}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap" label={t("checked")}>
                      {domain.last_checked_at ? <Time value={domain.last_checked_at} /> : "—"}
                    </Td>
                    <Td label={t("state")}>
                      <span className={BADGE[domain.status]}>
                        <span className="dot" />
                        {t(`status.${domain.status}`)}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      <span className="row-acts">
                        {domain.status !== "verified" ? (
                          <InlineAction
                            action={verifyDomainAction}
                            id={domain.id}
                            label={t("verify")}
                            ariaLabel={t("verifyLabel", { domain: domain.domain })}
                            done={t("verified")}
                          />
                        ) : null}
                        <ConfirmAction
                          action={revokeDomainAction}
                          id={domain.id}
                          label={t("revoke")}
                          title={t("revokeTitle", { domain: domain.domain })}
                          points={[t("revokeSite"), t("revokeAgain")]}
                          submit={t("revokeSubmit")}
                          done={t("revoked")}
                        />
                      </span>
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
