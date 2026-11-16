import type { components } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";
import { removeTenantSetting, setTenantSetting } from "@/app/(admin)/settings/actions";
import { ConfirmButton } from "@/components/engage/actions";
import { FormDialog } from "@/components/ui/form-dialog";
import { Time } from "@/components/ui/time";

type TenantSetting = components["schemas"]["TenantSettingState"];

/**
 * Danh sách cài đặt theo khách của core: tên, mô tả của module, giá trị (secret không bao giờ
 * hiện), nút đặt / bỏ. Dùng chung cho hai chỗ:
 * - khách tự đặt cho mình (Cài đặt › Kết nối đối tác, `GET/PUT/DELETE /kernel/settings`);
 * - nhân sự nền tảng đặt cho một khách (`tenantId`, trang chi tiết khách,
 *   `…/kernel/tenants/{id}/settings`, D-296 của core).
 * Core kiểm giá trị: lỗi 422 hiện dưới ô "Giá trị". `editable = false` thì chỉ xem.
 */
export async function TenantSettingsList({
  settings,
  tenantId,
  editable = true,
}: {
  settings: readonly TenantSetting[];
  tenantId?: string;
  editable?: boolean;
}) {
  const t = await getTranslations("settings.connections");
  const target = tenantId ? { tenant_id: tenantId } : {};
  return (
    <div className="card">
      {settings.length === 0 ? <p className="empty">{t("tenant.empty")}</p> : null}
      {settings.map((setting) => (
        <div className="item" key={setting.name} data-testid={`tset-${setting.name}`}>
          <div className="item-main">
            <span className="item-title mono">{setting.name}</span>
            <span className="item-meta">{setting.description}</span>
            <span className="item-meta">
              {setting.is_set ? (
                <>
                  {setting.secret ? t("isSet") : <span className="mono">{setting.value}</span>}
                  {setting.updated_at ? (
                    <>
                      {" · "}
                      {t("tenant.updated")} <Time value={setting.updated_at} />
                    </>
                  ) : null}
                </>
              ) : (
                t("tenant.default")
              )}
            </span>
          </div>
          <span className={setting.is_set ? "badge b-ok" : "badge b-draft"}>
            <span className="dot" />
            {setting.is_set ? t("state.set") : t("state.unset")}
          </span>
          {editable ? (
            <span className="item-acts">
              <FormDialog
                action={setTenantSetting}
                label={setting.is_set ? t("change") : t("tenant.set")}
                ariaLabel={t("tenant.setLabel", { name: setting.name })}
                title={t("tenant.formTitle", { name: setting.name })}
                intro={setting.secret ? t("tenant.secretIntro") : setting.description}
                submit={t("tenant.save")}
                done={t("tenant.saved", { name: setting.name })}
                fields={[
                  ...(tenantId
                    ? [{ kind: "hidden" as const, name: "tenant_id", value: tenantId }]
                    : []),
                  { kind: "hidden", name: "name", value: setting.name },
                  { kind: "hidden", name: "secret", value: setting.secret ? "1" : "0" },
                  {
                    kind: setting.secret ? "password" : "text",
                    name: "value",
                    label: t("tenant.value"),
                    mono: true,
                    ...(setting.secret ? {} : { defaultValue: setting.value ?? "" }),
                  },
                ]}
              />
              {setting.is_set ? (
                <ConfirmButton
                  action={removeTenantSetting}
                  fields={{ ...target, id: setting.name }}
                  label={t("tenant.remove")}
                  title={t("tenant.removeTitle", { name: setting.name })}
                  points={[t("tenant.removeDefault")]}
                  submit={t("tenant.remove")}
                  done={t("tenant.removed", { name: setting.name })}
                />
              ) : null}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
