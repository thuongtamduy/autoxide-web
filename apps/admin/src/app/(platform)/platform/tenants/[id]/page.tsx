import type { components } from "@autoxide/sdk";
import { notFound } from "next/navigation";
import { isNotFound, loadTagged } from "@/lib/core";
import { TENANTS_READ } from "@/lib/permissions";
import { platformData, platformGate, platformRefused } from "@/lib/platform-server";
import { sampleDataEnabled } from "@/sample";
import { CoreTenantView } from "./core-tenant";
import { SampleTenant } from "./sample-tenant";

// Chi tiết một khách: khách của core (bước 33) đọc `GET /kernel/tenants/{id}` (W-027); khách chỉ có
// trong dữ liệu mẫu (luồng cấp phát mẫu của bước 35) dùng trang mẫu cũ (W-014) khi bật dữ liệu mẫu.
export default async function TenantPage(props: { params: Promise<{ id: string }> }) {
  const gate = await platformGate(TENANTS_READ);
  if (gate) return gate;
  const { id } = await props.params;
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
  return <CoreTenantView tenant={found.data.data} etag={found.etag} data={await platformData()} />;
}
