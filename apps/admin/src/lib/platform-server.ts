// Dữ liệu của mặt điều khiển nền tảng đọc ở máy chủ (W-027): sổ khách và placement THẬT của core
// (`GET /kernel/tenants`, `/kernel/placements`, bước 33), ghép với phần chỉ có trong dữ liệu mẫu khi
// bật dữ liệu mẫu (gói, thuê bao, cấp phát… của bước 35 chưa có API).
import "server-only";

import { ApiError, type components, type Problem } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";
import { cache, createElement, type ReactNode } from "react";
import { MessagePanel } from "@/components/message-panel";
import { sampleDataEnabled } from "@/sample";
import { listPlacements, listTenants } from "@/sample/platform";
import { load } from "./core";
import {
  mergePlacements,
  mergeTenants,
  type PlatformPlacement,
  type PlatformTenant,
} from "./platform";
import { can } from "./viewer";

type CoreTenant = components["schemas"]["Tenant"];

export interface PlatformData {
  tenants: PlatformTenant[];
  placements: PlatformPlacement[];
}

/** Đọc hết các trang của sổ khách (mỗi trang 200, tối đa 10 trang — đủ cho một bản cài). */
async function coreTenants(query: { parent_id?: string } = {}): Promise<CoreTenant[]> {
  const all: CoreTenant[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await load((client) =>
      client.GET("/api/v1/kernel/tenants", {
        params: { query: { limit: 200, ...query, ...(cursor ? { cursor } : {}) } },
      }),
    );
    all.push(...result.data);
    cursor = result.pagination.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return all;
}

/**
 * Sổ khách và placement, đọc một lần cho mỗi request. Ném `ApiError` của core (403 khi thiếu
 * permission hay không phải nhân sự của khách nền tảng — `tenant_platform_only`).
 */
export const platformData = cache(async (): Promise<PlatformData> => {
  const sample = sampleDataEnabled();
  const [tenants, placements, sampleTenants, samplePlacements] = await Promise.all([
    coreTenants(),
    load((client) => client.GET("/api/v1/kernel/placements")).then((r) => r.data),
    sample ? listTenants().then((r) => r.data) : Promise.resolve(null),
    sample ? listPlacements().then((r) => r.data) : Promise.resolve(null),
  ]);
  return {
    tenants: mergeTenants(tenants, placements, sampleTenants),
    placements: mergePlacements(placements, samplePlacements),
  };
});

/**
 * Cửa của một màn có dữ liệu thật của mặt điều khiển: thiếu permission thì báo như màn thật; trả
 * `null` khi được mở. Khác `sampleGate`: không đòi bật dữ liệu mẫu.
 */
export async function platformGate(permission: string): Promise<ReactNode | null> {
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  return createElement(MessagePanel, {
    title: t("forbiddenTitle"),
    message: t("forbidden", { permission }),
  });
}

/** Câu báo khi core từ chối mặt điều khiển (thiếu permission, không phải nhân sự nền tảng). */
export async function platformRefused(error: unknown): Promise<ReactNode | null> {
  if (!(error instanceof ApiError) || error.status !== 403) return null;
  const t = await getTranslations();
  const problem: Problem = error.problem;
  return createElement(MessagePanel, {
    title: t("errors.forbiddenTitle"),
    message: problem.code === "tenant_platform_only" ? t("platform.platformOnly") : problem.detail,
  });
}
