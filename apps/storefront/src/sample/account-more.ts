// Bốn mục còn lại của tài khoản người mua theo bản thiết kế `Account` (mẫu, W-006, W-030): tải hàng số,
// bảo hành, tranh chấp, đăng nhập và bảo mật. Dữ liệu và luật thuần ở đây; trạng thái người dùng đổi
// (lượt tải, yêu cầu bảo hành, bước của tranh chấp, đăng xuất nơi khác) nằm trong cookie `sf_acct_more`
// của trình duyệt này (`account-more-actions.ts`).
//
// Thay bằng (khi core có):
// - hàng số: `GET /api/v1/orders/me/downloads`, `POST /me/downloads/{id}/link` (link riêng 5 phút, trừ
//   một lượt), `POST /me/downloads/{id}/resend` (bước 41, 45);
// - bảo hành: `GET /api/v1/orders/me/warranties`, `POST /me/warranties/{id}/claims` (bước 45);
// - tranh chấp: `GET /api/v1/marketplace/me/disputes/{id}`, `POST …/messages` (lời và ảnh qua module
//   `media`), `POST …/transitions` (`accept_offer`, `escalate`, `withdraw`) (bước 46);
// - bảo mật: phiên và passkey của người mua (bước 47 + `auth`).
import type { Localized } from "./index";

const L = (vi: string, en: string): Localized => ({ vi, en });

/** Mỗi file của hàng số tải được bao nhiêu lần, tới khi nào (30 ngày từ khi thanh toán). */
export const DOWNLOAD_LIMIT = 5;
export const DOWNLOAD_UNTIL = "2026-12-13";
export const DOWNLOAD_ORDER = "BM-2611-0421";

export interface DigitalFile {
  id: string;
  title: Localized;
  meta: Localized;
  kind: "doc" | "video";
}

export const SAMPLE_DOWNLOADS: readonly DigitalFile[] = [
  {
    id: "pdf",
    title: L("Sách “30 món với chảo gang” · bản PDF", "Book “30 cast-iron dishes” · PDF edition"),
    meta: L("PDF · 24 MB", "PDF · 24 MB"),
    kind: "doc",
  },
  {
    id: "epub",
    title: L("Sách “30 món với chảo gang” · bản EPUB", "Book “30 cast-iron dishes” · EPUB edition"),
    meta: L("EPUB · 8 MB · đọc trên điện thoại", "EPUB · 8 MB · for phones"),
    kind: "doc",
  },
  {
    id: "v1",
    title: L(
      "Khoá học “Nấu với chảo gang” · phần 1 (bài 1–4)",
      "Course “Cooking with cast iron” · part 1 (lessons 1–4)",
    ),
    meta: L("Video MP4 · 480 MB", "MP4 video · 480 MB"),
    kind: "video",
  },
  {
    id: "v2",
    title: L(
      "Khoá học “Nấu với chảo gang” · phần 2 (bài 5–8)",
      "Course “Cooking with cast iron” · part 2 (lessons 5–8)",
    ),
    meta: L("Video MP4 · 460 MB", "MP4 video · 460 MB"),
    kind: "video",
  },
];

/** Lượt tải còn lại của một file (đã dùng 2 lượt sẵn ở file video phần 1 để thấy trạng thái "sắp hết"). */
export function downloadsLeft(id: string, used: Record<string, number>): number {
  const already = id === "v1" ? 3 : 0;
  return Math.max(0, DOWNLOAD_LIMIT - already - (used[id] ?? 0));
}

export interface WarrantyItem {
  sku: string;
  name: Localized;
  months: number;
  order: string;
  /** Hết hạn bảo hành, `YYYY-MM-DD`. */
  until: string;
  scope: Localized | null;
}

export const SAMPLE_WARRANTIES: readonly WarrantyItem[] = [
  {
    sku: "chao-gang-26",
    name: L("Chảo gang 26 cm", "Cast-iron skillet 26 cm"),
    months: 24,
    order: "BM-2611-0201",
    until: "2028-11-11",
    scope: L("nứt vỡ do đúc", "cracks from casting"),
  },
  {
    sku: "noi-inox-20",
    name: L("Nồi inox 3 đáy 20 cm", "Tri-ply stainless pot 20 cm"),
    months: 12,
    order: "BM-2611-0201",
    until: "2027-11-11",
    scope: null,
  },
  {
    sku: "dao-3-mon",
    name: L("Bộ dao bếp 3 món", "Kitchen knife set, 3 pieces"),
    months: 6,
    order: "BM-2604-0112",
    until: "2026-10-20",
    scope: null,
  },
];

/** Còn hạn bảo hành vào ngày `today` (`YYYY-MM-DD`)? */
export function warrantyActive(item: WarrantyItem, today: string): boolean {
  return item.until >= today;
}

// ---------------------------------------------------------------- Tranh chấp

/**
 * Trạng thái của tranh chấp mẫu TC-2611-0007 (đơn sàn BM-2611-0156): người bán đã trả lời đề nghị hoàn
 * một phần, người mua đồng ý, nhờ sàn phân xử, hay rút. Tiền của đơn ở đối tác thu hộ có giấy phép, chỉ
 * chuyển cho người bán khi tranh chấp đóng (D-187 của core).
 */
