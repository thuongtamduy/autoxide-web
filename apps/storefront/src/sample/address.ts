// Đơn vị hành chính hai cấp (tỉnh, thành phố → phường, xã; áp dụng từ 01/7/2025) cho ô địa chỉ của
// website (mẫu, W-030). Core đã quyết module `address` (D-193) nhưng `openapi.json` chưa có endpoint
// công khai nào của nó: thay bằng danh mục đơn vị hành chính công khai của module đó khi có (dự kiến
// `GET /api/v1/address/public/provinces`, `…/provinces/{code}/wards` — bước 34 / D-193).
//
// Mẫu chỉ có vài tỉnh và vài phường, xã mỗi tỉnh; mã tỉnh như `SAMPLE_PROVINCES` của
// `apps/admin/src/sample/shipping.ts` (mã của Tổng cục Thống kê), mã phường, xã là mã mẫu.
import type { Localized } from "./index";

const L = (vi: string, en: string): Localized => ({ vi, en });

export interface Ward {
  code: string;
  name: Localized;
}

export interface Province {
  code: string;
  name: Localized;
  wards: readonly Ward[];
}

const ward = (code: string, vi: string, en = vi): Ward => ({ code, name: L(vi, en) });

export const PROVINCES: readonly Province[] = [
  {
    code: "79",
    name: L("TP. Hồ Chí Minh", "Ho Chi Minh City"),
    wards: [
      ward("79-01", "Phường Bến Thành", "Bến Thành Ward"),
      ward("79-02", "Phường Sài Gòn", "Sài Gòn Ward"),
      ward("79-03", "Phường Tân Định", "Tân Định Ward"),
      ward("79-04", "Phường Xuân Hoà", "Xuân Hoà Ward"),
      ward("79-05", "Phường Thủ Đức", "Thủ Đức Ward"),
    ],
  },
  {
    code: "01",
    name: L("Hà Nội", "Hanoi"),
    wards: [
      ward("01-01", "Phường Hoàn Kiếm", "Hoàn Kiếm Ward"),
      ward("01-02", "Phường Ba Đình", "Ba Đình Ward"),
      ward("01-03", "Phường Cầu Giấy", "Cầu Giấy Ward"),
      ward("01-04", "Phường Hoàng Mai", "Hoàng Mai Ward"),
      ward("01-05", "Xã Bát Tràng", "Bát Tràng Commune"),
    ],
  },
  {
    code: "48",
    name: L("Đà Nẵng", "Da Nang"),
    wards: [
      ward("48-01", "Phường Hải Châu", "Hải Châu Ward"),
      ward("48-02", "Phường Sơn Trà", "Sơn Trà Ward"),
    ],
  },
  {
    code: "92",
    name: L("Cần Thơ", "Can Tho"),
    wards: [
      ward("92-01", "Phường Ninh Kiều", "Ninh Kiều Ward"),
      ward("92-02", "Phường Cái Răng", "Cái Răng Ward"),
    ],
  },
  {
    code: "75",
    name: L("Đồng Nai", "Dong Nai"),
    wards: [
      ward("75-01", "Phường Trấn Biên", "Trấn Biên Ward"),
      ward("75-02", "Phường Biên Hoà", "Biên Hoà Ward"),
    ],
  },
  {
    code: "56",
    name: L("Khánh Hoà", "Khanh Hoa"),
    wards: [
      ward("56-01", "Phường Nha Trang", "Nha Trang Ward"),
      ward("56-02", "Phường Cam Ranh", "Cam Ranh Ward"),
    ],
  },
];

export function provinceByCode(code: string): Province | undefined {
  return PROVINCES.find((province) => province.code === code);
}

export function wardByCode(provinceCode: string, wardCode: string): Ward | undefined {
  return provinceByCode(provinceCode)?.wards.find((w) => w.code === wardCode);
}
