"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useActionState, useMemo, useRef, useState } from "react";
import {
  createWebhook,
  deleteWebhook,
  rotateWebhookSecret,
  type SecretState,
  updateWebhook,
} from "@/app/(admin)/settings/actions";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, Field, FormAlert, useFocusInvalid, useSubmit } from "@/components/ui/form";
import { SecretOnce } from "@/components/ui/secret-once";
import { useToast } from "@/components/ui/toast";
import { useHydrated } from "@/lib/hydrated";
// Sổ event cùng dạng `<module>.<việc>` như permission: dùng chung cách nhóm và tìm không dấu.
import { groupPermissions, matchesPermission } from "@/lib/permission-groups";

export interface EventKind {
  name: string;
  description: string;
}

/**
 * Chọn event cho endpoint: "mọi event" (`*`) hoặc từng event trong sổ của core, nhóm theo module
 * (nhóm gập lại, mở sẵn nhóm có event đã chọn) và có ô tìm không dấu. Lựa chọn giữ trong state,
 * để core báo lỗi thì không mất; ô nằm trong nhóm đang gập vẫn được gửi.
 */
function EventPicker({
  events,
  initial,
  error,
}: {
  events: readonly EventKind[];
  initial: readonly string[];
  error?: string | undefined;
}) {
  const t = useTranslations("settings.webhooks");
  const [all, setAll] = useState(initial.includes("*"));
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initial));
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupPermissions(events), [events]);
  const searching = query.trim() !== "";
  return (
    <fieldset className="card checks" aria-describedby={error ? "events-err" : undefined}>
      <legend className="checks-head">
        <span className="check-group">{t("events")}</span>
        <span className="cap">{all ? t("allEvents") : t("chosen", { count: chosen.size })}</span>
      </legend>
      <label className="check">
        <input
          type="checkbox"
          name="all_events"
          checked={all}
          onChange={(event) => setAll(event.target.checked)}
        />
        <span className="check-main">
          <span className="check-name">{t("allEvents")}</span>
          <span className="check-desc">{t("allEventsHint")}</span>
        </span>
      </label>
      <div className="event-groups" hidden={all}>
        <input
          className="inp"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("findHint")}
          aria-label={t("find")}
        />
        {groups.map((group) => {
          const shown = group.permissions.filter((kind) => matchesPermission(kind, query));
          const on = group.permissions.filter((kind) => chosen.has(kind.name)).length;
          return (
            <details
              key={group.module}
              className="event-group"
              open={searching ? shown.length > 0 : on > 0}
              hidden={shown.length === 0}
            >
              <summary>
                <span className="mono">{group.module}</span>{" "}
                <span className="cap">
                  {on}/{group.permissions.length}
                </span>
              </summary>
              {group.permissions.map((kind) => (
                <label
                  key={kind.name}
                  className="check"
                  hidden={!shown.some((s) => s.name === kind.name)}
                >
                  <input
                    type="checkbox"
                    name="event"
                    value={kind.name}
                    checked={chosen.has(kind.name)}
                    onChange={(event) =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(kind.name);
                        else next.delete(kind.name);
                        return next;
                      })
                    }
                  />
                  <span className="check-main">
                    <span className="mono check-name">{kind.name}</span>
                    <span className="check-desc">{kind.description}</span>
                  </span>
                </label>
              ))}
            </details>
          );
        })}
      </div>
      {error ? (
        <span id="events-err" className="ferr">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

/** "Thêm endpoint": địa chỉ, mô tả, event; xong thì hiện secret ký một lần. */
export function CreateWebhookDialog({ events }: { events: readonly EventKind[] }) {
  const t = useTranslations("settings.webhooks");
  return (
    <Dialog label={t("add")} title={t("addTitle")} intro={t("addIntro")} triggerClass="btn sm">
      {(close) => <CreateWebhookForm events={events} close={close} />}
    </Dialog>
  );
}

function CreateWebhookForm({ events, close }: { events: readonly EventKind[]; close: () => void }) {
  const t = useTranslations("settings.webhooks");
  const form = useRef<HTMLFormElement>(null);
  // Gửi qua `onSubmit` (không qua `action`) để React không đặt lại các ô đã chọn khi core báo lỗi.
  const [state, submit, pending] = useSubmit<SecretState>(createWebhook, () => {});
  useFocusInvalid(form, state);
  if (state.secret && state.id) {
    return (
      <div className="dlg-form">
        <SecretOnce value={state.secret} label={t("secret")} note={t("secretOnce")} />
        <div className="dlg-acts">
          <Link className="btn" href={`/settings/webhooks/${state.id}`}>
            {t("openEndpoint")}
          </Link>
          <button type="button" className="btn pri" onClick={close}>
            {t("stored")}
          </button>
        </div>
      </div>
    );
  }
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(new FormData(event.currentTarget));
  };
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="dlg-form">
      <Field
        label={t("url")}
        name="url"
        type="url"
        autoComplete="off"
        mono
        placeholder="https://"
        hint={t("urlHint")}
        error={state.fields?.url}
        autoFocus
      />
      <Field
        label={t("description")}
        name="description"
        autoComplete="off"
        hint={t("descriptionHint")}
        error={state.fields?.description}
      />
      <EventPicker events={events} initial={[]} error={state.fields?.events} />
      <FormAlert state={state} />
      <DialogButtons submit={t("addSubmit")} pending={pending} close={close} />
    </form>
  );
}

