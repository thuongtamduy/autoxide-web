// Thông tin người bán bắt buộc hiện trên trang sản phẩm (W-029): tên, loại hình, mã số thuế / số đăng
// ký kinh doanh, địa chỉ, liên hệ, đã xác thực chưa, điểm. Thay bằng `GET
// /api/v1/marketplace/public/sellers/{slug}` (bước 46: `SellerDisclosure::public_profile`) và hồ sơ
// công khai của khách cho hàng cửa hàng tự bán (bước 34).
//
// Nguồn: `apps/admin/src/sample/market-data.ts` (Khăn Bông Hạ Long: hộ kinh doanh, sàn giao hộ,
// điểm 4,1 trên 96 đánh giá, địa chỉ lấy hàng). Dữ liệu thật của người bán (mã số thuế, địa chỉ, số
// điện thoại) để trống dạng `[…]`: repo công khai.
import { SELLERS } from "./site";

/** Loại hình người bán (`seller_type` của bước 46). */
export type SellerType = "enterprise" | "household" | "individual";

export interface SellerProfile {
  slug: string;
  name: string;
  type: SellerType;
  /** Mã số thuế hoặc số đăng ký kinh doanh. */
  tax_code: string;
  address: string;
  phone: string;
  /** Đã xác thực danh tính và giấy tờ (KYC, bước 37) trước khi được đăng bán. */
  verified: boolean;
  rating: { value: number; count: number } | null;
  /** `platform`: sàn giao hộ từ kho của sàn; `self`: người bán tự giao. */
  fulfillment: "platform" | "self";
}

const PROFILES: readonly SellerProfile[] = [
  {
    slug: "khan-bong-ha-long",
    name: "Khăn Bông Hạ Long",
    type: "household",
    tax_code: "[MÃ SỐ THUẾ / SỐ ĐĂNG KÝ HỘ KINH DOANH]",
    address: "[Số nhà, đường mẫu], Phường Hồng Gai, Quảng Ninh",
    phone: "[SỐ ĐIỆN THOẠI]",
    verified: true,
    rating: { value: 4.1, count: 96 },
    fulfillment: "platform",
  },
];

/** Hồ sơ người bán theo slug: bản đủ ở trên, không có thì dựng từ danh sách người bán của trang chủ. */
export function sellerProfile(slug: string): SellerProfile | undefined {
  const found = PROFILES.find((p) => p.slug === slug);
  if (found) return found;
  const seller = SELLERS.find((s) => s.slug === slug);
  return seller
    ? {
        slug: seller.slug,
        name: seller.name,
        type: "enterprise",
        tax_code: "[MÃ SỐ THUẾ]",
        address: "[ĐỊA CHỈ]",
        phone: "[SỐ ĐIỆN THOẠI]",
        verified: true,
        rating: null,
        fulfillment: "self",
      }
    : undefined;
}
