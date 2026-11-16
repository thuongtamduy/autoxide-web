import { getLocale, getTranslations } from "next-intl/server";
import { publishDocument } from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { Basis, Day } from "@/components/compliance/common";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { loadPublishedPages } from "@/lib/compliance-server";
import { formatCount } from "@/lib/format";
import { DOCUMENTS_MANAGE, DOCUMENTS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import {
  currentVersion,
  documentState,
  listAcceptances,
  listDocuments,
} from "@/sample/compliance-records";
import { dayOf, ruleAt } from "@/sample/compliance-rules";

const STATE_BADGE = { current: "badge b-ok", scheduled: "badge b-sched", none: "badge b-draft" };

// Tab "Văn bản": điều khoản, chính sách bảo mật, điều kiện giao dịch chung, quy chế sàn, hợp đồng
// người bán. Văn bản soạn như trang của `content`; phát hành thì chép ảnh chụp bất biến kèm ngày
// hiệu lực (không đảo được, nên hỏi lại). Trang nguồn để chọn là trang đã đăng THẬT của core.
export default async function DocumentsTab() {
  const gate = await sampleGate(DOCUMENTS_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.records.documents");
  const [{ data: documents }, manage, pages, locale] = await Promise.all([
    listDocuments(),
    can(DOCUMENTS_MANAGE),
    loadPublishedPages(),
    getLocale(),
  ]);
  const evidence = await Promise.all(documents.map((d) => listAcceptances(d.id)));
  const sources = (pages ?? []).map((p) => ({ value: p.id, label: `${p.title} · ${p.locale}` }));
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="cp-docs-h">
        <h2 id="cp-docs-h" className="h2">
          {t("title")}
        </h2>
        <p className="fhint">{t("about")}</p>
        {pages === null ? <p className="note warn">{t("noContent")}</p> : null}
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("document")}</Th>
                <Th>{t("audience")}</Th>
                <Th>{t("version")}</Th>
                <Th className="text-right">{t("accepted")}</Th>
                <Th>{t("state")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc, index) => {
                const state = documentState(doc);
                const latest = doc.versions[0];
                const current = currentVersion(doc);
                const proofs = evidence[index]?.data ?? [];
                return (
                  <tr key={doc.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{doc.title}</b>
                        <span className="sub mono">{doc.kind}</span>
                      </span>
                    </Td>
                    <Td label={t("audience")}>{t(`audiences.${doc.audience}`)}</Td>
                    <Td label={t("version")}>
                      {latest ? (
                        <span className="cell2">
                          <span>
                            {t("versionFrom", { version: latest.version })}{" "}
                            <Day value={latest.effective_from} />
                          </span>
                          <span className="sub">
                            {latest.requires_reacceptance ? t("reaccept") : t("noReaccept")}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right" label={t("accepted")}>
                      {current
                        ? doc.audience_total !== null
                          ? `${formatCount(current.accepted_count, locale)} / ${formatCount(doc.audience_total, locale)}`
                          : formatCount(current.accepted_count, locale)
                        : "—"}
                    </Td>
                    <Td label={t("state")}>
                      <span className={STATE_BADGE[state]}>
                        <span className="dot" />
                        {t(`states.${state}`)}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      <span className="eg-acts">
                        {manage ? (
                          <FormDialog
                            action={publishDocument}
                            label={t("publish.button")}
                            title={t("publish.title", { title: doc.title })}
                            intro={t("publish.intro")}
                            points={[
                              t("publish.snapshot"),
                              t("publish.final"),
                              t("publish.reacceptPoint"),
                            ]}
                            submit={t("publish.submit")}
                            done={t("publish.done")}
                            fields={[
                              { kind: "hidden", name: "document_id", value: doc.id },
                              {
                                kind: "select",
                                name: "source_entry_id",
                                label: t("publish.source"),
                                options: [{ value: "", label: t("publish.choose") }, ...sources],
                                hint:
                                  sources.length === 0
                                    ? t("publish.noSources")
                                    : t("publish.sourceHint"),
                              },
                              {
                                kind: "select",
                                name: "locale",
                                label: t("publish.locale"),
                                defaultValue: "vi",
                                options: [
                                  { value: "vi", label: "Tiếng Việt (vi)" },
                                  { value: "en", label: "English (en)" },
                                ],
                              },
                              {
                                kind: "date",
                                name: "effective_from",
                                label: t("publish.effective"),
                                defaultValue: dayOf(),
                              },
                              {
                                kind: "check",
                                name: "requires_reacceptance",
                                label: t("publish.reaccept"),
                                hint: t("publish.reacceptHint"),
                              },
                              { kind: "check", name: "acknowledged", label: t("publish.ack") },
                            ]}
                          />
                        ) : null}
                      </span>
                      {proofs.length > 0 ? (
                        <details className="cp-proofs">
                          <summary>{t("evidence", { count: proofs.length })}</summary>
                          <ul>
                            {proofs.map((p) => (
                              <li key={p.id}>
                                <b>{p.subject}</b> · {t("versionShort", { version: p.version })} ·{" "}
                                {t(`channels.${p.channel}`)} · {t(`methods.${p.method}`)} ·{" "}
                                <Time value={p.accepted_at} />
                                <span className="sub mono">SHA-256 {p.sha256.slice(0, 12)}…</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("countNote")}</p>
        <Basis rule={ruleAt("documents.evidence")} lead={t("evidenceLaw")} />
      </section>
    </div>
  );
}
