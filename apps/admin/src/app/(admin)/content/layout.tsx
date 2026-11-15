import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import "@/components/content/content.css";
import "@/components/media/media.css";
import "@/components/structure/structure.css";

// Phân hệ Nội dung: danh sách bài viết và trình soạn. Thông báo nổi sau thao tác dùng chung.
export default function ContentLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
