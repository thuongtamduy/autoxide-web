import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { NewProductDialog } from "@/components/catalog/forms";
import { SampleBadge } from "@/components/sample-badge";
import { Icon } from "@/components/shell/icon";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import { CATALOG_IMPORT, CATALOG_PRODUCTS_READ, CATALOG_PRODUCTS_WRITE } from "@/lib/catalog";
import { can } from "@/lib/viewer";
import { commerceGate } from "../gate";
import { ENDPOINTS_41, newProductOptions } from "../shared";
import "@/components/catalog/catalog.css";

// Màn "Sản phẩm và giá": cả màn dựng bằng dữ liệu mẫu (W-006) vì core chưa có module `catalog`
// (bước 41). Mỗi tab một đường dẫn con; trang chi tiết sản phẩm nằm ở `/catalog/products/{id}`
// (ngoài nhóm tab này).
export default async function CatalogLayout({ children }: { children: ReactNode }) {
  const gate = await commerceGate(CATALOG_PRODUCTS_READ);
  if (gate) return gate;
  const [t, locale] = await Promise.all([getTranslations("catalog"), getLocale()]);
  const [write, importer, options] = await Promise.all([
    can(CATALOG_PRODUCTS_WRITE),
    can(CATALOG_IMPORT),
    newProductOptions(locale),
  ]);
  const tabs: PageTab[] = [
    { href: "/catalog", label: t("tabs.products") },
    { href: "/catalog/categories", label: t("tabs.categories") },
    { href: "/catalog/prices", label: t("tabs.prices") },
    { href: "/catalog/tax", label: t("tabs.tax") },
    { href: "/catalog/imports", label: t("tabs.imports") },
  ];
  return (
    <ToastProvider>
      <div className="page cat-page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{t("crumb")}</span>
            <h1 className="h1">{t("title")}</h1>
            <p className="pdesc">{t("description")}</p>
            <span className="cat-sample">
              <SampleBadge step="41" endpoint={ENDPOINTS_41} />
            </span>
          </div>
          {write ? (
            <div className="headacts">
              {importer ? (
                <Link className="btn" href="/catalog/imports#import">
                  <Icon name="upload" />
                  {t("importButton")}
                </Link>
              ) : null}
              <NewProductDialog categories={options.categories} taxes={options.taxes} />
            </div>
          ) : null}
        </section>
        <PageTabs tabs={tabs} label={t("tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
