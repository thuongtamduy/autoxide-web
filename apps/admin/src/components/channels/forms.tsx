"use client";

// Biểu mẫu của màn Kênh bán (dữ liệu mẫu, W-006 / W-019, chờ module `channels` của bước 48). Khoá kết nối
// của kênh nhập một lần ở ô mật khẩu, ghi thẳng vào kho secret của khách và không bao giờ hiện lại.
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  allocationAction,
  connectAction,
  linkAction,
  mapAction,
  reconnectAction,
  resolveAction,
  resolveLineAction,
  syncAction,
} from "@/app/(admin)/sales/channels/actions";
import { ActionDialog } from "@/components/catalog/action-dialog";
import type { Option } from "@/components/catalog/forms";
import { Field, FormAlert, SelectField, TextareaField, useSubmit } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";

const value = (state: FormState, name: string, fallback = "") => state.values?.[name] ?? fallback;

export function ConnectDialog({ kinds, orgs }: { kinds: Option[]; orgs: Option[] }) {
  const t = useTranslations("channels.connect");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn pri"
      action={connectAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <SelectField
            label={t("kind")}
            name="kind"
            options={kinds}
            hint={t("kindHint")}
            defaultValue={value(state, "kind", kinds[0]?.value ?? "")}
            error={state.fields?.kind}
          />
          <Field
            label={t("name")}
            name="name"
            required
            maxLength={60}
            defaultValue={value(state, "name")}
            error={state.fields?.name}
          />
          <SelectField
            label={t("org")}
            name="org_id"
            options={orgs}
            defaultValue={value(state, "org_id", orgs[0]?.value ?? "")}
            error={state.fields?.org_id}
          />
          <Field
            label={t("token")}
            name="token"
            type="password"
            mono
            required
            autoComplete="off"
            hint={t("tokenHint")}
            error={state.fields?.token}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** "Đồng bộ ngay": xếp job đẩy toàn bộ tồn và giá lên các tài khoản đang chạy. */
export function SyncNowButton() {
  const t = useTranslations("channels.sync");
  const toast = useToast();
  const [state, run, pending] = useSubmit(syncAction, () => toast(t("done")));
  return (
    <form action={run} className="inline-form">
      <button type="submit" className="btn" disabled={pending}>
        {t("button")}
      </button>
      <FormAlert state={state} />
    </form>
  );
}

export function ReconnectDialog({ id, name }: { id: string; name: string }) {
  const t = useTranslations("channels.reconnect");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { name })}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={reconnectAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <Field
          label={t("token")}
          name="token"
          type="password"
          mono
          required
          autoComplete="off"
          hint={t("tokenHint")}
          error={state.fields?.token}
        />
      )}
    </ActionDialog>
  );
}

/** Gắn biến thể với mã trên kênh; giá theo bảng giá, theo % (làm tròn lên 1.000 ₫) hay cố định từ một ngày. */
export function LinkDialog({ accounts, variants }: { accounts: Option[]; variants: Option[] }) {
  const t = useTranslations("channels.link");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={linkAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => <LinkFields state={state} accounts={accounts} variants={variants} />}
    </ActionDialog>
  );
}

function LinkFields({
  state,
  accounts,
  variants,
}: {
  state: FormState;
  accounts: Option[];
  variants: Option[];
}) {
  const t = useTranslations("channels.link");
  const [mode, setMode] = useState(value(state, "mode", "price_list"));
  return (
    <>
      <SelectField
        label={t("variant")}
        name="sku"
        options={[{ value: "", label: t("pick") }, ...variants]}
        defaultValue={value(state, "sku")}
        error={state.fields?.sku}
      />
      <SelectField
        label={t("account")}
        name="account_id"
        options={accounts}
        defaultValue={value(state, "account_id", accounts[0]?.value ?? "")}
        error={state.fields?.account_id}
      />
      <Field
        label={t("externalSku")}
        name="external_sku"
        mono
        required
        placeholder="KB4-SHP"
        hint={t("externalSkuHint")}
        defaultValue={value(state, "external_sku")}
        error={state.fields?.external_sku}
      />
      <SelectField
        label={t("price")}
        name="mode"
        options={[
          { value: "price_list", label: t("modes.price_list") },
          { value: "markup", label: t("modes.markup") },
          { value: "fixed", label: t("modes.fixed") },
        ]}
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        error={state.fields?.mode}
      />
      {mode === "markup" ? (
        <Field
          label={t("markup")}
          name="value"
          mono
          required
          placeholder="8"
          hint={t("markupHint")}
          defaultValue={value(state, "value")}
          error={state.fields?.value}
        />
      ) : null}
      {mode === "fixed" ? (
        <div className="gr-two">
          <Field
            label={t("fixed")}
            name="value"
            inputMode="numeric"
            mono
            required
            defaultValue={value(state, "value")}
            error={state.fields?.value}
          />
          <Field
            label={t("from")}
            name="from"
            type="date"
            required
            defaultValue={value(state, "from")}
            error={state.fields?.from}
          />
        </div>
      ) : null}
    </>
  );
}

