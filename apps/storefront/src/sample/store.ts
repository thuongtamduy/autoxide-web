// Cửa hàng người mua đang chọn (mẫu): cookie `sf_store`, mặc định CN Quận 3. Giá và tình trạng
// hàng trên thẻ sản phẩm theo cửa hàng này. Khi core có hồ sơ công khai của cửa hàng (bước 34) và
// tồn công khai (bước 42), cookie giữ id của nút cửa hàng thay cho mã ngắn.
import { isStoreCode, type StoreCode } from "./catalog";

export const STORE_COOKIE = "sf_store";
export const DEFAULT_STORE: StoreCode = "q3";

export function parseStore(value: string | undefined): StoreCode {
  return isStoreCode(value) ? value : DEFAULT_STORE;
}
