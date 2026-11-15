import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { aiLabel } from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis } from "@/components/compliance/common";
import { ChangeButtons } from "@/components/engage/actions";
import { SampleBadge } from "@/components/sample-badge";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { AI_SCAN_LIMIT, loadAiEntries } from "@/lib/compliance-server";
import { CASES_READ, CONTENT_PUBLISH } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { listAiLabelled } from "@/sample/compliance-records";
import { ruleAt } from "@/sample/compliance-rules";

const LABEL_BADGE = {
  ai_generated: "badge b-violet",
  ai_assisted: "badge b-violet",
  removed: "badge b-arch",
} as const;

// Tab "Nhãn AI": nội dung do AI tạo hay sửa phải mang nhãn khi hiện cho người xem. Bài viết và trang
// có `ai_generated` đọc THẬT từ core (lọc trên các bài sửa gần nhất vì core chưa có tham số lọc);
// sản phẩm và alt ảnh là dữ liệu mẫu (chưa có API).
export default async function AiTab() {
  const gate = await sampleGate(CASES_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.records.ai");
  const [entries, { data: others }, publish] = await Promise.all([
    loadAiEntries(),
    listAiLabelled(),
    can(CONTENT_PUBLISH),
  ]);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="cp-ai-posts-h">
        <h2 id="cp-ai-posts-h" className="h2">
          {t("posts")}
        </h2>
        <p className="fhint">{t("postsAbout", { limit: AI_SCAN_LIMIT })}</p>
        <div className="card tcard">
          {entries === null ? (
            <p className="empty">{t("noContent")}</p>
          ) : entries.length === 0 ? (
            <p className="empty">{t("noPosts")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("content")}</Th>
                  <Th>{t("status")}</Th>
                  <Th>{t("updated")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b className="ell">{entry.title || t("untitled")}</b>
                        <span className="sub">
                          {t(`kinds.${entry.kind}`)} · {entry.locale}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("status")}>
                      <span className="badge b-violet">{t("generated")}</span>{" "}
                      <span className="sub">{t(`statuses.${entry.status}`)}</span>
                    </Td>
                    <Td label={t("updated")}>
                      <Time value={entry.updated_at} />
                    </Td>
                    <Td className="rt-acts">
                      <Link className="btn sm" href={`/content/${entry.id}`}>
                        {t("open")}
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </section>

      <section className="block" aria-labelledby="cp-ai-other-h">
        <div className="block-head">
          <h2 id="cp-ai-other-h" className="h2">
            {t("other")}
          </h2>
          <SampleBadge
            step="mới"
            endpoint="GET /api/v1/catalog/products?ai_label=, GET /api/v1/media?ai_label=, PATCH …/ai-label"
          />
        </div>
        <p className="fhint">{t("otherAbout")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("content")}</Th>
                <Th>{t("what")}</Th>
                <Th>{t("reviewer")}</Th>
                <Th>{t("label")}</Th>
                {publish ? (
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {others.map((item) => (
                <tr key={item.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <b>{item.title}</b>
                      <span className="sub">{t(`kinds.${item.kind}`)}</span>
                    </span>
                  </Td>
                  <Td label={t("what")}>{item.what}</Td>
                  <Td label={t("reviewer")}>{item.reviewer ?? t("notReviewed")}</Td>
                  <Td label={t("label")}>
                    <span className={LABEL_BADGE[item.label]}>{t(`labels.${item.label}`)}</span>
                  </Td>
                  {publish ? (
                    <Td className="rt-acts">
                      {item.label === "ai_generated" ? (
                        <span className="sub muted">{t("locked")}</span>
                      ) : (
                        <ChangeButtons
                          action={aiLabel}
                          id={item.id}
                          expect="-"
                          undo={{ label: t("undo"), done: t("undone") }}
                          moves={[
                            item.label === "ai_assisted"
                              ? { value: "removed", label: t("remove"), done: t("removed") }
                              : { value: "ai_assisted", label: t("restore"), done: t("restored") },
                          ]}
                        />
                      )}
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <Basis rule={ruleAt("ai.labels")} lead={t("law")} />
      </section>
    </div>
  );
}
