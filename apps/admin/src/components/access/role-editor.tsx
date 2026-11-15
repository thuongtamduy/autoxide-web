"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { createRole, updateRole } from "@/app/(admin)/org/access/actions";
import { Field, FormAlert, useFocusInvalid, useSubmit } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { groupPermissions, matchesPermission, type PermissionInfo } from "@/lib/permission-groups";

export interface EditedRole {
  id: string;
  name: string;
  description: string;
  permissions: readonly string[];
}

/**
 * Biểu mẫu role: tên, mô tả và bộ chọn permission nhóm theo module, có ô tìm (không cần dấu).
 * Ô chọn là controlled (giữ trong state), và form gửi qua `onSubmit` chứ không qua `action`,
 * để lựa chọn không bị React đặt lại khi core báo lỗi. Permission bị ẩn do ô tìm vẫn được gửi.
 */
export function RoleEditor({
  catalog,
  role,
  etag = null,
  editable,
}: {
  catalog: readonly PermissionInfo[];
  role?: EditedRole;
  etag?: string | null;
  editable: boolean;
}) {
  const t = useTranslations("access.role");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => groupPermissions(catalog, role?.permissions ?? []),
    [catalog, role?.permissions],
  );
  const [state, submit, pending] = useSubmit(role ? updateRole : createRole, () =>
    toast(t("saved")),
  );
  useFocusInvalid(form, state);

  const toggle = (names: readonly string[], on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      for (const n of names) {
        if (on) next.add(n);
        else next.delete(n);
      }
      return next;
    });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(new FormData(event.currentTarget));
  };
  const total = groups.reduce((sum, g) => sum + g.permissions.length, 0);
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      shown: group.permissions.filter((p) => matchesPermission(p, query)),
    }))
    .filter((group) => group.shown.length > 0);
  const shownCount = visibleGroups.reduce((sum, g) => sum + g.shown.length, 0);

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="role-form">
      {role ? <input type="hidden" name="id" value={role.id} /> : null}
      {role ? <input type="hidden" name="etag" value={etag ?? ""} /> : null}
      <div className="card role-meta">
        <Field
          label={t("name")}
          name="role_name"
          autoComplete="off"
          mono
          value={name}
          onChange={(event) => setName(event.target.value)}
          hint={t("nameHint")}
          error={state.fields?.role_name}
          disabled={!editable}
        />
        <Field
          label={t("description")}
          name="description"
          autoComplete="off"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={state.fields?.description}
          disabled={!editable}
        />
      </div>

      <div className="picker-head">
        <h3 className="h2">{t("permissions")}</h3>
        <span className="cap" data-testid="chosen-count">
          {t("chosen", { count: chosen.size, total })}
        </span>
      </div>
      <input
        className="inp"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("findHint")}
        aria-label={t("find")}
      />
      {state.fields?.permissions ? <p className="ferr">{state.fields.permissions}</p> : null}
      {/* Ô bị ẩn vì ô tìm vẫn nằm trong form (hidden), để vẫn được gửi. */}
      <div className="picker">
        {groups.map((group) => {
          const shown = visibleGroups.find((g) => g.module === group.module)?.shown ?? [];
          const names = shown.map((p) => p.name);
          const on = group.permissions.filter((p) => chosen.has(p.name)).length;
          const allShownOn = names.every((n) => chosen.has(n));
          return (
            <fieldset
              key={group.module}
              className="card checks"
              hidden={shown.length === 0}
              aria-label={group.module}
            >
              <legend className="checks-head">
                <span className="mono check-group">{group.module}</span>
                <span className="cap">
                  {t("groupCount", { on, total: group.permissions.length })}
                </span>
              </legend>
              {editable ? (
                <button
                  type="button"
                  className="btn ghost sm checks-all"
                  onClick={() => toggle(names, !allShownOn)}
                >
                  {allShownOn
                    ? t("clearGroup", { module: group.module })
                    : t("selectGroup", { module: group.module })}
                </button>
              ) : null}
              {group.permissions.map((permission) => (
                <label
                  key={permission.name}
                  className="check"
                  hidden={!names.includes(permission.name)}
                >
                  <input
                    type="checkbox"
                    name="permission"
                    value={permission.name}
                    checked={chosen.has(permission.name)}
                    onChange={(event) => toggle([permission.name], event.target.checked)}
                    disabled={!editable}
                  />
                  <span className="check-main">
                    <span className="mono check-name">{permission.name}</span>
                    <span className="check-desc">{permission.description || t("unknown")}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
      {shownCount === 0 ? <p className="card empty">{t("noMatch", { query })}</p> : null}
      {editable ? (
        <div className="role-foot">
          <FormAlert state={state} />
          <button type="submit" className="btn pri" disabled={pending}>
            {role ? t("save") : t("create")}
          </button>
        </div>
      ) : (
        <p className="note">{t("readOnly")}</p>
      )}
    </form>
  );
}
