import "server-only";

import type { components } from "@autoxide/sdk";
import { cache } from "react";
import { allRoles } from "@/lib/access";
import { actorNames } from "@/lib/audit";
import { isForbidden, isNotFound, load } from "@/lib/core";
import { AUDIT_READ, ROLES_READ, USERS_READ } from "@/lib/permissions";
// Đọc hộp việc, số đếm, số liệu, việc thiết lập và hoạt động cho một request (W-020). `cache` của React
// gộp mọi lời gọi trong cùng một lần render: khung (số đếm trên menu), trang Tổng quan và màn Việc dùng
// chung một lần đọc mỗi nguồn.
import { enabledModuleNames } from "@/lib/plans-server";
import { getMe, getModules } from "@/lib/viewer";
import { holds, NAV, type Viewer } from "@/nav/nav";
import { sampleDataEnabled } from "@/sample";
import { listUnits } from "@/sample/org";
import { listWorkStates } from "@/sample/work";
import { type ActivityLine, activityLines } from "./activity";
import { collectCounts, collectWork, navCounts, type WorkRow, withStates } from "./registry";
import { WORK_SOURCES } from "./sources";
import type { WorkContext, WorkItem } from "./types";

type User = components["schemas"]["UserResponse"];
type Role = components["schemas"]["RoleResponse"];

/** Người xem và ngữ cảnh của lần đọc này. */
export const workContext = cache(async (): Promise<WorkContext> => {
  const [me, installed] = await Promise.all([getMe(), getModules()]);
  const modules = await enabledModuleNames(installed);
  const viewer: Viewer = {
    allPermissions: me.all_permissions,
    permissions: me.permissions,
    modules,
    sample: sampleDataEnabled(),
  };
  return {
    can: (permission) => holds(viewer, permission),
    modules: viewer.modules,
    sample: viewer.sample === true,
    now: Date.now(),
  };
});

/** Tên nút gốc của cây tổ chức mẫu: phạm vi của việc đọc từ dữ liệu mẫu ("vì sao bạn thấy"). */
async function rootName(): Promise<string> {
  const { data } = await listUnits();
  return data.find((u) => u.parent_id === null)?.name ?? "";
}

/**
 * Điền "vì sao bạn thấy": permission của nguồn mà người xem có (admin có mọi permission: permission
 * đầu tiên của nguồn) và nút. Việc của nguồn thật áp cho cả khách; việc mẫu ở nút gốc cây mẫu.
 */
function withReason(item: WorkItem, ctx: WorkContext, root: string): WorkItem {
  const source = WORK_SOURCES.find((s) => s.id === item.source);
  const held = source?.permission?.find((p) => ctx.can(p)) ?? source?.permission?.[0] ?? null;
  return {
    ...item,
    reason: {
      permission: item.reason.permission ?? held,
      scope: source?.sample ? { key: "why.node", params: { node: root } } : { key: "why.tenant" },
    },
  };
}

/** Hộp việc của người xem kèm trạng thái hoãn / giao của họ. */
export const workRows = cache(
  async (): Promise<{ rows: WorkRow[]; incomplete: string[]; now: number }> => {
    const [ctx, me] = await Promise.all([workContext(), getMe()]);
    const [box, root, states] = await Promise.all([
      collectWork(WORK_SOURCES, ctx, { limit: 100 }),
      ctx.sample ? rootName() : Promise.resolve(""),
      ctx.sample ? listWorkStates(me.id) : Promise.resolve({ data: [] }),
    ]);
    const items = box.data.map((item) => withReason(item, ctx, root));
    return {
      rows: withStates(items, states.data, ctx.now),
      incomplete: box.incomplete,
      now: ctx.now,
    };
  },
);

/** Việc đang chờ (chưa hoãn), cho trang Tổng quan và số đếm của màn Việc. */
export function waiting(rows: readonly WorkRow[]): WorkRow[] {
  return rows.filter((row) => row.state !== "snoozed");
}

/** Thời gian giữ số đếm của menu. */
const COUNTS_TTL_MS = 10_000;
const COUNTS = new Map<string, { value: Record<string, number>; until: number }>();

/**
 * Số đếm trên menu theo màn (khung, mọi trang của không gian khách). Không bao giờ làm hỏng khung:
 * lỗi thì không có số.
 */
