"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Đặt trong một form lọc (GET): chọn là lọc ngay, gõ thì lọc sau khi ngừng gõ 400 ms — không phải
 * bấm "Lọc" (như Shopify, Linear). Đổi URL bằng `router.replace` nên ô đang gõ giữ nguyên con trỏ.
 * Nút gửi của form bị ẩn khi JavaScript chạy; trình duyệt tắt JavaScript vẫn bấm được nút đó.
 */
export function AutoFilter() {
  const marker = useRef<HTMLSpanElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    form.dataset.auto = "1";
    for (const b of form.querySelectorAll<HTMLButtonElement>("button[type=submit]:not([name])")) {
      b.hidden = true;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(form)) {
        if (typeof value === "string" && value.trim() !== "") params.append(key, value.trim());
      }
      const target = form.getAttribute("action") || pathname;
      const qs = params.toString();
      router.replace(qs ? `${target}?${qs}` : target, { scroll: false });
    };
    const typed = (el: EventTarget | null) =>
      el instanceof HTMLInputElement &&
      ["text", "search", "email", "tel", "url", "number"].includes(el.type);
    const onInput = (e: Event) => {
      if (!typed(e.target)) return;
      clearTimeout(timer);
      timer = setTimeout(go, 400);
    };
    const onChange = (e: Event) => {
      if (typed(e.target)) return;
      clearTimeout(timer);
      go();
    };
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      clearTimeout(timer);
      go();
    };
    // Gõ xong rồi bấm sang chỗ khác (mở một dòng, đổi trang): huỷ lần lọc đang chờ, nếu không 400 ms
    // sau trang bị kéo về danh sách.
    const onAway = (e: Event) => {
      if (e.target instanceof Node && !form.contains(e.target)) clearTimeout(timer);
    };
    document.addEventListener("pointerdown", onAway, true);
    form.addEventListener("input", onInput);
    form.addEventListener("change", onChange);
    form.addEventListener("submit", onSubmit);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onAway, true);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onChange);
      form.removeEventListener("submit", onSubmit);
    };
  }, [router, pathname]);

  return <span ref={marker} hidden />;
}
