import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { PlatformHead } from "@/components/platform/common";
import { PageTabs } from "@/components/ui/page-tabs";
import { PLANS_READ } from "@/lib/permissions";

const ENDPOINTS =
  "GET/POST /api/v1/plans/plans, GET/PUT /api/v1/plans/plans/{id}, POST …/{id}/retire, POST …/{id}/prices, POST /api/v1/plans/prices/{id}/deactivate, GET/POST/DELETE /api/v1/plans/tenants/{id}/overrides (bước 35)";

// Màn "Gói và giá" (dữ liệu mẫu, W-014): gói là dữ liệu — module, tính năng, hạn mức, giá theo kỳ;
// tab "Ghi đè cho từng khách". Mỗi tab một đường dẫn con.
export default async function PlansLayout({ children }: { children: ReactNode }) {
  const gate = await sampleGate(PLANS_READ);
  if (gate) return gate;
  const t = await getTranslations("platform.plans");
  return (
    <div className="page">
      <PlatformHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("description")}
        step="35"
        endpoint={ENDPOINTS}
      />
      <PageTabs
        label={t("tabs")}
        tabs={[
          { href: "/platform/plans", label: t("tabPlans") },
          { href: "/platform/plans/overrides", label: t("tabOverrides") },
        ]}
      />
      {children}
    </div>
  );
}