export const shellCounts = cache(async (): Promise<Record<string, number>> => {
  try {
    const me = await getMe();
    // Khung dựng lại ở mọi trang và mọi lần prefetch: giữ số đếm ngắn hạn trong bộ nhớ, khoá theo người
    // xem (core cũng cache số đếm, khoá gồm khách, người gọi, nút — D-190). Hộp việc và Tổng quan luôn
    // đọc mới.
    const key = `${me.id}:${sampleDataEnabled()}`;
    const hit = COUNTS.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const ctx = await workContext();
    const [counts, { rows }] = await Promise.all([collectCounts(WORK_SOURCES, ctx), workRows()]);
    const value = navCounts(NAV, counts.data, waiting(rows).length);
    if (COUNTS.size > 1000) COUNTS.clear();
    COUNTS.set(key, { value, until: Date.now() + COUNTS_TTL_MS });
    return value;
  } catch {
    return {};
  }
});

/** Ai nhận được việc của một nguồn: người dùng của core có permission của nguồn (role của họ). */
export interface Candidate {
  id: string;
  name: string;
  permissions: readonly string[] | "all";
}

/**
 * Người có thể được giao việc: người dùng đang dùng của core (trang đầu, 50 người) kèm role của từng
 * người trong cùng câu trả lời (`include=roles&status=active`), permission tra theo sổ role
 * (`GET /auth/roles`, một lời gọi). Người xem không đọc được danh sách người dùng (`auth.users.read`)
 * thì chỉ giao được cho chính mình; không đọc được sổ role (`auth.roles.read`) thì không biết
 * permission của người khác: họ chỉ được coi là xử lý được việc không đòi permission.
 */
export const assignCandidates = cache(async (): Promise<Candidate[]> => {
  const [me, ctx] = await Promise.all([getMe(), workContext()]);
  const self: Candidate = {
    id: me.id,
    name: me.name || me.email,
    permissions: me.all_permissions ? "all" : me.permissions,
  };
  if (!ctx.can(USERS_READ)) return [self];
  const [page, roles] = await Promise.all([
    load((client) =>
      client.GET("/api/v1/auth/users", {
        params: { query: { limit: 50, status: "active", include: "roles" } },
      }),
    ),
    ctx.can(ROLES_READ) ? allRoles() : Promise.resolve([] as Role[]),
  ]);
  const byId = new Map(roles.map((role) => [role.id, role]));
  return page.data.map((user: User): Candidate => {
    if (user.id === me.id) return self;
    const held = (user.roles ?? []).map((r) => byId.get(r.id)).filter((r): r is Role => !!r);
    return {
      id: user.id,
      name: user.name || user.email,
      permissions: held.some((r) => r.all_permissions)
        ? "all"
        : [...new Set(held.flatMap((r) => r.permissions))],
    };
  });
});

/** Người này xử lý được việc của nguồn `sourceId` (có một trong các permission của nguồn). */
export function canHandle(candidate: Candidate, sourceId: string, item?: WorkItem): boolean {
  if (candidate.permissions === "all") return true;
  const source = WORK_SOURCES.find((s) => s.id === sourceId);
  const wanted = item?.reason.permission ? [item.reason.permission] : (source?.permission ?? []);
  const held = candidate.permissions;
  return wanted.length === 0 || wanted.some((p) => held.includes(p));
}

/**
 * Hoạt động gần đây đọc THẬT từ nhật ký audit (`GET /api/v1/audit`, cần `audit.read`), câu theo i18n.
 * `null` khi người xem không đọc được nhật ký (chờ `GET /api/v1/audit/activity` của bước 51 P5, trả
 * cho mọi người theo quyền đọc từng bản ghi).
 */
export const recentActivity = cache(
  async (limit: number): Promise<{ lines: ActivityLine[]; names: Map<string, string> } | null> => {
    const ctx = await workContext();
    if (!ctx.can(AUDIT_READ)) return null;
    let page: components["schemas"]["Page_AuditEntryResponse"];
    try {
      page = await load((client) =>
        client.GET("/api/v1/audit", { params: { query: { limit: 200, include: "actor" } } }),
      );
    } catch (error) {
      // Không có module `audit` (404) hay core từ chối (403): không có khối hoạt động.
      if (isForbidden(error) || isNotFound(error)) return null;
      throw error;
    }
    const lines = activityLines(page.data, limit);
    // Tên người làm đi cùng mỗi mục (`include=actor`), không gọi thêm cho từng người.
    return { lines, names: actorNames(page.data) };
  },
);
