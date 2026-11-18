import { formatDate } from "./format";
import type { PublicBadge, PublicOwner } from "./types";

// Thông tin pháp lý ở chân trang, dựng từ hồ sơ pháp lý của core (`GET /compliance/public/owner`) và
// logo Bộ Công Thương (`GET /compliance/public/badge`). Hàm thuần: không gọi mạng, dễ test.
//
// Căn cứ: NĐ 52/2013/NĐ-CP (sửa bởi NĐ 85/2021/NĐ-CP), điều về thông tin người sở hữu website: tên,
// địa chỉ trụ sở, số / ngày / nơi cấp giấy đăng ký kinh doanh hay mã số thuế, điện thoại, email; website
// đã thông báo / đăng ký thì gắn logo của Bộ (cần đối chiếu văn bản gốc). Không có hồ sơ thì KHÔNG in gì:
// in chữ giữ chỗ trên website chạy thật là công bố thông tin sai.

/** Một dòng thông tin; `key` là key i18n dưới `footer.owner`. */
export type OwnerFact =
  | { key: "taxCode"; values: { value: string } }
  | { key: "registration"; values: { value: string } }
  | { key: "registrationIssued"; values: { value: string; date: string; by: string } }
  | { key: "address"; values: { value: string } }
  | { key: "phone"; values: { value: string } }
  | { key: "email"; values: { value: string } }
  | { key: "representative"; values: { value: string } };

export interface OwnerView {
  /** Tên pháp lý, kèm tên thương mại trong ngoặc khi khác. */
  name: string;
  facts: OwnerFact[];
}

const clean = (value: string | null | undefined): string => value?.trim() ?? "";

/** Địa chỉ một dòng: số nhà / đường, xã / phường, tỉnh / thành. */
export function formatAddress(address: PublicOwner["address"]): string {
  if (!address) return "";
  return [address.line, address.commune_name, address.province_name]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(", ");
}

/** `null` khi hồ sơ không có tên pháp lý (không có gì đáng in). */
export function ownerView(owner: PublicOwner | null, locale: string): OwnerView | null {
  if (!owner) return null;
  const legal = clean(owner.legal_name);
  if (!legal) return null;
  const trade = clean(owner.trade_name);
  const name = trade && trade !== legal ? `${legal} (${trade})` : legal;

  const facts: OwnerFact[] = [];
  const taxCode = clean(owner.tax_code);
  if (taxCode) facts.push({ key: "taxCode", values: { value: taxCode } });
  const number = clean(owner.registration_number);
  // Mã số doanh nghiệp thường trùng mã số thuế: chỉ in lại khi khác hoặc có ngày / nơi cấp.
  if (number) {
    const date = owner.registration_issued_on
      ? formatDate(owner.registration_issued_on, locale)
      : "";
    const by = clean(owner.registration_issued_by);
    if (date && by) {
      facts.push({ key: "registrationIssued", values: { value: number, date, by } });
    } else if (number !== taxCode) {
      facts.push({ key: "registration", values: { value: number } });
    }
  }
  const address = formatAddress(owner.address);
  if (address) facts.push({ key: "address", values: { value: address } });
  const phone = clean(owner.phone);
  if (phone) facts.push({ key: "phone", values: { value: phone } });
  const email = clean(owner.email);
  if (email) facts.push({ key: "email", values: { value: email } });
  const representative = clean(owner.representative_name);
  if (representative) facts.push({ key: "representative", values: { value: representative } });
  return { name, facts };
}

export interface BadgeView {
  href: string;
  src: string;
  alt: string;
}

const httpsUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/**
 * Logo "Đã thông báo / Đã đăng ký" chỉ khi core xác nhận trạng thái và cả hai địa chỉ là `https:`.
 * Không chèn `snippet` HTML của core (không `dangerouslySetInnerHTML` trên website công khai).
 */
export function badgeView(badge: PublicBadge | null): BadgeView | null {
  if (!badge || (badge.status !== "notified" && badge.status !== "registered")) return null;
  const href = httpsUrl(badge.link_url);
  const src = httpsUrl(badge.image_url);
  if (!href || !src) return null;
  return { href, src, alt: badge.alt };
}
