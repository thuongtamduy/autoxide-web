"use client";

import { useTransition } from "react";
import { chooseStore } from "@/sample/actions";
import { Icon } from "./icon";

/**
 * Chọn cửa hàng của bạn (mẫu): giá và tình trạng hàng trên mọi thẻ sản phẩm theo cửa hàng này.
 * Action ghi cookie rồi Next.js dựng lại trang.
 */
export function StorePicker({
  value,
  options,
  label,
}: {
  value: string;
  options: { code: string; name: string }[];
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <label className="hdr-store">
      <Icon name="map_pin" small />
      <select
        className="sel"
        aria-label={label}
        defaultValue={value}
        disabled={pending}
        onChange={(event) => {
          const code = event.target.value;
          start(() => chooseStore(code));
        }}
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
