import { getTranslations } from "next-intl/server";
import { saveLegalProfile, savePolicies } from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { InlineForm } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { LEGAL_MANAGE, LEGAL_READ, POLICIES_MANAGE } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { getPolicies, listKycProfiles, listLegalProfiles } from "@/sample/compliance";
import { SAMPLE_PROVINCES } from "@/sample/org";

const KYC_BADGE = {
  draft: "badge b-draft",
  pending: "badge b-violet",
  verified: "badge b-ok",
  rejected: "badge b-arch",
  expired: "badge b-warn",
  revoked: "badge b-bad",
} as const;

// Tab "Hồ sơ pháp lý": chủ sở hữu website (tên pháp lý, mã số thuế, người đại diện, địa chỉ) dùng cho
// chân trang, mẫu trang bắt buộc và bộ hồ sơ Bộ Công Thương; kênh liên hệ; hồ sơ của từng người bán.
export default async function LegalProfileTab() {
  const gate = await sampleGate(LEGAL_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.records.profile");
  const [{ data: profiles }, { data: kyc }, { data: policies }, manage, policiesManage] =
    await Promise.all([
      listLegalProfiles(),
      listKycProfiles(),
      getPolicies(),
      can(LEGAL_MANAGE),
      can(POLICIES_MANAGE),
    ]);
  const tenant = profiles.find((p) => p.org_id === null);
  const nodes = profiles.filter((p) => p.org_id !== null);
  const kycOf = (id: string | null) => kyc.find((k) => k.id === id);
  return (
    <div className="blocks cp-two">
      {tenant ? (
        <section className="block" aria-labelledby="cp-owner-h">
          <h2 id="cp-owner-h" className="h2">
            {t("owner", { name: tenant.name })}
          </h2>
          <p className="fhint">{t("about")}</p>
          <div className="card cp-pad">
            <InlineForm
              action={saveLegalProfile}
              submit={t("save")}
              done={t("saved")}
              disabled={!manage}
              fields={[
                { kind: "hidden", name: "id", value: tenant.id },
                {
                  kind: "select",
                  name: "entity_type",
                  label: t("entity"),
                  defaultValue: tenant.entity_type,
                  options: ["company", "household_business", "individual"].map((v) => ({
                    value: v,
                    label: t(`entities.${v}`),
                  })),
                },
                {
                  kind: "text",
                  name: "legal_name",
                  label: t("legalName"),
                  defaultValue: tenant.legal_name,
                },
                {
                  kind: "text",
                  name: "trade_name",
                  label: t("tradeName"),
                  defaultValue: tenant.trade_name,
                },
                {
                  kind: "text",
                  name: "tax_code",
                  label: t("taxCode"),
                  mono: true,
                  defaultValue: tenant.tax_code,
                  hint: t("taxHint"),
                },
                {
                  kind: "text",
                  name: "registration_number",
                  label: t("registration"),
                  mono: true,
                  defaultValue: tenant.registration_number,
                },
                {
                  kind: "text",
                  name: "representative_name",
                  label: t("representative"),
                  defaultValue: tenant.representative_name,
                },
                {
                  kind: "text",
                  name: "representative_title",
                  label: t("representativeTitle"),
                  defaultValue: tenant.representative_title,
                },
                {
                  kind: "select",
                  name: "province_code",
                  label: t("province"),
                  defaultValue: tenant.address.province_code,
                  options: SAMPLE_PROVINCES.map((p) => ({ value: p.id, label: p.name })),
                },
                {
                  kind: "text",
                  name: "commune_name",
                  label: t("commune"),
                  defaultValue: tenant.address.commune_name,
                },
                { kind: "text", name: "line", label: t("line"), defaultValue: tenant.address.line },
                { kind: "text", name: "phone", label: t("phone"), defaultValue: tenant.phone },
                { kind: "email", name: "email", label: t("email"), defaultValue: tenant.email },
              ]}
            />
          </div>
        </section>
      ) : null}

      <div className="blocks">
        <section className="block" aria-labelledby="cp-contacts-h">
          <h2 id="cp-contacts-h" className="h2">
            {t("contacts")}
          </h2>
          <p className="fhint">{t("contactsAbout")}</p>
          <div className="card cp-pad">
            <InlineForm
              action={savePolicies}
              submit={t("saveContacts")}
              done={t("savedContacts")}
              disabled={!policiesManage}
              fields={[
                {
                  kind: "text",
                  name: "complaints.contact",
                  label: t("complaints"),
                  defaultValue: policies["complaints.contact"],
                },
                {
                  kind: "text",
                  name: "privacy.contact",
                  label: t("privacy"),
                  defaultValue: policies["privacy.contact"],
                },
              ]}
            />
          </div>
        </section>

        <section className="block" aria-labelledby="cp-nodes-h">
          <h2 id="cp-nodes-h" className="h2">
            {t("byUnit")}
          </h2>
          <p className="fhint">{t("byUnitAbout")}</p>
          <div className="card tcard">
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("subject")}</Th>
                  <Th>{t("kyc")}</Th>
                  <Th>{t("updated")}</Th>
                </tr>
              </thead>
              <tbody>
                {[tenant, ...nodes].flatMap((profile) => {
                  if (!profile) return [];
                  const status = kycOf(profile.kyc_profile_id)?.status ?? "draft";
                  return [
                    <tr key={profile.id}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <b>{profile.name}</b>
                          <span className="sub">
                            {profile.org_id ? t("seller") : t("tenant")} ·{" "}
                            {t(`entities.${profile.entity_type}`)}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("kyc")}>
                        <span className={KYC_BADGE[status]}>
                          <span className="dot" />
                          {t(`kycStatus.${status}`)}
                        </span>
                      </Td>
                      <Td label={t("updated")}>
                        <Time value={profile.updated_at} />
                      </Td>
                    </tr>,
                  ];
                })}
              </tbody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
