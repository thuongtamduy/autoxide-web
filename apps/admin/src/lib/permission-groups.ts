// Bộ chọn permission của role: nhóm theo module (phần trước dấu chấm đầu tiên của tên, vd
// `auth.roles.read` → `auth`) và lọc theo chữ gõ vào, không cần dấu. Hàm thuần, chạy được ở cả
// máy chủ và trình duyệt.
import { fold } from "./fold";

export interface PermissionInfo {
  name: string;
  description: string;
  /**
   * Mức cẩn thận khi cấp (core v0.14.0, `ModulePermission.risk` của `GET /kernel/modules`): `read`,
   * `write`, `destructive`, `sensitive_data`, `money`. Không đọc được sổ module thì bỏ trống.
   */
  risk?: string;
}

/** Mức rủi ro cần nêu cạnh permission (đọc và ghi thường thì không). */
export const NOTABLE_RISKS = ["destructive", "sensitive_data", "money"] as const;
export type NotableRisk = (typeof NOTABLE_RISKS)[number];

export function notableRisk(permission: PermissionInfo): NotableRisk | null {
  return (NOTABLE_RISKS as readonly string[]).includes(permission.risk ?? "")
    ? (permission.risk as NotableRisk)
    : null;
}

/** Gắn mức rủi ro từ sổ module vào sổ permission (theo tên); permission không có trong sổ module giữ nguyên. */
export function withRisk(
  catalog: readonly PermissionInfo[],
  modules: readonly { permissions: readonly { name: string; risk: string }[] }[],
): PermissionInfo[] {
  const risks = new Map(modules.flatMap((m) => m.permissions.map((p) => [p.name, p.risk])));
  return catalog.map((p) => {
    const risk = risks.get(p.name);
    return risk ? { ...p, risk } : p;
  });
}

export interface PermissionGroup {
  /** Tên module, vd `auth`. */
  module: string;
  permissions: PermissionInfo[];
}

/** Module của một permission: phần trước dấu chấm đầu tiên (`<module>.<việc>`). */
export function moduleOf(name: string): string {
  const dot = name.indexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Gom permission theo module, module xếp theo tên, permission trong module xếp theo tên.
 * `extra`: tên role đang giữ mà sổ permission không còn (module đã gỡ) — vẫn hiện để bỏ chọn được.
 */
export function groupPermissions(
  catalog: readonly PermissionInfo[],
  extra: readonly string[] = [],
): PermissionGroup[] {
  const known = new Set(catalog.map((p) => p.name));
  const all = [
    ...catalog,
    ...extra.filter((name) => !known.has(name)).map((name) => ({ name, description: "" })),
  ];
  const groups = new Map<string, PermissionInfo[]>();
  for (const permission of all) {
    const module = moduleOf(permission.name);
    const list = groups.get(module) ?? [];
    list.push(permission);
    groups.set(module, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, permissions]) => ({
      module,
      permissions: [...permissions].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/** Permission khớp chữ tìm: theo tên hoặc mô tả, không phân biệt hoa thường và dấu. */
export function matchesPermission(permission: PermissionInfo, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  return fold(`${permission.name} ${permission.description}`).includes(q);
}