/** Sửa địa chỉ, mô tả, event của một endpoint (gửi `If-Match`). */
export function WebhookEditForm({
  endpoint,
  etag,
  events,
}: {
  endpoint: { id: string; url: string; description: string; events: readonly string[] };
  etag: string | null;
  events: readonly EventKind[];
}) {
  const t = useTranslations("settings.webhooks");
  const hydrated = useHydrated();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useSubmit(updateWebhook, () => toast(t("saved")));
  useFocusInvalid(form, state);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(new FormData(event.currentTarget));
  };
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="dlg-form">
      <input type="hidden" name="id" value={endpoint.id} />
      <input type="hidden" name="etag" value={etag ?? ""} />
      <Field
        label={t("url")}
        name="url"
        type="url"
        autoComplete="off"
        mono
        defaultValue={endpoint.url}
        hint={t("urlHint")}
        error={state.fields?.url}
      />
      <Field
        label={t("description")}
        name="description"
        autoComplete="off"
        defaultValue={endpoint.description}
        error={state.fields?.description}
      />
      <EventPicker events={events} initial={endpoint.events} error={state.fields?.events} />
      <div className="role-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending || !hydrated}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}

/** Thay secret ký: hỏi lại (secret cũ ngừng chạy ngay), xong thì hiện secret mới một lần. */
export function RotateSecretDialog({ id }: { id: string }) {
  const t = useTranslations("settings.webhooks");
  return (
    <Dialog
      label={t("rotate")}
      title={t("rotateTitle")}
      intro={
        <ul className="dlg-list">
          <li>{t("rotateOld")}</li>
          <li>{t("rotateOnce")}</li>
        </ul>
      }
    >
      {(close) => <RotateForm id={id} close={close} />}
    </Dialog>
  );
}

function RotateForm({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("settings.webhooks");
  const [state, action, pending] = useActionState<SecretState, FormData>(rotateWebhookSecret, {});
  if (state.secret) {
    return (
      <div className="dlg-form">
        <SecretOnce value={state.secret} label={t("secret")} note={t("secretOnce")} />
        <div className="dlg-acts">
          <button type="button" className="btn pri" onClick={close}>
            {t("stored")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <DialogButtons submit={t("rotateSubmit")} pending={pending} close={close} danger />
    </form>
  );
}

/** Xoá endpoint: nêu hệ quả (ngừng gửi, mất lịch sử giao, không hoàn tác). */
export function DeleteWebhookDialog({ id, url }: { id: string; url: string }) {
  const t = useTranslations("settings.webhooks");
  return (
    <Dialog
      label={t("delete")}
      title={t("deleteTitle", { url })}
      triggerClass="btn sm danger"
      intro={
        <ul className="dlg-list">
          <li>{t("deleteStops")}</li>
          <li>{t("deleteHistory")}</li>
          <li>{t("deleteNoUndo")}</li>
        </ul>
      }
    >
      {(close) => <DeleteForm id={id} close={close} />}
    </Dialog>
  );
}

function DeleteForm({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("settings.webhooks");
  const [state, action, pending] = useActionState(deleteWebhook, {});
  return (
    <form action={action} className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <DialogButtons submit={t("deleteSubmit")} pending={pending} close={close} danger />
    </form>
  );
}
