import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  bulkRemoveSuppressions,
  removeSuppression,
} from "@/app/(admin)/marketing/newsletter/actions";
import { ConfirmButton } from "@/components/engage/actions";
import { Forbidden } from "@/components/engage/common";
import { SuppressDialog } from "@/components/engage/subscriber-forms";
import { AutoFilter } from "@/components/ui/auto-filter";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { EmptyState } from "@/components/ui/empty-state";
import { Pager } from "@/components/ui/pager";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { isForbidden, load } from "@/lib/core";
import { hrefWith, NEWSLETTER_MANAGE, NEWSLETTER_READ, one, PAGE_SIZE } from "@/lib/engage";
import type { Suppression } from "@/lib/newsletter";
import { readSort } from "@/lib/table";
import { can } from "@/lib/viewer";

const BASE = "/marketing/newsletter/suppressions";

// Tab "Không gửi": địa chỉ không nhận chiến dịch nào, dù còn đăng ký — bounce cứng, khiếu nại thư
// rác, đủ số bounce mềm, hoặc chặn tay. Dòng có một nút (Gỡ); chọn nhiều để gỡ (lặp lệnh từng cái của
// core); sắp theo giờ thêm (`order` của core); phân trang theo con trỏ, không tổng.
export default async function SuppressionsPage(
  props: PageProps<"/marketing/newsletter/suppressions">,
) {
  const t = await getTranslations("engage.newsletter");
  const e = await getTranslations("emptyStates");
  const params = await props.searchParams;
  const email = one(params, "email");
  const cursor = one(params, "cursor", 500);
  // Core chỉ sắp theo giờ thêm vào danh sách (`order=asc|desc`): chỉ cột "Từ lúc" sắp được.
  const sort = readSort(params, ["created"], { field: "created", dir: "desc" });
  const order = one(params, "sort") ? sort.dir : undefined;
  const keep = { email, ...(order ? { sort: "created", dir: order } : {}) };
  let page: { data: Suppression[]; pagination: { next_cursor?: string | null } };
  try {
    page = await load((client) =>
      client.GET("/api/v1/newsletter/suppressions", {
        params: {
          query: {
            limit: PAGE_SIZE,
            ...(email ? { email } : {}),
            ...(order ? { order } : {}),
            ...(cursor ? { cursor } : {}),
          },
        },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={NEWSLETTER_READ} />;
    throw error;
  }
  const manage = await can(NEWSLETTER_MANAGE);
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="sup-h">
        <div className="block-head">
          <h2 id="sup-h" className="h2">
            {t("suppressions")}
          </h2>
          {manage ? <SuppressDialog /> : null}
        </div>
        <p className="fhint">{t("suppressionsAbout")}</p>
        <form method="get" action={BASE} className="filters">
          <AutoFilter />
          <label className="fld grow">
            <span className="lab">{t("searchEmail")}</span>
            <input
              className="inp"
              type="search"
              name="email"
              defaultValue={email ?? ""}
              placeholder={t("searchEmailHint")}
              maxLength={200}
            />
          </label>
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("apply")}
            </button>
            {email ? (
              <Link className="btn ghost" href={BASE}>
                {t("clear")}
              </Link>
            ) : null}
          </div>
        </form>
        <div className="card tcard">
          {page.data.length === 0 ? (
            email ? (
              <p className="empty">{t("noMatch")}</p>
            ) : (
              <EmptyState icon="mail" title={t("noSuppressions")}>
                {e("suppressions.body")}
              </EmptyState>
            )
          ) : (
            <BulkTable
              ids={page.data.map((s) => s.id)}
              actions={
                manage
                  ? [
                      {
                        key: "remove",
                        label: t("unsuppress"),
                        run: bulkRemoveSuppressions,
                        confirm: {
                          title: t("bulkUnsuppressTitle"),
                          points: [t("unsuppressMail"), t("unsuppressBounce")],
                          submit: t("unsuppressSubmit"),
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
                    <Th>{t("col.email")}</Th>
                    <Th>{t("col.reason")}</Th>
                    <Th>{t("col.note")}</Th>
                    <SortTh field="created" sort={sort} base={BASE} keep={keep} first="desc">
                      {t("col.since")}
                    </SortTh>
                    {manage ? <Th>{t("col.actions")}</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((s) => (
                    <tr key={s.id}>
                      {manage ? <SelectTd id={s.id} name={s.email} /> : null}
                      <Td className="rt-title">
                        <span className="mono ell">{s.email}</span>
                      </Td>
                      <Td label={t("col.reason")}>
                        <span className="badge b-bad">
                          <span className="dot" />
                          {t.has(`reason.${s.reason}`) ? t(`reason.${s.reason}`) : s.reason}
                        </span>
                      </Td>
                      <Td label={t("col.note")}>{s.note || "—"}</Td>
                      <Td className="whitespace-nowrap" label={t("col.since")}>
                        <Time value={s.created_at} />
                      </Td>
                      {manage ? (
                        <Td label={t("col.actions")}>
                          <ConfirmButton
                            action={removeSuppression}
                            fields={{ id: s.id }}
                            label={t("unsuppress")}
                            title={t("unsuppressTitle", { email: s.email })}
                            points={[t("unsuppressMail"), t("unsuppressBounce")]}
                            submit={t("unsuppressSubmit")}
                            done={t("unsuppressed")}
                            danger={false}
                          />
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        {/* Core phân trang theo con trỏ, không trả tổng. */}
        <Pager
          first={cursor ? hrefWith(BASE, keep) : null}
          next={next ? hrefWith(BASE, { ...keep, cursor: next }) : null}
        />
      </section>
    </div>
  );
}
