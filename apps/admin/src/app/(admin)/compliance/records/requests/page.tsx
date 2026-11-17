import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  addSubjectRequest,
  bulkFinishRequestsAction,
  bulkVerifyRequestsAction,
  moveRequest,
} from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis, TimeLeft } from "@/components/compliance/common";
import { ConfirmButton } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { FormDialog } from "@/components/ui/form-dialog";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { emailLookupModules } from "@/lib/compliance-server";
import { COMMENTS_EXPORT, FORMS_EXPORT, NEWSLETTER_EXPORT } from "@/lib/engage";
import { PRIVACY_MANAGE, PRIVACY_READ } from "@/lib/permissions";
import { readPage, readSort, slicePage, sortRows } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  listSubjectRequests,
  REQUEST_CHANNELS,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  type RequestStatus,
  selfServiceStats,
} from "@/sample/compliance-records";
import { ruleAt } from "@/sample/compliance-rules";

const BADGE: Record<RequestStatus, string> = {
  new: "badge b-warn",
  verifying: "badge b-violet",
  in_progress: "badge b-info",
  done: "badge b-ok",
  rejected: "badge b-arch",
};

/** Màn "dữ liệu theo email" THẬT của các module đã dựng (forms, newsletter, comments). */
const LOOKUPS = [
  { module: "forms", href: "/marketing/forms/data", permission: FORMS_EXPORT },
  { module: "newsletter", href: "/marketing/newsletter/data", permission: NEWSLETTER_EXPORT },
  { module: "comments", href: "/marketing/comments/data", permission: COMMENTS_EXPORT },
] as const;

// Tab "Yêu cầu chủ thể": yêu cầu xem, sửa, xoá, rút đồng ý nhận qua kênh khác (email, điện thoại,
// tại quầy). Sổ yêu cầu là đề xuất mới (dữ liệu mẫu); tra và xoá dữ liệu theo email thì dẫn tới các
// tab THẬT của Biểu mẫu, Bản tin, Bình luận. Người có tài khoản tự xuất / tự xoá ở Tài khoản của tôi.
// Bộ bảng (W-058): chọn nhiều để ghi "đã xác minh" / "đã trả lời" (lặp lệnh từng cái của hàm mẫu; yêu
// cầu sai trạng thái báo lỗi), dòng hiện một nút (bước kế tiếp), từ chối trong "⋯"; sắp theo ngày nhận /
// hạn trả lời, phân trang có tổng (hàm mẫu trả đủ danh sách).
const BASE = "/compliance/records/requests";

