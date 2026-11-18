import type { PublicOwner } from "@/lib/types";

// Hồ sơ pháp lý mẫu cho chân trang khi core chưa có hồ sơ (W-006): toàn chỗ trống `[…]` (repo công
// khai, không ghi dữ liệu thật). Chỉ hiện khi bật dữ liệu mẫu, kèm dấu "mẫu".
export const SAMPLE_OWNER: PublicOwner = {
  entity_type: "organization",
  legal_name: "[TÊN PHÁP LÝ]",
  trade_name: null,
  tax_code: "[MÃ SỐ THUẾ]",
  registration_number: null,
  registration_issued_on: null,
  registration_issued_by: null,
  address: null,
  phone: "[SỐ ĐIỆN THOẠI]",
  email: "[EMAIL]",
  representative_name: "[HỌ TÊN]",
};
