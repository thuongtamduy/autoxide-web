// Phần thuần của bảng lệnh Ctrl K (tách khỏi component để test không kéo theo Server Action).
import { fold } from "@/lib/fold";
import type { IconName } from "./icon";
import type { ShellGroup, ShellPage } from "./nav-client";

export interface Destination {
  key: string;
  label: string;
  /** Phân hệ chứa màn ("Nội dung"); hiện mờ ở bên phải. Rỗng khi màn đứng riêng. */
  context: string;
  href: string;
  /** Icon của phân hệ: người dùng nhận ra dòng bằng mắt trước khi đọc chữ. */
  icon: IconName;
}

export function destinations(
  groups: ShellGroup[],
  extra: (ShellPage & { icon?: IconName })[],
): Destination[] {
  const out: Destination[] = [];
  for (const group of groups) {
    for (const page of group.pages) {
      out.push({
        key: `${group.id}/${page.id}`,
        label: page.label,
        context: group.pages.length > 1 || page.label !== group.label ? group.label : "",
        href: page.href,
        icon: group.icon,
      });
    }
  }
  for (const page of extra) {
    out.push({
      key: page.id,
      label: page.label,
      context: "",
      href: page.href,
      icon: page.icon ?? "right",
    });
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

/** Icon của một kết quả tìm dữ liệu, theo loại ghi ở đầu `key` (`entry/…`, `media/…`, `user/…`). */
export function hitIcon(key: string): IconName {
  const kind = key.slice(0, key.indexOf("/"));
  if (kind === "media") return "image";
  if (kind === "user") return "user";
  return "page";
}

/** Số màn "Gần đây" giữ lại và hiện khi chưa gõ gì. */
export const RECENT_MAX = 5;

/** Đưa màn vừa mở lên đầu danh sách gần đây (không trùng, tối đa `RECENT_MAX`). */
export function pushRecent(keys: readonly string[], key: string): string[] {
  return [key, ...keys.filter((k) => k !== key)].slice(0, RECENT_MAX);
}

/** Màn có địa chỉ đúng bằng `pathname` (bỏ chuỗi truy vấn); `undefined` khi không có. */
export function destinationAt(
  all: readonly Destination[],
  pathname: string,
): Destination | undefined {
  return all.find((d) => d.href.split("?")[0] === pathname);
}

/**
 * Khi chưa gõ gì, bảng lệnh không đổ ra mọi màn (vài chục dòng, người dùng phải cuộn để tìm): như
 * Linear, Vercel hay GitHub, nó gợi ý ít dòng. Có màn gần đây thì hiện chúng (màn đã mất quyền thì
 * bỏ); chưa có thì hiện màn đầu của mỗi phân hệ, như thanh bên. Gõ chữ thì tìm trong mọi màn.
 */
export function suggestions(
  all: readonly Destination[],
  groups: readonly ShellGroup[],
  recentKeys: readonly string[],
): { kind: "recent" | "areas"; items: Destination[] } {
  const recent = recentKeys
    .map((key) => all.find((d) => d.key === key))
    .filter((d): d is Destination => d !== undefined);
  if (recent.length > 0) return { kind: "recent", items: recent };
  const firsts = groups
    .map((g) => (g.pages[0] ? all.find((d) => d.key === `${g.id}/${g.pages[0]?.id}`) : undefined))
    .filter((d): d is Destination => d !== undefined)
    .map((d) => {
      const group = groups.find((g) => d.key.startsWith(`${g.id}/`));
      return { ...d, label: group?.label ?? d.label, context: "" };
    });
  return { kind: "areas", items: firsts };
}
