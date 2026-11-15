import "server-only";

// Sổ nguồn việc (bước 51 P2 của core, W-020): mỗi phân hệ khai các nguồn của mình — việc tính từ dữ
// liệu của phân hệ, xử lý xong ở nơi gốc thì việc tự biến mất (không có bảng việc riêng).
//
// - Nguồn đọc API thật: bình luận chờ duyệt (`comments`), bài nộp form mới (`forms`), bài chờ duyệt
//   (`content`). Core chưa có số đếm, nên đọc một trang (tối đa 200) và đếm.
// - Nguồn còn lại đọc dữ liệu mẫu của phân hệ (W-006), chờ API của bước ghi ở `sample`.
//
// Khi core có `GET /api/v1/kernel/work` và `/work/counts` thì thay cả file này bằng lời gọi đó; mỗi
// nguồn ở đây tương ứng một `WorkSource` mà module của core sẽ khai.
import { type AutoxideClient, toApiError } from "@autoxide/sdk";
import { cache } from "react";
import { CATALOG_PRODUCTS_WRITE, INVENTORY_ADJUST, INVENTORY_TRANSFER } from "@/lib/catalog";
import { coreClient } from "@/lib/core";
import { COMMENTS_MODERATE, FORMS_REVIEW } from "@/lib/engage";
import {
  INVOICES_ISSUE,
  LEDGER_PERIODS_CLOSE,
  LEDGER_RECONCILE,
  TAX_PROFILES_MANAGE,
} from "@/lib/finance";
import { MARKETPLACE_DISPUTES_RESOLVE } from "@/lib/market";
import { ORDERS_MANAGE, ORDERS_RETURNS_MANAGE } from "@/lib/orders";
import { CONTENT_PUBLISH, INCIDENTS_MANAGE, KYC_REVIEW, LEGAL_MANAGE } from "@/lib/permissions";
import { SHIPPING_COD_MANAGE } from "@/lib/shipping";
import { listApprovals } from "@/sample/agent";
import { productStats } from "@/sample/catalog";
import {
  getChecklist,
  listComplianceWebsites,
  listIncidents,
  listKycProfiles,
} from "@/sample/compliance";
import { financeCounts, listExceptions, listPeriods } from "@/sample/finance";
import { listDocuments } from "@/sample/finance-invoices";
import { inventoryStats } from "@/sample/inventory";
import { listDisputes } from "@/sample/market";
import { ordersState } from "@/sample/orders";
import { codStats } from "@/sample/shipping";
import { expiringRates, listTaxRates } from "@/sample/tax";
import { defineSource } from "./registry";
import type { WorkItem, WorkMessage, WorkSource } from "./types";

const HOUR = 3_600_000;
/** Một trang của core (tối đa 200 dòng): số đếm của nguồn thật dừng ở đây, hiện "200+". */
const PAGE = 200;

/**
 * Hạn gợi ý cho việc không có hạn trong dữ liệu (dự kiến, mỗi module của core tự khai hạn của nguồn):
 * đơn chờ nhận theo chính sách `acceptance_hours` (24 giờ, mục H2 của `ui-trace-roadmap.md`), bình
 * luận một ngày, bài nộp và bài chờ duyệt hai ngày.
 */
const DUE = { acceptance: 24 * HOUR, comment: 24 * HOUR, submission: 48 * HOUR, review: 48 * HOUR };

