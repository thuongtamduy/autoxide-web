import type { components } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";
import { removeDomain } from "@/app/(admin)/settings/domain-actions";
import { MessagePanel } from "@/components/message-panel";
import { SampleBadge } from "@/components/sample-badge";
import { AddDomainDialog, VerifyDomainButton } from "@/components/settings/domain-forms";
import { ConfirmAction } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/secret-once";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import {
  canVerify,
  domainNext,
  MAX_FAILED_CHECKS,
  pendingExpiresAt,
  sortDomains,
  type TenantDomain,
} from "@/lib/domains";
import { DOMAINS_MANAGE } from "@/lib/permissions";
import { can, getCurrentTenant } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";

type Problem = components["schemas"]["Problem"];

const BADGE: Record<string, string> = {
  verified: "badge b-ok",
  pending: "badge b-warn",
  failed: "badge b-bad",
};

/** Mọi tên miền của khách (mỗi trang 200, tối đa 5 trang — một khách có vài tên miền). */
async function allDomains(): Promise<TenantDomain[]> {
  const all: TenantDomain[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const result = await load((client) =>
      client.GET("/api/v1/kernel/domains", {
        params: { query: { limit: 200, ...(cursor ? { cursor } : {}) } },
      }),
    );
    all.push(...result.data);
    cursor = result.pagination.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return all;
}

// Tab "Tên miền" (W-032): tên miền riêng của khách đọc thật từ core (`/kernel/domains`, D-291 của
// core). Mỗi tên miền hiện đúng bản ghi TXT phải tạo (nút chép), trạng thái, lần tra gần nhất, lý do
// chưa xác minh, hạn của tên miền đang chờ và số lần kiểm hằng ngày không thấy bản ghi. Bản cài một
// khách (`mode: single` của `GET /kernel/tenant`) không nhận tên miền: trang giải thích thay vì để
// người dùng gặp lỗi 409. Gắn tên miền vào một cửa hàng / chi nhánh chưa có API (bước 34).
export default async function DomainsPage() {
  const t = await getTranslations("settings.domains");
  if (!(await can(DOMAINS_MANAGE))) {
    const te = await getTranslations("errors");
    return (
      <MessagePanel
        title={te("forbiddenTitle")}
        message={te("forbidden", { permission: DOMAINS_MANAGE })}
      />
    );
  }
  let domains: TenantDomain[];
  try {
    domains = sortDomains(await allDomains());
  } catch (error) {
    if (!isForbidden(error)) throw error;
    const problem = error.problem as Problem;
    return <MessagePanel title={t("title")} message={problem.detail} />;
  }
  const tenant = await getCurrentTenant();
  const single = tenant?.mode === "single";
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="domains-h">
        <div className="block-head">
          <h2 id="domains-h" className="h2">
            {t("title")}
          </h2>
          {single ? null : <AddDomainDialog />}
        </div>
        <p className="fhint">{t("about")}</p>
        {single ? (
          <div className="note" data-testid="domains-single">
            <p>
              <b>{t("singleTitle")}</b> {t("singleText")}
            </p>
            <p className="fhint">{t("singleHow")}</p>
          </div>
        ) : (
          <ol className="steps">
            <li>{t("step1")}</li>
            <li>{t("step2")}</li>
            <li>{t("step3")}</li>
          </ol>
        )}
        {domains.length === 0 && single ? null : (
          <div className="card tcard">
            {domains.length === 0 ? (
              <p className="empty">{t("empty")}</p>
            ) : (
              <Table cards>
                <thead>
                  <tr>
                    <Th>{t("domain")}</Th>
                    <Th>{t("record")}</Th>
                    <Th>{t("state")}</Th>
                    <Th>
                      <span className="vh">{t("actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((domain) => {
                    const next = domainNext(domain);
                    const expires = pendingExpiresAt(domain);
                    return (
                      <tr key={domain.id} data-domain={domain.domain}>
                        <Td className="rt-title">
                          <span className="cell2">
                            <b className="mono">{domain.domain}</b>
                            <span className="sub">
                              {t("addedAt")} <Time value={domain.created_at} date />
                            </span>
                          </span>
                        </Td>
                        <Td label={t("record")}>
                          <span className="cell2">
                            <span className="sub">{t(`next.${next}`)}</span>
                            <span className="sub">
                              {t("recordType")} <code className="mono">{domain.record.type}</code>
                            </span>
                            <span className="sub">{t("recordName")}</span>
                            <code className="mono txt" data-testid="txt-name">
                              {domain.record.name}
                            </code>
                            <CopyButton text={domain.record.name} label={t("copyName")} />
                            <span className="sub">{t("recordValue")}</span>
                            <code className="mono txt" data-testid="txt-value">
                              {domain.record.value}
                            </code>
                            <CopyButton text={domain.record.value} label={t("copyValue")} />
                          </span>
                        </Td>
                        <Td label={t("state")}>
                          <span className="cell2">
                            <span className={BADGE[domain.status] ?? "badge"}>
                              <span className="dot" />
                              {t.has(`status.${domain.status}`)
                                ? t(`status.${domain.status}`)
                                : domain.status}
                            </span>
                            {domain.verified_at && domain.status === "verified" ? (
                              <span className="sub">
                                {t("verifiedSince")} <Time value={domain.verified_at} date />
                              </span>
                            ) : null}
                            {expires ? (
                              <span className="sub">
                                {t("expires")} <Time value={expires} />
                              </span>
                            ) : null}
                            <span className="sub">
                              {t("checked")}{" "}
                              {domain.last_checked_at ? (
                                <Time value={domain.last_checked_at} />
                              ) : (
                                t("neverChecked")
                              )}
                            </span>
                            {domain.status === "verified" && domain.failed_checks > 0 ? (
                              <span className="sub due">
                                {t("failedChecks", {
                                  count: domain.failed_checks,
                                  max: MAX_FAILED_CHECKS,
                                })}
                              </span>
                            ) : null}
                            {domain.org_id ? (
                              <span className="sub" data-testid="domain-node">
                                {t("node")} <span className="mono">{domain.org_id}</span>
                              </span>
                            ) : null}
                            {domain.check_error ? (
                              <span className="sub" data-testid="check-error">
                                {t("checkError", { reason: domain.check_error })}
                              </span>
                            ) : null}
                          </span>
                        </Td>
                        <Td className="rt-acts">
                          <span className="row-acts">
                            {canVerify(domain) ? (
                              <VerifyDomainButton id={domain.id} domain={domain.domain} />
                            ) : null}
                            <ConfirmAction
                              action={removeDomain}
                              id={domain.id}
                              label={t("revoke")}
                              title={t("revokeTitle", { domain: domain.domain })}
                              points={[
                                t("revokeSite", { domain: domain.domain }),
                                t("revokeCertificate"),
                                t("revokeOthers"),
                                t("revokeAgain"),
                              ]}
                              submit={t("revokeSubmit")}
                              done={t("revoked")}
                            />
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
        )}
      </section>
      {sampleDataEnabled() && !single ? (
        <section className="block" aria-labelledby="domains-unit-h">
          <div className="block-head">
            <h2 id="domains-unit-h" className="h2">
              {t("unitTitle")}
            </h2>
            <SampleBadge step="34" endpoint="GET /api/v1/organizations/nodes" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
