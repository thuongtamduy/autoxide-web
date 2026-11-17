"use client";

// Biểu mẫu của các tab Lời mời, Uỷ quyền, Quyền vào hỗ trợ (bước 34 của core): Server Action,
// lỗi theo ô, gom mọi lỗi một lần.
import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import {
  delegateRole,
  inviteStaff,
  saveSupportAccess,
} from "@/app/(admin)/org/access/team-actions";
import { Dialog } from "@/components/ui/dialog";
import {
  CheckField,
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  TextareaField,
  useFocusInvalid,
  useOnDone,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export interface Option {
  value: string;
  label: string;
}

/** "Mời nhân sự": email, tên, nút, role (role thật của core). */
export function InviteDialog({
  units,
  roles,
  triggerClass = "btn sm",
}: {
  units: Option[];
  roles: Option[];
  triggerClass?: string;
}) {
  const t = useTranslations("access.invitations");
  return (
    <Dialog
      label={t("invite")}
      title={t("inviteTitle")}
      intro={t("inviteIntro")}
      triggerClass={triggerClass}
    >
      {(close) => <InviteForm units={units} roles={roles} close={close} />}
    </Dialog>
  );
}

function InviteForm({
  units,
  roles,
  close,
}: {
  units: Option[];
  roles: Option[];
  close: () => void;
}) {
  const t = useTranslations("access.invitations");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(inviteStaff, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => {
    close();
    toast(t("sent"));
  });
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <Field
        label={t("email")}
        name="email"
        type="email"
        autoComplete="off"
        mono
        defaultValue={state.values?.email}
        error={state.fields?.email}
        autoFocus
      />
      <Field
        label={t("name")}
        name="name"
        autoComplete="off"
        defaultValue={state.values?.name}
        error={state.fields?.name}
      />
      <SelectField
        label={t("unit")}
        name="org_id"
        options={units}
        defaultValue={state.values?.org_id}
        error={state.fields?.org_id}
      />
      <fieldset className="checks plain" aria-invalid={state.fields?.role_ids ? true : undefined}>
        <legend className="lab">{t("roles")}</legend>
        {roles.length === 0 ? <p className="fhint">{t("noRoles")}</p> : null}
        {roles.map((role) => (
          <CheckField key={role.value} name="role" value={role.value} label={role.label} />
        ))}
        {state.fields?.role_ids ? <span className="ferr">{state.fields.role_ids}</span> : null}
      </fieldset>
      <p className="fhint">{t("depth")}</p>
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}

/** "Uỷ quyền mới": khách con, role, hạn (không bắt buộc), lý do. */
/**
 * Uỷ quyền một role cho khách cấp dưới. `childTenants`: khách cấp dưới chọn được
 * (`GET /auth/delegations/tenants`, D-333 của core); rỗng thì gõ ID của khách con.
 */
export function DelegateDialog({
  roles,
  childTenants,
}: {
  roles: Option[];
  childTenants: Option[];
}) {
  const t = useTranslations("access.delegations");
  return (
    <Dialog
      label={t("create")}
      title={t("createTitle")}
      intro={t("createIntro")}
      triggerClass="btn sm"
    >
      {(close) => <DelegateForm roles={roles} childTenants={childTenants} close={close} />}
    </Dialog>
  );
}

function DelegateForm({
  roles,
  childTenants,
  close,
}: {
  roles: Option[];
  childTenants: Option[];
  close: () => void;
}) {
  const t = useTranslations("access.delegations");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(delegateRole, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => {
    close();
    toast(t("created"));
  });
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      {childTenants.length > 0 ? (
        <SelectField
          label={t("childPick")}
          name="child_tenant_id"
          options={childTenants}
          defaultValue={state.values?.child_tenant_id}
          error={state.fields?.child_tenant_id}
        />
      ) : (
        <Field
          label={t("childId")}
          name="child_tenant_id"
          autoComplete="off"
          mono
          hint={t("childIdHint")}
          defaultValue={state.values?.child_tenant_id}
          error={state.fields?.child_tenant_id}
        />
      )}
      <SelectField
        label={t("role")}
        name="role_id"
        options={roles}
        defaultValue={state.values?.role_id}
        error={state.fields?.role_id}
      />
      <Field
        label={t("expires")}
        name="expires_at"
        type="date"
        hint={t("expiresHint")}
        defaultValue={state.values?.expires_at}
        error={state.fields?.expires_at}
      />
      <TextareaField
        label={t("reason")}
        name="reason"
        hint={t("reasonHint")}
        defaultValue={state.values?.reason}
        error={state.fields?.reason}
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}

/** Bật / tắt cho nhân sự nền tảng vào để hỗ trợ (`auth.support_access`). */
export function SupportToggle({ enabled }: { enabled: boolean }) {
  const t = useTranslations("access.support");
  const toast = useToast();
  const [state, action, pending] = useActionState(saveSupportAccess, {});
  useOnDone(state.done, () => toast(t("saved")));
  return (
    <form action={action} className="card dlg-form padded">
      <CheckField
        name="enabled"
        label={t("allow")}
        hint={t("allowHint")}
        defaultChecked={enabled}
      />
      <FormAlert state={state} />
      <div className="dlg-acts">
        <button type="submit" className="btn pri" disabled={pending}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
