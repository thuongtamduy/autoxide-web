import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Chips, Forbidden, Pager } from "@/components/engage/common";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { type CommentTarget, TARGET_BADGE, targetHref, targetState } from "@/lib/comments";
import { isForbidden, load } from "@/lib/core";
import { COMMENTS_READ, hrefWith, one, oneOf, PAGE_SIZE } from "@/lib/engage";
import { can } from "@/lib/viewer";

const BASE = "/marketing/comments/targets";
const STATES = ["open", "closed"] as const;

// Tab "Theo bài": mọi đích đã có bình luận (`GET /comments/targets`), đích mới có bình luận trước,
// kèm số đếm và trạng thái (mở, đóng, ẩn, giờ tự đóng). Lọc theo trạng thái đang áp dụng, đích còn
// bình luận chờ duyệt, loại đích — core lọc cả danh sách. Tiêu đề chỉ có khi đích đang công khai;
// ô tra mở thẳng một đích bất kỳ.
export default async function TargetsPage(props: PageProps<"/marketing/comments/targets">) {
  if (!(await can(COMMENTS_READ))) return <Forbidden permission={COMMENTS_READ} />;
  const t = await getTranslations("engage.comments");
  const params = await props.searchParams;
  const type = one(params, "type");
  const id = one(params, "id", 500);
  if (type && id) redirect(targetHref(type, id));
  const state = oneOf(params, "state", STATES);
  const pending = one(params, "pending") === "1" ? "1" : undefined;
  const kind = one(params, "kind");
  const cursor = one(params, "cursor", 500);
  let page: { data: CommentTarget[]; pagination: { next_cursor?: string | null } };
  let types: string[];
  try {
    const [found, settings] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/comments/targets", {
          params: {
            query: {
              limit: PAGE_SIZE,
              ...(state ? { state } : {}),
              ...(pending ? { pending: true } : {}),
              ...(kind ? { target_type: kind } : {}),
              ...(cursor ? { cursor } : {}),
            },
          },
        }),
      ),
      load((client) => client.GET("/api/v1/comments/public/settings")),
    ]);
    page = found;
    types = settings.data.target_types;
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={COMMENTS_READ} />;
    throw error;
  }
  const found = page.data;
  const keep = { kind };
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="tg-find">
        <h2 id="tg-find" className="h2">
          {t("findTarget")}
        </h2>
        <form method="get" action={BASE} className="filters">
          <label className="fld">
            <span className="lab">{t("targetType")}</span>
            <select className="inp" name="type" defaultValue={types[0] ?? ""}>
              {types.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="fld grow">
            <span className="lab">{t("targetId")}</span>
            <input className="inp mono" name="id" required maxLength={500} />
          </label>
          <div className="filters-acts">
            <button type="submit" className="btn">
              {t("open")}
            </button>
          </div>
        </form>
      </section>
      <section className="block" aria-labelledby="tg-h">
        <h2 id="tg-h" className="h2">
          {t("targets")}
        </h2>
        <p className="fhint">{t("targetsAbout")}</p>
        <Chips
          label={t("filterTargets")}
          chips={[
            { href: hrefWith(BASE, keep), label: t("all"), on: !state && !pending },
            ...STATES.map((s) => ({
              href: hrefWith(BASE, { ...keep, state: s }),
              label: t(`target.${s}`),
              on: state === s && !pending,
            })),
            {
              href: hrefWith(BASE, { ...keep, pending: "1" }),
              label: t("withPending"),
              on: Boolean(pending),
            },
          ]}
        />
        {types.length > 1 ? (
          <form method="get" action={BASE} className="filters">
            {state ? <input type="hidden" name="state" value={state} /> : null}
            {pending ? <input type="hidden" name="pending" value="1" /> : null}
            <label className="fld">
              <span className="lab">{t("targetType")}</span>
              <select className="inp" name="kind" defaultValue={kind ?? ""}>
                <option value="">{t("allTypes")}</option>
                {types.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("apply")}
              </button>
            </div>
          </form>
        ) : null}
        <div className="card tcard">
          {found.length === 0 ? (
            <p className="empty">{state || pending || kind ? t("noMatch") : t("noTargets")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("col.target")}</Th>
                  <Th>{t("col.shown")}</Th>
                  <Th>{t("col.pending")}</Th>
                  <Th>{t("col.closes")}</Th>
                  <Th>{t("col.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {found.map((st) => {
                  const shown = targetState(st);
                  return (
                    <tr key={`${st.target_type}\u0000${st.target_id}`}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open ell"
                            href={targetHref(st.target_type, st.target_id)}
                          >
                            {st.title ?? st.target_id}
                          </Link>
                          <span className="sub mono">
                            {st.target_type}
                            {st.url ? ` · ${st.url}` : ""}
                          </span>
                        </span>
                      </Td>
                      <Td className="tabular-nums" label={t("col.shown")}>
                        {st.comment_count}
                      </Td>
                      <Td className="tabular-nums" label={t("col.pending")}>
                        {st.pending_count ?? "—"}
                      </Td>
                      <Td className="whitespace-nowrap" label={t("col.closes")}>
                        {st.closes_at ? <Time value={st.closes_at} /> : "—"}
                      </Td>
                      <Td label={t("col.status")}>
                        <span className={TARGET_BADGE[shown]}>
                          <span className="dot" />
                          {t(`target.${shown}`)}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
        <Pager
          first={cursor ? hrefWith(BASE, { ...keep, state, pending }) : null}
          next={next ? hrefWith(BASE, { ...keep, state, pending, cursor: next }) : null}
        />
      </section>
    </div>
  );
}
