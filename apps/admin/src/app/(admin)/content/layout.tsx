import type { ReactNode } from "react";
import { ContentLocalesProvider } from "@/components/content/locales";
import { ToastProvider } from "@/components/ui/toast";
import { contentLocales } from "@/lib/client-config";
import "@/components/content/content.css";
import "@/components/media/media.css";
import "@/components/structure/structure.css";

// Phân hệ Nội dung: danh sách bài viết và trình soạn. Thông báo nổi sau thao tác dùng chung; ngôn ngữ của
// nội dung và menu đọc từ core một lần cho cả phân hệ.
export default async function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <ContentLocalesProvider value={await contentLocales()}>
      <ToastProvider>{children}</ToastProvider>
    </ContentLocalesProvider>
  );
}
