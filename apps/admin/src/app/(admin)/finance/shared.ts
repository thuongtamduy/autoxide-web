import "server-only";

import { getTranslations } from "next-intl/server";
import { INVOICES_EXPORT, INVOICES_READ, LEDGER_READ, TAX_READ } from "@/lib/finance";
import type { BookKey, LedgerAccount } from "@/sample/finance";

// Phần dùng chung của các trang trong màn "Kế toán" (máy chủ).

/** Endpoint còn thiếu của bước 36, ghi vào nhãn "Dữ liệu mẫu" (W-006) của từng tab. */
export const ENDPOINTS = {
  ledger:
    "GET /api/v1/ledger/books, /accounts, /entries, /trial-balance; POST /api/v1/ledger/entries, /entries/{id}/reverse",
  exceptions:
    "GET /api/v1/ledger/exceptions, POST /exceptions/{id}/resolve; GET/POST /api/v1/ledger/reconciliations; GET /api/v1/ledger/payments",
  bank: "GET/POST /api/v1/ledger/bank-accounts, PATCH /bank-accounts/{id}; POST /api/v1/ledger/payments (qr_payload)",
  einvoices:
    "GET /api/v1/invoices/documents, PATCH /documents/{id}, POST /documents/{id}/issue, /adjust, /replace, /cancel",
  series:
    "GET/POST /api/v1/invoices/series, PATCH /series/{id}; GET/POST /api/v1/invoices/mandates, POST /mandates/{id}/revoke",
  tax: "GET /api/v1/tax/rates, /packs, /profiles, PUT /profiles/{org_id}, POST /api/v1/tax/quote",
  periods: "GET /api/v1/ledger/periods, POST /periods/{id}/close",
  export: "POST /api/v1/invoices/exports, GET /exports/{id}, GET /exports/{id}/download",
} as const;

/** Khoá của chữ theo mục đích tài khoản: `cash.bank` → `cash_bank` (dấu chấm là tầng của next-intl). */
export const purposeKey = (purpose: string) => purpose.replaceAll(".", "_");

/** Tên tài khoản cho người đọc: tên mục đích theo ngôn ngữ, kèm đối tượng nếu có. */
export async function accountNamer(): Promise<(account: LedgerAccount | undefined) => string> {
  const t = await getTranslations("finance.purposes");
  return (account) => {
    if (!account) return "—";
    const key = purposeKey(account.purpose);
    const name = t.has(key) ? t(key) : account.purpose;
    return account.counterparty ? `${name} — ${account.counterparty.name}` : name;
  };
}

/** Sổ từ tham số `?book=` của địa chỉ; mặc định sổ của gốc khách. */
export function bookOf(value: string | string[] | undefined): BookKey {
  return value === "market" ? "market" : "main";
}

/** Tab của màn, theo thứ tự của bản thiết kế, kèm permission để xem tab đó. */
export const FINANCE_TABS = [
  ["ledger", "/finance", LEDGER_READ],
  ["exceptions", "/finance/exceptions", LEDGER_READ],
  ["bank", "/finance/bank", LEDGER_READ],
  ["einvoices", "/finance/einvoices", INVOICES_READ],
  ["series", "/finance/series", INVOICES_READ],
  ["tax", "/finance/tax", TAX_READ],
  ["periods", "/finance/periods", LEDGER_READ],
  ["export", "/finance/export", INVOICES_EXPORT],
] as const;
