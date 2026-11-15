"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState, useTransition } from "react";
import {
  createApiKey,
  type KeyConfirm,
  type SecretState,
  startKeyPasskey,
} from "@/app/(admin)/settings/actions";
import { PermissionPicker } from "@/components/access/permission-picker";
import { Field, FormAlert, SelectField, useFocusInvalid, useSubmit } from "@/components/ui/form";
import { CopyButton, SecretOnce } from "@/components/ui/secret-once";
import { EXPIRY_CHOICES } from "@/lib/api-keys";
import type { FormState } from "@/lib/form";
import type { PermissionInfo } from "@/lib/permission-groups";
import { ceremonyErrorKey, passkeySignInSupported, requestOptionsJson } from "@/lib/webauthn";

/** Cách xác nhận lại tài khoản này dùng được (có mật khẩu, bật app xác thực, có passkey). */
export type KeyConfirmMethods = Readonly<Record<KeyConfirm, boolean>>;

/**
 * Tạo API key: tên, hạn, permission (chỉ những gì người tạo đang có), rồi xác nhận lại là chính
 * mình bằng mật khẩu, mã của app xác thực hay một passkey. Xong thì hiện khoá một lần, kèm lệnh
 * `curl` mẫu để thử ngay. Ô chọn giữ trong state, form gửi qua `onSubmit`, để core báo lỗi thì lựa
 * chọn không mất.
 */
export function ApiKeyCreator({
  catalog,
  coreUrl,
  methods,
}: {
  catalog: readonly PermissionInfo[];
  coreUrl: string;
  methods: KeyConfirmMethods;
}) {
  const t = useTranslations("settings.apiKeys");
  const form = useRef<HTMLFormElement>(null);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const offered = (["password", "totp", "passkey"] as const).filter((m) => methods[m]);
  const [confirm, setConfirm] = useState<KeyConfirm>(offered[0] ?? "password");
  // Lỗi ở trình duyệt khi ký bằng passkey (huỷ, không hỗ trợ): báo ngay, chưa gửi gì tới core.
  const [local, setLocal] = useState<FormState | null>(null);
  const [signing, startSigning] = useTransition();
  const [state, submit, pending] = useSubmit<SecretState>(createApiKey, () => {});
  useFocusInvalid(form, local ?? state);

  if (state.secret) {
    const example = `curl -s ${coreUrl}/api/v1/auth/me -H 'Authorization: Bearer ${state.secret}'`;
    return (
      <div className="card padded blocks" data-testid="created-key">
        <SecretOnce value={state.secret} label={t("key")} note={t("keyOnce")} />
        <div className="fld">
          <span className="lab">{t("tryIt")}</span>
          <code className="secret mono">{example}</code>
          <CopyButton text={example} label={t("copyCommand")} />
        </div>
        <div className="dlg-acts">
          <Link className="btn pri" href="/settings/api-keys">
            {t("stored")}
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLocal(null);
    if (confirm !== "passkey") {
      submit(data);
      return;
    }
    // Passkey: máy chủ lấy nghi thức từ core (id giữ trong cookie `httpOnly`), trình duyệt ký,
    // câu trả lời đi cùng form. Khoá riêng không rời authenticator.
    if (!passkeySignInSupported()) {
      setLocal({ error: t("passkeyUnsupported"), code: "account.webauthn_unsupported" });
      return;
    }
    startSigning(async () => {
      const started = await startKeyPasskey();
      if (started.options === undefined) {
        setLocal(started);
        return;
      }
      try {
        const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(
          requestOptionsJson(started.options),
        );
        const signed = await navigator.credentials.get({ publicKey });
        if (!(signed instanceof PublicKeyCredential)) throw new Error("no credential");
        data.set("passkey_credential", JSON.stringify(signed.toJSON()));
      } catch (error) {
        const why = ceremonyErrorKey(error) === "cancelled" ? "cancelled" : "failed";
        setLocal({
          error: t(why === "cancelled" ? "passkeyCancelled" : "passkeyFailed"),
          code: `account.webauthn_${why}`,
        });
        return;
      }
      submit(data);
    });
  };
  const shown = local ?? state;
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="role-form">
      <div className="card role-meta">
        <Field
          label={t("name")}
          name="name"
          autoComplete="off"
          mono
          defaultValue={state.values?.name}
          hint={t("nameHint")}
          error={shown.fields?.name}
          autoFocus
        />
        <SelectField
          label={t("expiry")}
          name="expiry"
          defaultValue={state.values?.expiry || "90d"}
          options={EXPIRY_CHOICES.map((choice) => ({
            value: choice,
            label: t(`expiries.${choice}`),
          }))}
          hint={t("expiryHint")}
        />
      </div>
      <PermissionPicker
        catalog={catalog}
        chosen={chosen}
        onChange={setChosen}
        editable
        error={shown.fields?.permissions}
      />
      <fieldset className="card role-meta" aria-describedby="key-confirm-hint">
        <legend className="vh">{t("confirmTitle")}</legend>
        <div className="fld">
          <span className="lab">{t("confirmTitle")}</span>
          <span id="key-confirm-hint" className="fhint">
            {t("passwordHint")}
          </span>
          {offered.length > 1 ? (
            <div className="rseg" role="radiogroup" aria-label={t("confirmTitle")}>
              {offered.map((method) => (
                <label key={method}>
                  <input
                    type="radio"
                    name="confirm"
                    value={method}
                    checked={confirm === method}
                    onChange={() => setConfirm(method)}
                  />
                  {t(`confirmBy.${method}`)}
                </label>
              ))}
            </div>
          ) : (
            <input type="hidden" name="confirm" value={confirm} />
          )}
        </div>
        {confirm === "password" ? (
          <Field
            label={t("password")}
            name="current_password"
            type="password"
            autoComplete="current-password"
            error={shown.fields?.current_password}
          />
        ) : null}
        {confirm === "totp" ? (
          <Field
            label={t("totpCode")}
            name="totp_code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={20}
            mono
            hint={t("totpHint")}
            error={shown.fields?.totp_code}
          />
        ) : null}
        {confirm === "passkey" ? <p className="fhint">{t("passkeyHint")}</p> : null}
      </fieldset>
      <div className="role-foot">
        <FormAlert state={shown} />
        <button type="submit" className="btn pri" disabled={pending || signing}>
          {t("create")}
        </button>
      </div>
    </form>
  );
}
