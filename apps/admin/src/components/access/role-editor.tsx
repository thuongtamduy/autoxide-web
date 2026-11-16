"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { createRole, updateRole } from "@/app/(admin)/org/access/actions";
import { Field, FormAlert, useFocusInvalid, useSubmit } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { PermissionInfo } from "@/lib/permission-groups";
import { PermissionPicker } from "./permission-picker";

export interface EditedRole {
  id: string;
  name: string;
  description: string;
  permissions: readonly string[];
}

/**
 * Biểu mẫu role: tên, mô tả và bộ chọn permission (`PermissionPicker`).
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
  // Hằng số ổn định cho bộ chọn (mảng mới mỗi lần render làm nó nhóm lại vô ích).
  const extra = useMemo(() => role?.permissions ?? [], [role?.permissions]);
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
      </div>

      <PermissionPicker
        catalog={catalog}
        extra={extra}
        chosen={chosen}
        onChange={setChosen}
        editable={editable}
        error={state.fields?.permissions}
      />
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
