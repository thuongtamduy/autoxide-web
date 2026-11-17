import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  bulkCloseForms,
  bulkDeleteForms,
  bulkOpenForms,
  deleteForm,
  setFormStatus,
} from "@/app/(admin)/marketing/forms/actions";
import { ConfirmButton } from "@/components/engage/actions";
import { Chips, Forbidden } from "@/components/engage/common";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { Flash } from "@/components/ui/flash";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { FORMS_MANAGE, FORMS_READ, hrefWith, one, oneOf, PAGE_SIZE } from "@/lib/engage";
import { type Form, retention } from "@/lib/forms";
import { ownerFilter } from "@/lib/org-server";
import { publicApiUrl } from "@/lib/public-url";
import { can } from "@/lib/viewer";

const BASE = "/marketing/forms";
const STATES = ["open", "closed"] as const;

// Tab "Biểu mẫu": mọi form, lọc theo mở / đóng. Số bài mới của từng form là `submissions.new` của
// core (đếm cho cả trang form trong một câu truy vấn), không gọi thêm gì. Chọn nhiều để đóng / mở lại /
// xoá (lặp lệnh từng cái của core); không sắp theo cột (core chỉ có `order` theo giờ tạo, bảng hiện giờ sửa).
export default async function FormsPage(props: PageProps<"/marketing/forms">) {
  if (!(await can(FORMS_READ))) redirect(`${BASE}/data`);
  const t = await getTranslations("engage.forms");
  const tt = await getTranslations("table");
  const params = await props.searchParams;
  const status = oneOf(params, "status", STATES);
  const cursor = one(params, "cursor", 500);
  let page: { data: Form[]; pagination: { next_cursor?: string | null } };
  // Nút đang chọn ở góc trên trái: chỉ form của nút đó (`owner_org`).
  const owner = await ownerFilter();
  try {
    page = await load((client) =>
      client.GET("/api/v1/forms", {
        params: {
          query: {
            limit: PAGE_SIZE,
            ...(status ? { status } : {}),
            ...(cursor ? { cursor } : {}),
            ...owner,
          },
        },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={FORMS_READ} />;
    throw error;
  }
  const next = page.pagination.next_cursor;
  const [manage, api] = await Promise.all([can(FORMS_MANAGE), publicApiUrl()]);
  const undo = { label: t("undo"), done: t("undone") };
  // "⋯" của một form: mở, sửa, đóng / mở lại (có Hoàn tác), chép mã và địa chỉ API công khai cho
  // website (core chưa có lệnh nhân bản form), xoá. Không có nút nào khác trên dòng.
  const menu = (form: Form): RowMenuItem[] => [
    { label: t("open"), href: `${BASE}/${form.id}` },
    ...(manage
      ? [
          { label: t("edit"), href: `${BASE}/${form.id}/edit` },
          {
            label: form.status === "open" ? t("close") : t("reopen"),
            change: {
              action: setFormStatus,
              id: form.id,
              expect: form.updated_at,
              value: form.status === "open" ? "closed" : "open",
              done: form.status === "open" ? t("closedDone") : t("reopened"),
              undo,
            },
          },
        ]
      : []),
    { label: t("copyKey"), copy: form.key, done: t("copiedKey") },
    {
      label: t("copyApi"),
      copy: `${api.url}/api/v1/forms/public/${encodeURIComponent(form.key)}`,
      done: t("copiedApi"),
    },
    ...(manage
      ? [
          {
            label: t("delete"),
            danger: true,
            dialog: (
              <ConfirmButton
                action={deleteForm}
                fields={{ id: form.id, expect: form.updated_at }}
                label={t("delete")}
                title={t("deleteTitle", { name: form.name })}
                points={[t("deleteSubmissions"), t("deleteExport"), t("deleteClose")]}
                submit={t("deleteSubmit")}
              />
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="blocks">
      {params.deleted ? <Flash text={t("deleted")} /> : null}
      <section className="block" aria-labelledby="forms-h">
        <div className="block-head">
          <h2 id="forms-h" className="h2">
            {t("listTitle")}
          </h2>
        </div>
        <p className="fhint">{t("listAbout")}</p>
        <Chips
          label={t("filter")}
          chips={[
            { href: BASE, label: t("all"), on: !status },
            ...STATES.map((s) => ({
              href: hrefWith(BASE, { status: s }),
              label: t(`state.${s}`),
              on: status === s,
            })),
          ]}
        />
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{status ? t("emptyFiltered") : t("empty")}</p>
          ) : (
            <BulkTable
              ids={page.data.map((form) => form.id)}
              actions={
                manage
                  ? [
                      { key: "close", label: t("close"), run: bulkCloseForms },
                      { key: "open", label: t("reopen"), run: bulkOpenForms },
                      {
                        key: "delete",
                        label: t("delete"),
                        tone: "danger",
                        run: bulkDeleteForms,
                        confirm: {
                          title: t("bulkDeleteTitle"),
                          points: [t("deleteSubmissions"), t("deleteExport"), t("deleteClose")],
                          submit: t("deleteSubmit"),
                        },
                      },
                    ]
                  : []
              }
            >
              <Table cards>
                <thead>
                  <tr>
                    {manage ? <SelectAllTh /> : null}
                    <Th>{t("col.form")}</Th>
                    <Th>{t("col.fields")}</Th>
                    <Th>{t("col.new")}</Th>
                    <Th>{t("col.retention")}</Th>
                    <Th>{t("col.updated")}</Th>
                    <Th>{t("col.status")}</Th>
                    <Th>
                      <span className="vh">{t("col.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((form) => (
                    <tr key={form.id}>
                      {manage ? <SelectTd id={form.id} name={form.name} /> : null}
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link className="open ell" href={`${BASE}/${form.id}`}>
                            {form.name}
                          </Link>
                          <span className="sub mono">{form.key}</span>
                        </span>
                      </Td>
                      <Td className="tabular-nums" label={t("col.fields")}>
                        {t("fieldsVersion", { count: form.fields.length, version: form.version })}
                      </Td>
                      <Td className="tabular-nums" label={t("col.new")}>
                        {!form.submissions ? (
                          "—"
                        ) : form.submissions.new === 0 ? (
                          "0"
                        ) : (
                          <Link
                            className="eg-count"
                            href={hrefWith(`${BASE}/${form.id}`, { status: "new" })}
                          >
                            {form.submissions.new}
                          </Link>
                        )}
                      </Td>
                      <Td label={t("col.retention")}>{retention(form.retention_days, t)}</Td>
                      <Td className="whitespace-nowrap" label={t("col.updated")}>
                        <Time value={form.updated_at} />
                      </Td>
                      <Td label={t("col.status")}>
                        <span className={form.status === "open" ? "badge b-ok" : "badge b-arch"}>
                          <span className="dot" />
                          {t(`state.${form.status}`)}
                        </span>
                      </Td>
                      <Td label={t("col.actions")}>
                        <RowMenu label={tt("moreFor", { name: form.name })} items={menu(form)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        {/* Core phân trang theo con trỏ, không trả tổng. */}
        <Pager
          first={cursor ? hrefWith(BASE, { status }) : null}
          next={next ? hrefWith(BASE, { status, cursor: next }) : null}
        />
      </section>
    </div>
  );
}
