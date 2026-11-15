"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ConsentItem } from "@/sample/account";
import { Icon } from "../icon";

/**
 * Quyền riêng tư của người mua: đồng ý theo từng mục đích (rút lại có hiệu lực ngay), văn bản đã chấp
 * nhận, quyền với dữ liệu cá nhân (tải về, xoá). Luồng mô tả đúng như core sẽ làm (bước 37:
 * `compliance_purposes`, sổ đồng ý, yêu cầu của chủ thể dữ liệu); nút ở đây là mẫu, chỉ đổi trạng
 * thái trên trang.
 */
export function PrivacyPanel({
  consents,
  documents,
  openOrders,
  siteName,
}: {
  consents: readonly ConsentItem[];
  documents: { title: string; version: number; effective: string }[];
  /** Đơn chưa xong (chặn xoá ngay: chứng từ kế toán phải giữ). */
  openOrders: string[];
  siteName: string;
}) {
  const t = useTranslations("account.privacy");
  const [granted, setGranted] = useState(
    () => new Map(consents.map((c) => [c.key, c.granted] as const)),
  );
  const [toast, setToast] = useState("");
  const [exported, setExported] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"idle" | "ask" | "scheduled">("idle");
  const say = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };
  return (
    <>
      <section className="card acx-card" aria-labelledby="pv-consents">
        <h3 className="dsp" id="pv-consents">
          {t("consentsTitle", { name: siteName })}
        </h3>
        {consents.map((consent) => {
          const on = granted.get(consent.key) ?? false;
          return (
            <div className="acx-row" key={consent.key}>
              <span className="acx-rbody">
                <span id={`pv-${consent.key}`}>{t(`purposes.${consent.key}`)}</span>
                <span className="muted">
                  {on
                    ? consent.days_ago !== null
                      ? t("grantedAgo", { days: consent.days_ago })
                      : t("grantedNow")
                    : t("notGranted")}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={`pv-${consent.key}`}
                className={`acx-switch${on ? " on" : ""}`}
                onClick={() => {
                  setGranted((map) => new Map(map).set(consent.key, !on));
                  say(on ? t("withdrawn") : t("granted"));
                }}
              >
                <span />
              </button>
            </div>
          );
        })}
        <p className="muted">{t("contract")}</p>
      </section>
      <section className="card acx-card" aria-labelledby="pv-docs">
        <h3 className="dsp" id="pv-docs">
          {t("docsTitle")}
        </h3>
        {documents.map((doc) => (
          <div className="acx-row" key={doc.title}>
            <Icon name="doc" small />
            <span className="acx-rbody">
              <span>{doc.title}</span>
              <span className="muted">
                {t("docVersion", { version: doc.version, date: doc.effective })}
              </span>
            </span>
          </div>
        ))}
      </section>
      <section className="card acx-card" aria-labelledby="pv-rights">
        <h3 className="dsp" id="pv-rights">
          {t("rightsTitle")}
        </h3>
        <p className="muted">{t("rightsLead")}</p>
        <div className="acx-row">
          <Icon name="doc" small />
          <span className="acx-rbody">
            <span>{t("export")}</span>
            <span className="muted">{exported ? t("exportSent") : t("exportText")}</span>
          </span>
          <button
            type="button"
            className="btn sm"
            disabled={exported}
            onClick={() => {
              setExported(true);
              say(t("exportSent"));
            }}
          >
            {exported ? t("exportDone") : t("exportCta")}
          </button>
        </div>
        <div className="acx-row">
          <Icon name="trash" small />
          <span className="acx-rbody">
            <span>{t("delete")}</span>
            <span className="muted">{t("deleteText")}</span>
          </span>
          <button
            type="button"
            className="btn sm"
            disabled={deleteStep !== "idle"}
            onClick={() => setDeleteStep("ask")}
          >
            {t("deleteCta")}
          </button>
        </div>
        {deleteStep === "ask" ? (
          <div className="acx-confirm pop" role="alert">
            <b>
              {openOrders.length > 0
                ? t("deleteOpen", { count: openOrders.length, orders: openOrders.join(", ") })
                : t("deleteNone")}
            </b>
            <span>{t("deleteHow")}</span>
            <span className="acx-ret-btns">
              <button
                type="button"
                className="btn sm pri"
                onClick={() => {
                  setDeleteStep("scheduled");
                  say(t("deleteScheduled"));
                }}
              >
                {t("deleteConfirm")}
              </button>
              <button type="button" className="btn sm ghost" onClick={() => setDeleteStep("idle")}>
                {t("deleteCancel")}
              </button>
            </span>
          </div>
        ) : null}
        {deleteStep === "scheduled" ? (
          <p className="by-ok" role="status">
            {t("deleteScheduled")}
          </p>
        ) : null}
        <p className="muted acx-legal">{t("legal")}</p>
      </section>
      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" />
          {toast}
        </div>
      ) : null}
    </>
  );
}
