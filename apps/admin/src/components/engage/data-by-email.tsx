"use client";

import type { components } from "@autoxide/sdk";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid, useSubmit } from "@/components/ui/form";
import { Time } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import type { DataState, DataFound as Found } from "@/lib/engage";
import { useHydrated } from "@/lib/hydrated";

type Schemas = components["schemas"];

type Action = (state: DataState, formData: FormData) => Promise<DataState>;

/**
 * Dữ liệu theo email của một module (yêu cầu của chủ dữ liệu): tra, tải về JSON, xoá. Tra bằng
 * Server Action (POST), không đặt email lên địa chỉ trang, để địa chỉ không lọt vào log hay lịch
 * sử trình duyệt. Tệp tải về dựng ở trình duyệt từ đúng dữ liệu core vừa trả.
 */
export function DataByEmail({
  kind,
  lookup,
  erase,
  canErase,
}: {
  kind: "forms" | "newsletter" | "comments";
  lookup: Action;
  erase: Action;
  canErase: boolean;
}) {
  const t = useTranslations("engage.data");
  const hydrated = useHydrated();
  const form = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useSubmit(lookup, () => {});
  useFocusInvalid(form, state);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(new FormData(event.currentTarget));
  };
  const found = state.found;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="data-h">
        <h2 id="data-h" className="h2">
          {t("title")}
        </h2>
        <p className="fhint">{t(`about.${kind}`)}</p>
        <form ref={form} onSubmit={onSubmit} noValidate className="filters">
          <Field
            label={t("email")}
            name="email"
            type="email"
            autoComplete="off"
            mono
            defaultValue={state.email ?? state.values?.email ?? ""}
            error={state.fields?.email}
          />
          <div className="filters-acts">
            <button type="submit" className="btn pri" disabled={pending || !hydrated}>
              {t("lookup")}
            </button>
          </div>
        </form>
        {state.error ? <FormAlert state={state} /> : null}
      </section>
      {found ? null : (
        <section className="block" aria-labelledby="data-steps-h">
          <h2 id="data-steps-h" className="h2">
            {t("stepsTitle")}
          </h2>
          <ol className="eg-steps">
            {(["verify", "lookup", "deliver"] as const).map((step, i) => (
              <li key={step} className="card">
                <span className="eg-step-n" aria-hidden="true">
                  {i + 1}
                </span>
                <b>{t(`steps.${step}.title`)}</b>
                <span>{t(`steps.${step}.body`)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {found && state.email ? (
        <Result
          kind={kind}
          email={state.email}
          found={found}
          erase={erase}
          canErase={canErase}
          again={() => form.current?.requestSubmit()}
        />
      ) : null}
    </div>
  );
}

function download(email: string, kind: string, found: Found) {
  const blob = new Blob([`${JSON.stringify(found, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `autoxide-${kind}-${email.replace(/[^a-z0-9@._-]/gi, "_")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Số bản ghi tìm được, để báo "không có gì" và để nêu hệ quả của lệnh xoá. */
function amount(kind: string, found: Found): number {
  if (kind === "forms") return (found as Schemas["EmailDataResponse"]).submissions.length;
  if (kind === "newsletter") {
    const data = found as Schemas["NewsletterEmailData"];
    return (data.subscriber ? 1 : 0) + (data.suppression ? 1 : 0);
  }
  const data = found as Schemas["CommentsEmailData"];
  return data.comments.length + data.follows.length + data.bans.length;
}

function Result({
  kind,
  email,
  found,
  erase,
  canErase,
  again,
}: {
  kind: "forms" | "newsletter" | "comments";
  email: string;
  found: Found;
  erase: Action;
  canErase: boolean;
  again: () => void;
}) {
  const t = useTranslations("engage.data");
  const total = amount(kind, found);
  return (
    <section className="block" aria-labelledby="found-h">
      <div className="block-head">
        <h2 id="found-h" className="h2 ell">
          {t("found", { email })}
        </h2>
        {total > 0 ? (
          <div className="eg-acts">
            <button type="button" className="btn sm" onClick={() => download(email, kind, found)}>
              {t("download")}
            </button>
            {canErase ? (
              <EraseDialog kind={kind} email={email} erase={erase} again={again} />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="card padded">
        {total === 0 ? (
          <p className="empty">{t("nothing")}</p>
        ) : (
          <Summary kind={kind} found={found} />
        )}
      </div>
    </section>
  );
}

function Summary({ kind, found }: { kind: string; found: Found }) {
  const t = useTranslations("engage.data");
  if (kind === "forms") {
    const data = found as Schemas["EmailDataResponse"];
    return (
      <ul className="eg-list">
        {data.submissions.map((s) => (
          <li key={s.id}>
            <b className="mono">{s.form_key}</b> · <Time value={s.created_at} /> ·{" "}
            {t("answers", { count: s.answers.length })} · {s.status}
          </li>
        ))}
      </ul>
    );
  }
  if (kind === "newsletter") {
    const data = found as Schemas["NewsletterEmailData"];
    return (
      <ul className="eg-list">
        {data.subscriber ? (
          <li>
            {t("subscriber", {
              lists: data.subscriber.subscriptions
                .map((s) => `${s.list_key ?? "—"} (${s.status})`)
                .join(", "),
            })}
          </li>
        ) : null}
        <li>{t("deliveries", { count: data.deliveries.length })}</li>
        {data.suppression ? <li>{t("suppressed", { reason: data.suppression.reason })}</li> : null}
      </ul>
    );
  }
  const data = found as Schemas["CommentsEmailData"];
  return (
    <ul className="eg-list">
      <li>{t("comments", { count: data.comments.length })}</li>
      {data.comments.slice(0, 20).map((c) => (
        <li key={c.id} className="eg-sub">
          <Time value={c.created_at} /> · <span className="mono">{c.target_type}</span> · {c.status}{" "}
          · {c.body.slice(0, 80)}
        </li>
      ))}
      <li>{t("follows", { count: data.follows.length })}</li>
      <li>{t("bans", { count: data.bans.length })}</li>
    </ul>
  );
}

function EraseDialog({
  kind,
  email,
  erase,
  again,
}: {
  kind: string;
  email: string;
  erase: Action;
  again: () => void;
}) {
  const t = useTranslations("engage.data");
  return (
    <Dialog
      label={t("erase")}
      title={t("eraseTitle", { email })}
      triggerClass="btn sm danger"
      intro={
        <ul className="dlg-list">
          <li>{t(`erasePoints.${kind}`)}</li>
          <li>{t("eraseNoUndo")}</li>
          <li>{t("eraseVerify")}</li>
        </ul>
      }
    >
      {(close) => <EraseForm email={email} erase={erase} close={close} again={again} />}
    </Dialog>
  );
}

function EraseForm({
  email,
  erase,
  close,
  again,
}: {
  email: string;
  erase: Action;
  close: () => void;
  again: () => void;
}) {
  const t = useTranslations("engage.data");
  const toast = useToast();
  const [state, run, pending] = useSubmit(erase, () => {
    close();
    toast(t("erased"));
    again();
  });
  return (
    <form action={run} className="dlg-form">
      <input type="hidden" name="email" value={email} />
      <FormAlert state={state} />
      <DialogButtons submit={t("eraseSubmit")} pending={pending} close={close} danger />
    </form>
  );
}
