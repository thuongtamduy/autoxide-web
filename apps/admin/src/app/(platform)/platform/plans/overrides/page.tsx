import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  removeOverrideAction,
  restoreOverrideAction,
  setOverrideAction,
  undoOverrideAction,
} from "@/app/(platform)/platform/plan-actions";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { load } from "@/lib/core";
import { formatBytes, formatCount } from "@/lib/format";
import { SUBSCRIPTIONS_MANAGE } from "@/lib/permissions";
import { isBytes, type Override } from "@/lib/plans";
import { platformData } from "@/lib/platform-server";
import { can, getModules } from "@/lib/viewer";

// Tab "Ghi đè cho từng khách" (`/plans/tenants/{id}/overrides`, bước 35 của core): ghi đè thay hẳn giá
// trị của gói cho một khách (module, tính năng, hạn mức), bắt buộc có lý do, có thể đặt ngày hết hạn.
// Đặt và bỏ đều Hoàn tác được. Core chưa có danh sách ghi đè của mọi khách: đọc từng khách (của core).
export default async function OverridesPage() {
  const t = await getTranslations("platform.overrides");
  const tp = await getTranslations("platform");
  const locale = await getLocale();
  const [{ tenants: all }, manage, modules] = await Promise.all([
    platformData(),
    can(SUBSCRIPTIONS_MANAGE),
    getModules(),
  ]);
  // Khách của core, trừ khách nền tảng (core: khách nền tảng không bao giờ bị giới hạn theo gói).
  const tenants = all.filter((x) => x.source === "core" && !x.is_platform);
  const overrides = (
    await Promise.all(
      tenants.map(async (tenant) =>
        (
          await load((c) =>
            c.GET("/api/v1/plans/tenants/{tenant_id}/overrides", {
              params: { path: { tenant_id: tenant.id } },
            }),
          )
        ).data.map((o) => ({ ...o, tenant_id: tenant.id })),
      ),
    )
  ).flat();
  const name = (id: string) => tenants.find((x) => x.id === id)?.name ?? id;
  const value = (o: Override) =>
    o.kind === "limit"
      ? o.max_value === null || o.max_value === undefined
        ? tp("unlimited")
        : isBytes(o.key)
          ? formatBytes(o.max_value, locale)
          : formatCount(o.max_value, locale)
      : o.enabled
        ? t("on")
        : t("off");
  const limitKeys = (modules ?? []).flatMap((m) => m.limits.map((l) => l.key));
  const featureKeys = (modules ?? []).flatMap((m) => m.features.map((f) => f.key));
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="pf-ov-h">
        <div className="block-head">
          <h2 id="pf-ov-h" className="h2">
            {t("title")}
          </h2>
          {manage ? (
            <FormDialog
              action={setOverrideAction}
              label={t("add")}
              triggerClass="btn sm pri"
              title={t("addTitle")}
              intro={t("addIntro")}
              submit={t("addSubmit")}
              done={t("added")}
              undoAction={undoOverrideAction}
              undoLabel={tp("undo")}
              undoDone={tp("undone")}
              fields={[
                {
                  kind: "select",
                  name: "tenant_id",
                  label: t("tenant"),
                  options: tenants
                    .filter((x) => x.status !== "provisioning")
                    .map((x) => ({ value: x.id, label: x.name })),
                },
                {
                  kind: "select",
                  name: "kind",
                  label: t("kind"),
                  defaultValue: "limit",
                  options: (["module", "feature", "limit"] as const).map((k) => ({
                    value: k,
                    label: t(`kinds.${k}`),
                  })),
                },
                {
                  kind: "text",
                  name: "key",
                  label: t("key"),
                  mono: true,
                  placeholder: "files.storage_bytes",
                  hint: t("keyHint", {
                    limits: limitKeys.join(", ") || "—",
                    features: featureKeys.join(", ") || "—",
                    modules: (modules ?? []).filter((m) => !m.always_enabled).length,
                  }),
                },
                {
                  kind: "text",
                  name: "value",
                  label: t("value"),
                  mono: true,
                  hint: t("valueHint"),
                },
                {
                  kind: "date",
                  name: "expires_on",
                  label: tp("expiresOn"),
                  hint: tp("expiresHint"),
                },
                { kind: "textarea", name: "reason", label: tp("reason"), hint: tp("reasonHint") },
              ]}
            />
          ) : null}
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("tenant")}</Th>
                <Th>{t("override")}</Th>
                <Th>{t("expires")}</Th>
                <Th>{tp("reason")}</Th>
                <Th>
                  <span className="vh">{tp("tenant.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <Td className="rt-title">
                    <Link href={`/platform/tenants/${o.tenant_id}`} className="open">
                      {name(o.tenant_id)}
                    </Link>
                  </Td>
                  <Td label={t("override")}>
                    <span className="cell2">
                      <span className="mono">
                        {t.has(`kinds.${o.kind}`) ? t(`kinds.${o.kind}`) : o.kind} {o.key} ={" "}
                        {value(o)}
                      </span>
                    </span>
                  </Td>
                  <Td label={t("expires")}>
                    {o.expires_at ? <Time value={o.expires_at} date /> : t("never")}
                  </Td>
                  <Td label={tp("reason")}>
                    <span className="cell2">
                      <span>{o.reason}</span>
                      <span className="sub">
                        <Time value={o.created_at} />
                      </span>
                    </span>
                  </Td>
                  <Td className="rt-acts">
                    {manage ? (
                      <FormDialog
                        action={removeOverrideAction}
                        label={t("remove")}
                        title={t("removeTitle", { tenant: name(o.tenant_id) })}
                        points={[tp("tenant.dropBack")]}
                        submit={t("remove")}
                        done={tp("tenant.dropped")}
                        undoAction={restoreOverrideAction}
                        undoLabel={tp("undo")}
                        undoDone={tp("undone")}
                        fields={[{ kind: "hidden", name: "id", value: `${o.tenant_id}|${o.id}` }]}
                      />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {overrides.length === 0 ? <p className="empty">{t("none")}</p> : null}
        </div>
      </section>
    </div>
  );
}
