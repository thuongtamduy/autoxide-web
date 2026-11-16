import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { CreatePromotionDialog } from "@/components/promotions/forms";
import { SampleBadge } from "@/components/sample-badge";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import {
  PROMOTIONS_CODES_MANAGE,
  PROMOTIONS_COMPLIANCE,
  PROMOTIONS_READ,
  PROMOTIONS_WRITE,
} from "@/lib/promotions";
import { can } from "@/lib/viewer";
import { defaultWindow, ENDPOINTS_43, orgOptions } from "./shared";
import "@/components/catalog/catalog.css";
import "@/components/promotions/promotions.css";

// Màn "Khuyến mại": cả màn dựng bằng dữ liệu mẫu (W-006, W-015) vì core chưa có module `promotions`
// (bước 43). Mỗi tab một đường dẫn con; chi tiết một chương trình mở bằng `?open=<id>` ngay dưới dòng.
export default async function PromotionsLayout({ children }: { children: ReactNode }) {
  const gate = await commerceGate(PROMOTIONS_READ);
  if (gate) return gate;
  const t = await getTranslations("promotions");
  const [write, codes, compliance, orgs] = await Promise.all([
    can(PROMOTIONS_WRITE),
    can(PROMOTIONS_CODES_MANAGE),
    can(PROMOTIONS_COMPLIANCE),
    orgOptions(),
  ]);
  const window = defaultWindow();
  const tabs: PageTab[] = [
    { href: "/marketing/promotions", label: t("tabs.programs") },
    ...(codes ? [{ href: "/marketing/promotions/codes", label: t("tabs.codes") }] : []),
    { href: "/marketing/promotions/flash", label: t("tabs.flash") },
    ...(compliance ? [{ href: "/marketing/promotions/notice", label: t("tabs.notice") }] : []),
    { href: "/marketing/promotions/versions", label: t("tabs.versions") },
  ];
  return (
    <div className="page cat-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb ell">{t("crumb")}</span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description")}</p>
          <span className="cat-sample">
            <SampleBadge step="43" endpoint={ENDPOINTS_43} />
          </span>
        </div>
        <div className="headacts">
          <Link className="btn" href="/marketing/promotions#evaluate">
            {t("evaluateButton")}
          </Link>
          {write ? (
            <CreatePromotionDialog orgs={orgs} starts={window.starts} ends={window.ends} />
          ) : null}
        </div>
      </section>
      <PageTabs tabs={tabs} label={t("tabs.label")} />
      {children}
    </div>
  );
}
