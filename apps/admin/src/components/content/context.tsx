"use client";

import type { Problem } from "@autoxide/sdk";
import { createContext, useContext } from "react";
import type { EntryFields } from "@/app/(admin)/content/actions";
import type { AiState, ContentAbilities, Entry } from "@/lib/content";

// Trạng thái chung của trình soạn cho các khối con (thanh bên, hộp thoại): bài đang mở, phiên
// bản của nó, và cách báo kết quả của một lệnh. Giữ một chỗ để mọi lệnh gửi đúng phiên bản mới
// nhất trong `If-Match`.
export interface EditorApi {
  entry: Entry;
  version: string;
  /** Có chữ chưa lưu. */
  dirty: boolean;
  pending: boolean;
  can: ContentAbilities;
  ai: AiState;
  /** Ô đang sửa, để lệnh cần bản đã lưu (đăng, hẹn giờ, xem trước) lưu trước; `null` khi không có gì mới. */
  unsaved: () => EntryFields | null;
  /** Chạy một lệnh (khoá các nút trong lúc chờ). */
  run: (task: () => Promise<void>) => void;
  /** Nhận bài mới từ core. `reset`: thay cả thân bài trong trình soạn (khôi phục phiên bản). */
  accept: (entry: Entry, version: string, options?: { reset?: boolean }) => void;
  /** Báo lỗi của core trên trình soạn. */
  fail: (problem: Problem) => void;
  /** Áp gợi ý của AI vào bản nháp (chưa lưu; lưu thì bài mang dấu có AI hỗ trợ). */
  applySuggestion: (fields: {
    meta_title: string;
    meta_description: string;
    excerpt: string;
  }) => void;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditorApi(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error("useEditorApi outside of EntryEditor");
  return api;
}
