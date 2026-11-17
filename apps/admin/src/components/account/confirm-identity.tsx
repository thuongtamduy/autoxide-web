"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { startKeyPasskey } from "@/app/(admin)/settings/actions";
import { Field } from "@/components/ui/form";
import { type ConfirmMethod, type ConfirmMethods, offeredMethods } from "@/lib/confirm";
import type { FormState } from "@/lib/form";
import { ceremonyErrorKey, passkeySignInSupported, requestOptionsJson } from "@/lib/webauthn";

/**
 * Khối "Xác nhận là bạn" của lệnh nhạy cảm: chọn mật khẩu, mã của app xác thực hay một passkey đã có
 * (tuỳ tài khoản có gì). Tài khoản chỉ có passkey vẫn làm được lệnh nhạy cảm (`POST /auth/me/reauth`).
 * Ô `confirm` cho máy chủ biết cách đã chọn (`proof` ở `confirm-server.ts`).
 */
export function ConfirmFields({ methods, state }: { methods: ConfirmMethods; state: FormState }) {
  const t = useTranslations("account.confirm");
  const offered = offeredMethods(methods);
  const [method, setMethod] = useState<ConfirmMethod>(offered[0] ?? "password");
  // React đặt lại form sau mỗi lần gửi (nút chọn về mặc định): dựng lại nhóm nút với cách đang chọn.
  const [seen, setSeen] = useState(state);
  const [round, setRound] = useState(0);
  if (seen !== state) {
    setSeen(state);
    setRound((n) => n + 1);
  }
  if (offered.length === 0) return <p className="note warn">{t("none")}</p>;
  return (
    <fieldset className="fld" data-testid="confirm-identity">
      <legend className="lab">{t("title")}</legend>
      {/* Cách đã chọn đi qua ô ẩn: React đặt lại form sau mỗi lần gửi (nút chọn về mặc định), còn
          state thì giữ — ô ẩn luôn khớp với ô nhập đang hiện. */}
      <input type="hidden" name="confirm" value={method} />
      {offered.length > 1 ? (
        <div className="rseg" role="radiogroup" aria-label={t("title")} key={round}>
          {offered.map((m) => (
            <label key={m}>
              <input
                type="radio"
                name="confirm_choice"
                value={m}
                defaultChecked={method === m}
                onChange={() => setMethod(m)}
              />
              {t(`by.${m}`)}
            </label>
          ))}
        </div>
      ) : null}
      {method === "password" ? (
        <Field
          label={t("password")}
          name="current_password"
          type="password"
          autoComplete="current-password"
          error={state.fields?.current_password}
        />
      ) : null}
      {method === "totp" ? (
        <Field
          label={t("totpCode")}
          name="totp_code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={20}
          mono
          hint={t("totpHint")}
          error={state.fields?.totp_code}
        />
      ) : null}
      {method === "passkey" ? <p className="fhint">{t("passkeyHint")}</p> : null}
    </fieldset>
  );
}

/**
 * Trước khi gửi form: chọn passkey thì xin nghi thức từ core, cho trình duyệt ký bằng passkey đã có và
 * gắn câu trả lời vào `formData`. Trả lỗi (huỷ, không hỗ trợ) để hiện ngay; `null` khi gửi được.
 */
export async function signForProof(
  formData: FormData,
  t: (key: string) => string,
): Promise<FormState | null> {
  if (formData.get("confirm") !== "passkey") return null;
  if (!passkeySignInSupported()) {
    return { error: t("passkeyUnsupported"), code: "account.webauthn_unsupported" };
  }
  const started = await startKeyPasskey();
  if (started.options === undefined) return started;
  try {
    const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(
      requestOptionsJson(started.options),
    );
    const signed = await navigator.credentials.get({ publicKey });
    if (!(signed instanceof PublicKeyCredential)) throw new Error("no credential");
    formData.set("passkey_credential", JSON.stringify(signed.toJSON()));
    return null;
  } catch (error) {
    const why = ceremonyErrorKey(error) === "cancelled" ? "cancelled" : "failed";
    return {
      error: t(why === "cancelled" ? "passkeyCancelled" : "passkeyFailed"),
      code: `account.webauthn_${why}`,
    };
  }
}
