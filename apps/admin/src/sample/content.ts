// Dữ liệu mẫu của phân hệ Nội dung, cho phần bản thiết kế mà core chưa có API (W-006):
// - website theo tên miền và trang bắt buộc của từng website: bước 37 của core
//   (`docs/steps/37-compliance.md`, bảng `compliance_websites`, `compliance_website_pages`,
//   `GET /api/v1/compliance/websites`, `GET …/websites/{id}/checklist`, mẫu trang
//   `POST /api/v1/content/templates/{key}/drafts`);
// - bài thuộc website nào: chưa có ở đâu (bước 34 giữ `content` ở cấp khách, không có `org_id`).
// Nội dung mẫu lấy từ bản thiết kế (chuỗi "Bếp Mộc"). Lệnh ghi đổi kho trong bộ nhớ của tiến
// trình máy chủ; khởi động lại thì về ban đầu. Bài viết thật luôn đọc từ core.
import type { Problem } from "@autoxide/sdk";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

/** Tóm tắt nút tổ chức sở hữu, kèm tên để hiện mà không gọi thêm. */
export interface OrgRef {
  id: string;
  name: string;
}

/** Một website (một tên miền), như `GET /api/v1/compliance/websites` của bước 37. */
export interface Website {
  id: string;
  domain: string;
  /** `sales`: website bán hàng (thông báo Bộ Công Thương); `platform`: sàn (đăng ký). */
  website_kind: "sales" | "platform";
  org: OrgRef;
}

/** Loại trang bắt buộc (`page_kind` của bước 37). */
export type PageKind =
  | "owner_info"
  | "privacy_policy"
  | "return_policy"
  | "shipping_policy"
  | "payment_policy"
  | "inspection_policy"
  | "complaints"
  | "terms_of_use"
  | "platform_rules"
  | "seller_contract"
  | "seller_info";

/** Một dòng của danh sách kiểm (`GET /api/v1/compliance/websites/{id}/checklist`). */
export interface ChecklistPage {
  page_kind: PageKind;
  /** `published`: đã gắn một trang đã đăng; `draft`: có bản nháp; `missing`: chưa có. */
  status: "published" | "draft" | "missing";
  /** Có mẫu trang để tạo bản nháp (`GET /api/v1/content/templates`). */
  template: boolean;
}

export interface Checklist {
  website_id: string;
  pages: ChecklistPage[];
}

/** Bài thuộc website nào (chưa có trong lộ trình của core). */
export interface EntryWebsite {
  entry_id: string;
  website_id: string;
}

// ---------------------------------------------------------------- Kho mẫu

const MAIN = "01a1e000-0000-7000-8000-00000000c501";
const MARKET = "01a1e000-0000-7000-8000-00000000c502";

const WEBSITES: readonly Website[] = [
  {
    id: MAIN,
    domain: "bepmoc.example.com",
    website_kind: "sales",
    org: { id: "01a1e000-0000-7000-8000-0000000000a1", name: "Bếp Mộc — Trụ sở" },
  },
  {
    id: MARKET,
    domain: "cho.bepmoc.example.com",
    website_kind: "platform",
    org: { id: "01a1e000-0000-7000-8000-0000000000a2", name: "Chợ Bếp Mộc" },
  },
];

const SALES_PAGES: PageKind[] = [
  "owner_info",
  "privacy_policy",
  "return_policy",
  "shipping_policy",
  "payment_policy",
  "inspection_policy",
  "complaints",
  "terms_of_use",
];
const PLATFORM_PAGES: PageKind[] = [
  "owner_info",
  "platform_rules",
  "seller_contract",
  "privacy_policy",
  "complaints",
  "seller_info",
];

function seedChecklists(): Map<string, ChecklistPage[]> {
  const page = (page_kind: PageKind, status: ChecklistPage["status"]): ChecklistPage => ({
    page_kind,
    status,
    // "Thông tin người bán trên trang sản phẩm" cấu hình ở Sàn, không phải trang của `content`.
    template: page_kind !== "seller_info",
  });
  return new Map([
    [
      MAIN,
      SALES_PAGES.map((kind) => page(kind, kind === "inspection_policy" ? "missing" : "published")),
    ],
    [
      MARKET,
      PLATFORM_PAGES.map((kind) =>
        page(
          kind,
          kind === "platform_rules" ? "draft" : kind === "seller_info" ? "missing" : "published",
        ),
      ),
    ],
  ]);
}

let checklists = seedChecklists();
const entrySites = new Map<string, string>();

/** Đưa kho về ban đầu (test). */
export function resetContentSample() {
  checklists = seedChecklists();
  entrySites.clear();
}

function notFound(detail: string): { ok: false; problem: Problem } {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Not Found",
      status: 404,
      code: "compliance.website_not_found",
      detail,
    },
  };
}

// ---------------------------------------------------------------- Hàm mẫu

// Thay bằng GET /api/v1/compliance/websites (bước 37) khi core có.
export async function listWebsites(): Promise<{ data: Website[] }> {
  return { data: [...WEBSITES] };
}

// Thay bằng GET /api/v1/compliance/websites/{id}/checklist (bước 37) khi core có.
export async function websiteChecklist(websiteId: string): Promise<SampleOutcome<Checklist>> {
  const pages = checklists.get(websiteId);
  if (!pages) return notFound("No website has this id.");
  return { ok: true, data: { website_id: websiteId, pages: pages.map((p) => ({ ...p })) } };
}

// Thay bằng POST /api/v1/content/templates/{key}/drafts rồi
// PUT /api/v1/compliance/websites/{id}/pages/{page_kind} (bước 37) khi core có.
export async function draftFromTemplate(
  websiteId: string,
  pageKind: string,
): Promise<SampleOutcome<ChecklistPage>> {
  const pages = checklists.get(websiteId);
  if (!pages) return notFound("No website has this id.");
  const page = pages.find((p) => p.page_kind === pageKind);
  if (!page?.template) {
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        code: "content.template_not_found",
        detail: "No page template has this key.",
      },
    };
  }
  if (page.status === "missing") page.status = "draft";
  return { ok: true, data: { ...page } };
}

// Chưa có trong lộ trình của core ("mới"): bài thuộc website nào. Mặc định website đầu tiên.
export async function entryWebsite(entryId: string): Promise<{ data: EntryWebsite }> {
  return { data: { entry_id: entryId, website_id: entrySites.get(entryId) ?? MAIN } };
}

// Chưa có trong lộ trình của core ("mới").
export async function setEntryWebsite(
  entryId: string,
  websiteId: string,
): Promise<SampleOutcome<EntryWebsite>> {
  if (!WEBSITES.some((w) => w.id === websiteId)) return notFound("No website has this id.");
  entrySites.set(entryId, websiteId);
  return { ok: true, data: { entry_id: entryId, website_id: websiteId } };
}
