import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Forbidden } from "@/components/engage/common";
import { SampleBadge } from "@/components/sample-badge";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { CASES_READ, DOCUMENTS_READ, KYC_READ, LEGAL_READ, PRIVACY_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { getOverview } from "@/sample/compliance";
import { RULESET } from "@/sample/compliance-rules";

const ENDPOINTS =
  "GET /api/v1/compliance/websites, …/checklist, …/dossier, POST …/status; GET /api/v1/compliance/kyc/profiles, POST …/approve, …/reject; GET/POST /api/v1/compliance/incidents; GET /api/v1/compliance/documents; GET /api/v1/compliance/cases; GET /api/v1/compliance/rules";

// Màn "Tình trạng tuân thủ": mỗi tab một nghĩa vụ theo luật, mỗi tab một đường dẫn con. Tab chỉ hiện
// khi người xem có permission đọc của nó (permission dự kiến của bước 37; admin có sẵn).
export default async function StatusLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("compliance");
  const tabs: [string, string, string][] = [
    ["status", "/compliance", ""],
    ["websites", "/compliance/websites", LEGAL_READ],
    ["kyc", "/compliance/kyc", KYC_READ],
    ["privacy", "/compliance/privacy", PRIVACY_READ],
    ["documents", "/compliance/documents", DOCUMENTS_READ],
    ["reports", "/compliance/reports", CASES_READ],
  ];
  const allowed = await Promise.all(
    tabs.map(([, , permission]) =>
      permission
        ? can(permission)
        : can([LEGAL_READ, KYC_READ, PRIVACY_READ, DOCUMENTS_READ, CASES_READ]),
    ),
  );
  if (!allowed[0]) return <Forbidden permission={LEGAL_READ} />;
  const { data: tiles } = await getOverview();
  const open = new Map(tiles.map((tile) => [tile.area, tile.open]));
  const shown: PageTab[] = tabs
    .filter((_, index) => allowed[index])
    .map(([id, href]) => {
      const count = open.get(id as "kyc");
      return {
        href,
        label: t(`tabs.${id}`),
        ...(count ? { badge: String(count) } : {}),
      };
    });
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
      </section>
      <PageTabs tabs={shown} label={t("tabs.label")} />
      {children}
    </div>
  );
}
