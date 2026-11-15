"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import {
  confirmTotp,
  disableTotp,
  regenerateRecoveryCodes,
  startTotp,
} from "@/app/(admin)/account/actions";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid, useOnDone } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { QrPath } from "@/lib/qr";
import { RecoveryCodes } from "./recovery-codes";

/**
 * Nút của mục "Xác thực hai bước". Cả ba hộp thoại luôn được dựng (chỉ ẩn nút): bật xong thì
 * trang tải lại với trạng thái mới, mà hộp thoại vẫn phải giữ mã khôi phục đang hiện.
 */
export function TotpActions({ enabled }: { enabled: boolean }) {
  const t = useTranslations("account.totp");
  return (
    <>
      <Dialog
        label={t("enable")}
        title={t("enableTitle")}
        intro={t("enableIntro")}
        triggerClass="btn sm pri"
        hideTrigger={enabled}
      >
        {(close) => <EnableTotp close={close} />}
      </Dialog>
      <Dialog
        label={t("newCodes")}
        title={t("newCodesTitle")}
        intro={t("newCodesIntro")}
        hideTrigger={!enabled}
      >
        {(close) => <NewCodes close={close} />}
      </Dialog>
      <Dialog
        label={t("disable")}
        title={t("disableTitle")}
        intro={t("disableIntro")}
        triggerClass="btn sm danger"
        hideTrigger={!enabled}
      >
        {(close) => <DisableTotp close={close} />}
      </Dialog>
    </>
  );
}

function EnableTotp({ close }: { close: () => void }) {
  const t = useTranslations("account.totp");
  const form = useRef<HTMLFormElement>(null);
  const [setup, start, starting] = useActionState(startTotp, {});
  useFocusInvalid(form, setup);
  if (setup.secret && setup.qr) {
    return <ScanAndConfirm secret={setup.secret} qr={setup.qr} close={close} />;
  }
  return (
    <form ref={form} action={start} noValidate className="dlg-form">
      <Field
        label={t("password")}
        name="current_password"
        type="password"
        autoComplete="current-password"
        error={setup.fields?.current_password}
        autoFocus
      />
      <FormAlert state={setup} />
      <DialogButtons submit={t("continue")} pending={starting} close={close} />
    </form>
  );
}

function ScanAndConfirm({ secret, qr, close }: { secret: string; qr: QrPath; close: () => void }) {
  const t = useTranslations("account.totp");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, confirm, pending] = useActionState(confirmTotp, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => toast(t("enabled")));
  if (state.codes) {
    return <RecoveryCodes codes={state.codes} close={close} />;
  }
  return (
    <form ref={form} action={confirm} noValidate className="dlg-form">
      <p className="fhint">{t("scan")}</p>
      <svg
        className="qr"
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        role="img"
        aria-label={t("qrLabel")}
        shapeRendering="crispEdges"
      >
        <rect width={qr.size} height={qr.size} fill="#fff" />
        <path d={qr.d} fill="#000" />
      </svg>
      <div className="fld">
        <span className="lab">{t("manual")}</span>
        <code className="secret mono" data-testid="totp-secret">
          {secret.match(/.{1,4}/g)?.join(" ") ?? secret}
        </code>
      </div>
      <Field
        label={t("code")}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        mono
        error={state.fields?.code}
        autoFocus
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("confirm")} pending={pending} close={close} />
    </form>
  );
}

function NewCodes({ close }: { close: () => void }) {
  const t = useTranslations("account.totp");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(regenerateRecoveryCodes, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => toast(t("codesReplaced")));
  if (state.codes) {
    return <RecoveryCodes codes={state.codes} close={close} />;
  }
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <Field
        label={t("appCode")}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        mono
        error={state.fields?.code}
        autoFocus
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("newCodesSubmit")} pending={pending} close={close} />
    </form>
  );
}

function DisableTotp({ close }: { close: () => void }) {
  const t = useTranslations("account.totp");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(disableTotp, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () => {
    close();
    toast(t("disabled"));
  });
  return (
    <form ref={form} action={action} noValidate className="dlg-form">
      <Field
        label={t("codeOrRecovery")}
        name="code"
        autoComplete="one-time-code"
        mono
        error={state.fields?.code}
        autoFocus
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("disableSubmit")} pending={pending} close={close} danger />
    </form>
  );
}
