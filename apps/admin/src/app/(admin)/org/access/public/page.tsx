import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/access/profile-form";
import { MessagePanel } from "@/components/message-panel";
import { Table, Td, Th } from "@/components/ui/table";
import { load } from "@/lib/core";
import { ordered, typeLabel } from "@/lib/org";
import { loadUnits, loadUnitTypes } from "@/lib/org-server";
import { PROFILE_MANAGE, UNITS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { communesOf } from "../profile-actions";

// Tab "Hồ sơ công khai" (module `organizations` của core, D-315): thông tin cửa hàng hiện trên
// website — tên, địa chỉ, giờ mở cửa, nhận tại quầy. Chỉ nút bật "Công khai" mới hiện ở
// `GET /organizations/public/stores`; không lộ thành viên hay cài đặt.
export default async function PublicProfilesPage(props: PageProps<"/org/access/public">) {
  if (!(await can(UNITS_READ))) {
    const errors = await getTranslations("errors");
    return (
      <MessagePanel
        title={errors("forbiddenTitle")}
        message={errors("forbidden", { permission: UNITS_READ })}
      />
    );
  }
  const t = await getTranslations("access.public");
  const { unit } = await props.searchParams;
  const units = await loadUnits();
  if (!units) notFound();
  const tree = ordered(units);
  const chosen = tree.find((entry) => entry.unit.id === unit)?.unit ?? tree[0]?.unit;
  if (!chosen) notFound();
  const [stores, profile, provinces, write] = await Promise.all([
    load((c) => c.GET("/api/v1/organizations/public/stores")).then((r) => r.data),
    load((c) =>
      c.GET("/api/v1/organizations/units/{id}/public-profile", {
        params: { path: { id: chosen.id } },
      }),
    ).then((r) => r.data),
    load((c) => c.GET("/api/v1/address/provinces")).then((r) => r.data),
    can(PROFILE_MANAGE),
  ]);
  const shown = new Map(stores.map((s) => [s.unit_id, s]));
  const communes = profile.address ? await communesOf(profile.address.province_code) : [];
  const types = await loadUnitTypes();
  const typeName = (code: string) =>
    typeLabel(types, code, (c) => (t.has(`type.${c}`) ? t(`type.${c}`) : null));
  // Giờ mở cửa: form sửa một khung chung cho mọi ngày; hồ sơ có nhiều khung thì lấy khung đầu.
  const hours = profile.opening_hours[0];
  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="units-h">
        <h2 id="units-h" className="h2">
          {t("units")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("unit")}</Th>
                <Th>{t("state")}</Th>
              </tr>
            </thead>
            <tbody>
              {tree.map(({ unit: node, depth }) => {
                const on = node.id === chosen.id;
                const store = shown.get(node.id);
                return (
                  <tr key={node.id} data-current={on ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2" style={{ paddingInlineStart: `${depth * 16}px` }}>
                        <Link
                          className="open"
                          href={`/org/access/public?unit=${node.id}`}
                          aria-current={on ? "true" : undefined}
                        >
                          {node.name}
                        </Link>
                        <span className="sub">
                          {typeName(node.unit_type)}
                          {store?.pickup ? ` · ${t("pickupShort")}` : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("state")}>
                      <span className={store ? "badge b-ok" : "badge b-draft"}>
                        <span className="dot" />
                        {store ? t("on") : t("off")}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>
      <section className="block half" aria-labelledby="profile-h">
        <h2 id="profile-h" className="h2">
          {chosen.name}
        </h2>
        {write ? (
          <ProfileForm
            profile={{
              unit_id: chosen.id,
              public: profile.public,
              display_name: profile.display_name,
              province_code: profile.address?.province_code ?? "",
              commune_code: profile.address?.commune_code ?? "",
              line: profile.address?.line ?? "",
              opens: hours?.opens ?? "",
              closes: hours?.closes ?? "",
              pickup: profile.pickup,
            }}
            provinces={provinces.map((p) => ({ value: p.code, label: p.name }))}
            communes={communes}
          />
        ) : (
          <p className="note">{t("readOnly", { permission: PROFILE_MANAGE })}</p>
        )}
      </section>
    </div>
  );
}
