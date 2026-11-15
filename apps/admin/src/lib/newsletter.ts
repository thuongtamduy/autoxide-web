// Phần thuần của màn Bản tin (module `newsletter` của core): thao tác được theo trạng thái chiến
// dịch, đọc tệp CSV người đăng ký để nhập, số liệu gửi. Dùng được cả ở máy chủ lẫn trình duyệt.
import type { components } from "@autoxide/sdk";

type Schemas = components["schemas"];
export type Campaign = Schemas["CampaignResponse"];
export type CampaignStatus = Schemas["CampaignStatus"];
export type NewsletterList = Schemas["ListResponse"];
export type Subscriber = Schemas["SubscriberResponse"];
export type SubscriptionStatus = Schemas["SubscriptionStatus"];
export type Suppression = Schemas["SuppressionResponse"];
export type NewPosts = Schemas["NewPosts"];

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "draft",
  "scheduled",
  "sending",
  "paused",
  "sent",
  "cancelled",
];

export const CAMPAIGN_BADGE: Record<CampaignStatus, string> = {
  draft: "badge b-draft",
  scheduled: "badge b-sched",
  sending: "badge b-info",
  paused: "badge b-warn",
  sent: "badge b-ok",
  cancelled: "badge b-arch",
};

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "confirmed",
  "unconfirmed",
  "unsubscribed",
];

export const SUBSCRIPTION_BADGE: Record<SubscriptionStatus, string> = {
  confirmed: "badge b-ok",
  unconfirmed: "badge b-sched",
  unsubscribed: "badge b-arch",
};

/**
 * Nhãn core thêm vào đầu tiêu đề thư quảng cáo khi chưa đổi cấu hình
 * (`AUTOXIDE_NEWSLETTER_ADVERTISING_LABEL`, theo một cách đọc NĐ 91/2020). Core chưa có API đọc
 * cấu hình này, nên giao diện hiện giá trị mặc định và nói rõ là "hoặc nhãn đặt ở máy chủ".
 */
export const DEFAULT_AD_LABEL = "[QC]";

export const NEW_POSTS: readonly NewPosts[] = ["off", "draft", "send"];

export type CampaignAction =
  | "edit"
  | "test"
  | "schedule"
  | "send"
  | "pause"
  | "resume"
  | "cancel"
  | "delete";

/**
 * Thao tác core cho phép với một chiến dịch ở trạng thái này (mô tả của từng endpoint trong
 * `openapi.json`): sửa khi nháp hoặc đã hẹn giờ; xoá khi chưa gửi thư nào.
 */
export function campaignActions(campaign: Pick<Campaign, "status" | "progress">): CampaignAction[] {
  const neverSent = campaign.progress.sent === 0 && campaign.progress.failed === 0;
  switch (campaign.status) {
    case "draft":
      return ["edit", "test", "schedule", "send", "delete"];
    case "scheduled":
      return ["edit", "test", "schedule", "send", "cancel", "delete"];
    case "sending":
      return ["pause", "cancel"];
    case "paused":
      return ["resume", "cancel"];
    case "cancelled":
      return neverSent ? ["delete"] : [];
    case "sent":
      return [];
  }
}

/** Phần trăm đã xử lý (gửi, lỗi, bỏ qua) trên tổng số người nhận đã lấy. */
export function progressPercent(progress: Schemas["DeliveryCounts"]): number {
  if (progress.total === 0) return 0;
  const done = progress.sent + progress.failed + progress.skipped;
  return Math.min(100, Math.round((done / progress.total) * 100));
}

/** Tổng số đăng ký theo trạng thái của mọi danh sách đang xem. */
export function sumSubscriptions(lists: readonly NewsletterList[]): Schemas["SubscriptionCounts"] {
  return lists.reduce(
    (sum, list) => ({
      confirmed: sum.confirmed + list.subscriptions.confirmed,
      unconfirmed: sum.unconfirmed + list.subscriptions.unconfirmed,
      unsubscribed: sum.unsubscribed + list.subscriptions.unsubscribed,
    }),
    { confirmed: 0, unconfirmed: 0, unsubscribed: 0 },
  );
}

/** Số người nhập nhiều nhất trong một lần (`POST /subscribers/import`). */
export const IMPORT_MAX = 1000;

export interface ImportRow {
  email: string;
  name?: string;
  locale?: "en" | "vi";
}

export interface ImportParse {
  people: ImportRow[];
  /** Dòng bị bỏ: số dòng (đếm từ 1) và lý do (`email`, `duplicate`). */
  skipped: { line: number; reason: "email" | "duplicate" }[];
  /** Quá `IMPORT_MAX` người. */
  tooMany: boolean;
}

/** Tách một dòng CSV (dấu phẩy hoặc chấm phẩy, ô có thể nằm trong ngoặc kép). */
function cells(line: string, separator: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === separator) {
      out.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  out.push(cell.trim());
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Đọc danh sách người đăng ký từ CSV (hoặc mỗi dòng một email). Dòng đầu có chữ `email` là dòng
 * tiêu đề: cột `email`, `name` / `ten` / `họ tên`, `locale` / `ngon_ngu`. Không có tiêu đề thì cột
 * 1 là email, cột 2 là tên. Email sai định dạng và email lặp bị bỏ, kèm số dòng để báo. Core vẫn
 * kiểm lại từng địa chỉ.
 */
export function parseSubscriberCsv(text: string): ImportParse {
  const rows = text.replace(/^﻿/, "").split(/\r?\n/);
  const first = rows.find((row) => row.trim() !== "") ?? "";
  const separator = first.includes(";") && !first.includes(",") ? ";" : ",";
  const header = cells(first, separator).map((cell) =>
    cell.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"),
  );
  const hasHeader = header.includes("email");
  const col = (names: string[]) => header.findIndex((cell) => names.includes(cell));
  const emailCol = hasHeader ? col(["email"]) : 0;
  const nameCol = hasHeader ? col(["name", "ten", "ho ten", "ho_ten", "full name"]) : 1;
  const localeCol = hasHeader ? col(["locale", "language", "ngon ngu", "ngon_ngu"]) : -1;
  const seen = new Set<string>();
  const people: ImportRow[] = [];
  const skipped: ImportParse["skipped"] = [];
  let headerSkipped = false;
  rows.forEach((row, index) => {
    if (row.trim() === "") return;
    if (hasHeader && !headerSkipped) {
      headerSkipped = true;
      return;
    }
    const parts = cells(row, separator);
    const email = (parts[emailCol] ?? "").toLowerCase();
    if (!EMAIL.test(email)) {
      skipped.push({ line: index + 1, reason: "email" });
      return;
    }
    if (seen.has(email)) {
      skipped.push({ line: index + 1, reason: "duplicate" });
      return;
    }
    seen.add(email);
    const person: ImportRow = { email };
    const name = nameCol >= 0 ? (parts[nameCol] ?? "").slice(0, 200) : "";
    if (name) person.name = name;
    const locale = localeCol >= 0 ? (parts[localeCol] ?? "").toLowerCase() : "";
    if (locale === "en" || locale === "vi") person.locale = locale;
    people.push(person);
  });
  return { people, skipped, tooMany: people.length > IMPORT_MAX };
}
