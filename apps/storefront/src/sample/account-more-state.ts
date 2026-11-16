// Trạng thái mẫu của bốn mục tài khoản mới (`account-more.ts`) trên trình duyệt này: cookie
// `sf_acct_more`, JSON ngắn. Hàm thuần để test; đọc / ghi cookie ở `account-more-actions.ts`.
import type { DisputeStatus } from "./account-more";

export const ACCOUNT_MORE_COOKIE = "sf_acct_more";

/** Giới hạn để cookie không vượt ~4 KB: lời gửi thêm của tranh chấp, mỗi lời, số ảnh mỗi lần. */
export const EVIDENCE_LIMITS = { messages: 3, body: 500, photos: 5, photoName: 80 } as const;

export interface AccountMoreState {
  /** Số lượt đã tải theo id file. */
  used: Record<string, number>;
  /** File đã bấm "Gửi lại email" (giữ thứ tự, không trùng). */
  resent: string[];
  /** Yêu cầu bảo hành đã gửi: sku → thời điểm (ISO). */
  claims: Record<string, string>;
  dispute: {
    status: DisputeStatus;
    refund: number | null;
    /** Lời người mua gửi thêm. */
    added: { at: string; body: string; photos: string[] }[];
  };
  /** Đã "đăng xuất nơi khác". */
  signedOutOthers: boolean;
}

export function emptyAccountMore(): AccountMoreState {
  return {
    used: {},
    resent: [],
    claims: {},
    dispute: { status: "seller_responded", refund: null, added: [] },
    signedOutOthers: false,
  };
}

const STATUSES: readonly DisputeStatus[] = [
  "seller_responded",
  "escalated",
  "resolved",
  "withdrawn",
];

/** Đọc cookie; giá trị hỏng hay lạ thì về trạng thái đầu (không bao giờ ném lỗi). */
export function parseAccountMore(value: string | undefined): AccountMoreState {
  const empty = emptyAccountMore();
  if (!value) return empty;
  let raw: unknown;
  try {
    raw = JSON.parse(decodeURIComponent(value));
  } catch {
    return empty;
  }
  if (typeof raw !== "object" || raw === null) return empty;
  const r = raw as Record<string, unknown>;
  const used: Record<string, number> = {};
  if (typeof r.used === "object" && r.used !== null) {
    for (const [k, v] of Object.entries(r.used)) {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 99) used[k] = v;
    }
  }
  const resent = Array.isArray(r.resent)
    ? r.resent.filter((x): x is string => typeof x === "string").slice(0, 20)
    : [];
  const claims: Record<string, string> = {};
  if (typeof r.claims === "object" && r.claims !== null) {
    for (const [k, v] of Object.entries(r.claims)) if (typeof v === "string") claims[k] = v;
  }
  const d = (typeof r.dispute === "object" && r.dispute !== null ? r.dispute : {}) as Record<
    string,
    unknown
  >;
  const status = STATUSES.includes(d.status as DisputeStatus)
    ? (d.status as DisputeStatus)
    : empty.dispute.status;
  const refund = typeof d.refund === "number" ? d.refund : null;
  const added = Array.isArray(d.added)
    ? d.added
        .filter(
          (m): m is { at: string; body: string; photos: string[] } =>
            typeof m === "object" &&
            m !== null &&
            typeof (m as { at?: unknown }).at === "string" &&
            typeof (m as { body?: unknown }).body === "string" &&
            Array.isArray((m as { photos?: unknown }).photos),
        )
        .slice(-EVIDENCE_LIMITS.messages)
        .map((m) => ({
          at: m.at,
          body: m.body.slice(0, EVIDENCE_LIMITS.body),
          photos: m.photos
            .filter((p): p is string => typeof p === "string")
            .slice(0, EVIDENCE_LIMITS.photos),
        }))
    : [];
  return {
    used,
    resent,
    claims,
    dispute: { status, refund, added },
    signedOutOthers: r.signedOutOthers === true,
  };
}

export function serializeAccountMore(state: AccountMoreState): string {
  return encodeURIComponent(JSON.stringify(state));
}