function after(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

/** Câu của nguồn: `work.items.<tên>.<phần>`. */
function msg(key: string, params?: WorkMessage["params"]): WorkMessage {
  return params ? { key: `items.${key}`, params } : { key: `items.${key}` };
}

type Draft = Omit<WorkItem, "source" | "reason"> & {
  /** Permission riêng của việc (nguồn tự lọc từng việc, vd lệnh chờ duyệt). */
  permission?: string;
};

/** Việc của một nguồn; `reason` (vì sao bạn thấy) do `server.ts` điền theo người xem. */
function items(source: string, drafts: readonly Draft[]): WorkItem[] {
  return drafts.map(({ permission, ...draft }) => ({
    ...draft,
    source,
    reason: { permission: permission ?? null, scope: { key: "why.tenant" } },
  }));
}

/** Gọi core bằng token của người xem; lỗi thì ném để nguồn bị ghi vào `incomplete`. */
async function call<T>(
  run: (client: AutoxideClient) => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await run(await coreClient());
  if (data === undefined) throw toApiError(response, error);
  return data;
}

// ---------------------------------------------------------------- Nguồn đọc API thật

// Ba lần đọc core dùng chung cho nguồn việc và số liệu tóm tắt (`metrics.ts`): `cache` của React gộp
// mọi lời gọi trong cùng một request, nên menu, hộp việc và ô số liệu chỉ gọi core một lần.

/** Bình luận chờ duyệt, cũ nhất trước (một trang). */
export const readPendingComments = cache(() =>
  call((client) =>
    client.GET("/api/v1/comments", {
      params: { query: { status: "pending", limit: PAGE, order: "asc" } },
    }),
  ),
);

/**
 * Bài nộp mới (chưa đọc) của từng biểu mẫu. Số đếm lấy từ `submissions.new` của form (core đếm
 * cho cả trang form); chỉ form có bài mới mới đọc thêm bài cũ nhất (một dòng) để tính hạn. Core cũ
 * chưa có số đếm thì đọc một trang bài mới của từng form như trước.
 */
export const readNewSubmissions = cache(async () => {
  const forms = await call((client) =>
    client.GET("/api/v1/forms", { params: { query: { limit: PAGE } } }),
  );
  return Promise.all(
    forms.data.map(async (form) => {
      const known = form.submissions?.new;
      if (known === 0) return { form, count: 0, more: false, oldest: null };
      const page = await call((client) =>
        client.GET("/api/v1/forms/{id}/submissions", {
          params: {
            path: { id: form.id },
            query: { status: "new", limit: known === undefined ? PAGE : 1, order: "asc" },
          },
        }),
      );
      return {
        form,
        count: known ?? page.data.length,
        more: known === undefined && Boolean(page.pagination.next_cursor),
        oldest: page.data[0]?.created_at ?? null,
      };
    }),
  );
});

/**
 * Bài chờ duyệt (`review_requested=true`, core lọc), gửi duyệt sớm nhất trước. Core xếp theo lúc
 * tạo bài, nên xếp lại theo `review_requested_at` trong trang đã đọc.
 */
export const readReviewEntries = cache(async () => {
  const page = await call((client) =>
    client.GET("/api/v1/content/entries", {
      params: { query: { review_requested: true, limit: PAGE, order: "asc" } },
    }),
  );
  return page.data
    .filter((entry) => entry.review_requested_at)
    .sort((a, b) => String(a.review_requested_at).localeCompare(String(b.review_requested_at)));
});

const commentsPending = defineSource({
  id: "comments.pending",
  group: "mkt",
  permission: [COMMENTS_MODERATE],
  module: "comments",
  load: async () => {
    const page = await readPendingComments();
    const oldest = page.data[0];
    if (!oldest) return { count: 0, items: [] };
    const count = page.data.length;
    const more = page.pagination.next_cursor ? "yes" : "no";
    return {
      count,
      items: items("comments.pending", [
        {
          key: "comments.pending:queue",
          severity: "info",
          title: msg("commentsPending.title", { count, more }),
          detail: msg("commentsPending.detail", { name: oldest.author_name ?? "—" }),
          due_at: after(oldest.created_at, DUE.comment),
          target: { item: "comments", href: "/marketing/comments" },
          count,
        },
      ]),
    };
  },
});

const formsNew = defineSource({
  id: "forms.new_submissions",
  group: "mkt",
  permission: [FORMS_REVIEW],
  module: "forms",
  load: async () => {
    const perForm = await readNewSubmissions();
    const drafts: Draft[] = [];
    let total = 0;
    for (const { form, count, more, oldest } of perForm) {
      if (count === 0 || !oldest) continue;
      total += count;
      drafts.push({
        key: `forms.new_submissions:${form.id}`,
        severity: "info",
        title: msg("formsNew.title", { count, more: more ? "yes" : "no", form: form.name }),
        detail: msg("formsNew.detail", { key: form.key }),
        due_at: after(oldest, DUE.submission),
        target: { item: "forms", href: `/marketing/forms/${form.id}?status=new` },
        count,
      });
    }
    return { count: total, items: items("forms.new_submissions", drafts) };
  },
});

const contentReview = defineSource({
  id: "content.review",
  group: "content",
  permission: [CONTENT_PUBLISH],
  module: "content",
  load: async () => {
    const waiting = await readReviewEntries();
    const oldest = waiting[0];
    if (!oldest?.review_requested_at) return { count: 0, items: [] };
    const count = waiting.length;
    return {
      count,
      items: items("content.review", [
        {
          key: "content.review:queue",
          severity: "info",
          title: msg("contentReview.title", { count }),
          detail: msg("contentReview.detail", { title: oldest.title }),
          due_at: after(oldest.review_requested_at, DUE.review),
          target: {
            item: "entries",
            href: count === 1 ? `/content/${oldest.id}` : "/content?status=review",
          },
          count,
        },
      ]),
    };
  },
});

// ---------------------------------------------------------------- Nguồn đọc dữ liệu mẫu

const ordersUnconfirmed = defineSource({
  id: "orders.unconfirmed",
  group: "sales",
  permission: [ORDERS_MANAGE],
  sample: { step: "45", endpoint: "GET /api/v1/orders?status=awaiting_acceptance" },
  load: async () => {
    const { orders } = await ordersState();
    // Đơn của người bán trên sàn do chính người bán nhận (Trung tâm người bán), không phải việc ở đây.
    const waiting = orders
      .filter((o) => o.status === "awaiting_acceptance" && o.seller === null)
      .sort((a, b) => a.placed_at.localeCompare(b.placed_at));
    const oldest = waiting[0];
    if (!oldest) return { count: 0, items: [] };
    const byOrg = new Map<string, number>();
    for (const o of waiting) byOrg.set(o.org_name, (byOrg.get(o.org_name) ?? 0) + 1);
    const where = [...byOrg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, n]) => `${name}: ${n}`)
      .join(" · ");
    return {
      count: waiting.length,
      items: items("orders.unconfirmed", [
        {
          key: "orders.unconfirmed:queue",
          severity: "attention",
          title: msg("ordersUnconfirmed.title", { count: waiting.length }),
          detail: msg("ordersUnconfirmed.detail", { where }),
          due_at: after(oldest.placed_at, DUE.acceptance),
          target: {
            item: "orders",
            // Cùng một kênh thì lọc luôn theo kênh, để danh sách không lẫn đơn của người bán trên sàn.
            href: `/sales/orders?status=awaiting_acceptance${
              new Set(waiting.map((o) => o.channel)).size === 1 ? `&channel=${oldest.channel}` : ""
            }`,
          },
          count: waiting.length,
        },
      ]),
    };
  },
});

