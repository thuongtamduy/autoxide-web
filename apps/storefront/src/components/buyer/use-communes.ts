"use client";

import { useEffect, useState } from "react";
import type { AddressOption } from "@/lib/address";
import { communesOf } from "@/lib/address-actions";

/**
 * Phường, xã của tỉnh đang chọn: tải từ core khi đổi tỉnh (qua Server Action), nhớ theo tỉnh để chọn
 * lại không tải lần nữa.
 */
export function useCommunes(
  province: string,
  locale: string,
): { communes: AddressOption[]; loading: boolean } {
  const [byProvince, setByProvince] = useState<Record<string, AddressOption[]>>({});
  const known = province ? byProvince[province] : undefined;
  useEffect(() => {
    if (!province || known) return;
    let alive = true;
    communesOf(province, locale).then((list) => {
      if (alive) setByProvince((all) => ({ ...all, [province]: list }));
    });
    return () => {
      alive = false;
    };
  }, [province, known, locale]);
  return { communes: known ?? [], loading: Boolean(province) && !known };
}
