"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useToast } from "./toast";

/**
 * Báo một câu sau khi Server Action chuyển trang (vd "Đã xoá tài khoản" khi về danh sách): trang
 * đích thấy cờ trong địa chỉ (`?deleted=1`) thì render component này. Báo một lần rồi bỏ cờ khỏi
 * địa chỉ, để tải lại trang không báo lại.
 */
export function Flash({ text }: { text: string }) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const said = useRef(false);
  useEffect(() => {
    if (said.current) return;
    said.current = true;
    toast(text);
    router.replace(pathname, { scroll: false });
  }, [text, toast, router, pathname]);
  return null;
}
