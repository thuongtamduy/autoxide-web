import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Forbidden } from "@/components/engage/common";
import { JournalEntryDialog } from "@/components/finance/forms";
import { SampleBadge } from "@/components/sample-badge";
import { FormDialog } from "@/components/ui/form-dialog";
import { type PageTab, PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import { FINANCE_PERMISSIONS, INVOICES_EXPORT, LEDGER_POST, LEDGER_READ } from "@/lib/finance";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { financeCounts, listAccounts, listEntries, monthBounds, monthOf } from "@/sample/finance";
import { invoiceCounts } from "@/sample/finance-invoices";
import { vietnamDay } from "@/sample/tax";
import { createExportAction } from "./actions";
import { accountNamer, ENDPOINTS, FINANCE_TABS } from "./shared";
import "@/components/catalog/catalog.css";
import "@/components/compliance/compliance.css";
import "@/components/engage/engage.css";
import "@/components/finance/finance.css";

// Màn "Kế toán": cả màn dựng bằng dữ liệu mẫu (W-006, W-016) vì core chưa có module `tax`, `ledger`,
// `invoices` (bước 36). Mỗi tab một đường dẫn con; tab chỉ hiện khi người xem có permission đọc của
// nó. Tắt dữ liệu mẫu thì màn không tồn tại.
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  if (!sampleDataEnabled()) notFound();
  if (!(await can(FINANCE_PERMISSIONS))) return <Forbidden permission={LEDGER_READ} />;
  const [t, locale] = await Promise.all([getTranslations("finance"), getLocale()]);
  const [allowed, post, exporter, counts, invoices] = await Promise.all([
    Promise.all(FINANCE_TABS.map(([, , permission]) => can(permission))),
    can(LEDGER_POST),
    can(INVOICES_EXPORT),
    financeCounts(),
    invoiceCounts(),
  ]);
  const badge: Partial<Record<(typeof FINANCE_TABS)[number][0], number>> = {
    exceptions: counts.exceptions,
    einvoices: invoices.rejected,
    periods: counts.closable,
  };
  const tabs: PageTab[] = FINANCE_TABS.filter((_, index) => allowed[index]).map(([id, href]) => {
    const count = badge[id];
    return { href, label: t(`tabs.${id}`), ...(count ? { badge: String(count) } : {}) };
  });
  const today = vietnamDay();
  let entryDialog: ReactNode = null;
  if (post) {
    const [name, { data: main }, { data: market }, manual] = await Promise.all([
      accountNamer(),
      listAccounts("main"),
      listAccounts("market"),
      listEntries({ filter: "manual", limit: 500 }),
    ]);
    // Gợi ý mã tham chiếu kế tiếp theo dạng của bản thiết kế (BT-YYMM-NNNN); người ghi sửa được.
    const prefix = `BT-${today.slice(2, 4)}${today.slice(5, 7)}-`;
    const last = manual.data
      .map((e) => e.reference)
      .filter((r) => r.startsWith(prefix))
      .map((r) => Number(r.slice(prefix.length)))
      .reduce((a, b) => Math.max(a, b), 0);
    const options = (list: typeof main) =>
      list
        .map((a) => ({ value: a.id, label: name(a) }))
        .sort((x, y) => x.label.localeCompare(y.label, locale));
    entryDialog = (
      <JournalEntryDialog
        books={[
          { value: "main", label: t("books.main") },
          { value: "market", label: t("books.market") },
        ]}
        accounts={{ main: options(main), market: options(market) }}
        today={today}
        reference={`${prefix}${String(last + 1).padStart(4, "0")}`}
      />
    );
  }
  const month = monthBounds(monthOf(today));
  return (
    <ToastProvider>
      <div className="page fin-page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{t("crumb")}</span>
            <h1 className="h1">{t("title")}</h1>
            <p className="pdesc">{t("description")}</p>
            <span className="cat-sample">
              <SampleBadge step="36" endpoint={Object.values(ENDPOINTS).join("; ")} />
            </span>
          </div>
          {entryDialog || exporter ? (
            <div className="headacts">
              {exporter ? (
                <FormDialog
                  action={createExportAction}
                  label={t("export.button")}
                  title={t("export.title")}
                  intro={t("export.intro")}
                  submit={t("export.submit")}
                  done={t("export.done")}
                  triggerClass="btn"
                  fields={[
                    {
                      kind: "select",
                      name: "profile",
                      label: t("export.profile"),
                      options: [
                        { value: "generic_journal", label: t("export.profiles.generic_journal") },
                        {
                          value: "generic_documents",
                          label: t("export.profiles.generic_documents"),
                        },
                      ],
                    },
                    {
                      kind: "select",
                      name: "format",
                      label: t("export.format"),
                      options: [
                        { value: "csv", label: "CSV" },
                        { value: "xlsx", label: "XLSX" },
                      ],
                    },
                    {
                      kind: "date",
                      name: "period_from",
                      label: t("export.from"),
                      defaultValue: month.starts_on,
                    },
                    { kind: "date", name: "period_to", label: t("export.to"), defaultValue: today },
                  ]}
                />
              ) : null}
              {entryDialog}
            </div>
          ) : null}
        </section>
        <PageTabs tabs={tabs} label={t("tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
