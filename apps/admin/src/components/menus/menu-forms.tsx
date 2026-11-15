"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { importOldMenus, newMenu } from "@/app/(admin)/content/menus/actions";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  useFocusInvalid,
  useSubmit,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { CONTENT_LOCALES } from "@/lib/content";
import type { ImportRow } from "@/sample/menus";

/** "Menu mới": khoá (`main`, `footer`…), ngôn ngữ, chép từ một menu có sẵn. */
export function NewMenuDialog({
  websiteId,
  copyFrom,
}: {
  websiteId: string;
  copyFrom: { id: string; label: string }[];
}) {
  const t = useTranslations("menus.create");
  return (
    <Dialog label={t("button")} title={t("title")} intro={t("intro")} triggerClass="btn pri">
      {(close) => <NewMenuForm websiteId={websiteId} copyFrom={copyFrom} close={close} />}
    </Dialog>
  );
}

function NewMenuForm({
  websiteId,
  copyFrom,
  close,
}: {
  websiteId: string;
  copyFrom: { id: string; label: string }[];
  close: () => void;
}) {
  const t = useTranslations("menus.create");
  const locales = useTranslations("content.locales");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit(newMenu, () => {
    close();
    toast(t("created"));
  });
  useFocusInvalid(form, state);
  return (
    <form
      ref={form}
      className="dlg-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        run(new FormData(event.currentTarget));
      }}
    >
      <input type="hidden" name="website_id" value={websiteId} />
      <FormAlert state={state} />
      <Field
        label={t("key")}
        name="key"
        mono
        defaultValue={state.values?.key ?? ""}
        error={state.fields?.key}
        hint={t("keyHint")}
        autoComplete="off"
        required
      />
      <SelectField
        label={t("locale")}
        name="locale"
        defaultValue={state.values?.locale ?? "vi"}
        error={state.fields?.locale}
        options={CONTENT_LOCALES.map((code) => ({ value: code, label: locales(code) }))}
      />
      <SelectField
        label={t("copy")}
        name="copy_from"
        defaultValue={state.values?.copy_from ?? ""}
        options={[
          { value: "", label: t("blank") },
          ...copyFrom.map((m) => ({ value: m.id, label: m.label })),
        ]}
        hint={t("copyHint")}
      />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}

/** Xem trước rồi chạy lệnh nhập menu cũ của `content` vào website đang chọn. */
export function ImportPanel({ websiteId, hasLegacy }: { websiteId: string; hasLegacy: boolean }) {
  const t = useTranslations("menus.import");
  const toast = useToast();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (dryRun: boolean) =>
    start(async () => {
      const result = await importOldMenus(websiteId, dryRun);
      if (!result.ok) {
        setError(result.problem.detail);
        return;
      }
      setError("");
      setRows(result.data);
      if (!dryRun)
        toast(t("done", { count: result.data.filter((r) => r.status === "created").length }));
    });
  return (
    <div className="mn-import">
      <span className="headacts">
        <button
          type="button"
          className="btn sm"
          disabled={!hasLegacy || pending}
          onClick={() => run(true)}
        >
          {t("dryRun")}
        </button>
        <button
          type="button"
          className="btn sm pri"
          disabled={!hasLegacy || pending}
          onClick={() => run(false)}
        >
          {t("run")}
        </button>
      </span>
      {error ? (
        <p role="alert" className="falert">
          {error}
        </p>
      ) : null}
      {rows ? (
        rows.length === 0 ? (
          <p className="fhint">{t("nothing")}</p>
        ) : (
          <ul className="mn-improws" aria-label={t("result")}>
            {rows.map((row) => (
              <li key={`${row.key}-${row.locale}`} className="mn-improw">
                <span className="mono">
                  {row.key} · {row.locale.toUpperCase()}
                </span>
                <span
                  className={
                    row.status === "created" || row.status === "create"
                      ? "badge b-ok"
                      : "badge b-draft"
                  }
                >
                  {t(`status.${row.status}`)}
                </span>
                <span className="fhint">{t("items", { count: row.items })}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
