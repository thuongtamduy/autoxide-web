// Bộ quy định mẫu (`compliance_rules`, gói `vn` của bước 37 của core): mọi điểm luật hay đổi —
// danh mục hồ sơ, thời hạn, giới hạn lưu — là dữ liệu có phiên bản và ngày hiệu lực, kèm căn cứ
// (văn bản, điều). Giao diện đọc căn cứ từ đây để hiện, không viết cứng trong component.
//
// AI không phải luật sư: dòng có `needs_legal_review` hiện "cần đối chiếu văn bản gốc". Giá trị số
// (giờ, ngày) là dữ liệu mẫu theo đặc tả bước 37, không phải tư vấn pháp lý.
//
// Thay bằng GET /api/v1/compliance/rules (bước 37) khi core có.

/** Tiêu đề hai ngôn ngữ của một mục trong quy tắc (như `title: {en, vi}` của đặc tả). */
export interface Localized {
  en: string;
  vi: string;
}

/** Một mục của danh sách kiểm hồ sơ Bộ Công Thương (`moit.checklist.*`). */
export interface ChecklistRuleItem {
  key: string;
  title: Localized;
  check:
    | { type: "profile_field"; fields: string[] }
    | { type: "page"; page_kind: string }
    | { type: "document"; kind: string }
    | { type: "kyc" }
    | { type: "policy"; key: string }
    | { type: "fact"; fact: string }
    | { type: "manual" };
  legal_basis: string;
  needs_legal_review: boolean;
}

/** Một phiên bản của một khoá quy tắc. */
export interface RuleVersion<B = unknown> {
  key: string;
  version: number;
  /** Ngày (UTC) bắt đầu có hiệu lực, `YYYY-MM-DD`. */
  effective_from: string;
  effective_to: string | null;
  legal_basis: string;
  needs_legal_review: boolean;
  body: B;
}

/** Tên bộ quy định đang nạp (hiện ở dòng phạm vi của màn). */
export const RULESET = { jurisdiction: "vn", release: "2026.11" } as const;

const MOIT_OLD = "NĐ 52/2013/NĐ-CP, sửa đổi bởi NĐ 85/2021/NĐ-CP";
const MOIT_NEW =
  "Luật Thương mại điện tử 2025 và nghị định hướng dẫn (các nguồn nêu NĐ 248/2026/NĐ-CP)";

const owner: ChecklistRuleItem = {
  key: "owner",
  title: {
    en: "Owner details, tax code, legal representative",
    vi: "Thông tin chủ sở hữu, mã số thuế, người đại diện",
  },
  check: {
    type: "profile_field",
    fields: ["legal_name", "tax_code", "registration_number", "representative_name"],
  },
  legal_basis: MOIT_NEW,
  needs_legal_review: true,
};

const page = (key: string, en: string, vi: string): ChecklistRuleItem => ({
  key: `page.${key}`,
  title: { en, vi },
  check: { type: "page", page_kind: key },
  legal_basis: MOIT_NEW,
  needs_legal_review: true,
});

const SALES_V2: ChecklistRuleItem[] = [
  owner,
  page("owner_info", "Owner information page", "Trang thông tin chủ sở hữu"),
  page("privacy_policy", "Personal data protection policy", "Chính sách bảo vệ dữ liệu cá nhân"),
  page("return_policy", "Returns and refunds policy", "Chính sách đổi trả, hoàn tiền"),
  page("shipping_policy", "Shipping policy", "Chính sách vận chuyển"),
  page("payment_policy", "Payment policy", "Chính sách thanh toán"),
  page("inspection_policy", "Inspection on delivery policy", "Chính sách kiểm hàng"),
  page("complaints", "Complaint handling", "Giải quyết khiếu nại"),
  page("terms_of_use", "Terms of use", "Điều khoản sử dụng"),
  {
    key: "document.general_conditions",
    title: {
      en: "General conditions of sale (versioned)",
      vi: "Điều kiện giao dịch chung (có phiên bản)",
    },
    check: { type: "document", kind: "general_conditions" },
    legal_basis: "Luật Bảo vệ quyền lợi người tiêu dùng 19/2023/QH15",
    needs_legal_review: true,
  },
  {
    key: "policy.complaints_contact",
    title: { en: "Complaint channel published", vi: "Có kênh tiếp nhận khiếu nại" },
    check: { type: "policy", key: "complaints.contact" },
    legal_basis: MOIT_NEW,
    needs_legal_review: true,
  },
];

