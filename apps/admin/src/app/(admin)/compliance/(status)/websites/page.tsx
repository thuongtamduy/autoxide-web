import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { decideDossier, submitDossier } from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis, Day, TONE_BADGE } from "@/components/compliance/common";
import { Icon } from "@/components/shell/icon";
import { FormDialog } from "@/components/ui/form-dialog";
import { Time } from "@/components/ui/time";
import { LEGAL_MANAGE, LEGAL_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import {
  type ChecklistResult,
  type ComplianceWebsite,
  getChecklist,
  listComplianceWebsites,
  moitDuty,
} from "@/sample/compliance";
import { dayOf, ruleAt, ruleHistory } from "@/sample/compliance-rules";

const STATUS_TONE = {
  not_submitted: "bad",
  submitted: "info",
  needs_supplement: "warn",
  notified: "ok",
  registered: "ok",
  rejected: "bad",
} as const;

const RESULT = {
  met: { tone: "ok", icon: "check" },
  missing: { tone: "bad", icon: "x" },
  unknown: { tone: "warn", icon: "info" },
  manual: { tone: "info", icon: "info" },
} as const;

/** Chỗ sửa một mục còn thiếu. */
function fixHref(item: ChecklistResult, site: ComplianceWebsite): string | null {
  if (item.type === "page") return `/content?site=${site.id}`;
  if (item.type === "profile_field" || item.type === "policy") return "/compliance/records";
  if (item.type === "document") return "/compliance/records/documents";
  if (item.type === "kyc") return "/compliance/kyc";
  return null;
}

// Tab "Website TMĐT": mỗi tên miền một hồ sơ. Website bán hàng thông báo, sàn đăng ký với Bộ Công
// Thương. Danh sách kiểm là bản đang có hiệu lực của bộ quy định; nộp hồ sơ do người làm trên cổng
// của Bộ, ở đây chỉ ghi lại (không hoàn tác được nên có hộp xác nhận).
export default async function WebsitesTab() {
  const gate = await sampleGate(LEGAL_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.websites");
  const [{ data: sites }, manage, locale] = await Promise.all([
    listComplianceWebsites(),
    can(LEGAL_MANAGE),
    getLocale(),
  ]);
  const lists = await Promise.all(sites.map((site) => getChecklist(site.id)));
  const title = (text: { en: string; vi: string }) => (locale === "vi" ? text.vi : text.en);
  return (
    <div className="blocks">
      {sites.map((site, index) => {
        const list = lists[index];
        if (!list?.ok) return null;
        const items = list.data.items;
        const met = items.filter((i) => i.result === "met").length;
        const missing = items.filter((i) => i.result === "missing").length;
        const duty = moitDuty(site.website_kind);
        const rule = ruleAt(list.data.rule_key);
        const older = ruleHistory(list.data.rule_key).filter(
          (r) => r.version !== list.data.version,
        );
        const accepted = site.website_kind === "sales" ? "notified" : "registered";
        const headingId = `cp-site-${index}`;
        return (
          <section key={site.id} className="block card cp-site" aria-labelledby={headingId}>
            <div className="block-head">
              <h2 id={headingId} className="h2 mono ell">
                {site.domain}
              </h2>
              <span className={TONE_BADGE[STATUS_TONE[site.moit_status]]}>
                <span className="dot" />
                {t(`status.${site.moit_status}`)}
              </span>
            </div>
            <p className="fhint">
              {t(`kind.${site.website_kind}`)} · {t("owner", { unit: site.org.name })} ·{" "}
              <b>{t(`duty.${duty}`)}</b>
            </p>
            <div className="meter">
              <div className="meter-head">
                <span>{t("progress")}</span>
                <b>{t("count", { met, total: items.length })}</b>
              </div>
              <progress className="bar" max={items.length} value={met} aria-label={t("progress")} />
            </div>
            <ul className="cp-check">
              {items.map((item) => {
                const look = RESULT[item.result];
                const href = item.result === "met" ? null : fixHref(item, site);
                return (
                  <li key={item.key} className={`tone-${look.tone}`}>
                    <span className="cp-check-ic" aria-hidden="true">
                      <Icon name={look.icon} />
                    </span>
                    <span className="cp-check-main">
                      <span>{title(item.title)}</span>
                      <span className="sub">
                        {t(`result.${item.result}`)}
                        {item.reason ? ` · ${t(`reason.${item.reason}`)}` : ""}
                      </span>
                    </span>
                    {href ? (
                      <Link className="btn sm" href={href}>
                        {t("fix")}
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <Basis rule={rule} lead={t("checklistVersion", { version: list.data.version })} />
            {older.map((r) => (
              <p key={r.version} className="fhint">
                {t("older", { version: r.version })} <Day value={r.effective_from} /> –{" "}
                {r.effective_to ? <Day value={r.effective_to} /> : null} · {r.legal_basis}
              </p>
            ))}
            {site.moit_reference || site.logo_link_url ? (
              <dl className="eg-facts">
                {site.moit_reference ? (
                  <div>
                    <dt>{t("reference")}</dt>
                    <dd className="mono">{site.moit_reference}</dd>
                  </div>
                ) : null}
                {site.submitted_at ? (
                  <div>
                    <dt>{t("submittedAt")}</dt>
                    <dd>
                      <Day value={site.submitted_at} />
                    </dd>
                  </div>
                ) : null}
                {site.logo_link_url ? (
                  <div>
                    <dt>{t("logo")}</dt>
                    <dd className="mono ell">{site.logo_link_url}</dd>
                  </div>
                ) : null}
                {site.decided_at ? (
                  <div>
                    <dt>{t("decidedAt")}</dt>
                    <dd>
                      <Time value={site.decided_at} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <p className="fhint">{t(`foot.${site.moit_status}`)}</p>
            <div className="eg-acts">
              <a
                className={missing > 0 ? "btn" : "btn pri"}
                href={`/compliance/websites/${site.id}/dossier`}
                download
              >
                <Icon name="down" />
                {t("download")}
              </a>
              {manage && ["not_submitted", "needs_supplement"].includes(site.moit_status) ? (
                <FormDialog
                  action={submitDossier}
                  label={t("submit.button")}
                  triggerClass="btn pri"
                  title={t("submit.title", { domain: site.domain })}
                  points={[
                    t("submit.portal"),
                    t("submit.final"),
                    ...(missing > 0 ? [t("submit.missing", { count: missing })] : []),
                  ]}
                  submit={t("submit.submit")}
                  done={t("submit.done", { domain: site.domain })}
                  fields={[
                    { kind: "hidden", name: "website_id", value: site.id },
                    { kind: "text", name: "reference", label: t("submit.reference"), mono: true },
                    {
                      kind: "date",
                      name: "submitted_on",
                      label: t("submit.date"),
                      defaultValue: dayOf(),
                    },
                    { kind: "check", name: "acknowledged", label: t("submit.ack") },
                  ]}
                />
              ) : null}
              {manage && site.moit_status === "submitted" ? (
                <FormDialog
                  action={decideDossier}
                  label={t("decide.button")}
                  title={t("decide.title", { domain: site.domain })}
                  intro={t("decide.intro")}
                  submit={t("decide.submit")}
                  done={t("decide.done")}
                  fields={[
                    { kind: "hidden", name: "website_id", value: site.id },
                    {
                      kind: "select",
                      name: "status",
                      label: t("decide.status"),
                      options: [accepted, "needs_supplement", "rejected"].map((value) => ({
                        value,
                        label: t(`status.${value}`),
                      })),
                    },
                    {
                      kind: "text",
                      name: "link_url",
                      label: t("decide.link"),
                      mono: true,
                      hint: t("decide.linkHint"),
                    },
                    { kind: "text", name: "image_url", label: t("decide.image"), mono: true },
                  ]}
                />
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