export default async function RequestsTab(props: PageProps<"/compliance/records/requests">) {
  const gate = await sampleGate(PRIVACY_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.records.requests");
  const tt = await getTranslations("table");
  const params = await props.searchParams;
  const status = params.status;
  const current = REQUEST_STATUSES.find((s) => s === status);
  const sort = readSort(params, ["received", "due"], { field: "due", dir: "asc" });
  const paging = readPage(params);
  const [{ data: all }, { data: self }, manage, installed] = await Promise.all([
    listSubjectRequests(),
    selfServiceStats(),
    can(PRIVACY_MANAGE),
    emailLookupModules(),
  ]);
  const allowed = await Promise.all(LOOKUPS.map((l) => can(l.permission)));
  const lookups = LOOKUPS.filter((l, i) => allowed[i] && installed.includes(l.module));
  const page = slicePage(
    sortRows(
      current ? all.filter((r) => r.status === current) : all,
      (r) => (sort.field === "received" ? r.received_at : r.due_at),
      sort.dir,
    ),
    paging.page,
    paging.per,
  );
  const requests = page.data;
  const keep = {
    status: current ?? null,
    ...(typeof params.sort === "string" ? { sort: sort.field, dir: sort.dir } : {}),
  };
  // Yêu cầu còn mở mới chuyển bước được (cả hàng loạt lẫn trên dòng).
  const selectable = manage
    ? requests.filter((r) => r.status !== "done" && r.status !== "rejected").map((r) => r.id)
    : [];
  const bulk: BulkActionSpec[] = [
    {
      key: "verified",
      label: t("do.verified"),
      run: bulkVerifyRequestsAction,
      confirm: {
        title: t("bulkVerifiedTitle"),
        points: [t("points.verified"), t("bulkWrongState")],
        submit: t("do.verified"),
      },
    },
    {
      key: "done",
      label: t("do.done"),
      run: bulkFinishRequestsAction,
      confirm: {
        title: t("bulkDoneTitle"),
        points: [t("points.done"), t("points.accounting"), t("bulkWrongState")],
        submit: t("do.done"),
      },
    },
  ];
  const open = all.filter((r) => !["done", "rejected"].includes(r.status)).length;
  const move = (id: string, to: RequestStatus, label: string, done: string, points: string[]) => (
    <ConfirmButton
      action={moveRequest}
      fields={{ id, status: to }}
      label={label}
      title={label}
      points={points}
      submit={label}
      done={done}
      danger={false}
    />
  );
  return (
    <div className="blocks">
      <div className="kpis">
        <div className="card kpi">
          <span className="kpi-label">{t("exports")}</span>
          <span className="kpi-value">{self.exports_30d}</span>
          <span className="kpi-sub">{t("exportsSub")}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">{t("deletions")}</span>
          <span className="kpi-value">{self.deletions_30d}</span>
          <span className="kpi-sub">{t("deletionsSub")}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">{t("open")}</span>
          <span className="kpi-value">{open}</span>
          <span className="kpi-sub">{t("openSub")}</span>
        </div>
      </div>

      <section className="block" aria-labelledby="cp-dsr-h">
        <div className="block-head">
          <h2 id="cp-dsr-h" className="h2">
            {t("title")}
          </h2>
          {manage ? (
            <FormDialog
              action={addSubjectRequest}
              label={t("add.button")}
              title={t("add.title")}
              intro={t("add.intro")}
              submit={t("add.submit")}
              done={t("add.done")}
              fields={[
                {
                  kind: "select",
                  name: "kind",
                  label: t("kind"),
                  options: REQUEST_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })),
                },
                {
                  kind: "select",
                  name: "channel",
                  label: t("channel"),
                  options: REQUEST_CHANNELS.map((c) => ({ value: c, label: t(`channels.${c}`) })),
                },
                {
                  kind: "text",
                  name: "subject",
                  label: t("add.subject"),
                  hint: t("add.subjectHint"),
                },
                { kind: "textarea", name: "note", label: t("add.note") },
              ]}
            />
          ) : null}
        </div>
        <p className="fhint">{t("about")}</p>
        <Chips
          label={t("filter")}
          chips={[
            {
              href: BASE,
              label: t("all"),
              on: !current,
              count: all.length,
            },
            ...REQUEST_STATUSES.map((s) => ({
              href: `${BASE}?status=${s}`,
              label: t(`status.${s}`),
              on: current === s,
              count: all.filter((r) => r.status === s).length,
            })),
          ]}
        />
        <div className="card tcard">
          {requests.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <BulkTable ids={selectable} actions={bulk}>
              <Table cards>
                <thead>
                  <tr>
                    {selectable.length > 0 ? <SelectAllTh /> : null}
                    <Th>{t("request")}</Th>
                    <Th>{t("channel")}</Th>
                    <SortTh field="received" sort={sort} base={BASE} keep={keep} first="desc">
                      {t("received")}
                    </SortTh>
                    <SortTh field="due" sort={sort} base={BASE} keep={keep}>
                      {t("due")}
                    </SortTh>
                    <Th>{t("state")}</Th>
                    {manage ? (
                      <Th>
                        <span className="vh">{t("actions")}</span>
                      </Th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const closed = r.status === "done" || r.status === "rejected";
                    return (
                      <tr key={r.id}>
                        {selectable.length > 0 ? (
                          selectable.includes(r.id) ? (
                            <SelectTd id={r.id} name={`${r.reference} · ${t(`kinds.${r.kind}`)}`} />
                          ) : (
                            <Td className="t-sel" />
                          )
                        ) : null}
                        <Td className="rt-title">
                          <span className="cell2">
                            <b>
                              <span className="mono">{r.reference}</span> · {t(`kinds.${r.kind}`)}
                            </b>
                            <span className="sub mono ell">{r.subject}</span>
                            <span className="sub">{r.note}</span>
                            {r.reason ? (
                              <span className="sub">{t("reason", { reason: r.reason })}</span>
                            ) : null}
                          </span>
                        </Td>
                        <Td label={t("channel")}>{t(`channels.${r.channel}`)}</Td>
                        <Td label={t("received")}>
                          <Time value={r.received_at} />
                        </Td>
                        <Td label={t("due")}>
                          {closed ? <Time value={r.due_at} /> : <TimeLeft until={r.due_at} />}
                        </Td>
                        <Td label={t("state")}>
                          <span className={BADGE[r.status]}>
                            <span className="dot" />
                            {t(`status.${r.status}`)}
                          </span>
                        </Td>
                        {manage ? (
                          <Td className="rt-acts">
                            {closed ? null : (
                              <span className="eg-acts">
                                {r.status === "in_progress"
                                  ? move(r.id, "done", t("do.done"), t("done.done"), [
                                      t("points.done"),
                                      t("points.accounting"),
                                    ])
                                  : move(
                                      r.id,
                                      "in_progress",
                                      t("do.verified"),
                                      t("done.verified"),
                                      [t("points.verified")],
                                    )}
                                <RowMenu
                                  label={tt("moreFor", { name: r.reference })}
                                  items={[
                                    {
                                      label: t("do.reject"),
                                      danger: true,
                                      dialog: (
                                        <FormDialog
                                          action={moveRequest}
                                          label={t("do.reject")}
                                          triggerClass="btn sm danger"
                                          title={t("rejectTitle", { reference: r.reference })}
                                          points={[t("points.reject"), t("points.final")]}
                                          submit={t("do.reject")}
                                          done={t("done.rejected")}
                                          danger
                                          fields={[
                                            { kind: "hidden", name: "id", value: r.id },
                                            { kind: "hidden", name: "status", value: "rejected" },
                                            {
                                              kind: "textarea",
                                              name: "reason",
                                              label: t("rejectReason"),
                                            },
                                          ]}
                                        />
                                      ),
                                    },
                                  ]}
                                />
                              </span>
                            )}
                          </Td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
      </section>

      <section className="block" aria-labelledby="cp-lookup-h">
        <h2 id="cp-lookup-h" className="h2">
          {t("lookup.title")}
        </h2>
        <p className="fhint">{t("lookup.about")}</p>
        {lookups.length === 0 ? (
          <p className="note">{t("lookup.none")}</p>
        ) : (
          <div className="eg-acts">
            {lookups.map((l) => (
              <Link key={l.module} className="btn" href={l.href}>
                {t(`lookup.${l.module}`)}
              </Link>
            ))}
            <Link className="btn ghost" href="/account/data">
              {t("lookup.self")}
            </Link>
          </div>
        )}
        <Basis rule={ruleAt("privacy.subject_requests")} lead={t("deadlines")} />
      </section>
    </div>
  );
}
