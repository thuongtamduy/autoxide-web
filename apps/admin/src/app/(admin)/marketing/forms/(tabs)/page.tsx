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
import { can } from "@/lib/viewer";

const BASE = "/marketing/forms";
const STATES = ["open", "closed"] as const;
/** Đếm bài mới tới mức này; nhiều hơn thì hiện "100+" (core chưa trả số đếm). */
const COUNT_CAP = 100;

// Tab "Biểu mẫu": mọi form, lọc theo mở / đóng. Số bài mới của từng form đọc bằng một lời gọi
// danh sách bài nộp `status=new` (song song, tối đa 100) vì `FormResponse` chưa kèm số đếm.
export default async function FormsPage(props: PageProps<"/marketing/forms">) {
  if (!(await can(FORMS_READ))) redirect(`${BASE}/data`);
  const t = await getTranslations("engage.forms");
  const params = await props.searchParams;
  const status = oneOf(params, "status", STATES);
  const cursor = one(params, "cursor", 500);
  let page: { data: Form[]; pagination: { next_cursor?: string | null } };
  try {
    page = await load((client) =>
      client.GET("/api/v1/forms", {
        params: {
          query: { limit: PAGE_SIZE, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) },
        },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={FORMS_READ} />;
    throw error;
  }
  const fresh = await Promise.all(
    page.data.map(async (form) => {
      try {
        const subs = await load((client) =>
          client.GET("/api/v1/forms/{id}/submissions", {
            params: { path: { id: form.id }, query: { status: "new", limit: COUNT_CAP } },
          }),
        );
        return subs.pagination.next_cursor ? `${COUNT_CAP}+` : String(subs.data.length);
      } catch {
        return "—";
      }
    }),
  );
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
                {page.data.map((form, index) => (
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
                      {fresh[index] === "0" ? (
                        "0"
                      ) : (
                        <Link
                          className="eg-count"
                          href={hrefWith(`${BASE}/${form.id}`, { status: "new" })}
                        >
                          {fresh[index]}
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
