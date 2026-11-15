"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  type FormExport,
  readFormExport,
  startFormExport,
} from "@/app/(admin)/marketing/forms/actions";
import { Time } from "@/components/ui/time";

/** Hỏi lại trạng thái một lượt xuất sau ngần này mili giây. */
const POLL_MS = 2000;

/**
 * Xuất bài nộp chạy nền cho form nhiều bài nộp: bấm thì core xếp job, giao diện hỏi lại trạng thái vài giây
 * một lần, xong thì hiện link tải (qua route của máy chủ giao diện). Tệp chứa dữ liệu cá nhân và bị core
 * xoá sau một thời gian; câu dưới nút nêu hạn đó.
 */
export function BackgroundExport({ formId, status }: { formId: string; status: string }) {
  const t = useTranslations("engage.forms.bgExport");
  const [job, setJob] = useState<FormExport | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const waiting = job !== null && (job.state === "pending" || job.state === "running");

  useEffect(() => {
    if (!waiting || !job) return;
    const timer = setTimeout(async () => {
      const result = await readFormExport(job.id);
      if (result.ok) setJob(result.data);
      else setError(result.problem.detail);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, job]);

  return (
    <div className="eg-bgexport" aria-live="polite">
      <button
        type="button"
        className="btn"
        disabled={pending || waiting}
        onClick={() =>
          start(async () => {
            setError("");
            const result = await startFormExport(formId, status);
            if (result.ok) setJob(result.data);
            else setError(result.problem.detail);
          })
        }
      >
        {t("start")}
      </button>
      {waiting ? <span className="fhint">{t("working")}</span> : null}
      {job?.state === "ready" ? (
        <span className="fhint">
          <a href={`/marketing/forms/exports/${job.id}/file`} download>
            {t("download")}
          </a>
          {job.expires_at ? (
            <>
              {" · "}
              {t("deletedAt")} <Time value={job.expires_at} />
            </>
          ) : null}
        </span>
      ) : null}
      {job?.state === "failed" ? <span className="ferr">{t("failed")}</span> : null}
      {error ? (
        <span className="ferr" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
