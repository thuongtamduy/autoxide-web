import { getTranslations } from "next-intl/server";
import { Chips } from "@/components/engage/common";
import { PlatformHead } from "@/components/platform/common";
import { SupportGrantDialog, SupportGrantTable } from "@/components/platform/support-grants";
import { allRoles } from "@/lib/access";
import { oneOf, type SearchParams } from "@/lib/engage";
import { SUPPORT_GRANT } from "@/lib/permissions";
import { platformData, platformGate, platformRefused } from "@/lib/platform-server";
import { GRANT_STATES, grantState, type SupportGrant } from "@/lib/support";
import { loadGrants, loadStaff } from "@/lib/support-server";

// Màn "Vào dữ liệu khách" (bước 34 của core, đợt 3b): nhân sự nền tảng chỉ vào dữ liệu một khách khi
// được cấp quyền có lý do và thời hạn; khách thấy mọi lần cấp và lần vào. Khách tắt hỗ trợ thì chỉ cấp
// được theo văn bản của cơ quan có thẩm quyền (core từ chối `auth.support_access_disabled`). Core chỉ
// liệt kê lần cấp theo từng khách (`GET /auth/support-grants?tenant_id=`), nên trang đọc từng khách
// thường của sổ khách rồi gộp lại, mới trước.
export default async function SupportPage(props: { searchParams: Promise<SearchParams> }) {
  const gate = await platformGate(SUPPORT_GRANT);
  if (gate) return gate;
  const t = await getTranslations("platform.support");
  const tp = await getTranslations("platform");
  const state = oneOf(await props.searchParams, "status", GRANT_STATES);
  let customers: { id: string; name: string }[];
  try {
    customers = (await platformData()).tenants.filter(
      (x) => x.source === "core" && !x.is_platform && x.status !== "provisioning",
    );
  } catch (error) {
    const refused = await platformRefused(error);
    if (refused) return refused;
    throw error;
  }
  const [lists, staff, roles] = await Promise.all([
    Promise.all(customers.map((x) => loadGrants(x.id))),
    loadStaff(),
    allRoles(),
  ]);
  const all: SupportGrant[] = lists
    .flatMap((list) => list ?? [])
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const now = Date.now();
  const grants = all.filter((g) => !state || grantState(g, now) === state);
  const name = (id: string) => customers.find((x) => x.id === id)?.name ?? id.slice(0, 8);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id.slice(0, 8);
  return (
    <div className="page">
      <PlatformHead
        crumb={t("crumb")}
        title={t("title")}
        description={t("description")}
        actions={
          customers.length > 0 ? (
            <SupportGrantDialog
              tenants={customers.map((x) => ({ value: x.id, label: x.name }))}
              staff={staff}
              roles={roles.map((r) => ({ value: r.id, label: r.name }))}
              triggerClass="btn pri"
            />
          ) : undefined
        }
      />
      <p className="note">
        {t("basisLaw")} {t("review")}
      </p>
      {customers.length === 0 ? <p className="note">{t("noCustomers")}</p> : null}

      <section className="block" aria-labelledby="pf-grants-h">
        <h2 id="pf-grants-h" className="h2">
          {t("listTitle")}
        </h2>
        <Chips
          label={t("filter")}
          chips={[
            { href: "/platform/support", label: tp("all"), on: !state, count: all.length },
            ...GRANT_STATES.map((s) => ({
              href: `/platform/support?status=${s}`,
              label: tp(`grantStatus.${s}`),
              on: s === state,
              count: all.filter((g) => grantState(g, now) === s).length,
            })),
          ]}
        />
        <div className="card tcard">
          <SupportGrantTable grants={grants} tenantName={name} roleName={roleName} manage />
        </div>
      </section>
    </div>
  );
}