export type DisputeStatus = "seller_responded" | "escalated" | "resolved" | "withdrawn";
export type DisputeAction = "accept_offer" | "escalate" | "withdraw" | "platform_decides";

export const DISPUTE = {
  number: "TC-2611-0007",
  order: "BM-2611-0156",
  seller: "Gốm Sứ Bát Tràng Xưa",
  opened: "2026-11-10T09:20:00+07:00",
  responded: "2026-11-11T15:05:00+07:00",
  respondBy: "2026-11-12T09:20:00+07:00",
  decideBy: "2026-11-20",
  /** Tiền của đơn, tiền buyer đề nghị hoàn, tiền người bán đề nghị (VND). */
  total: 450_000,
  asked: 140_000,
  offered: 70_000,
} as const;

/** Thao tác người mua làm được ở mỗi trạng thái (`platform_decides` chỉ để xem kết quả mẫu). */
export function disputeActions(status: DisputeStatus): DisputeAction[] {
  switch (status) {
    case "seller_responded":
      return ["accept_offer", "escalate", "withdraw"];
    case "escalated":
      return ["platform_decides", "withdraw"];
    default:
      return [];
  }
}

/** Trạng thái sau một thao tác; thao tác không hợp lệ ở trạng thái này thì `null`. */
export function disputeAfter(
  status: DisputeStatus,
  action: DisputeAction,
): { status: DisputeStatus; refund: number | null } | null {
  if (!disputeActions(status).includes(action)) return null;
  switch (action) {
    case "accept_offer":
      return { status: "resolved", refund: DISPUTE.offered };
    case "platform_decides":
      return { status: "resolved", refund: DISPUTE.asked };
    case "escalate":
      return { status: "escalated", refund: null };
    case "withdraw":
      return { status: "withdrawn", refund: null };
  }
}

export function disputeOpen(status: DisputeStatus): boolean {
  return status === "seller_responded" || status === "escalated";
}

export interface DisputeMessage {
  who: "buyer" | "seller" | "platform";
  at: string;
  body: Localized | string;
  /** Mô tả ảnh kèm (ảnh mẫu); ảnh người mua gửi thêm chỉ giữ tên file. */
  photos: (Localized | string)[];
}

export const DISPUTE_MESSAGES: readonly DisputeMessage[] = [
  {
    who: "buyer",
    at: "2026-11-10T09:20:00+07:00",
    body: L(
      "Nhận hàng 07/11, mở hộp thấy 2 bát nứt ở chân, đổ nước vào thì rỉ ra. Đề nghị hoàn 140.000 ₫ cho 2 bát.",
      "Received on 07/11; two bowls had cracked feet and leaked when filled with water. Asking for 140,000 ₫ back for the two bowls.",
    ),
    photos: [
      L("Ảnh 1: chân bát thứ nhất bị nứt", "Photo 1: the first bowl's cracked foot"),
      L("Ảnh 2: bát thứ hai rỉ nước", "Photo 2: the second bowl leaking"),
      L("Ảnh 3: hộp và tem lúc nhận", "Photo 3: box and seal on arrival"),
    ],
  },
  {
    who: "seller",
    at: "2026-11-11T15:05:00+07:00",
    body: L(
      "Xin lỗi chị về bát nứt chân ở ảnh 1, shop đồng ý hoàn 70.000 ₫. Bát ở ảnh 2 là men rạn trang trí, không rỉ nước; ảnh đóng gói lúc gửi kèm theo.",
      "Sorry about the cracked bowl in photo 1; we agree to refund 70,000 ₫. The bowl in photo 2 has a decorative crackle glaze and does not leak; packing photo attached.",
    ),
    photos: [L("Ảnh người bán: hàng đóng gói lúc gửi", "Seller's photo: packing at dispatch")],
  },
];

/** Lời của sàn thêm vào khi tranh chấp đổi trạng thái. */
export function platformNote(status: DisputeStatus, refund: number | null): Localized | null {
  if (status === "escalated") {
    return L(
      "Đã nhận yêu cầu phân xử. Sàn xem ảnh, lời hai bên và vận đơn rồi quyết trước 20/11/2026. Hai bên vẫn gửi thêm bằng chứng được.",
      "Mediation requested. The marketplace reviews the photos, both sides' messages and the shipment, and decides by 20/11/2026. Both sides can still add evidence.",
    );
  }
  if (status === "resolved" && refund === DISPUTE.offered) {
    return L(
      "Hai bên đã thống nhất hoàn 70.000 ₫. Đối tác thu hộ hoàn về thẻ đã thanh toán trong 1–3 ngày làm việc.",
      "Both sides agreed on a 70,000 ₫ refund. The payment partner returns it to the card you paid with within 1–3 working days.",
    );
  }
  if (status === "resolved") {
    return L(
      "Sàn quyết: hoàn 140.000 ₫ cho 2 bát. Ảnh 2 cho thấy nước rỉ qua vết nứt, không phải men rạn. Đối tác thu hộ hoàn về thẻ đã thanh toán trong 1–3 ngày làm việc.",
      "Decision: refund 140,000 ₫ for both bowls. Photo 2 shows water leaking through a crack, not a crackle glaze. The payment partner returns it to the card you paid with within 1–3 working days.",
    );
  }
  return null;
}
