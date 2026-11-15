import "server-only";

// Việc thiết lập theo mô hình kinh doanh (bước 51 P10 của core, `SetupStep`; W-020): mỗi bước có trạng
// thái tính từ dữ liệu (không có ô "đánh dấu xong"); bước pháp lý chặn bán được đánh dấu `blocking`.
// Bước chỉ hiện khi áp dụng cho khách (có website bán hàng, có sàn) và người xem có permission của nó.
// Core chưa có `GET /api/v1/kernel/setup` và các module nguồn (bước 33, 37): đọc dữ liệu mẫu.
import { DOMAINS_MANAGE, LEGAL_READ, TENANT_SETTINGS_MANAGE } from "@/lib/permissions";
import { listComplianceWebsites, listLegalProfiles } from "@/sample/compliance";
import { listWebsites, websiteChecklist } from "@/sample/content";
import type { ConnectionId } from "@/sample/settings";
import { CONNECTION_SETTINGS, listConnections, listDomains } from "@/sample/settings";
import { visibleSources } from "./registry";
import type { SetupView, WorkContext, WorkMessage } from "./types";

export const SETUP_ENDPOINT = "GET /api/v1/kernel/setup";

interface SetupStep {
  id: string;
  permission: readonly string[];
  sample: { step: string; endpoint: string };
  href: string;
  /** Bước pháp lý: chưa xong thì chưa được bán. */
  blocking: boolean;
  /** `null` = bước không áp dụng cho khách này (vd không có sàn). */
  state: () => Promise<{ done: boolean; note: WorkMessage | null } | null>;
}

function connection(id: ConnectionId, href: string): SetupStep {
  return {
    id,
    permission: [TENANT_SETTINGS_MANAGE],
    sample: { step: "33", endpoint: `${SETUP_ENDPOINT} · GET /api/v1/kernel/settings` },
    href,
    blocking: false,
    state: async () => {
      const { data } = await listConnections();
      const found = data.find((c) => c.id === id);
      const required = CONNECTION_SETTINGS[id].filter((s) => s.required).map((s) => s.name);
      const set = new Set(found?.settings.filter((s) => s.is_set).map((s) => s.name) ?? []);
      const missing = required.filter((name) => !set.has(name)).length;
      if (missing > 0) return { done: false, note: { key: "setup.notes.notConnected" } };
      if (found?.last_check && !found.last_check.ok) {
        return { done: false, note: { key: "setup.notes.checkFailed" } };
      }
      return { done: true, note: null };
    },
  };
}

function moit(kind: "sales" | "platform"): SetupStep {
  return {
    id: kind === "sales" ? "moitNotify" : "moitRegister",
    permission: [LEGAL_READ],
    sample: { step: "37", endpoint: `${SETUP_ENDPOINT} · GET /api/v1/compliance/websites` },
    href: "/compliance/websites",
    blocking: true,
    state: async () => {
      const { data } = await listComplianceWebsites();
      const sites = data.filter((s) => s.website_kind === kind);
      if (sites.length === 0) return null;
      const open = sites.filter((s) => !["notified", "registered"].includes(s.moit_status));
      if (open.length === 0) return { done: true, note: null };
      return {
        done: false,
        note: {
          key: "setup.notes.moit",
          params: { domain: open[0]?.domain ?? "", status: open[0]?.moit_status ?? "" },
        },
      };
    },
  };
}

const STEPS: readonly SetupStep[] = [
  {
    id: "owner",
    permission: [LEGAL_READ],
    sample: { step: "37", endpoint: `${SETUP_ENDPOINT} · GET /api/v1/compliance/legal-profiles` },
    href: "/compliance/records",
    blocking: true,
    state: async () => {
      const { data } = await listLegalProfiles();
      const tenant = data.find((p) => p.org_id === null);
      const done = Boolean(tenant?.tax_code && tenant.legal_name && tenant.address.line);
      return { done, note: done ? null : { key: "setup.notes.owner" } };
    },
  },
  {
    id: "pages",
    permission: [LEGAL_READ],
    sample: {
      step: "37",
      endpoint: `${SETUP_ENDPOINT} · GET /api/v1/compliance/websites/{id}/checklist`,
    },
    href: "/content",
    blocking: true,
    state: async () => {
      const { data: sites } = await listWebsites();
      let missing = 0;
      for (const site of sites) {
        const list = await websiteChecklist(site.id);
        if (list.ok) missing += list.data.pages.filter((p) => p.status !== "published").length;
      }
      return missing === 0
        ? { done: true, note: null }
        : { done: false, note: { key: "setup.notes.pages", params: { missing } } };
    },
  },
  moit("sales"),
  moit("platform"),
  connection("payment", "/settings/connections"),
  connection("einvoice", "/settings/connections"),
  connection("sms", "/settings/connections"),
  {
    id: "domain",
    permission: [DOMAINS_MANAGE],
    sample: { step: "33", endpoint: `${SETUP_ENDPOINT} · GET /api/v1/kernel/domains` },
    href: "/settings/domains",
    blocking: false,
    state: async () => {
      const { data } = await listDomains();
      const verified = data.some((d) => d.status === "verified");
      return verified
        ? { done: true, note: null }
        : { done: false, note: { key: "setup.notes.domain" } };
    },
  },
];

/**
 * Các bước thiết lập người xem dùng được: chưa xong trước (bước chặn bán trước nhất), rồi bước đã xong.
 * Bước không áp dụng cho khách (trả `null`) thì bỏ.
 */
export async function readSetup(ctx: WorkContext): Promise<SetupView[]> {
  const shown = visibleSources(STEPS, ctx);
  const states = await Promise.all(shown.map((step) => step.state()));
  const out: SetupView[] = [];
  shown.forEach((step, index) => {
    const state = states[index];
    if (!state) return;
    out.push({
      id: step.id,
      done: state.done,
      blocking: step.blocking,
      note: state.note,
      href: step.href,
    });
  });
  return out.sort(
    (a, b) => Number(a.done) - Number(b.done) || Number(b.blocking) - Number(a.blocking),
  );
}