const returnsOverdue = defineSource({
  id: "orders.returns_overdue",
  group: "sales",
  permission: [ORDERS_RETURNS_MANAGE],
  sample: { step: "45", endpoint: "GET /api/v1/orders/returns?status=requested" },
  load: async (ctx) => {
    // Yêu cầu đổi trả chưa trả lời mà đã quá hạn trả lời của chính sách (`respond_by`).
    const { returns } = await ordersState();
    const late = returns
      .filter((r) => r.status === "requested" && Date.parse(r.respond_by) < ctx.now)
      .sort((a, b) => a.respond_by.localeCompare(b.respond_by));
    const oldest = late[0];
    if (!oldest) return { count: 0, items: [] };
    return {
      count: late.length,
      items: items("orders.returns_overdue", [
        {
          key: "orders.returns_overdue:queue",
          severity: "attention",
          title: msg("returnsOverdue.title", { count: late.length }),
          detail: msg("returnsOverdue.detail", {
            number: oldest.number,
            order: oldest.order_number,
          }),
          due_at: oldest.respond_by,
          target: { item: "orders", href: "/sales/orders/returns?status=requested" },
          count: late.length,
        },
      ]),
    };
  },
});

const inventoryLow = defineSource({
  id: "inventory.below_minimum",
  group: "catalog",
  permission: [INVENTORY_TRANSFER, INVENTORY_ADJUST],
  sample: { step: "42", endpoint: "GET /api/v1/inventory/levels?status=low" },
  load: async () => {
    const { data } = await inventoryStats();
    if (data.low === 0) return { count: 0, items: [] };
    const where = data.low_by_org.map((x) => `${x.org_name}: ${x.count}`).join(" · ");
    return {
      count: data.low,
      items: items("inventory.below_minimum", [
        {
          key: "inventory.below_minimum:queue",
          severity: "info",
          title: msg("inventoryLow.title", { count: data.low }),
          detail: msg("inventoryLow.detail", { where }),
          due_at: null,
          target: { item: "inventory", href: "/catalog/inventory?status=low" },
          count: data.low,
        },
      ]),
    };
  },
});

