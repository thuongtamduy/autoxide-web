"use server";

import type { AddressOption } from "./address";
import { loadCommunes } from "./address-server";

/** Phường, xã của tỉnh `code`, cho ô địa chỉ ở trình duyệt (chọn tỉnh xong mới tải). */
export async function communesOf(code: string, locale: string): Promise<AddressOption[]> {
  return loadCommunes(code, locale === "en" ? "en" : "vi");
}
