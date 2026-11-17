"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { changePlan } from "@/app/(admin)/settings/plan-actions";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, FormAlert, SelectField, useOnDone } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

interface Option {
  value: string;
  label: string;
}

/** "Đổi gói": chọn gói chính và giá; nâng gói có hiệu lực ngay, hạ gói chờ hết kỳ. */
export function ChangePlanDialog({ options, current }: { options: Option[]; current: string }) {
  const t = useTranslations("settings.plan");
  return (
    <Dialog
      label={t("change")}
      title={t("changeTitle")}
      intro={
        <ul className="dlg-list">
          <li>{t("changeUp")}</li>
          <li>{t("changeDown")}</li>
        </ul>
      }
    >
      {(close) => <ChangePlanForm options={options} current={current} close={close} />}
    </Dialog>
  );
}

function ChangePlanForm({
  options,
  current,
  close,
}: {
  options: Option[];
  current: string;
  close: () => void;
}) {
  const t = useTranslations("settings.plan");
  const toast = useToast();
  // Mã của lần đổi này, sinh một lần khi mở hộp thoại (hộp thoại dựng lại mỗi lần mở).
  const [reference] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(changePlan, {});
  useOnDone(state.done, () => {
    close();
    toast(t("changed"));
  });
  return (
    <form action={action} noValidate className="dlg-form">
      <input type="hidden" name="reference" value={reference} />
      <SelectField
        label={t("price")}
        name="choice"
        options={options}
        defaultValue={current}
        error={state.fields?.choice}
      />
      <FormAlert state={state} />
      <DialogButtons submit={t("changeSubmit")} pending={pending} close={close} />
    </form>
  );
}