const websiteDossier = defineSource({
  id: "compliance.website_dossier",
  group: "legal",
  permission: [LEGAL_MANAGE],
  sample: { step: "37", endpoint: "GET /api/v1/compliance/websites, …/checklist" },
  load: async () => {
    // Website chưa thông báo / đăng ký với Bộ Công Thương: chưa nộp thì chưa được bán online (bước
    // pháp lý chặn bán), nên việc này luôn "chặn".
    const { data: sites } = await listComplianceWebsites();
    const open = sites.filter((s) => !["notified", "registered"].includes(s.moit_status));
    const drafts: Draft[] = [];
    for (const site of open) {
      const list = await getChecklist(site.id);
      const missing = list.ok ? list.data.items.filter((i) => i.result === "missing").length : 0;
      drafts.push({
        key: `compliance.website_dossier:${site.id}`,
        severity: "blocking",
        title: msg(
          site.website_kind === "platform" ? "websiteDossier.platform" : "websiteDossier.sales",
          { domain: site.domain },
        ),
        detail: msg("websiteDossier.detail", { missing }),
        due_at: null,
        target: { item: "compliance", href: "/compliance/websites" },
        count: 1,
      });
    }
    return { count: drafts.length, items: items("compliance.website_dossier", drafts) };
  },
});

const kycPending = defineSource({
  id: "compliance.kyc_pending",
  group: "legal",
  permission: [KYC_REVIEW],
  sample: { step: "37", endpoint: "GET /api/v1/compliance/kyc/profiles?status=pending" },
  load: async () => {
    const { data } = await listKycProfiles({ status: "pending" });
    const oldest = data[0];
    if (!oldest) return { count: 0, items: [] };
    return {
      count: data.length,
      items: items("compliance.kyc_pending", [
        {
          key: "compliance.kyc_pending:queue",
          severity: "attention",
          title: msg("kycPending.title", { count: data.length }),
          detail: msg("kycPending.detail", { name: oldest.subject_name }),
          due_at: null,
          target: { item: "compliance", href: "/compliance/kyc" },
          count: data.length,
        },
      ]),
    };
  },
});

