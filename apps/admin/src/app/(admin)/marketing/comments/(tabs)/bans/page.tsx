import { getTranslations } from "next-intl/server";
import { liftBan } from "@/app/(admin)/marketing/comments/actions";
import { ConfirmButton } from "@/components/engage/actions";
import { BanDialog } from "@/components/engage/comment-forms";
import { Chips, Forbidden, Pager } from "@/components/engage/common";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { BAN_KINDS, type CommentBan } from "@/lib/comments";
import { isForbidden, load } from "@/lib/core";
import { COMMENTS_MANAGE, hrefWith, one, oneOf, PAGE_SIZE } from "@/lib/engage";
import { can } from "@/lib/viewer";

const BASE = "/marketing/comments/bans";

// Tab "Danh sách cấm": cấm theo tài khoản, email hay dấu vết mạng đã băm; mặc định chỉ lệnh còn
// hiệu lực. Bình luận mới (và sửa) của người bị cấm bị core từ chối tới khi hết hạn.
export default async function BansPage(props: PageProps<"/marketing/comments/bans">) {
  if (!(await can(COMMENTS_MANAGE))) return <Forbidden permission={COMMENTS_MANAGE} />;
  const t = await getTranslations("engage.comments");
  const e = await getTranslations("emptyStates");
  const params = await props.searchParams;
  const all = one(params, "all") === "1";
  const kind = oneOf(params, "kind", BAN_KINDS);
  const cursor = one(params, "cursor", 500);
  let page: { data: CommentBan[]; pagination: { next_cursor?: string | null } };
  try {
    page = await load((client) =>
      client.GET("/api/v1/comments/bans", {
        params: {
          query: {
            limit: PAGE_SIZE,
            ...(all ? {} : { active: true }),
            ...(kind ? { kind } : {}),
            ...(cursor ? { cursor } : {}),
          },
        },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) return <Forbidden permission={COMMENTS_MANAGE} />;
    throw error;
  }
  const keep = { all: all ? "1" : undefined };
  const next = page.pagination.next_cursor;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="bans-h">
        <div className="block-head">
          <h2 id="bans-h" className="h2">
            {t("bans")}
          </h2>
          <BanDialog />
        </div>
        <p className="fhint">{t("bansAbout")}</p>
        <Chips
          label={t("filterBans")}
          chips={[
            { href: hrefWith(BASE, { kind }), label: t("activeBans"), on: !all },
            { href: hrefWith(BASE, { kind, all: "1" }), label: t("allBans"), on: all },
          ]}
        />
        <Chips
          label={t("filterKind")}
          chips={[
            { href: hrefWith(BASE, keep), label: t("allKinds"), on: !kind },
            ...BAN_KINDS.map((k) => ({
              href: hrefWith(BASE, { ...keep, kind: k }),
              label: t(`ban.kinds.${k}`),
              on: kind === k,
            })),
          ]}
        />
        <div className="card tcard">
          {page.data.length === 0 ? (
            <EmptyState icon="shield" title={t("noBans")}>
              {e("bans.body")}
            </EmptyState>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("col.banned")}</Th>
                  <Th>{t("col.why")}</Th>
                  <Th>{t("col.until")}</Th>
                  <Th>{t("col.status")}</Th>
                  <Th>{t("col.actions")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((ban) => (
                  <tr key={ban.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <span className="mono ell">{ban.value}</span>
                        <span className="sub">
                          {t.has(`ban.kinds.${ban.kind}`) ? t(`ban.kinds.${ban.kind}`) : ban.kind} ·{" "}
                          <Time value={ban.created_at} />
                        </span>
                      </span>
                    </Td>
                    <Td label={t("col.why")}>{ban.reason}</Td>
                    <Td className="whitespace-nowrap" label={t("col.until")}>
                      {ban.until ? <Time value={ban.until} /> : t("forever")}
                    </Td>
                    <Td label={t("col.status")}>
                      <span className={ban.active ? "badge b-bad" : "badge b-draft"}>
                        <span className="dot" />
                        {ban.active ? t("banActive") : t("banExpired")}
                      </span>
                    </Td>
                    <Td label={t("col.actions")}>
                      <ConfirmButton
                        action={liftBan}
                        fields={{ id: ban.id }}
                        label={t("lift")}
                        title={t("liftTitle", { value: ban.value })}
                        points={[t("liftAgain"), t("liftAudit")]}
                        submit={t("liftSubmit")}
                        done={t("lifted")}
                        danger={false}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Pager
          first={cursor ? hrefWith(BASE, { ...keep, kind }) : null}
          next={next ? hrefWith(BASE, { ...keep, kind, cursor: next }) : null}
        />
      </section>
    </div>
  );
}