const PLATFORM_V2: ChecklistRuleItem[] = [
  owner,
  {
    key: "manual.service_scheme",
    title: {
      en: "Service scheme (draft exported from the configuration)",
      vi: "Đề án cung cấp dịch vụ (bản nháp xuất từ cấu hình)",
    },
    check: { type: "manual" },
    legal_basis: MOIT_NEW,
    needs_legal_review: true,
  },
  page("platform_rules", "Marketplace operating rules", "Quy chế hoạt động của sàn"),
  page("seller_contract", "Seller contract template", "Mẫu hợp đồng với người bán"),
  {
    key: "kyc.sellers",
    title: {
      en: "Sellers are verified before they sell",
      vi: "Cơ chế xác thực người bán trước khi bán",
    },
    check: { type: "kyc" },
    legal_basis: "Luật Thương mại điện tử 122/2025/QH15, Điều 17",
    needs_legal_review: false,
  },
  {
    key: "fact.seller_info",
    title: {
      en: "Seller information on product pages",
      vi: "Thông tin người bán trên trang sản phẩm",
    },
    check: { type: "fact", fact: "marketplace.seller_info_on_product" },
    legal_basis: MOIT_NEW,
    needs_legal_review: true,
  },
  page(
    "complaints",
    "Complaints and takedown channel",
    "Kênh tiếp nhận khiếu nại, gỡ hàng vi phạm",
  ),
  page("privacy_policy", "Personal data protection policy", "Chính sách bảo vệ dữ liệu cá nhân"),
];

// Bản cũ (trước Luật Thương mại điện tử 2025) giữ lại để thấy danh sách kiểm có phiên bản.
const SALES_V1 = SALES_V2.filter((item) => item.check.type !== "document").map((item) => ({
  ...item,
  legal_basis: MOIT_OLD,
  needs_legal_review: false,
}));
const PLATFORM_V1 = PLATFORM_V2.filter((item) => item.check.type !== "kyc").map((item) => ({
  ...item,
  legal_basis: MOIT_OLD,
  needs_legal_review: false,
}));

export interface CaseDeadline {
  ack_days: number;
  respond_days: number;
  decide_days: number;
}

