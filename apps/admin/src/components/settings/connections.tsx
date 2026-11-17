import type { components } from "@autoxide/sdk";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { removeTenantSetting, setTenantSetting } from "@/app/(admin)/settings/actions";
import { Icon, type IconName } from "@/components/shell/icon";
import { Time } from "@/components/ui/time";
import {
  type ConnectionCategory,
  type ConnectionStatus,
  connectionStatus,
  settingMessageKey,
} from "@/lib/tenant-settings";
import { SettingDialog, type SettingDialogField } from "./setting-dialog";

type TenantSetting = components["schemas"]["TenantSettingState"];
type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** Biểu tượng của từng loại đối tác. */
export const CATEGORY_ICON: Record<ConnectionCategory, IconName> = {
  email: "mail",
  messaging: "chat",
  payment: "card",
  einvoice: "file",
  shipping: "truck",
  ai: "spark",
  other: "link",
};

const STATUS_BADGE: Record<ConnectionStatus, string> = {
  connected: "badge b-ok",
  unset: "badge b-draft",
  error: "badge b-bad",
};

/** Chữ theo khoá nếu messages có, không thì `fallback` (khoá lạ của module mới: mô tả của core). */
export function textOr(t: Translate, key: string, fallback: string): string {
  return t.has(key) ? t(key) : fallback;
}

/** Tên và mô tả của một kết nối (`kind` dạng `mail.smtp`). */
export function kindText(t: Translate, kind: string, fallbackAbout: string) {
  return {
    name: textOr(t, `kinds.${kind}.name`, kind),
    about: textOr(t, `kinds.${kind}.about`, fallbackAbout),
  };
}

/** Nhãn và gợi ý của một ô; khoá lạ: phần cuối của tên làm nhãn, mô tả của core làm gợi ý. */
export function fieldText(
  t: Translate,
  setting: { name: string; description?: string },
): { label: string; hint: string | undefined } {
  const key = `fields.${settingMessageKey(setting.name)}`;
  const known = t.has(`${key}.label`);
  return {
    label: known ? t(`${key}.label`) : (setting.name.split(".").at(-1) ?? setting.name),
    hint: t.has(`${key}.hint`) ? t(`${key}.hint`) : known ? undefined : setting.description,
  };
}

/** Thẻ một kết nối: biểu tượng, tên, một dòng mô tả, trạng thái, dòng phụ, nút. */
export function ConnectionCard({
  testId,
  icon,
  name,
  about,
  status,
  statusLabel,
  meta,
  badge,
  actions,
}: {
  testId: string;
  icon: IconName;
  name: string;
  about: string;
  status: ConnectionStatus;
  statusLabel: string;
  meta?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className="card conn-card" data-testid={testId} data-status={status}>
      <div className="conn-top">
        <span className={status === "connected" ? "sq-ic ok" : "sq-ic"} aria-hidden="true">
          <Icon name={icon} />
        </span>
        <div className="conn-name">
          <h3 className="conn-title">{name}</h3>
          {badge}
        </div>
        <span className={STATUS_BADGE[status]}>
          <span className="dot" />
          {statusLabel}
        </span>
      </div>
      <p className="conn-about">{about}</p>
      {meta ? <div className="conn-meta">{meta}</div> : null}
      {actions ? <div className="conn-acts">{actions}</div> : null}
    </article>
  );
}

/** Lần đổi gần nhất trong các cài đặt. */
function lastChange(settings: readonly TenantSetting[]): string | null {
  return settings.reduce<string | null>(
    (latest, s) => (s.updated_at && (!latest || s.updated_at > latest) ? s.updated_at : latest),
    null,
  );
}

/** Thẻ của một kết nối core đã nhận thật (`<module>.connection.<loại>.*`). */
export async function RealConnectionCard({
  kind,
  icon,
  settings,
}: {
  kind: string;
  icon: IconName;
  settings: readonly TenantSetting[];
}) {
  const t = await getTranslations("settings.connections");
  const { name, about } = kindText(t, kind, settings[0]?.description ?? "");
  const status = connectionStatus(settings);
  const changed = lastChange(settings);
  const fields: SettingDialogField[] = settings.map((s) => ({
    name: s.name,
    secret: s.secret,
    is_set: s.is_set,
    value: s.value ?? null,
    ...fieldText(t, s),
  }));
  return (
    <ConnectionCard
      testId={`conn-${kind}`}
      icon={icon}
      name={name}
      about={about}
      status={status}
      statusLabel={t(`status.${status}`)}
      meta={
        status === "unset" ? (
          t("serverDefault")
        ) : changed ? (
          <>
            {t("changedAt")} <Time value={changed} />
          </>
        ) : null
      }
      actions={
        <SettingDialog
          label={status === "unset" ? t("configure") : t("edit")}
          ariaLabel={t("configureLabel", { name })}
          title={t("configureLabel", { name })}
          about={about}
          primary={status === "unset"}
          name={name}
          removeLabel={t("dialog.disconnect")}
          fields={fields}
          save={setTenantSetting}
          remove={removeTenantSetting}
        />
      }
    />
  );
}

/** Cấu hình nghiệp vụ theo khách (không phải kết nối), xếp theo module, tên tiếng Việt / Anh. */
export async function BusinessSettings({ settings }: { settings: readonly TenantSetting[] }) {
  const t = await getTranslations("settings.connections");
  const modules = new Map<string, TenantSetting[]>();
  for (const setting of settings) {
    const module = setting.name.split(".")[0] ?? setting.name;
    modules.set(module, [...(modules.get(module) ?? []), setting]);
  }
  return (
    <div className="conn-business">
      {[...modules].map(([module, list]) => (
        <div key={module} className="conn-module">
          <h3 className="cap">{textOr(t, `business.modules.${module}`, module)}</h3>
          <div className="card">
            {list.map((setting) => {
              const key = `settings.${setting.name}`;
              const label = textOr(t, `${key}.label`, setting.name);
              const about = textOr(t, `${key}.about`, setting.description);
              return (
                <div
                  className="item conn-row"
                  key={setting.name}
                  data-testid={`tset-${setting.name}`}
                >
                  <div className="item-main">
                    <span className="item-title">{label}</span>
                    <span className="item-meta">{about}</span>
                    <span className="item-meta">
                      {setting.is_set ? (
                        <>
                          {setting.secret ? (
                            t("business.secretSet")
                          ) : (
                            <span className="mono conn-value">{setting.value}</span>
                          )}
                          {setting.updated_at ? (
                            <>
                              {" · "}
                              {t("changedAt")} <Time value={setting.updated_at} />
                            </>
                          ) : null}
                        </>
                      ) : (
                        t("serverDefault")
                      )}
                    </span>
                  </div>
                  <span className={setting.is_set ? "badge b-info" : "badge b-draft"}>
                    <span className="dot" />
                    {setting.is_set ? t("business.custom") : t("business.default")}
                  </span>
                  <span className="item-acts">
                    <SettingDialog
                      label={setting.is_set ? t("edit") : t("business.set")}
                      ariaLabel={t("configureLabel", { name: label })}
                      title={label}
                      about={about}
                      name={label}
                      removeLabel={t("dialog.reset")}
                      fields={[
                        {
                          name: setting.name,
                          secret: setting.secret,
                          is_set: setting.is_set,
                          value: setting.value ?? null,
                          label: t("business.value"),
                        },
                      ]}
                      save={setTenantSetting}
                      remove={removeTenantSetting}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
