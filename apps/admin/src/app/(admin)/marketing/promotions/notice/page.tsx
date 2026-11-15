import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { NoticeDialog } from "@/components/promotions/forms";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { PROMOTIONS_COMPLIANCE, vnDay, vnRange } from "@/lib/promotions";
import { exportNotice, listNoticeRules, listNotices, type NoticeStatus } from "@/sample/promotions";
import { vietnamDay } from "@/sample/tax";

const STATUSES: NoticeStatus[] = ["pending", "submitted", "not_required"];

const NOTICE_BADGE: Record<NoticeStatus, string> = {
  pending: "badge b-warn",
  submitted: "badge b-ok",
  not_required: "badge b-draft",
};

// Tab "Thông báo Sở Công Thương": xuất dữ liệu hồ sơ thông báo khuyến mại gửi Sở Công Thương nơi tổ
// chức, rồi ghi nhận đã nộp (số tiếp nhận, ngày nộp). Hệ thống không tự nộp lên cổng dịch vụ công.
// Quy tắc cần thông báo hay không là dữ liệu có ngày hiệu lực (bảng cuối trang).
export default async function NoticePage(props: PageProps<"/marketing/promotions/notice">) {
  const gate = await commerceGate(PROMOTIONS_COMPLIANCE);
  if (gate) return gate;
  const [t, locale, params] = await Promise.all([
    getTranslations("promotions"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = STATUSES.find((s) => s === one("status"));
  const open = one("open");
  const [{ data: rows }, { data: all }, { data: rules }, preview] = await Promise.all([
    listNotices({ ...(status ? { status } : {}), locale }),
    listNotices({ locale }),
    listNoticeRules(),
    open ? exportNotice(open, "json") : Promise.resolve(null),
  ]);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: status ?? "", ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/marketing/promotions/notice?${query}` : "/marketing/promotions/notice";
  };
  const today = vietnamDay();
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="notice-h">
        <div className="block-head">
          <h2 id="notice-h" className="h2">
            {t("notice.title")}
          </h2>
        </div>
        <p className="fhint">{t("notice.about")}</p>
        <nav className="chips" aria-label={t("notice.byStatus")}>
          <Link
            className={status ? "chip" : "chip on"}
            href={href({ status: null, open: null })}
            aria-current={status ? undefined : "page"}
          >
            {t("programs.all")} <span className="cnt">{all.length}</span>
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              className={status === s ? "chip on" : "chip"}
              href={href({ status: s, open: null })}
              aria-current={status === s ? "page" : undefined}
            >
              {t(`noticeStatus.${s}`)}{" "}
              <span className="cnt">{all.filter((n) => n.notice_status === s).length}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {rows.length === 0 ? (
            <p className="empty">{t("notice.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("notice.program")}</Th>
                  <Th>{t("notice.area")}</Th>
                  <Th>{t("notice.due")}</Th>
                  <Th>{t("notice.state")}</Th>
                  <Th>
                    <span className="vh">{t("notice.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => {
                  const isOpen = open === n.promotion_id;
                  return [
                    <tr key={n.promotion_id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          {n.notice_status === "not_required" ? (
                            <span>{n.title}</span>
                          ) : (
                            <Link
                              className="open"
                              href={
                                isOpen
                                  ? href({ open: null })
                                  : `${href({ open: n.promotion_id })}#notice-h`
                              }
                              scroll={false}
                              aria-expanded={isOpen}
                            >
                              {n.title}
                            </Link>
                          )}
                          <span className="sub">{vnRange(n.starts_at, n.ends_at, locale)}</span>
                        </span>
                      </Td>
                      <Td label={t("notice.area")}>
                        <span className="cell2">
                          <span>
                            {[...n.provinces, ...(n.website ? [t("notice.website")] : [])].join(
                              ", ",
                            ) || "—"}
                          </span>
                          <span className="sub">
                            {t("notice.stores", { count: n.store_count })}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("notice.due")}>
                        {n.notice_status === "submitted" && n.notice_submitted_at
                          ? t("notice.submittedAt", {
                              date: vnDay(n.notice_submitted_at, locale),
                            })
                          : n.due_at
                            ? t("notice.before", {
                                date: vnDay(n.due_at, locale),
                              })
                            : "—"}
                      </Td>
                      <Td label={t("notice.state")}>
                        <span className={NOTICE_BADGE[n.notice_status]}>
                          <span className="dot" />
                          {t(`noticeStatus.${n.notice_status}`)}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        {n.notice_status === "pending" ? (
                          <NoticeDialog id={n.promotion_id} title={n.title} today={today} />
                        ) : null}
                      </Td>
                    </tr>,
                    isOpen && preview?.ok ? (
                      <tr key={`${n.promotion_id}-open`} className="cat-detail-row">
                        <td colSpan={5}>
                          <div className="cat-detail">
                            <h3 className="h2">{t("notice.fileTitle", { title: n.title })}</h3>
                            <p className="fhint">
                              {n.notice_status === "submitted"
                                ? t("notice.fileSubmitted", { reference: n.notice_reference ?? "" })
                                : t("notice.filePending", { authority: n.authority ?? "" })}
                            </p>
                            <h4 className="pm-h">{t("notice.content")}</h4>
                            <ul className="cat-lines">
                              {preview.data.fields.map(([field, value]) => (
                                <li key={field}>
                                  <span>{t(`notice.fields.${field}`)}</span>
                                  <b>{value}</b>
                                </li>
                              ))}
                            </ul>
                            <span className="row-acts">
                              <a
                                className="btn sm"
                                href={`/marketing/promotions/notice/export?id=${n.promotion_id}&format=csv`}
                                download
                              >
                                {t("notice.exportCsv")}
                              </a>
                              <a
                                className="btn sm"
                                href={`/marketing/promotions/notice/export?id=${n.promotion_id}&format=json`}
                                download
                              >
                                {t("notice.exportJson")}
                              </a>
                            </span>
                            <p className="fhint">{t("notice.humanOnly")}</p>
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          )}
        </div>
      </section>

      <section className="block" aria-labelledby="rules-h">
        <div className="block-head">
          <h2 id="rules-h" className="h2">
            {t("rules.title")}
          </h2>
        </div>
        <p className="fhint">{t("rules.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("limits.kind")}</Th>
                <Th>{t("rules.required")}</Th>
                <Th>{t("rules.authority")}</Th>
                <Th>{t("limits.basis")}</Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <Td className="rt-title">{t(`legalKinds.${r.promotion_kind}`)}</Td>
                  <Td label={t("rules.required")}>
                    {r.notice_required
                      ? r.days_before > 0
                        ? t("rules.daysBefore", { days: r.days_before })
                        : t("rules.beforeStart")
                      : t("rules.notRequired")}
                  </Td>
                  <Td label={t("rules.authority")}>{r.notice_required ? r.authority : "—"}</Td>
                  <Td label={t("limits.basis")}>
                    <span className="cell2">
                      <span>{r.legal_basis}</span>
                      <span className="sub">
                        {t("limits.from", { date: formatDay(r.effective_from, locale) })}
                        {r.needs_review ? ` · ${t("limits.review")}` : ""}
                      </span>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="note warn">
          <b>{t("rules.noteStrong")}</b> {t("rules.noteText")}
        </p>
      </section>
    </div>
  );
}
