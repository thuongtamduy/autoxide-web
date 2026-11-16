import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Forbidden } from "@/components/engage/common";
import { SampleBadge } from "@/components/sample-badge";
import { FormDialog } from "@/components/ui/form-dialog";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import {
  ENDPOINTS_46,
  MARKET_PERMISSIONS,
  MARKETPLACE_SELLERS_MANAGE,
  MARKETPLACE_SELLERS_READ,
} from "@/lib/market";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { listDisputes, listListingReviews, SELLER_TYPES, sellerCounts } from "@/sample/market";
import { inviteSellerAction } from "./actions";
import { MARKET_TABS } from "./shared";
import "@/components/catalog/catalog.css";
import "@/components/compliance/compliance.css";
import "@/components/engage/engage.css";
import "@/components/market/market.css";

// Màn "Vận hành sàn": cả màn dựng bằng dữ liệu mẫu (W-006, W-018) vì core chưa có module
// `marketplace` (bước 46). Mỗi tab một đường dẫn con, chỉ hiện khi người xem có permission của nó.
// Người bán là nút `seller` của cây tổ chức mẫu; KYC và văn bản đã chấp nhận đọc từ Tuân thủ mẫu.
export default async function MarketLayout({ children }: { children: ReactNode }) {
  if (!sampleDataEnabled()) notFound();
  if (!(await can(MARKET_PERMISSIONS))) return <Forbidden permission={MARKETPLACE_SELLERS_READ} />;
  const t = await getTranslations("market");
  const [allowed, manage, preview, counts, { data: listings }, { data: disputes }] =
    await Promise.all([
      Promise.all(MARKET_TABS.map(([, , permission]) => can(permission))),
      can(MARKETPLACE_SELLERS_MANAGE),
      can(MARKETPLACE_SELLERS_READ),
      sellerCounts(),
      listListingReviews({ status: "pending" }),
      listDisputes({ status: "escalated" }),
    ]);
  // Số việc đang chờ cạnh tên tab, như bản thiết kế.
  const badge: Partial<Record<(typeof MARKET_TABS)[number][0], number>> = {
    sellers: counts.pending_review,
    listings: listings.length,
    disputes: disputes.length,
  };
  const tabs: PageTab[] = MARKET_TABS.filter((_, index) => allowed[index]).map(([id, href]) => {
    const count = badge[id];
    return { href, label: t(`tabs.${id}`), ...(count ? { badge: String(count) } : {}) };
  });
  return (
    <ToastProvider>
      <div className="page mk-page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{t("crumb")}</span>
            <h1 className="h1">{t("title")}</h1>
            <p className="pdesc">{t("description")}</p>
            <span className="cat-sample">
              <SampleBadge step="46" endpoint={ENDPOINTS_46} />
            </span>
          </div>
          {manage || preview ? (
            <div className="headacts">
              {manage ? (
                <FormDialog
                  action={inviteSellerAction}
                  label={t("invite.button")}
                  title={t("invite.title")}
                  intro={t("invite.intro")}
                  submit={t("invite.submit")}
                  done={t("invite.done")}
                  triggerClass="btn pri"
                  fields={[
                    {
                      kind: "email",
                      name: "email",
                      label: t("invite.email"),
                      placeholder: "lien-he@example.com",
                    },
                    {
                      kind: "select",
                      name: "seller_type",
                      label: t("invite.type"),
                      defaultValue: "household",
                      options: SELLER_TYPES.map((type) => ({
                        value: type,
                        label: t(`sellerType.${type}`),
                      })),
                    },
                    {
                      kind: "textarea",
                      name: "note",
                      label: t("invite.note"),
                      hint: t("invite.noteHint"),
                    },
                  ]}
                />
              ) : null}
              {preview ? (
                <Link className="btn" href="/seller">
                  {t("previewLink")}
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
        <PageTabs tabs={tabs} label={t("tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
