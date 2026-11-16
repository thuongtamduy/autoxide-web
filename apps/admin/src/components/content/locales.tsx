"use client";

// Ngôn ngữ của nội dung và của menu, do core quyết (`content.locales`, `menus.locales` của
// `GET /kernel/client-config`). Layout của phân hệ Nội dung đọc một lần ở máy chủ rồi đặt vào đây; các
// form bên trong lấy ra bằng hook, không phải truyền qua từng tầng component. Không chứa token.
import { createContext, type ReactNode, useContext } from "react";
import { FALLBACK_CONTENT_LOCALES } from "@/lib/content";

export interface ContentLocales {
  /** Ngôn ngữ của bài, trang, danh mục, chuyển hướng. */
  content: readonly string[];
  /** Ngôn ngữ mặc định của nội dung. */
  contentDefault: string;
  /** Ngôn ngữ của menu website. */
  menus: readonly string[];
}

export const FALLBACK_LOCALES: ContentLocales = {
  content: FALLBACK_CONTENT_LOCALES,
  contentDefault: FALLBACK_CONTENT_LOCALES[0],
  menus: FALLBACK_CONTENT_LOCALES,
};

const LocalesContext = createContext<ContentLocales>(FALLBACK_LOCALES);

export function ContentLocalesProvider({
  value,
  children,
}: {
  value: ContentLocales;
  children: ReactNode;
}) {
  return <LocalesContext value={value}>{children}</LocalesContext>;
}

export function useContentLocales(): ContentLocales {
  return useContext(LocalesContext);
}
