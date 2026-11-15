import { getTranslations } from "next-intl/server";
import { approveKycAction, rejectKycAction } from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis } from "@/components/compliance/common";
import { ConfirmButton } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { KYC_READ, KYC_REVIEW } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { KYC_REASONS, type KycStatus, listKycProfiles } from "@/sample/compliance";
import { ruleAt } from "@/sample/compliance-rules";

const FILTERS: KycStatus[] = ["pending", "verified", "rejected"];
const BADGE: Record<KycStatus, string> = {
  draft: "badge b-draft",
  pending: "badge b-warn",
  verified: "badge b-ok",
  rejected: "badge b-arch",
  expired: "badge b-arch",
  revoked: "badge b-bad",
};

// Tab "Định danh (KYC)": người bán, người livestream bán hàng và người tiếp thị liên kết phải được
// xác thực danh tính trước khi bán (cổng chặn của bước 37). Duyệt chỉ bằng phiên đăng nhập của người.
export default async function KycTab(props: PageProps<"/compliance/kyc">) {
  const gate = await sampleGate(KYC_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.kyc");
  const { status } = await props.searchParams;
  const current = FILTERS.find((s) => s === status) ?? (status === "all" ? undefined : "pending");
  const [{ data: profiles }, review] = await Promise.all([
    listKycProfiles(current ? { status: current } : {}),
    can(KYC_REVIEW),
  ]);
  const rule = ruleAt("kyc.required_activities");
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="cp-kyc-h">
        <h2 id="cp-kyc-h" className="h2">
          {t("title")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <Chips
          label={t("filter")}
          chips={[
            ...FILTERS.map((s) => ({
              href: `/compliance/kyc?status=${s}`,
              label: t(`status.${s}`),
              on: current === s,
            })),
            { href: "/compliance/kyc?status=all", label: t("all"), on: current === undefined },
          ]}
        />
        <div className="card tcard">
          {profiles.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("subject")}</Th>
                  <Th>{t("party")}</Th>
                  <Th>{t("method")}</Th>
                  <Th>{t("state")}</Th>
                  {review ? (
                    <Th>
                      <span className="vh">{t("actions")}</span>
                    </Th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b className="ell">{profile.subject_name}</b>
                        <span className="sub">
                          {t(`activity.${profile.activity}`)} · {t("sent")}{" "}
                          <Time value={profile.created_at} />
                        </span>
                      </span>
                    </Td>
                    <Td label={t("party")}>{t(`parties.${profile.party_type}`)}</Td>
                    <Td label={t("method")}>{t(`methods.${profile.method}`)}</Td>
                    <Td label={t("state")}>
                      <span className="cell2">
                        <span
                          className={
                            profile.documents_missing ? "badge b-bad" : BADGE[profile.status]
                          }
                        >
                          <span className="dot" />
                          {profile.documents_missing
                            ? t("missingDocuments")
                            : t(`status.${profile.status}`)}
                        </span>
                        {profile.expires_at && profile.status === "verified" ? (
                          <span className="sub">
                            {t("expires")} <Time value={profile.expires_at} date />
                          </span>
                        ) : null}
                        {profile.reason_code ? (
                          <span className="sub">{t(`reasons.${profile.reason_code}`)}</span>
                        ) : null}
                      </span>
                    </Td>
                    {review ? (
                      <Td className="rt-acts">
                        {profile.status === "pending" ? (
                          <span className="eg-acts">
                            <ConfirmButton
                              action={approveKycAction}
                              fields={{ id: profile.id }}
                              label={t("approve.button")}
                              title={t("approve.title", { name: profile.subject_name })}
                              points={[t("approve.sell"), t("approve.audit"), t("approve.expiry")]}
                              submit={t("approve.submit")}
                              done={t("approve.done", { name: profile.subject_name })}
                              danger={false}
                            />
                            <FormDialog
                              action={rejectKycAction}
                              label={t("reject.button")}
                              title={t("reject.title", { name: profile.subject_name })}
                              intro={t("reject.intro")}
                              submit={t("reject.submit")}
                              done={t("reject.done", { name: profile.subject_name })}
                              fields={[
                                { kind: "hidden", name: "id", value: profile.id },
                                {
                                  kind: "select",
                                  name: "reason_code",
                                  label: t("reject.reason"),
                                  defaultValue: profile.documents_missing
                                    ? "documents_missing"
                                    : "",
                                  options: [
                                    { value: "", label: t("reject.choose") },
                                    ...KYC_REASONS.map((r) => ({
                                      value: r,
                                      label: t(`reasons.${r}`),
                                    })),
                                  ],
                                },
                                {
                                  kind: "textarea",
                                  name: "note",
                                  label: t("reject.note"),
                                  hint: t("reject.noteHint"),
                                },
                              ]}
                            />
                          </span>
                        ) : null}
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <p className="fhint">{t("human")}</p>
        <Basis rule={rule} lead={t("gate")} />
      </section>
    </div>
  );
}
