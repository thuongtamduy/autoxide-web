"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { createRole, updateRole } from "@/app/(admin)/org/access/actions";
import { CheckField, Field, FormAlert, useFocusInvalid, useSubmit } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useHydrated } from "@/lib/hydrated";
import type { Scope } from "@/lib/org";
import type { PermissionInfo } from "@/lib/permission-groups";
import { PermissionPicker } from "./permission-picker";

export interface EditedRole {
  id: string;
  name: string;
  description: string;
  permissions: readonly string[];
  /** Permission cấp với độ sâu hẹp hơn cả khách (bước 34 của core). */
  grants?: readonly { permission: string; scope: Scope }[];
  /** Permission của role chỉ có hiệu lực với tài khoản đã bật xác thực hai bước. */
  requires_mfa?: boolean;
}

/**
 * Biểu mẫu role: tên, mô tả, "bắt buộc xác thực hai bước" và bộ chọn permission
 * (`PermissionPicker`) kèm độ sâu cho permission có phạm vi.
 * Ô chọn là controlled (giữ trong state), và form gửi qua `onSubmit` chứ không qua `action`,
 * để lựa chọn không bị React đặt lại khi core báo lỗi. Permission bị ẩn do ô tìm vẫn được gửi.
 */
export function RoleEditor({
  catalog,
  role,
  template,
  etag = null,
  editable,
}: {
  catalog: readonly PermissionInfo[];
  role?: EditedRole;
  /** Tạo role mới điền sẵn từ một role có sẵn (nút "Nhân bản"); bỏ qua khi có `role`. */
  template?: Omit<EditedRole, "id">;
  etag?: string | null;
  editable: boolean;
}) {
  const t = useTranslations("access.role");
  const hydrated = useHydrated();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const start = role ?? template;
  const [name, setName] = useState(start?.name ?? "");
  const [description, setDescription] = useState(start?.description ?? "");
  const [chosen, setChosen] = useState<Set<string>>(
    () =>
      new Set([...(start?.permissions ?? []), ...(start?.grants ?? []).map((g) => g.permission)]),
  );
  const [scopes, setScopes] = useState<Map<string, Scope>>(
    () => new Map((start?.grants ?? []).map((g) => [g.permission, g.scope])),
  );
  const [mfa, setMfa] = useState(start?.requires_mfa ?? false);
  // Hằng số ổn định cho bộ chọn (mảng mới mỗi lần render làm nó nhóm lại vô ích).
  const extra = useMemo(
    () => [...(start?.permissions ?? []), ...(start?.grants ?? []).map((g) => g.permission)],
    [start?.permissions, start?.grants],
  );
  const [state, submit, pending] = useSubmit(role ? updateRole : createRole, () =>
    toast(t("saved")),
  );
  useFocusInvalid(form, state);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(new FormData(event.currentTarget));
  };

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
        <CheckField
          name="requires_mfa"
          label={t("requiresMfa")}
          hint={t("requiresMfaHint")}
          checked={mfa}
          onChange={(event) => setMfa(event.target.checked)}
          disabled={!editable}
        />
      </div>

      <PermissionPicker
        catalog={catalog}
        extra={extra}
        chosen={chosen}
        onChange={setChosen}
        editable={editable}
        error={state.fields?.permissions ?? state.fields?.grants}
        scopes={scopes}
        onScope={(permission, scope) =>
          setScopes((current) => new Map(current).set(permission, scope))
        }
      />
      {editable ? (
        <div className="role-foot">
          <FormAlert state={state} />
          <button type="submit" className="btn pri" disabled={pending || !hydrated}>
            {role ? t("save") : t("create")}
          </button>
        </div>
      ) : (
        <p className="note">{t("readOnly")}</p>
      )}
    </form>
  );
}
