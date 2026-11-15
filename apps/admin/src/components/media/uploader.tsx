"use client";

import type { Problem } from "@autoxide/sdk";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useId, useRef, useState } from "react";
import { Icon } from "@/components/shell/icon";
import { type MediaItem, safeFileName, uploadErrorKey } from "@/lib/media";

// Tải tệp lên qua route của giao diện (`/media/upload`, `/media/{id}/replace`): trình duyệt gửi
// nguyên tệp, máy chủ của giao diện chuyển sang core kèm token trong cookie. Dùng XMLHttpRequest
// thay cho `fetch` vì chỉ nó báo được tiến độ gửi lên. Lỗi của core (kích thước, loại tệp…) hiện
// `detail` của core, rẽ nhánh theo `code`.

export interface Upload {
  key: string;
  name: string;
  /** 0–100. */
  progress: number;
  state: "sending" | "done" | "failed";
  /** Câu báo lỗi (đã theo ngôn ngữ) và mã của core. */
  error?: string;
  code?: string;
  item?: MediaItem;
  /** Số tệp đã có cùng nội dung (core vẫn giữ bản tải lên). */
  duplicates?: number;
}

type Sent = { ok: true; item: MediaItem; duplicates: number } | { ok: false; problem: Problem };

/** Gửi một tệp; `onProgress` nhận phần trăm đã gửi. */
export function sendFile(
  method: "POST" | "PUT",
  url: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<Sent> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body === "object") {
        const data = (body as { data: MediaItem & { duplicates?: unknown[] } }).data;
        resolve({ ok: true, item: data, duplicates: data.duplicates?.length ?? 0 });
        return;
      }
      const problem =
        body && typeof body === "object" && "code" in body
          ? (body as Problem)
          : {
              type: "about:blank",
              title: "Error",
              status: xhr.status,
              code: xhr.status === 413 ? "payload_too_large" : "http_error",
              detail: "",
            };
      resolve({ ok: false, problem });
    };
    xhr.onerror = () =>
      resolve({
        ok: false,
        problem: {
          type: "about:blank",
          title: "Error",
          status: 0,
          code: "core_unreachable",
          detail: "",
        },
      });
    xhr.send(file);
  });
}

/** Tải nhiều tệp lần lượt; giữ danh sách tiến độ và lỗi để hiện. */
export function useUploader(options: {
  folderId?: string | undefined;
  onUploaded?: ((items: MediaItem[]) => void) | undefined;
}) {
  const t = useTranslations("media.upload");
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const counter = useRef(0);
  const done = useRef(options.onUploaded);
  done.current = options.onUploaded;

  const patch = useCallback((key: string, change: Partial<Upload>) => {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...change } : u)));
  }, []);

  const explain = useCallback(
    (problem: Problem) => {
      const key = uploadErrorKey(problem.code);
      // Câu của core đã theo ngôn ngữ; không có (mạng hỏng, proxy cắt) thì câu của giao diện.
      return problem.detail || t(`codes.${key}`);
    },
    [t],
  );

  const upload = useCallback(
    async (files: readonly File[]) => {
      const queued = files.map((file) => {
        counter.current += 1;
        return { key: `u${counter.current}`, file };
      });
      setUploads((list) => [
        ...queued.map(({ key, file }) => ({
          key,
          name: file.name,
          progress: 0,
          state: "sending" as const,
        })),
        ...list.filter((u) => u.state !== "done").slice(0, 10),
      ]);
      const uploaded: MediaItem[] = [];
      for (const { key, file } of queued) {
        const query = new URLSearchParams({ name: safeFileName(file.name) });
        if (options.folderId && options.folderId !== "root") {
          query.set("folder_id", options.folderId);
        }
        const sent = await sendFile("POST", `/media/upload?${query}`, file, {}, (progress) =>
          patch(key, { progress }),
        );
        if (sent.ok) {
          uploaded.push(sent.item);
          patch(key, {
            state: "done",
            progress: 100,
            item: sent.item,
            duplicates: sent.duplicates,
          });
        } else {
          if (sent.problem.status === 401) {
            router.push("/login");
            return;
          }
          patch(key, { state: "failed", error: explain(sent.problem), code: sent.problem.code });
        }
      }
      if (uploaded.length > 0) {
        router.refresh();
        done.current?.(uploaded);
      }
    },
    [options.folderId, patch, explain, router],
  );

  const dismiss = useCallback((key: string) => {
    setUploads((list) => list.filter((u) => u.key !== key));
  }, []);

  return { uploads, upload, dismiss };
}

/** Danh sách tiến độ và lỗi của các tệp đang / vừa tải lên. */
export function UploadList({
  uploads,
  dismiss,
}: {
  uploads: readonly Upload[];
  dismiss: (key: string) => void;
}) {
  const t = useTranslations("media.upload");
  if (uploads.length === 0) return null;
  return (
    <ul className="md-ups" aria-label={t("progress")}>
      {uploads.map((u) => (
        <li key={u.key} className={`md-up ${u.state}`} data-code={u.code}>
          <span className="md-up-head">
            <span className="mono ell">{u.name}</span>
            <span className="md-up-state">
              {u.state === "sending"
                ? t("sending", { percent: u.progress })
                : u.state === "done"
                  ? t("done")
                  : t("failed")}
            </span>
            {u.state !== "sending" ? (
              <button
                type="button"
                className="btn ghost sm sq"
                aria-label={t("dismiss")}
                onClick={() => dismiss(u.key)}
              >
                <Icon name="x" small />
              </button>
            ) : null}
          </span>
          <progress className="bar" max={100} value={u.progress} aria-label={u.name} />
          {u.error ? (
            <span className="ferr" role="alert">
              {u.error}
            </span>
          ) : null}
          {u.state === "done" && u.duplicates ? (
            <span className="fhint">{t("duplicates", { count: u.duplicates })}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Vùng kéo thả và ô chọn tệp. Nút "Tải lên" ở đầu trang là `<label htmlFor={inputId}>` trỏ vào ô
 * chọn tệp này, nên không cần JavaScript để nối hai chỗ.
 */
export function DropZone({
  inputId,
  folderId,
  hint,
  accept,
  onUploaded,
  children,
}: {
  inputId: string;
  folderId?: string | undefined;
  hint: ReactNode;
  accept?: string;
  onUploaded?: ((items: MediaItem[]) => void) | undefined;
  children?: ReactNode;
}) {
  const t = useTranslations("media.upload");
  const { uploads, upload, dismiss } = useUploader({ folderId, onUploaded });
  const [over, setOver] = useState(false);
  const hintId = useId();
  return (
    <section
      className={over ? "md-drop over" : "md-drop"}
      aria-label={t("zone")}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const files = [...event.dataTransfer.files];
        if (files.length > 0) void upload(files);
      }}
    >
      <div className="md-drop-hint">
        <span className="sq-ic info">
          <Icon name="upload" />
        </span>
        <span className="md-drop-text" id={hintId}>
          {hint}
        </span>
        {children}
      </div>
      <input
        id={inputId}
        className="vh"
        type="file"
        multiple
        accept={accept}
        aria-describedby={hintId}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) void upload(files);
        }}
      />
      <UploadList uploads={uploads} dismiss={dismiss} />
    </section>
  );
}
