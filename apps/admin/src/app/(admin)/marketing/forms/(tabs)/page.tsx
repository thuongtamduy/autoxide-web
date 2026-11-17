import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Chips, Forbidden, Pager } from "@/components/engage/common";
import { Flash } from "@/components/ui/flash";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { FORMS_READ, hrefWith, one, oneOf, PAGE_SIZE } from "@/lib/engage";
import { type Form, retention } from "@/lib/forms";
import { ownerFilter } from "@/lib/org-server";
import { can } from "@/lib/viewer";

const BASE = "/marketing/forms";
const STATES = ["open", "closed"] as const;

// Tab "Biểu mẫu": mọi form, lọc theo mở / đóng. Số bài mới của từng form là `submissions.new` của
// core (đếm cho cả trang form trong một câu truy vấn), không gọi thêm gì.
export default async function FormsPage(props: PageProps<"/marketing/forms">) {
  if (!(await can(FORMS_READ))) redirect(`${BASE}/data`);
  const t = await getTranslations("engage.forms");
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
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("col.form")}</Th>
                  <Th>{t("col.fields")}</Th>
                  <Th>{t("col.new")}</Th>
                  <Th>{t("col.retention")}</Th>
                  <Th>{t("col.updated")}</Th>
                  <Th>{t("col.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((form) => (
                  <tr key={form.id}>
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
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Pager
          first={cursor ? hrefWith(BASE, { status }) : null}
          next={next ? hrefWith(BASE, { status, cursor: next }) : null}
        />
      </section>
    </div>
  );
}
