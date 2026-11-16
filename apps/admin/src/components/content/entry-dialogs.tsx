"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import { makePreview, publishEntry, scheduleEntry } from "@/app/(admin)/content/actions";
import { Icon } from "@/components/shell/icon";
import { Dialog } from "@/components/ui/dialog";
import { CheckField, DialogButtons, Field } from "@/components/ui/form";
import { Time } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import { localToIso, publishChecklist, type SeoFinding } from "@/lib/content";
import { useEditorApi } from "./context";

/** Hỏi lại trước một thao tác có hệ quả (gỡ đăng, lưu trữ, khôi phục), nêu rõ hệ quả. */
export function ConfirmDialog({
  label,
  title,
  intro,
  submit,
  run,
  danger = false,
}: {
  label: string;
  title: string;
  intro: ReactNode;
  submit: string;
  /** Trả `true` khi xong; lỗi thì trình soạn tự báo. */
  run: () => Promise<boolean>;
  danger?: boolean;
}) {
  const api = useEditorApi();
  return (
    <Dialog
      label={label}
      title={title}
      intro={intro}
      triggerClass={danger ? "btn sm danger" : "btn sm"}
    >
      {(close) => (
        <form
          className="dlg-form"
          onSubmit={(event) => {
            event.preventDefault();
            // Lỗi thì trình soạn báo ở đầu trang; hộp thoại đóng trong cả hai trường hợp.
            api.run(async () => {
              await run();
              close();
            });
          }}
        >
          <DialogButtons submit={submit} pending={api.pending} close={close} danger={danger} />
        </form>
      )}
    </Dialog>
  );
}

function zoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Ô ngày giờ hẹn; báo lỗi dưới ô khi trống hay đã qua. */
function WhenField({ error }: { error: string }) {
  const t = useTranslations("content.publish");
  const id = useId();
  return (
    <div className="fld">
      <label className="lab" htmlFor={id}>
        {t("when", { zone: zoneName() })}
      </label>
      <input
        id={id}
        name="run_at"
        type="datetime-local"
        className="inp num"
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-e` : undefined}
      />
      {error ? (
        <span id={`${id}-e`} className="ferr">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Đăng ngay hay hẹn giờ đăng; bài có phần do AI viết thì người đăng xác nhận đã duyệt. */
export function PublishDialog({
  pathPrefix,
  slug,
  aiUsed,
  findings,
}: {
  pathPrefix: string;
  slug: string;
  aiUsed: boolean;
  findings: SeoFinding[] | null;
}) {
  const t = useTranslations("content.publish");
  const api = useEditorApi();
  const { entry } = api;
  const published = entry.status === "published";
  const nothingNew = published && !entry.has_unpublished_changes && !api.dirty;
  return (
    <Dialog
      label={published ? t("publishChanges") : t("publish")}
      title={published ? t("publishChanges") : t("publish")}
      triggerClass={nothingNew ? "btn pri ce-nothing" : "btn pri"}
      intro={
        <>
          <p>
            {entry.kind === "post" ? t("intro", { path: `${pathPrefix}${slug}` }) : t("introPage")}
          </p>
          {api.dirty ? <p>{t("savesFirst")}</p> : null}
          {nothingNew ? <p>{t("nothingNew")}</p> : null}
          <PublishChecklist findings={findings} />
        </>
      }
    >
      {(close) => <PublishForm close={close} aiUsed={aiUsed} />}
    </Dialog>
  );
}

/**
 * Kiểm trước khi đăng (thiết kế "Soạn bài"): bốn dòng gom từ lần kiểm SEO của core lúc mở bài —
 * tiêu đề không trùng, ảnh có alt, đủ bản dịch, phần cho máy tìm kiếm. Chỉ để nhắc: vẫn đăng được.
 */
function PublishChecklist({ findings }: { findings: SeoFinding[] | null }) {
  const t = useTranslations("content.publish.checks");
  const checks = publishChecklist(findings);
  if (checks === null) return <p className="ce-muted">{t("unavailable")}</p>;
  return (
    <ul className="ce-checks" aria-label={t("label")} data-testid="publish-checks">
      {checks.map((check) => (
        <li key={check.id} data-state={check.state}>
          <Icon name={check.state === "ok" ? "check" : "warn"} />
          <span>
            {check.state === "ok"
              ? t(`${check.id}.ok`)
              : t(`${check.id}.problem`, { count: check.count })}
          </span>
        </li>
      ))}
      <li className="ce-muted">{t("when")}</li>
    </ul>
  );
}

function PublishForm({ close, aiUsed }: { close: () => void; aiUsed: boolean }) {
  const t = useTranslations("content.publish");
  const api = useEditorApi();
  const toast = useToast();
  const [later, setLater] = useState(false);
  const [errors, setErrors] = useState<{ when?: string; review?: string; core?: string }>({});
  const needsReview = api.entry.ai_generated || aiUsed;
  return (
    <form
      className="dlg-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const reviewed = form.get("ai_reviewed") === "on";
        const runAt = localToIso(String(form.get("run_at") ?? ""));
        const next: typeof errors = {};
        if (needsReview && !reviewed) next.review = t("reviewRequired");
        if (later && (!runAt || Date.parse(runAt) <= Date.now())) next.when = t("whenInvalid");
        setErrors(next);
        if (Object.keys(next).length > 0) return;
        api.run(async () => {
          const fields = api.unsaved();
          if (later && runAt) {
            const result = await scheduleEntry(api.entry.id, api.version, fields, {
              action: "publish",
              run_at: runAt,
              ...(reviewed ? { ai_reviewed: true } : {}),
            });
            if (result.ok) {
              if (result.entry) api.accept(result.entry, result.version);
              toast(t("scheduled"));
              close();
            } else {
              if (result.saved) api.accept(result.saved.entry, result.saved.version);
              setErrors({ core: result.problem.detail });
            }
            return;
          }
          const result = await publishEntry(api.entry.id, api.version, fields, reviewed);
          if (result.ok) {
            api.accept(result.entry, result.version);
            toast(t("published"));
            close();
          } else {
            if ("saved" in result && result.saved)
              api.accept(result.saved.entry, result.saved.version);
            if (result.problem.code === "precondition_failed") {
              api.fail(result.problem);
              close();
            } else {
              setErrors({ core: result.problem.detail });
            }
          }
        });
      }}
    >
      {api.can.publishAll ? (
        <fieldset className="ce-seg" aria-label={t("timing")}>
          <label className={later ? "" : "on"}>
            <input type="radio" name="timing" checked={!later} onChange={() => setLater(false)} />
            {t("now")}
          </label>
          <label className={later ? "on" : ""}>
            <input type="radio" name="timing" checked={later} onChange={() => setLater(true)} />
            {t("later")}
          </label>
        </fieldset>
      ) : null}
      {later ? (
        <>
          <WhenField error={errors.when ?? ""} />
          <p className="fhint">{t("laterHint")}</p>
        </>
      ) : null}
      {needsReview ? (
        <div className="fld">
          <CheckField
            label={t("aiReviewed")}
            hint={t("aiReviewedHint")}
            name="ai_reviewed"
            aria-invalid={errors.review ? true : undefined}
            aria-describedby={errors.review ? "ce-review-err" : undefined}
          />
          {errors.review ? (
            <span id="ce-review-err" className="ferr">
              {errors.review}
            </span>
          ) : null}
        </div>
      ) : null}
      {errors.core ? (
        <p role="alert" className="falert">
          {errors.core}
        </p>
      ) : null}
      <p className="fhint">{t("permission")}</p>
      <DialogButtons
        submit={later ? t("schedule") : t("publishNow")}
        pending={api.pending}
        close={close}
      />
    </form>
  );
}

/** Hẹn giờ gỡ bài đang đăng (hẹn giờ đăng nằm trong hộp thoại Đăng). */
export function ScheduleDialog({ action }: { action: "unpublish" }) {
  const t = useTranslations("content.publish");
  return (
    <Dialog
      label={t("scheduleUnpublish")}
      title={t("scheduleUnpublish")}
      intro={t("scheduleUnpublishIntro")}
    >
      {(close) => <ScheduleForm close={close} action={action} />}
    </Dialog>
  );
}

function ScheduleForm({ close, action }: { close: () => void; action: "unpublish" }) {
  const t = useTranslations("content.publish");
  const api = useEditorApi();
  const toast = useToast();
  const [error, setError] = useState("");
  const [core, setCore] = useState("");
  return (
    <form
      className="dlg-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const runAt = localToIso(String(new FormData(event.currentTarget).get("run_at") ?? ""));
        if (!runAt || Date.parse(runAt) <= Date.now()) {
          setError(t("whenInvalid"));
          return;
        }
        setError("");
        api.run(async () => {
          const result = await scheduleEntry(api.entry.id, api.version, null, {
            action,
            run_at: runAt,
          });
          if (result.ok) {
            toast(t("scheduled"));
            close();
          } else {
            setCore(result.problem.detail);
          }
        });
      }}
    >
      <WhenField error={error} />
      {core ? (
        <p role="alert" className="falert">
          {core}
        </p>
      ) : null}
      <DialogButtons submit={t("schedule")} pending={api.pending} close={close} />
    </form>
  );
}

/** Link xem trước bản nháp cho người không có tài khoản (hết hạn sau vài phút). */
export function PreviewDialog() {
  const t = useTranslations("content.preview");
  return (
    <Dialog label={t("open")} title={t("title")} triggerClass="btn" intro={<p>{t("intro")}</p>}>
      {(close) => <PreviewForm close={close} />}
    </Dialog>
  );
}

function PreviewForm({ close }: { close: () => void }) {
  const t = useTranslations("content.preview");
  const form = useTranslations("form");
  const api = useEditorApi();
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <div className="dlg-form">
      {api.dirty ? <p className="fhint">{t("savesFirst")}</p> : null}
      {link ? (
        <div className="ce-sec">
          <Field
            label={t("link")}
            name="preview_link"
            mono
            readOnly
            value={link.url}
            onFocus={(event) => event.target.select()}
          />
          <span className="fhint">
            {t("expires")} <Time value={link.expires} />
          </span>
          <span className="ce-acts">
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                await navigator.clipboard?.writeText(link.url);
                setCopied(true);
              }}
            >
              {copied ? t("copied") : t("copy")}
            </button>
            <a className="btn sm" href={link.url} target="_blank" rel="noopener noreferrer">
              {t("view")}
            </a>
          </span>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="falert">
          {error}
        </p>
      ) : null}
      <div className="dlg-acts">
        <button type="button" className="btn" onClick={close}>
          {form("cancel")}
        </button>
        <button
          type="button"
          className="btn pri"
          disabled={api.pending}
          onClick={() =>
            api.run(async () => {
              setError("");
              const result = await makePreview(api.entry.id, api.version, api.unsaved());
              if (result.ok) {
                if (result.entry) api.accept(result.entry, result.version);
                const url = new URL("/preview", window.location.origin);
                url.searchParams.set("token", result.token);
                setLink({ url: url.toString(), expires: result.expiresAt });
                setCopied(false);
              } else {
                if (result.saved) api.accept(result.saved.entry, result.saved.version);
                setError(result.problem.detail);
              }
            })
          }
        >
          {link ? t("again") : t("make")}
        </button>
      </div>
    </div>
  );
}
