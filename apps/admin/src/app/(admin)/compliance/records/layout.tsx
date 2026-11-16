import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Forbidden } from "@/components/engage/common";
import { SampleBadge } from "@/components/sample-badge";
import { Icon } from "@/components/shell/icon";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import {
  CASES_READ,
  DOCUMENTS_READ,
  LEGAL_READ,
  POLICIES_MANAGE,
  PRIVACY_READ,
} from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { RULESET } from "@/sample/compliance-rules";

const ENDPOINTS =
  "GET/PATCH /api/v1/compliance/legal-profiles; GET/POST/PATCH /api/v1/compliance/purposes; GET /api/v1/compliance/retention; GET/PUT /api/v1/compliance/policies; GET/POST /api/v1/compliance/documents/{id}/versions; GET/POST /api/v1/compliance/cases…; subject requests (new)";

// Màn "Hồ sơ và dữ liệu cá nhân": các sổ pháp chế dùng hằng ngày. Mỗi tab một đường dẫn con, chỉ hiện
// khi người xem có permission của nó (permission dự kiến của bước 37; admin có sẵn).
export default async function RecordsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("compliance.records");
  const tabs: [string, string, string][] = [
    ["profile", "/compliance/records", LEGAL_READ],
    ["purposes", "/compliance/records/purposes", PRIVACY_READ],
    ["retention", "/compliance/records/retention", PRIVACY_READ],
    ["posting", "/compliance/records/posting", POLICIES_MANAGE],
    ["documents", "/compliance/records/documents", DOCUMENTS_READ],
    ["cases", "/compliance/records/cases", CASES_READ],
    ["ai", "/compliance/records/ai", CASES_READ],
    ["requests", "/compliance/records/requests", PRIVACY_READ],
  ];
  const allowed = await Promise.all(tabs.map(([, , permission]) => can(permission)));
  if (!allowed.some(Boolean)) return <Forbidden permission={LEGAL_READ} />;
  const shown: PageTab[] = tabs
    .filter((_, index) => allowed[index])
    .map(([id, href]) => ({ href, label: t(`tabs.${id}`) }));
  return (
    <div className="page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb ell">
            {t("crumb", { ruleset: `${RULESET.jurisdiction} · ${RULESET.release}` })}
          </span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description")}</p>
          <span>
            <SampleBadge step="37" endpoint={ENDPOINTS} />
          </span>
        </div>
        {allowed[1] ? (
          <div className="headacts eg-headacts">
            <a className="btn pri" href="/compliance/records/processing-register" download>
              <Icon name="down" />
              {t("export")}
            </a>
          </div>
        ) : null}
      </section>
      <PageTabs tabs={shown} label={t("tabs.label")} />
      {children}
    </div>
  );
}