const incidentDeadline = defineSource({
  id: "compliance.incident_deadline",
  group: "legal",
  permission: [INCIDENTS_MANAGE],
  sample: { step: "37", endpoint: "GET /api/v1/compliance/incidents" },
  load: async () => {
    // Sự cố dữ liệu cá nhân chưa báo cơ quan: hạn 72 giờ tính từ lúc phát hiện (quy tắc có ngày hiệu
    // lực của `privacy.incident`).
    const { data } = await listIncidents();
    const open = data.filter((i) => i.status !== "closed" && !i.authority_notified_at);
    return {
      count: open.length,
      items: items(
        "compliance.incident_deadline",
        open.map((incident) => ({
          key: `compliance.incident_deadline:${incident.id}`,
          severity: "blocking",
          title: msg("incident.title", { reference: incident.reference }),
          detail: msg("incident.detail", { severity: incident.severity }),
          due_at: incident.report_due_at,
          target: { item: "compliance", href: "/compliance/privacy" },
          count: 1,
        })),
      ),
    };
  },
});

const invoicesRejected = defineSource({
  id: "invoices.rejected",
  group: "finance",
  permission: [INVOICES_ISSUE],
  sample: { step: "36", endpoint: "GET /api/v1/invoices/documents?status=rejected" },
  load: async () => {
    const { data } = await listDocuments("rejected");
    if (data.length === 0) return { count: 0, items: [] };
    return {
      count: data.length,
      items: items("invoices.rejected", [
        {
          key: "invoices.rejected:queue",
          severity: "attention",
          title: msg("invoicesRejected.title", { count: data.length }),
          detail: msg("invoicesRejected.detail"),
          due_at: null,
          target: { item: "finance", href: "/finance/einvoices?f=rejected" },
          count: data.length,
        },
      ]),
    };
  },
});

const ledgerExceptions = defineSource({
  id: "ledger.exceptions",
  group: "finance",
  permission: [LEDGER_RECONCILE],
  sample: { step: "36", endpoint: "GET /api/v1/ledger/exceptions?status=open" },
  load: async () => {
    const { data } = await listExceptions("open");
    if (data.length === 0) return { count: 0, items: [] };
    return {
      count: data.length,
      items: items("ledger.exceptions", [
        {
          key: "ledger.exceptions:queue",
          severity: "info",
          title: msg("ledgerExceptions.title", { count: data.length }),
          detail: msg("ledgerExceptions.detail"),
          due_at: null,
          target: { item: "finance", href: "/finance/exceptions?f=open" },
          count: data.length,
        },
      ]),
    };
  },
});

const periodsClosable = defineSource({
  id: "ledger.periods_closable",
  group: "finance",
  permission: [LEDGER_PERIODS_CLOSE],
  sample: { step: "36", endpoint: "GET /api/v1/ledger/periods?status=open" },
  load: async () => {
    const [{ closable }, { data: periods }] = await Promise.all([financeCounts(), listPeriods()]);
    if (closable === 0) return { count: 0, items: [] };
    const first = periods
      .filter((p) => p.status === "open")
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0];
    return {
      count: closable,
      items: items("ledger.periods_closable", [
        {
          key: "ledger.periods_closable:queue",
          severity: "info",
          title: msg("periodsClosable.title", { count: closable }),
          detail: msg("periodsClosable.detail", { month: first?.starts_on.slice(0, 7) ?? "" }),
          due_at: null,
          target: { item: "finance", href: "/finance/periods" },
          count: closable,
        },
      ]),
    };
  },
});

const codMismatch = defineSource({
  id: "shipping.cod_mismatch",
  group: "sales",
  permission: [SHIPPING_COD_MANAGE],
  sample: { step: "44", endpoint: "GET /api/v1/shipping/cod/discrepancies?status=open" },
  load: async () => {
    const { data } = await codStats();
    if (data.open_count === 0) return { count: 0, items: [] };
    return {
      count: data.open_count,
      items: items("shipping.cod_mismatch", [
        {
          key: "shipping.cod_mismatch:queue",
          severity: "attention",
          title: msg("codMismatch.title", { amount: { money: data.open_mismatch } }),
          detail: msg("codMismatch.detail", { count: data.open_count }),
          due_at: null,
          target: { item: "shipping", href: "/sales/shipping/cod" },
          count: data.open_count,
        },
      ]),
    };
  },
});

