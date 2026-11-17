import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TipHeading } from "@/components/help/info-tip";
import { MessagePanel } from "@/components/message-panel";
import { InlineAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { ToastProvider } from "@/components/ui/toast";
import { allRoles } from "@/lib/access";
import { load } from "@/lib/core";
import { initialsOf } from "@/lib/initials";
import {
  chainOf,
  groupMemberships,
  memberCounts,
  ordered,
  SCOPES,
  type Scope,
  settingText,
  typeLabel,
  widestScope,
} from "@/lib/org";
import { loadMemberships, loadUnits, loadUnitTypes, loadUser } from "@/lib/org-server";
import {
  ROLES_READ,
  SETTINGS_WRITE,
  UNITS_MANAGE,
  UNITS_READ,
  UNITS_WRITE,
  USERS_READ,
} from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { addUnit, approveUnit, archiveUnit, dropSetting, putSetting } from "./actions";
import "@/components/engage/engage.css";
import "@/components/orgtree/orgtree.css";

const SCOPE_BADGE = {
  own: "badge b-draft",
  unit: "badge b-info",
  subtree: "badge b-violet",
  tenant: "badge b-ok",
} as const;

// Màn "Cây tổ chức" (phân hệ Tổ chức), module `organizations` của core (bước 34, D-303 – D-306):
// cây bên trái, chi tiết nút bên phải; điện thoại: danh sách → chi tiết (`?unit=` có thì hiện chi
// tiết, không thì hiện cây). Người ở nút: `GET /auth/memberships?org_id=` (gồm người gán ở nút trên).
export default async function OrgTreePage(props: PageProps<"/org">) {
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
  const units = await loadUnits();
  if (!units) notFound();
  const tree = ordered(units);
  const root = tree[0]?.unit;
  if (!root) notFound();
  const wanted = typeof params.unit === "string" ? params.unit : "";
  const node = tree.find((entry) => entry.unit.id === wanted)?.unit ?? root;
  const view = wanted ? "node" : "tree";

  const [types, settings, catalog, rows, allRows, write, manage, writeSettings, readRoles, users] =
    await Promise.all([
      loadUnitTypes(),
      load((c) =>
        c.GET("/api/v1/organizations/units/{id}/settings", { params: { path: { id: node.id } } }),
      ).then((r) => r.data),
      load((c) => c.GET("/api/v1/organizations/settings")).then((r) => r.data),
      loadMemberships({ org_id: node.id }),
      loadMemberships({}),
      can(UNITS_WRITE),
      can(UNITS_MANAGE),
      can(SETTINGS_WRITE),
      can(ROLES_READ),
      can(USERS_READ),
    ]);
  const members = groupMemberships(rows);
  const counts = memberCounts(allRows);
  const roles = readRoles ? await allRoles() : [];
  const scopeOf = new Map(roles.map((r) => [r.id, widestScope(r)]));
  // Tên và email của người ở nút (`auth.users.read`); không có quyền thì hiện mã người dùng.
  const people = new Map(
    users
      ? await Promise.all(
          [...new Set(members.map((m) => m.user_id))].map(
            async (id) => [id, await loadUser(id)] as const,
          ),
        )
      : [],
  );
  const nameOf = new Map(units.map((u) => [u.id, u.name]));
  const typeName = (code: string) =>
    typeLabel(types, code, (c) => (t.has(`types.${c}`) ? t(`types.${c}`) : null));
  const path = chainOf(units, node.id).slice(1).reverse();
  const describe = new Map(catalog.map((s) => [s.key, s.description]));
  const defaults = new Map(catalog.map((s) => [s.key, s.default ?? null]));
  const settingLabel = (key: string) => {
    const id = `settings.keys.${key.replaceAll(".", "_")}`;
    return t.has(id) ? t(id) : key;
  };

  const addButton =
    write && node.status === "active" ? (
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
            defaultValue: types.some((type) => type.code === "store")
              ? "store"
              : (types.find((type) => type.code !== "tenant")?.code ?? ""),
            options: types
              .filter((type) => type.code !== "tenant")
              .map((type) => ({ value: type.code, label: typeName(type.code) })),
            hint: t("add.typeHint", { parent: node.name }),
          },
          {
            kind: "text",
            name: "code",
            label: t("add.code"),
            mono: true,
            hint: t("add.codeHint"),
          },
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
                {manage && node.status === "pending" ? (
                  <div className="eg-acts ot-acts">
                    <InlineAction
                      action={approveUnit}
                      id={node.id}
                      label={t("approve")}
                      done={t("approved")}
                    />
                  </div>
                ) : null}
              </div>
              {node.status === "pending" ? <p className="note warn">{t("pendingNote")}</p> : null}
              {node.status === "suspended" ? (
                <p className="note warn">{node.status_reason ?? t("suspendedNote")}</p>
              ) : null}
            </section>

            <section className="block" aria-labelledby="ot-members-h">
              <div className="block-head">
                <h2 id="ot-members-h" className="h2">
                  {t("members.title")}
                </h2>
                <span className="cnt">{members.length}</span>
              </div>
              <p className="fhint">{t("members.hint")}</p>
              <div className="card tcard">
                {members.length === 0 ? (
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
                      {members.map((m) => {
                        const person = people.get(m.user_id);
                        const scopes = [
                          ...new Set(
                            m.roles
                              .map((r) => scopeOf.get(r.id))
                              .filter((s): s is Scope => Boolean(s)),
                          ),
                        ].sort((a, b) => SCOPES.indexOf(a) - SCOPES.indexOf(b));
                        return (
                          <tr key={`${m.user_id}|${m.org_id}`}>
                            <Td className="rt-title">
                              <span className="ot-person">
                                <span className="avatar sm" aria-hidden="true">
                                  {initialsOf(person?.name ?? person?.email ?? "?")}
                                </span>
                                <span className="cell2">
                                  {person ? (
                                    <>
                                      <Link
                                        className="open ell"
                                        href={`/org/access/users/${m.user_id}`}
                                      >
                                        {person.name}
                                      </Link>
                                      <span className="sub mono ell">{person.email}</span>
                                    </>
                                  ) : (
                                    <b className="mono ell">{m.user_id.slice(0, 8)}</b>
                                  )}
                                </span>
                              </span>
                            </Td>
                            <Td label={t("members.role")}>
                              <span className="mono">{m.roles.map((r) => r.name).join(", ")}</span>
                            </Td>
                            <Td label={t("members.depth")}>
                              {scopes.length > 0
                                ? scopes.map((scope) => (
                                    <span key={scope} className={SCOPE_BADGE[scope]}>
                                      {t(`scopes.${scope}`)}
                                    </span>
                                  ))
                                : "—"}
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
                        );
                      })}
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
                {settings.length === 0 ? (
                  <p className="empty">{t("settings.empty")}</p>
                ) : (
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
                      {settings.map((setting) => {
                        const label = settingLabel(setting.key);
                        const shown = settingText(setting.value);
                        return (
                          <tr key={setting.key}>
                            <Td className="rt-title">
                              <span className="cell2">
                                <b>{label}</b>
                                <span className="sub mono">{setting.key}</span>
                              </span>
                            </Td>
                            <Td label={t("settings.value")}>
                              {shown === "" ? (
                                <span className="muted">{t("settings.unset")}</span>
                              ) : typeof setting.value === "boolean" ? (
                                t(setting.value ? "settings.on" : "settings.off")
                              ) : (
                                shown
                              )}
                            </Td>
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
                            {writeSettings ? (
                              <Td className="rt-acts">
                                <span className="row-acts">
                                  <FormDialog
                                    action={putSetting}
                                    label={t("settings.set")}
                                    title={t("settings.setTitle", { key: label, unit: node.name })}
                                    intro={describe.get(setting.key) ?? t("settings.setIntro")}
                                    submit={t("settings.save")}
                                    done={t("settings.saved")}
                                    fields={[
                                      { kind: "hidden", name: "unit_id", value: node.id },
                                      { kind: "hidden", name: "key", value: setting.key },
                                      {
                                        kind: "hidden",
                                        name: "current",
                                        value: JSON.stringify(setting.value ?? null),
                                      },
                                      {
                                        kind: "hidden",
                                        name: "fallback",
                                        value: JSON.stringify(defaults.get(setting.key) ?? null),
                                      },
                                      {
                                        kind: "text",
                                        name: "value",
                                        label,
                                        defaultValue: shown,
                                        hint: t("settings.setIntro"),
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
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
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
