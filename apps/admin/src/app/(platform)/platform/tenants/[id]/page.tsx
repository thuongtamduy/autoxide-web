import type { components } from "@autoxide/sdk";
import { notFound } from "next/navigation";
import { isForbidden, isNotFound, load, loadTagged } from "@/lib/core";
import { TENANTS_READ } from "@/lib/permissions";
import { platformData, platformGate, platformRefused } from "@/lib/platform-server";
import { sampleDataEnabled } from "@/sample";
import { CoreTenantView } from "./core-tenant";
import { SampleTenant } from "./sample-tenant";

// Chi tiết một khách: khách của core (bước 33) đọc `GET /kernel/tenants/{id}` (W-027); khách chỉ có
// trong dữ liệu mẫu (luồng cấp phát mẫu của bước 35) dùng trang mẫu cũ (W-014) khi bật dữ liệu mẫu.
export default async function TenantPage(props: PageProps<"/platform/tenants/[id]">) {
  const gate = await platformGate(TENANTS_READ);
  if (gate) return gate;
  const [{ id }, query] = await Promise.all([props.params, props.searchParams]);
  const one = (key: string) => {
    const value = query[key];
    return typeof value === "string" && value ? value : undefined;
  };
  let found: { data: { data: components["schemas"]["Tenant"] }; etag: string | null } | null;
  try {
    found = await loadTagged((client) =>
      client.GET("/api/v1/kernel/tenants/{id}", { params: { path: { id } } }),
    );
  } catch (error) {
    const refused = await platformRefused(error);
    if (refused) return refused;
    if (!isNotFound(error)) throw error;
    found = null;
  }
  if (!found) {
    if (sampleDataEnabled()) return <SampleTenant id={id} />;
    notFound();
  }
  const [data, settings] = await Promise.all([platformData(), tenantSettings(found.data.data.id)]);
  return (
    <CoreTenantView
      tenant={found.data.data}
      etag={found.etag}
      data={data}
      settings={settings}
      search={{ move_to: one("move_to"), keep_source: one("keep_source"), move: one("move") }}
    />
  );
}

/** Cấu hình theo khách của khách `id` (D-296 của core); `null` khi core từ chối (403). */
async function tenantSettings(
  id: string,
): Promise<components["schemas"]["TenantSettingState"][] | null> {
  try {
    return (
      await load((client) =>
        client.GET("/api/v1/kernel/tenants/{id}/settings", { params: { path: { id } } }),
      )
    ).data;
  } catch (error) {
    if (isForbidden(error)) return null;
    throw error;
  }
}
