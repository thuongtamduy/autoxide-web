import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InviteDialog } from "@/components/access/sample-forms";
import { MessagePanel } from "@/components/message-panel";
import { SampleBadge } from "@/components/sample-badge";
import { InlineAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { ToastProvider } from "@/components/ui/toast";
import { allRoles } from "@/lib/access";
import { initialsOf } from "@/lib/initials";
import {
  INVITATIONS_MANAGE,
  ROLES_READ,
  SETTINGS_WRITE,
  UNITS_MANAGE,
  UNITS_READ,
  UNITS_WRITE,
} from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { listInvitations, listUnits, listUnitTypes, type OrgUnit } from "@/sample/org";
import {
  chainOf,
  effectiveSettings,
  listMemberships,
  listSplitRequests,
  memberCounts,
  SCOPES,
  SETTING_CHOICES,
  SETTINGS,
  SPLITTABLE,
} from "@/sample/org-tree";
import { roleOptions } from "./access/sample-gate";
import { addUnit, archiveUnit, askSplit, dropSetting, putSetting } from "./actions";
import "@/components/engage/engage.css";
import "@/components/orgtree/orgtree.css";
import { TipHeading } from "@/components/help/info-tip";

const ENDPOINTS =
  "GET/POST /api/v1/organizations/units, GET /api/v1/auth/memberships?org_id=, GET/PUT/DELETE /api/v1/organizations/units/{id}/settings, POST /api/v1/organizations/units/{id}/split-requests";

const SCOPE_BADGE = {
  own: "badge b-draft",
  unit: "badge b-info",
  subtree: "badge b-violet",
  tenant: "badge b-ok",
} as const;

/** Thứ tự cây: duyệt sâu từ gốc; con theo thứ tự tạo. Nút đã lưu trữ không hiện. */
function ordered(units: readonly OrgUnit[]): { unit: OrgUnit; depth: number }[] {
  const out: { unit: OrgUnit; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const unit of units.filter((u) => u.parent_id === parent && u.status !== "archived")) {
      out.push({ unit, depth });
      walk(unit.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// Màn "Cây tổ chức" (phân hệ Tổ chức): cả màn chờ API của bước 34 của core, dựng bằng dữ liệu mẫu
// (W-006, W-012). Cây bên trái, chi tiết nút bên phải; điện thoại: danh sách → chi tiết
// (`?unit=` có thì hiện chi tiết, không thì hiện cây). Role cho lời mời là role thật của core.
export default async function OrgTreePage(props: PageProps<"/org">) {
  if (!sampleDataEnabled()) notFound();
  const t = await getTranslations("orgtree");
  if (!(await can(UNITS_READ))) {
    const errors = await getTranslations("errors");
    return (
      <MessagePanel
        title={errors("forbiddenTitle")}
        message={errors("forbidden", { permission: UNITS_READ })}
      />
    );
  }
  const params = await props.searchParams;
  const [{ data: units }, { data: types }, counts] = await Promise.all([
    listUnits(),
    listUnitTypes(),
    memberCounts(),
  ]);
  const tree = ordered(units);
  const root = tree[0]?.unit;
  if (!root) notFound();
  const wanted = typeof params.unit === "string" ? params.unit : "";
  const node = tree.find((entry) => entry.unit.id === wanted)?.unit ?? root;
  const view = wanted ? "node" : "tree";
  const [
    { data: members },
    invitations,
    settings,
    { data: splits },
    write,
    manage,
    invite,
    writeSettings,
    readRoles,
  ] = await Promise.all([
    listMemberships({ org_id: node.id, include_inherited: true }),
    listInvitations({ status: "pending" }),
    effectiveSettings(node.id),
    listSplitRequests(node.id),
    can(UNITS_WRITE),
    can(UNITS_MANAGE),
    can(INVITATIONS_MANAGE),
    can(SETTINGS_WRITE),
    can(ROLES_READ),
  ]);
  const roles = invite && readRoles ? await allRoles() : null;
  const nameOf = new Map(units.map((u) => [u.id, u.name]));
  const typeName = (code: string) => (t.has(`types.${code}`) ? t(`types.${code}`) : code);
  const path = chainOf(units, node.id).slice(1).reverse();
  const waiting = invitations.data.filter((i) => i.org_id === node.id);
  const split = splits.find((s) => s.status === "requested");
  const canSplit = manage && SPLITTABLE.includes(node.unit_type) && node.status === "active";
  const valueLabel = (kind: string, value: string) =>
    t.has(`values.${kind}.${value}`) ? t(`values.${kind}.${value}`) : value;

  const addButton = write ? (
    <FormDialog
      action={addUnit}
      label={t("add.button")}
      triggerClass="btn pri"
      title={t("add.title", { parent: node.name })}
      intro={t("add.intro")}
      submit={t("add.submit")}
      done={t("add.done", { parent: node.name })}
      undoAction={archiveUnit}
      undoLabel={t("undo")}
      undoDone={t("add.undone")}
      fields={[
        { kind: "hidden", name: "parent_id", value: node.id },
        { kind: "text", name: "name", label: t("add.name") },
        {
          kind: "select",
          name: "unit_type",
          label: t("add.type"),
          defaultValue: "store",
          options: types
            .filter((type) => type.code !== "tenant")
            .map((type) => ({ value: type.code, label: typeName(type.code) })),
          hint: t("add.typeHint", { parent: node.name }),
        },
        { kind: "text", name: "code", label: t("add.code"), mono: true, hint: t("add.codeHint") },
      ]}
    />
  ) : null;

  return (
    <ToastProvider>
      <div className="page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{t("crumb", { tenant: root.name })}</span>
            <h1 className="h1">{t("title")}</h1>
            <p className="pdesc">{t("description")}</p>
            <span>
              <SampleBadge step="34" endpoint={ENDPOINTS} />
            </span>
          </div>
          {addButton ? <div className="headacts eg-headacts">{addButton}</div> : null}
        </section>

        <div className="ot-split" data-view={view}>
          <section className="card ot-tree" aria-labelledby="ot-tree-h">
            <h2 id="ot-tree-h" className="h2">
              {t("units")}
            </h2>
            <ul className="ot-list">
              {tree.map(({ unit, depth }) => (
                <li key={unit.id}>
                  <Link
                    href={`/org?unit=${unit.id}`}
                    className={unit.id === node.id ? "ot-node on" : "ot-node"}
                    aria-current={unit.id === node.id ? "page" : undefined}
                    style={{ paddingInlineStart: `${10 + depth * 20}px` }}
                  >
                    <span className="ot-name ell">{unit.name}</span>
                    <span className="ot-type">{typeName(unit.unit_type)}</span>
                    {unit.status !== "active" ? (
                      <span className="badge b-warn">{t(`status.${unit.status}`)}</span>
                    ) : null}
                    <span className="cnt" title={t("membersCount")}>
                      {counts.get(unit.id) ?? 0}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="fhint">{t("treeHint")}</p>
          </section>

          <div className="ot-detail blocks">
            <Link href="/org" className="btn ghost sm ot-back">
              <span aria-hidden="true">←</span> {t("back")}
            </Link>
            <section className="block" aria-labelledby="ot-node-h">
              <span className="crumb ell">
                {path.length > 0 ? path.map((u) => u.name).join(" › ") : t("rootPath")}
              </span>
              <div className="block-head">
                <h2 id="ot-node-h" className="h2">
                  {node.name}
                </h2>
                <span className="badge b-arch">{typeName(node.unit_type)}</span>
                {node.code ? <span className="mono muted">{node.code}</span> : null}
                <div className="eg-acts ot-acts">
                  {invite ? (
                    <InviteDialog
                      units={[{ value: node.id, label: node.name }]}
                      roles={roleOptions(roles)}
                    />
                  ) : null}
                  {canSplit && !split ? (
                    <FormDialog
                      action={askSplit}
                      label={t("split.button")}
                      title={t("split.title", { unit: node.name })}
                      intro={t("split.intro")}
                      points={[t("split.copy"), t("split.readOnly"), t("split.keeps")]}
                      submit={t("split.submit")}
                      done={t("split.done", { unit: node.name })}
                      fields={[
                        { kind: "hidden", name: "unit_id", value: node.id },
                        { kind: "textarea", name: "note", label: t("split.note") },
                        { kind: "check", name: "acknowledged", label: t("split.ack") },
                      ]}
                    />
                  ) : null}
                </div>
              </div>
              {split ? (
                <p className="note">
                  {t("split.waiting")} <Time value={split.created_at} />
                </p>
              ) : null}
              {node.status === "pending" ? <p className="note warn">{t("pendingNote")}</p> : null}
            </section>

            <section className="block" aria-labelledby="ot-members-h">
              <div className="block-head">
                <h2 id="ot-members-h" className="h2">
                  {t("members.title")}
                </h2>
                <span className="cnt">{members.length + waiting.length}</span>
              </div>
              <p className="fhint">{t("members.hint")}</p>
              <div className="card tcard">
                {members.length + waiting.length === 0 ? (
                  <p className="empty">{t("members.empty")}</p>
                ) : (
                  <Table cards>
                    <thead>
                      <tr>
                        <Th>{t("members.member")}</Th>
                        <Th>{t("members.role")}</Th>
                        <Th>{t("members.depth")}</Th>
                        <Th>{t("members.from")}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.id}>
                          <Td className="rt-title">
                            <span className="ot-person">
                              <span className="avatar sm" aria-hidden="true">
                                {initialsOf(m.user.name)}
                              </span>
                              <span className="cell2">
                                <b className="ell">{m.user.name}</b>
                                <span className="sub mono ell">{m.user.email}</span>
                              </span>
                            </span>
                          </Td>
                          <Td label={t("members.role")}>
                            <span className="mono">{m.roles.map((r) => r.name).join(", ")}</span>
                          </Td>
                          <Td label={t("members.depth")}>
                            {m.roles.map((r) => (
                              <span key={r.id} className={SCOPE_BADGE[r.scope]}>
                                {t(`scopes.${r.scope}`)}
                              </span>
                            ))}
                          </Td>
                          <Td label={t("members.from")}>
                            {m.inherited ? (
                              <span className="muted">
                                {t("members.inherited", { unit: nameOf.get(m.org_id) ?? "—" })}
                              </span>
                            ) : (
                              t("members.direct")
                            )}
                          </Td>
                        </tr>
                      ))}
                      {waiting.map((i) => (
                        <tr key={i.id}>
                          <Td className="rt-title">
                            <span className="ot-person">
                              <span className="avatar sm" aria-hidden="true">
                                {initialsOf(i.email)}
                              </span>
                              <span className="cell2">
                                <b className="mono ell">{i.email}</b>
                              </span>
                            </span>
                          </Td>
                          <Td label={t("members.role")}>
                            <span className="mono">{i.roles.map((r) => r.name).join(", ")}</span>
                          </Td>
                          <Td label={t("members.depth")}>—</Td>
                          <Td label={t("members.from")}>
                            <span className="badge b-warn">{t("members.invited")}</span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            </section>

            <section className="block" aria-labelledby="ot-settings-h">
              <TipHeading id="ot-settings-h" tip="inherit">
                {t("settings.title")}
              </TipHeading>
              <p className="fhint">{t("settings.hint")}</p>
              <div className="card tcard">
                {settings.ok ? (
                  <Table cards>
                    <thead>
                      <tr>
                        <Th>{t("settings.key")}</Th>
                        <Th>{t("settings.value")}</Th>
                        <Th>{t("settings.source")}</Th>
                        {writeSettings ? (
                          <Th>
                            <span className="vh">{t("settings.actions")}</span>
                          </Th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {settings.data.map((setting) => {
                        const info = SETTINGS.find((s) => s.key === setting.key);
                        const kind = info?.kind ?? "text";
                        const label = t(`settings.keys.${setting.key.replaceAll(".", "_")}`);
                        return (
                          <tr key={setting.key}>
                            <Td className="rt-title">
                              <span className="cell2">
                                <b>{label}</b>
                                <span className="sub mono">{setting.key}</span>
                              </span>
                            </Td>
                            <Td label={t("settings.value")}>{valueLabel(kind, setting.value)}</Td>
                            <Td label={t("settings.source")}>
                              {!setting.inherited ? (
                                <span className="badge b-info">{t("settings.here")}</span>
                              ) : setting.source_unit_id ? (
                                <span className="badge b-arch">
                                  {t("settings.from", {
                                    unit: nameOf.get(setting.source_unit_id) ?? "—",
                                  })}
                                </span>
                              ) : (
                                <span className="badge b-draft">{t("settings.default")}</span>
                              )}
                            </Td>
                            {writeSettings && info ? (
                              <Td className="rt-acts">
                                <span className="row-acts">
                                  <FormDialog
                                    action={putSetting}
                                    label={t("settings.set")}
                                    title={t("settings.setTitle", { key: label, unit: node.name })}
                                    intro={t("settings.setIntro")}
                                    submit={t("settings.save")}
                                    done={t("settings.saved")}
                                    fields={[
                                      { kind: "hidden", name: "unit_id", value: node.id },
                                      { kind: "hidden", name: "key", value: setting.key },
                                      {
                                        kind: "select",
                                        name: "value",
                                        label: label,
                                        defaultValue: setting.value,
                                        options: SETTING_CHOICES[info.kind].map((value) => ({
                                          value,
                                          label: valueLabel(info.kind, value),
                                        })),
                                      },
                                    ]}
                                  />
                                  {!setting.inherited ? (
                                    <InlineAction
                                      action={dropSetting}
                                      id={`${node.id}|${setting.key}`}
                                      label={t("settings.inherit")}
                                      done={t("settings.inherited")}
                                    />
                                  ) : null}
                                </span>
                              </Td>
                            ) : writeSettings ? (
                              <Td />
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                ) : (
                  <p className="empty">{settings.problem.detail}</p>
                )}
              </div>
            </section>

            <section className="block" aria-labelledby="ot-depth-h">
              <TipHeading id="ot-depth-h" tip="depth">
                {t("depth.title")}
              </TipHeading>
              <p className="fhint">{t("depth.hint")}</p>
              <ul className="card ot-depths">
                {SCOPES.map((scope) => (
                  <li key={scope}>
                    <span className={SCOPE_BADGE[scope]}>{t(`scopes.${scope}`)}</span>
                    <span>{t(`depth.${scope}`)}</span>
                  </li>
                ))}
              </ul>
              <p className="note">{t("depth.staff")}</p>
            </section>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
