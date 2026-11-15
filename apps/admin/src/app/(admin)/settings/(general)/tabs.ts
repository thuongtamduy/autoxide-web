import "server-only";

import {
  AUDIT_READ,
  BILLING_READ,
  DEVTOOLS_READ,
  DOMAINS_MANAGE,
  MODULES_READ,
  TENANT_SETTINGS_MANAGE,
  USERS_READ,
  WEBHOOKS_MANAGE,
} from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";

export interface GeneralTab {
  id: string;
  href: string;
  /** Bước của core mà tab đang chờ (dữ liệu mẫu, W-006); không có = API thật. */
  sample?: string;
  /** Tab là link sang màn khác (Nhân sự → Tổ chức › Người dùng). */
  external?: boolean;
}

// Thứ tự theo bản thiết kế: gói, tên miền, kết nối, module, job, nhân sự, webhook, audit.
const TABS: (GeneralTab & { permission: string })[] = [
  { id: "plan", href: "/settings/plan", permission: BILLING_READ, sample: "35" },
  { id: "domains", href: "/settings/domains", permission: DOMAINS_MANAGE, sample: "33" },
  { id: "connections", href: "/settings/connections", permission: TENANT_SETTINGS_MANAGE },
  { id: "modules", href: "/settings/modules", permission: MODULES_READ },
  { id: "jobs", href: "/settings/jobs", permission: DEVTOOLS_READ, sample: "52" },
  { id: "staff", href: "/org/access/users", permission: USERS_READ, external: true },
  { id: "webhooks", href: "/settings/webhooks", permission: WEBHOOKS_MANAGE },
  { id: "audit", href: "/settings/audit", permission: AUDIT_READ },
];

/**
 * Tab của Cài đặt chung người xem được dùng: có permission của tab; tab dữ liệu mẫu chỉ khi bật dữ
 * liệu mẫu. Core vẫn kiểm quyền ở từng lời gọi.
 */
export async function generalTabs(): Promise<GeneralTab[]> {
  const sample = sampleDataEnabled();
  const allowed = await Promise.all(TABS.map((tab) => can(tab.permission)));
  return TABS.filter((tab, index) => allowed[index] && (!tab.sample || sample)).map(
    ({ permission: _permission, ...tab }) => tab,
  );
}
