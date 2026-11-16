import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/access/sample-forms";
import { SampleBadge } from "@/components/sample-badge";
import { Table, Td, Th } from "@/components/ui/table";
import { UNITS_READ, UNITS_WRITE } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { listProfiles, listUnits, SAMPLE_PROVINCES } from "@/sample/org";
import { sampleGate } from "../sample-gate";

// Tab "Hồ sơ công khai" (dữ liệu mẫu, chờ hồ sơ công khai của nút ở bước 34, D-200): thông tin
// cửa hàng hiện trên website. Chỉ nút bật "Công khai" mới hiện; không lộ thành viên hay cài đặt.
export default async function PublicProfilesPage(props: PageProps<"/org/access/public">) {
  const gate = await sampleGate(UNITS_READ);
  if (gate) return gate;
  const t = await getTranslations("access.public");
  const { unit } = await props.searchParams;
  const [{ data: profiles }, { data: units }, write] = await Promise.all([
    listProfiles(),
    listUnits(),
    can(UNITS_WRITE),
  ]);
  const nameOf = new Map(units.map((u) => [u.id, u]));
  const chosen = profiles.find((p) => p.unit_id === unit) ?? profiles[0];
  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="units-h">
        <div className="block-head">
          <h2 id="units-h" className="h2">
            {t("units")}
          </h2>
          <SampleBadge step="34" endpoint="GET/PATCH /api/v1/organizations/units/{id}" />
        </div>
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
              {profiles.map((profile) => {
                const info = nameOf.get(profile.unit_id);
                const on = profile.unit_id === chosen?.unit_id;
                return (
                  <tr key={profile.unit_id} data-current={on ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link
                          className="open"
                          href={`/org/access/public?unit=${profile.unit_id}`}
                          aria-current={on ? "true" : undefined}
                        >
                          {info?.name ?? profile.display_name}
                        </Link>
                        <span className="sub">
                          {info ? t(`type.${info.unit_type}`) : ""}
                          {profile.pickup ? ` · ${t("pickupShort")}` : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("state")}>
                      <span className={profile.public ? "badge b-ok" : "badge b-draft"}>
                        <span className="dot" />
                        {profile.public ? t("on") : t("off")}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>
      {chosen ? (
        <section className="block half" aria-labelledby="profile-h">
          <h2 id="profile-h" className="h2">
            {nameOf.get(chosen.unit_id)?.name ?? chosen.display_name}
          </h2>
          {write ? (
            <ProfileForm
              profile={{
                unit_id: chosen.unit_id,
                public: chosen.public,
                display_name: chosen.display_name,
                province_code: chosen.address?.province_code ?? "",
                commune_name: chosen.address?.commune_name ?? "",
                line: chosen.address?.line ?? "",
                opens: chosen.hours[0]?.opens ?? "",
                closes: chosen.hours[0]?.closes ?? "",
                pickup: chosen.pickup,
              }}
              provinces={SAMPLE_PROVINCES.map((p) => ({ value: p.id, label: p.name }))}
            />
          ) : (
            <p className="note">{t("readOnly", { permission: UNITS_WRITE })}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
