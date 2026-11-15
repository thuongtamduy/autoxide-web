import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { setTargetState } from "@/app/(admin)/marketing/comments/actions";
import { ChangeButtons, type Move } from "@/components/engage/actions";
import { ClosesForm } from "@/components/engage/comment-forms";
import { Back, DetailHead, Facts, Forbidden } from "@/components/engage/common";
import { Time } from "@/components/ui/time";
import { adminHref, type CommentTarget, decoded, TARGET_BADGE, targetState } from "@/lib/comments";
import { isForbidden, isNotFound, load } from "@/lib/core";
import { COMMENTS_MANAGE, COMMENTS_READ, hrefWith } from "@/lib/engage";
import { can } from "@/lib/viewer";

// Bình luận của một đích: mở, đóng (giữ bình luận cũ, không nhận mới), ẩn hết (và đóng); giờ tự
// đóng. Đổi trạng thái có Hoàn tác. Core ghi `comments.target_opened` / `target_closed`.
export default async function TargetPage(
  props: PageProps<"/marketing/comments/targets/[type]/[id]">,
) {
  const raw = await props.params;
  const type = decoded(raw.type);
  const id = decoded(raw.id);
  const t = await getTranslations("engage.comments");
  let target: CommentTarget;
  let title: string | null = null;
  try {
    // Tiêu đề của đích: `target_title` của một bình luận bất kỳ của nó (core tra qua sổ đối tượng,
    // chỉ khi đích đang công khai). Trạng thái đích và một bình luận đọc song song.
    const [found, sample] = await Promise.all([
      load((client) =>
        client.GET("/api/v1/comments/targets/{target_type}/{target_id}", {
          params: { path: { target_type: type, target_id: id } },
        }),
      ),
      load((client) =>
        client.GET("/api/v1/comments", {
          params: { query: { target_type: type, target_id: id, limit: 1 } },
        }),
      ),
    ]);
    target = found.data;
    title = sample.data[0]?.target_title ?? null;
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={COMMENTS_READ} />;
    if (isNotFound(error)) notFound();
    throw error;
  }
  const manage = await can(COMMENTS_MANAGE);
  const openHref = adminHref(type, id);
  const shown = targetState(target);
  const moves: Move[] = [];
  if (shown !== "open")
    moves.push({ value: "open", label: t("targetOpen"), done: t("targetOpened"), tone: "pri" });
  if (shown === "open")
    moves.push({ value: "closed", label: t("targetClose"), done: t("targetClosed") });
  if (shown !== "hidden")
    moves.push({
      value: "hidden",
      label: t("targetHide"),
      done: t("targetHidden"),
      tone: "danger",
    });
  return (
    <div className="blocks">
      <Back href="/marketing/comments/targets" label={t("backToTargets")} />
      <DetailHead
        title={title ?? id}
        badge={
          <span className={TARGET_BADGE[shown]}>
            <span className="dot" />
            {t(`target.${shown}`)}
          </span>
        }
        description={t(`targetAbout.${shown}`)}
        actions={
          <>
            {openHref ? (
              <Link className="btn sm" href={openHref}>
                {t("openTarget")}
              </Link>
            ) : null}
            <Link
              className="btn sm"
              href={hrefWith("/marketing/comments", { type, target: id, status: "published" })}
            >
              {t("targetComments")}
            </Link>
          </>
        }
      />
      {manage ? (
        <ChangeButtons
          action={setTargetState}
          id={id}
          expect="-"
          extra={{ type, target: id }}
          undo={{ label: t("undo"), done: t("undone") }}
          moves={moves}
          small={false}
        />
      ) : null}
      <section className="block" aria-labelledby="tg-facts">
        <h3 id="tg-facts" className="h2">
          {t("targetFacts")}
        </h3>
        <div className="card padded">
          <Facts
            items={[
              [
                t("typeLabel"),
                <span key="ty" className="mono">
                  {type}
                </span>,
              ],
              [
                t("targetId"),
                <span key="id" className="mono">
                  {id}
                </span>,
              ],
              [t("col.shown"), String(target.comment_count)],
              [t("col.pending"), String(target.pending_count ?? 0)],
              [t("col.closes"), target.closes_at ? <Time key="c" value={target.closes_at} /> : "—"],
            ]}
          />
        </div>
      </section>
      {manage ? (
        <section className="block" aria-labelledby="tg-closes">
          <h3 id="tg-closes" className="h2">
            {t("closesTitle")}
          </h3>
          <div className="card padded">
            <ClosesForm type={type} target={id} current={target.closes_at} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
