// Ô địa chỉ của website (tỉnh, thành phố → phường, xã; từ 01/7/2025): một lựa chọn của danh mục hành
// chính. Danh mục lấy từ module `address` của core (`GET /address/provinces`, `…/communes`).

/** Một đơn vị hành chính đem ra chọn: mã chính thức và tên. */
export interface AddressOption {
  code: string;
  name: string;
}
