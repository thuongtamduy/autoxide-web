import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { MessagePanel } from "@/components/message-panel";
import { PlatformHead } from "@/components/platform/common";
import { PageTabs } from "@/components/ui/page-tabs";
import { PLANS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";

// Màn "Gói và giá" (module `plans` của core, bước 35): gói là dữ liệu — module, tính năng, hạn mức, giá
// theo kỳ; tab "Ghi đè cho từng khách". Mỗi tab một đường dẫn con.
export default async function PlansLayout({ children }: { children: ReactNode }) {
  if (!(await can(PLANS_READ))) {
    const errors = await getTranslations("errors");
    return (
      <MessagePanel
        title={errors("forbiddenTitle")}
        message={errors("forbidden", { permission: PLANS_READ })}
      />
    );
  }
  const t = await getTranslations("platform.plans");
  return (
    <div className="page">
      <PlatformHead crumb={t("crumb")} title={t("title")} description={t("description")} />
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
