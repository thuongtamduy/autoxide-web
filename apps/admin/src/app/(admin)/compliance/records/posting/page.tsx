import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { savePolicies } from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis, Day } from "@/components/compliance/common";
import { InlineForm } from "@/components/ui/form-dialog";
import { formatCount } from "@/lib/format";
import { POLICIES_MANAGE } from "@/lib/permissions";
import { getPolicies, verificationStats } from "@/sample/compliance";
import { ruleAt } from "@/sample/compliance-rules";

const LEVELS = ["none", "phone", "identity"] as const;

// Tab "Đăng nội dung": ai được đánh giá, phát trực tiếp bán hàng — không cần xác thực, cần số di động
// Việt Nam đã xác thực, hay cần định danh. Mức cho bình luận đặt ở màn Bình luận (cùng kho mẫu).
export default async function PostingTab() {
  const gate = await sampleGate(POLICIES_MANAGE);
  if (gate) return gate;
  const t = await getTranslations("compliance.records.posting");
  const [{ data: policies }, { data: stats }, locale] = await Promise.all([
    getPolicies(),
    verificationStats(),
    getLocale(),
  ]);
  const kyc = ruleAt("kyc.required_activities");
  const level = (value: string) => t(`levels.${value}`);
  const pct = (part: number) => Math.round((part / stats.buyers) * 100);
  return (
    <div className="blocks cp-two">
      <section className="block" aria-labelledby="cp-post-h">
        <h2 id="cp-post-h" className="h2">
          {t("title")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <div className="card cp-pad">
          <p className="cp-readonly">
            <span>{t("comments")}</span> <b>{level(policies["posting.comments"])}</b>{" "}
            <Link href="/marketing/comments/settings">{t("commentsWhere")}</Link>
          </p>
          <InlineForm
            action={savePolicies}
            submit={t("save")}
            done={t("saved")}
            fields={[
              {
                kind: "select",
                name: "posting.reviews",
                label: t("reviews"),
                defaultValue: policies["posting.reviews"],
                options: LEVELS.map((v) => ({ value: v, label: level(v) })),
              },
              {
                kind: "select",
                name: "posting.livestream",
                label: t("livestream"),
                defaultValue: policies["posting.livestream"],
                options: LEVELS.map((v) => ({ value: v, label: level(v) })),
                hint: t("livestreamHint"),
              },
              {
                kind: "number",
                name: "posting.max_accounts_per_phone",
                label: t("maxAccounts"),
                defaultValue: String(policies["posting.max_accounts_per_phone"]),
                hint: t("maxHint"),
              },
            ]}
          />
        </div>
        <Basis rule={ruleAt("posting.verification")} />
        {kyc ? (
          <p className="fhint">
            {t("kycFrom")} <Day value={kyc.effective_from} /> · {kyc.legal_basis}
          </p>
        ) : null}
      </section>

      <section className="block" aria-labelledby="cp-buyers-h">
        <h2 id="cp-buyers-h" className="h2">
          {t("buyers")}
        </h2>
        <div className="card cp-pad meters">
          {(
            [
              ["phone", stats.phone_verified],
              ["identity", stats.identity_verified],
            ] as const
          ).map(([kind, count]) => (
            <div key={kind} className="meter">
              <div className="meter-head">
                <span>{t(`verified.${kind}`)}</span>
                <b>
                  {formatCount(count, locale)} / {formatCount(stats.buyers, locale)}
                </b>
              </div>
              <progress
                className="bar"
                max={100}
                value={pct(count)}
                aria-label={t(`verified.${kind}`)}
              />
              <span className="fhint">{t(`verifiedNote.${kind}`)}</span>
            </div>
          ))}
        </div>
        <p className="note">
          <b>{t("guestsTitle")}</b> {t("guests")}
        </p>
      </section>
    </div>
  );
}