const disputesDue = defineSource({
  id: "marketplace.disputes_due",
  group: "market",
  permission: [MARKETPLACE_DISPUTES_RESOLVE],
  sample: { step: "46", endpoint: "GET /api/v1/marketplace/disputes?status=escalated" },
  load: async () => {
    // Tranh chấp đang chờ sàn phân xử (người bán đã trả lời hay quá hạn): hạn của sàn.
    const { data } = await listDisputes({ status: "escalated" });
    return {
      count: data.length,
      items: items(
        "marketplace.disputes_due",
        data.map((d) => ({
          key: `marketplace.disputes_due:${d.id}`,
          severity: "attention",
          title: msg("disputeDue.title", { number: d.number, order: d.order_number }),
          detail: msg("disputeDue.detail", { seller: d.seller_name, claim: { money: d.claim } }),
          due_at: d.platform_due_at,
          target: { item: "market", href: `/market/disputes?status=escalated&open=${d.id}` },
          count: 1,
        })),
      ),
    };
  },
});

const approvalsPending = defineSource({
  id: "kernel.approvals",
  group: "settings",
  // Mỗi yêu cầu cần đúng permission của lệnh: nguồn tự lọc từng việc (core cũng vậy).
  permission: null,
  sample: { step: "51", endpoint: "GET /api/v1/kernel/approvals?status=pending" },
  load: async (ctx) => {
    const { data } = await listApprovals({ status: "pending" }, (p) => ctx.can(p));
    return {
      count: data.length,
      items: items(
        "kernel.approvals",
        data.map((r) => ({
          key: `kernel.approvals:${r.id}`,
          severity: r.risk === "high" ? "blocking" : "attention",
          title: msg("approval.title", { agent: r.agent.name, summary: r.summary }),
          detail: msg("approval.detail", { permission: r.permission }),
          due_at: r.expires_at,
          target: { item: "apiKeys", href: "/settings/api-keys/approvals" },
          count: 1,
          permission: r.permission,
        })),
      ),
    };
  },
});

const taxExpiring = defineSource({
  id: "tax.rate_expiring",
  group: "finance",
  permission: [TAX_PROFILES_MANAGE, CATALOG_PRODUCTS_WRITE],
  sample: { step: "36", endpoint: "GET /api/v1/tax/rates?expiring_within=60" },
  load: async () => {
    const [{ data: rates }, { data: stats }] = await Promise.all([listTaxRates(), productStats()]);
    const soon = expiringRates(rates);
    return {
      count: soon.length,
      items: items(
        "tax.rate_expiring",
        soon.map(({ rate, successor }) => ({
          key: `tax.rate_expiring:${rate.id}`,
          severity: "attention",
          title: msg("taxExpiring.title", { percent: rate.rate_percent }),
          detail: msg("taxExpiring.detail", {
            products: stats.by_tax[rate.category_code] ?? 0,
            next: successor ? successor.rate_percent : "none",
            from: { day: rate.effective_to ?? "" },
          }),
          // Hết hiệu lực lúc 0:00 ngày `effective_to` theo giờ Việt Nam.
          due_at: new Date(`${rate.effective_to}T00:00:00+07:00`).toISOString(),
          target: { item: "finance", href: "/finance/tax" },
          count: 1,
        })),
      ),
    };
  },
});

/** Mọi nguồn việc, theo thứ tự phân hệ của sổ điều hướng. */
export const WORK_SOURCES: readonly WorkSource[] = [
  ordersUnconfirmed,
  returnsOverdue,
  codMismatch,
  inventoryLow,
  commentsPending,
  formsNew,
  contentReview,
  disputesDue,
  invoicesRejected,
  ledgerExceptions,
  periodsClosable,
  taxExpiring,
  websiteDossier,
  kycPending,
  incidentDeadline,
  approvalsPending,
];
