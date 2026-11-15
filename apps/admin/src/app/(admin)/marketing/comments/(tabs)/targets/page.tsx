import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Forbidden } from "@/components/engage/common";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import {
  type CommentDetail,
  type CommentTarget,
  TARGET_BADGE,
  targetHref,
  targetState,
  uniqueTargets,
} from "@/lib/comments";
import { targetKey, targetLabels } from "@/lib/comments-server";
import { isForbidden, load } from "@/lib/core";
import { COMMENTS_READ, one } from "@/lib/engage";
import { can } from "@/lib/viewer";

const BASE = "/marketing/comments/targets";

// Tab "Theo bài": trạng thái bình luận của từng đích (mở, đóng, ẩn, giờ tự đóng, số đếm). Core
// chưa có danh sách đích, nên tab lấy các đích có bình luận gần đây (đang chờ và đang hiện, mỗi
// loại 100 bình luận mới nhất) rồi đọc trạng thái từng đích; ô tra mở thẳng một đích bất kỳ.
export default async function TargetsPage(props: PageProps<"/marketing/comments/targets">) {
  if (!(await can(COMMENTS_READ))) return <Forbidden permission={COMMENTS_READ} />;
  const t = await getTranslations("engage.comments");
  const params = await props.searchParams;
  const type = one(params, "type");
  const id = one(params, "id", 500);
  if (type && id) redirect(targetHref(type, id));
  let recent: CommentDetail[];
  let types: string[];
  try {
    const [pending, published, settings] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/comments", { params: { query: { status: "pending", limit: 100 } } }),
      ),
      load((client) =>
        client.GET("/api/v1/comments", { params: { query: { status: "published", limit: 100 } } }),
      ),
      load((client) => client.GET("/api/v1/comments/public/settings")),
    ]);
    recent = [...pending.data, ...published.data];
    types = settings.data.target_types;
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={COMMENTS_READ} />;
    throw error;
  }
  const found = uniqueTargets(recent).slice(0, 50);
  const [states, labels] = await Promise.all([
    Promise.all(
      found.map(async (x): Promise<CommentTarget | null> => {
        try {
          const { data } = await load((client) =>
            client.GET("/api/v1/comments/targets/{target_type}/{target_id}", {
              params: { path: { target_type: x.type, target_id: x.id } },
            }),
          );
          return data;
        } catch {
          return null;
        }
      }),
    ),
    targetLabels(found),
  ]);
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
        <div className="card tcard">
          {found.length === 0 ? (
            <p className="empty">{t("noTargets")}</p>
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
                {found.map((x, index) => {
                  const st = states[index];
                  const shown = st ? targetState(st) : null;
                  return (
                    <tr key={targetKey(x.type, x.id)}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link className="open ell" href={targetHref(x.type, x.id)}>
                            {labels.get(targetKey(x.type, x.id))?.title ?? x.id}
                          </Link>
                          <span className="sub mono">{x.type}</span>
                        </span>
                      </Td>
                      <Td className="tabular-nums" label={t("col.shown")}>
                        {st?.comment_count ?? "—"}
                      </Td>
                      <Td className="tabular-nums" label={t("col.pending")}>
                        {st?.pending_count ?? "—"}
                      </Td>
                      <Td className="whitespace-nowrap" label={t("col.closes")}>
                        {st?.closes_at ? <Time value={st.closes_at} /> : "—"}
                      </Td>
                      <Td label={t("col.status")}>
                        {shown ? (
                          <span className={TARGET_BADGE[shown]}>
                            <span className="dot" />
                            {t(`target.${shown}`)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
