import "server-only";

import {
  CHANNELS_FINANCE_READ,
  CHANNELS_MANAGE,
  CHANNELS_ORDERS_MANAGE,
  CHANNELS_READ,
  ORDERS_REPORTS_READ,
} from "@/lib/channels";
import { allVariants } from "@/sample/catalog";
import { listAccounts, ownerOptions } from "@/sample/channels";

// Phần dùng chung của màn "Kênh bán" (máy chủ).

/** Endpoint còn thiếu của bước 48, ghi vào nhãn "Dữ liệu mẫu" (W-006). */
export const ENDPOINTS_48 =
  "GET /api/v1/channels/connectors, /accounts, POST /accounts, /accounts/{id}/pause|resume|disconnect|sync, /accounts/{id}/listings, /allocations, /stock-preview, /inbound-orders, /inbound-orders/{id}/mapping|retry|resolve, /settlements, /settlement-lines/{id}/resolve, /settlements/summary, /reports/channels";

/** Permission của từng tab. Báo cáo cần thêm `orders.reports.read` (đặc tả 48). */
export const CHANNEL_TABS = {
  accounts: CHANNELS_READ,
  listings: CHANNELS_READ,
  stock: [CHANNELS_MANAGE, CHANNELS_READ],
  inbound: CHANNELS_ORDERS_MANAGE,
  settlements: CHANNELS_FINANCE_READ,
  report: ORDERS_REPORTS_READ,
} as const;

export async function accountOptions(): Promise<{ value: string; label: string }[]> {
  const { data } = await listAccounts();
  return data
    .filter((a) => a.status !== "unavailable" && a.status !== "disconnected")
    .map((a) => ({ value: a.id, label: a.name }));
}

export async function variantOptions(): Promise<{ value: string; label: string }[]> {
  const { data } = await allVariants();
  return data
    .filter((v) => v.kind === "physical" || v.kind === "bundle")
    .map((v) => ({
      value: v.sku,
      label: `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""} · ${v.sku}`,
    }));
}

export async function ownerOrgOptions(): Promise<{ value: string; label: string }[]> {
  return (await ownerOptions()).map((u) => ({ value: u.id, label: u.name }));
}