export interface AllocationInput {
  id: string;
  account: string;
  target: string;
  mode: "share" | "reserved";
  share: number;
  reserved: number;
  buffer: number;
  variant: boolean;
}

export function AllocationDialog({ allocation }: { allocation: AllocationInput }) {
  const t = useTranslations("channels.alloc");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { account: allocation.account, target: allocation.target })}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={allocationAction}
      hidden={{ id: allocation.id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <div className="gr-two">
          <SelectField
            label={t("mode")}
            name="mode"
            options={[
              { value: "share", label: t("modes.share") },
              ...(allocation.variant ? [{ value: "reserved", label: t("modes.reserved") }] : []),
            ]}
            defaultValue={value(state, "mode", allocation.mode)}
            error={state.fields?.mode}
          />
          <Field
            label={t("share")}
            name="share"
            inputMode="numeric"
            mono
            defaultValue={value(state, "share", String(allocation.share))}
            error={state.fields?.share}
          />
          <Field
            label={t("reserved")}
            name="reserved"
            inputMode="numeric"
            mono
            defaultValue={value(state, "reserved", String(allocation.reserved))}
            error={state.fields?.reserved}
          />
          <Field
            label={t("buffer")}
            name="buffer"
            inputMode="numeric"
            mono
            hint={t("bufferHint")}
            defaultValue={value(state, "buffer", String(allocation.buffer))}
            error={state.fields?.buffer}
          />
        </div>
      )}
    </ActionDialog>
  );
}

/** Gắn một dòng đơn kênh chưa có liên kết với biến thể; đủ mọi dòng thì nhập thành đơn ngay. */
export function MapDialog({
  id,
  externalSku,
  title,
  variants,
  primary = true,
}: {
  id: string;
  externalSku: string;
  title: string;
  variants: Option[];
  primary?: boolean;
}) {
  const t = useTranslations("channels.map");
  return (
    <ActionDialog<FormState>
      label={t("button", { sku: externalSku })}
      title={t("title", { sku: externalSku })}
      intro={t("intro", { title })}
      triggerClass={primary ? "btn sm pri" : "btn sm"}
      action={mapAction}
      hidden={{ id, external_sku: externalSku }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <SelectField
          label={t("variant")}
          name="sku"
          options={[{ value: "", label: t("pick") }, ...variants]}
          defaultValue={value(state, "sku")}
          error={state.fields?.sku}
        />
      )}
    </ActionDialog>
  );
}

/** Đóng xung đột trạng thái (ghi chú bắt buộc, không đảo được). */
export function ResolveConflictDialog({ id, number }: { id: string; number: string }) {
  const t = useTranslations("channels.conflict");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { number })}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={resolveAction}
      hidden={{ id, resolution: "close_conflict" }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <TextareaField
          label={t("note")}
          name="note"
          required
          maxLength={300}
          defaultValue={value(state, "note")}
          error={state.fields?.note}
        />
      )}
    </ActionDialog>
  );
}

/** Đóng một dòng lệch của bảng kê (ghi chú bắt buộc, lưu vào dòng đối soát; không đảo được). */
export function ResolveLineDialog({ id, order }: { id: string; order: string }) {
  const t = useTranslations("channels.line");
  return (
    <ActionDialog<FormState>
      label={t("button")}
      title={t("title", { order })}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={resolveLineAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <TextareaField
          label={t("note")}
          name="note"
          required
          maxLength={300}
          defaultValue={value(state, "note")}
          error={state.fields?.note}
        />
      )}
    </ActionDialog>
  );
}
