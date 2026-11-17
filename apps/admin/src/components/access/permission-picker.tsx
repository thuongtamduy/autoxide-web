"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { SCOPES, type Scope } from "@/lib/org";
import {
  groupPermissions,
  matchesPermission,
  notableRisk,
  type PermissionInfo,
} from "@/lib/permission-groups";

/**
 * Bộ chọn permission nhóm theo module, có ô tìm (không cần dấu). Dùng chung cho role và API key.
 * Lựa chọn do component cha giữ (`chosen`, `onChange`), để core báo lỗi thì lựa chọn không mất.
 * Mỗi ô là `<input name="permission">`; ô bị ẩn vì ô tìm vẫn nằm trong form nên vẫn được gửi.
 */
export function PermissionPicker({
  catalog,
  extra = [],
  chosen,
  onChange,
  editable,
  error,
  scopes,
  onScope,
}: {
  catalog: readonly PermissionInfo[];
  /**
   * Độ sâu đang chọn của permission có phạm vi (chỉ trình sửa role truyền; API key không có độ
   * sâu). Không có trong map: cả khách. Mỗi ô chọn là `<select name="scope:<permission>">`.
   */
  scopes?: ReadonlyMap<string, Scope>;
  onScope?: (permission: string, scope: Scope) => void;
  /** Tên đang chọn mà sổ không còn (module đã gỡ): vẫn hiện để bỏ chọn được. */
  extra?: readonly string[];
  chosen: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  editable: boolean;
  error?: string | undefined;
}) {
  const t = useTranslations("access.role");
  const risks = useTranslations("access.risk");
  const depth = useTranslations("orgtree.scopes");
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupPermissions(catalog, extra), [catalog, extra]);

  const toggle = (names: readonly string[], on: boolean) => {
    const next = new Set(chosen);
    for (const n of names) {
      if (on) next.add(n);
      else next.delete(n);
    }
    onChange(next);
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
    <>
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
      {error ? <p className="ferr">{error}</p> : null}
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
                    <span className="mono check-name">
                      {permission.name}
                      {notableRisk(permission) ? (
                        <span
                          className={`badge ${notableRisk(permission) === "destructive" ? "b-bad" : "b-warn"} perm-risk`}
                          title={risks(`${notableRisk(permission)}Hint`)}
                        >
                          {risks(notableRisk(permission) ?? "money")}
                        </span>
                      ) : null}
                    </span>
                    <span className="check-desc">{permission.description || t("unknown")}</span>
                  </span>
                  {scopes && permission.scoped && chosen.has(permission.name) ? (
                    <select
                      className="inp sm perm-scope"
                      name={`scope:${permission.name}`}
                      aria-label={t("scopeOf", { permission: permission.name })}
                      value={scopes.get(permission.name) ?? "tenant"}
                      onChange={(event) => onScope?.(permission.name, event.target.value as Scope)}
                      disabled={!editable}
                    >
                      {SCOPES.map((scope) => (
                        <option key={scope} value={scope}>
                          {depth(scope)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
      {shownCount === 0 ? <p className="card empty">{t("noMatch", { query })}</p> : null}
    </>
  );
}
