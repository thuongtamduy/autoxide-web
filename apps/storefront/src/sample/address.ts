// Đơn vị hành chính hai cấp (tỉnh, thành phố → phường, xã; áp dụng từ 01/7/2025): danh sách rút gọn
// dùng khi core chưa có danh mục (chưa cài module `address` hay chưa nhập — `lib/address-server.ts`
// đọc danh mục thật trước). Mã tỉnh, phường là mã chính thức (QĐ 19/2025/QĐ-TTg), khớp với danh mục
// của core, nên địa chỉ mẫu đã lưu cũng chọn lại được trong danh mục thật.
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
      ward("26743", "Phường Bến Thành", "Bến Thành Ward"),
      ward("26740", "Phường Sài Gòn", "Sài Gòn Ward"),
      ward("26737", "Phường Tân Định", "Tân Định Ward"),
      ward("27139", "Phường Xuân Hoà", "Xuân Hoà Ward"),
      ward("26824", "Phường Thủ Đức", "Thủ Đức Ward"),
    ],
  },
  {
    code: "01",
    name: L("Hà Nội", "Hanoi"),
    wards: [
      ward("00070", "Phường Hoàn Kiếm", "Hoàn Kiếm Ward"),
      ward("00004", "Phường Ba Đình", "Ba Đình Ward"),
      ward("00166", "Phường Cầu Giấy", "Cầu Giấy Ward"),
      ward("00331", "Phường Hoàng Mai", "Hoàng Mai Ward"),
      ward("00577", "Xã Bát Tràng", "Bát Tràng Commune"),
    ],
  },
  {
    code: "48",
    name: L("Đà Nẵng", "Da Nang"),
    wards: [
      ward("20242", "Phường Hải Châu", "Hải Châu Ward"),
      ward("20263", "Phường Sơn Trà", "Sơn Trà Ward"),
    ],
  },
  {
    code: "92",
    name: L("Cần Thơ", "Can Tho"),
    wards: [
      ward("31135", "Phường Ninh Kiều", "Ninh Kiều Ward"),
      ward("31186", "Phường Cái Răng", "Cái Răng Ward"),
    ],
  },
  {
    code: "75",
    name: L("Đồng Nai", "Dong Nai"),
    wards: [
      ward("26041", "Phường Trấn Biên", "Trấn Biên Ward"),
      ward("26068", "Phường Biên Hoà", "Biên Hoà Ward"),
    ],
  },
  {
    code: "56",
    name: L("Khánh Hoà", "Khanh Hoa"),
    wards: [
      ward("22366", "Phường Nha Trang", "Nha Trang Ward"),
      ward("22420", "Phường Cam Ranh", "Cam Ranh Ward"),
    ],
  },
];

export function provinceByCode(code: string): Province | undefined {
  return PROVINCES.find((province) => province.code === code);
}

export function wardByCode(provinceCode: string, wardCode: string): Ward | undefined {
  return provinceByCode(provinceCode)?.wards.find((w) => w.code === wardCode);
}
