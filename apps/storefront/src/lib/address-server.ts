import "server-only";

import { cache } from "react";
import { sampleDataEnabled, text } from "@/sample";
import { PROVINCES } from "@/sample/address";
import type { AddressOption } from "./address";
import { loadChrome } from "./core";

/**
 * Tỉnh, thành phố để chọn (`GET /address/provinces` của core, công khai). Core không trả gì (chưa cài
 * module `address` hay chưa nhập danh mục) thì danh sách mẫu khi bật dữ liệu mẫu, không thì rỗng.
 */
export const loadProvinces = cache(async (locale: string): Promise<AddressOption[]> => {
  const answer = await loadChrome(locale, (client) => client.GET("/api/v1/address/provinces"));
  const core = (answer?.data ?? []).map((p) => ({ code: p.code, name: p.name }));
  if (core.length > 0) return core;
  return sampleDataEnabled()
    ? PROVINCES.map((p) => ({ code: p.code, name: text(p.name, locale) }))
    : [];
});

/** Phường, xã, đặc khu của một tỉnh; như `loadProvinces`, danh sách mẫu khi core không có. */
export async function loadCommunes(code: string, locale: string): Promise<AddressOption[]> {
  if (!/^[0-9A-Za-z]{1,10}$/.test(code)) return [];
  const answer = await loadChrome(locale, (client) =>
    client.GET("/api/v1/address/provinces/{code}/communes", { params: { path: { code } } }),
  );
  const core = (answer?.data ?? []).map((c) => ({ code: c.code, name: c.name }));
  if (core.length > 0) return core;
  if (!sampleDataEnabled()) return [];
  const sample = PROVINCES.find((p) => p.code === code);
  return (sample?.wards ?? []).map((w) => ({ code: w.code, name: text(w.name, locale) }));
}
