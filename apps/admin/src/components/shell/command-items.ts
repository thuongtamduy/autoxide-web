// Phần thuần của bảng lệnh Ctrl K (tách khỏi component để test không kéo theo Server Action).
import { fold } from "@/lib/fold";
import type { ShellGroup, ShellPage } from "./nav-client";

export interface Destination {
  key: string;
  label: string;
  context: string;
  href: string;
}

export function destinations(groups: ShellGroup[], extra: ShellPage[]): Destination[] {
  const out: Destination[] = [];
  for (const group of groups) {
    for (const page of group.pages) {
      out.push({
        key: `${group.id}/${page.id}`,
        label: page.label,
        context: group.pages.length > 1 || page.label !== group.label ? group.label : "",
        href: page.href,
      });
    }
  }
  for (const page of extra) {
    out.push({ key: page.id, label: page.label, context: "", href: page.href });
  }
  return out;
}

/** Lối tắt "Tạo mới" mà khung tính sẵn theo permission của người xem. */
export interface CreateShortcut {
  key: string;
  label: string;
  context: string;
  href: string;
}

export function filterDestinations<T extends { label: string; context: string }>(
  list: T[],
  query: string,
): T[] {
  const q = fold(query);
  if (!q) return list;
  return list.filter((d) => fold(`${d.context} ${d.label}`).includes(q));
}