export const RULES: readonly RuleVersion[] = [
  {
    key: "kyc.required_activities",
    version: 1,
    effective_from: "2026-07-01",
    effective_to: null,
    legal_basis: "Luật Thương mại điện tử 122/2025/QH15, Điều 17",
    needs_legal_review: false,
    body: { sell: true, livestream: true, affiliate: true, valid_days: 730 },
  },
  {
    key: "moit.checklist.sales",
    version: 1,
    effective_from: "2021-12-01",
    effective_to: "2026-06-30",
    legal_basis: MOIT_OLD,
    needs_legal_review: false,
    body: SALES_V1,
  },
  {
    key: "moit.checklist.sales",
    version: 2,
    effective_from: "2026-07-01",
    effective_to: null,
    legal_basis: MOIT_NEW,
    needs_legal_review: true,
    body: SALES_V2,
  },
  {
    key: "moit.checklist.platform",
    version: 1,
    effective_from: "2021-12-01",
    effective_to: "2026-06-30",
    legal_basis: MOIT_OLD,
    needs_legal_review: false,
    body: PLATFORM_V1,
  },
  {
    key: "moit.checklist.platform",
    version: 2,
    effective_from: "2026-07-01",
    effective_to: null,
    legal_basis: MOIT_NEW,
    needs_legal_review: true,
    body: PLATFORM_V2,
  },
  {
    key: "privacy.incident",
    version: 1,
    effective_from: "2026-01-01",
    effective_to: null,
    legal_basis: "Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15; NĐ 356/2025/NĐ-CP",
    needs_legal_review: true,
    body: { report_within_hours: 72, remind_at_hours: [24, 48, 60, 68] },
  },
  {
    // Đề xuất (chưa có trong đặc tả bước 37): hạn trả lời yêu cầu của chủ thể dữ liệu.
    key: "privacy.subject_requests",
    version: 1,
    effective_from: "2026-01-01",
    effective_to: null,
    legal_basis: "Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15; NĐ 356/2025/NĐ-CP",
    needs_legal_review: true,
    body: { access: 7, rectify: 7, erase: 7, withdraw: 1, object: 7 },
  },
  {
    key: "privacy.retention_limits",
    version: 1,
    effective_from: "2026-01-01",
    effective_to: null,
    legal_basis: "Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15; Luật Kế toán 88/2015/QH13",
    needs_legal_review: true,
    body: {
      "forms.submissions": 1095,
      "auth.sessions": 365,
      "comments.ip_traces": 365,
      "compliance.kyc_documents": 90,
      "webhooks.deliveries": 365,
      "audit.events": 1825,
    },
  },
  {
    key: "cases.deadlines",
    version: 1,
    effective_from: "2026-07-01",
    effective_to: null,
    legal_basis: "Luật Bảo vệ quyền lợi người tiêu dùng 19/2023/QH15; Luật Thương mại điện tử 2025",
    needs_legal_review: true,
    body: {
      ip_infringement: { ack_days: 1, respond_days: 3, decide_days: 8 },
      counterfeit: { ack_days: 1, respond_days: 3, decide_days: 8 },
      prohibited_goods: { ack_days: 1, respond_days: 2, decide_days: 5 },
      consumer_complaint: { ack_days: 1, respond_days: 3, decide_days: 7 },
      other: { ack_days: 2, respond_days: 5, decide_days: 10 },
    } satisfies Record<string, CaseDeadline>,
  },
  {
    key: "posting.verification",
    version: 1,
    effective_from: "2024-12-25",
    effective_to: null,
    legal_basis: "NĐ 147/2024/NĐ-CP",
    needs_legal_review: true,
    body: { phone_countries: ["84"] },
  },
  {
    key: "documents.evidence",
    version: 1,
    effective_from: "2024-07-01",
    effective_to: null,
    legal_basis: "Luật Giao dịch điện tử 20/2023/QH15",
    needs_legal_review: false,
    body: {},
  },
  {
    key: "ai.labels",
    version: 1,
    effective_from: "2026-03-01",
    effective_to: null,
    legal_basis: "Luật Trí tuệ nhân tạo 134/2025/QH15",
    needs_legal_review: true,
    body: { labels: ["ai_generated", "ai_assisted"] },
  },
];

/** Ngày `YYYY-MM-DD` (UTC) của một thời điểm. */
export function dayOf(at: number | Date = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Phiên bản của `key` có hiệu lực vào ngày `asOf` (mặc định hôm nay). */
export function ruleAt<B = unknown>(key: string, asOf = dayOf()): RuleVersion<B> | undefined {
  return RULES.find(
    (rule) =>
      rule.key === key &&
      rule.effective_from <= asOf &&
      (rule.effective_to === null || rule.effective_to >= asOf),
  ) as RuleVersion<B> | undefined;
}

/** Mọi phiên bản của `key`, mới nhất trước (lịch sử của danh sách kiểm). */
export function ruleHistory(key: string): RuleVersion[] {
  return RULES.filter((rule) => rule.key === key).sort((a, b) => b.version - a.version);
}

/** Thay bằng GET /api/v1/compliance/rules?as_of= (bước 37) khi core có. */
export async function listRules(asOf = dayOf()): Promise<{ data: RuleVersion[] }> {
  const keys = [...new Set(RULES.map((rule) => rule.key))];
  return {
    data: keys.flatMap((key) => {
      const rule = ruleAt(key, asOf);
      return rule ? [rule] : [];
    }),
  };
}

/**
 * Cộng `days` ngày làm việc (bỏ thứ Bảy, Chủ nhật) vào `from`. Ngày lễ là dữ liệu của quy tắc ở
 * core; bản mẫu chưa có.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const out = new Date(from);
  let left = days;
  while (left > 0) {
    out.setUTCDate(out.getUTCDate() + 1);
    const weekday = out.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return out;
}
