import { getLocale, getTranslations } from "next-intl/server";
import { addPurpose, togglePurpose } from "@/app/(admin)/compliance/actions";
import { sampleGate } from "@/app/(admin)/org/access/sample-gate";
import { ChangeButtons } from "@/components/engage/actions";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCount } from "@/lib/format";
import { PRIVACY_MANAGE, PRIVACY_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import {
  DATA_CATEGORIES,
  LEGAL_BASES,
  listPurposes,
  RETENTIONS,
} from "@/sample/compliance-records";

// Tab "Mục đích xử lý": vì sao thu, căn cứ, loại dữ liệu, hạn lưu. Danh sách hiệu lực = mặc định
// của bộ quy định ∪ phần khách thêm; công khai trên website (`GET /public/purposes`) và là đầu vào
// của sổ hoạt động xử lý. Tắt / bật đảo được (Hoàn tác).
export default async function PurposesTab() {
  const gate = await sampleGate(PRIVACY_READ);
  if (gate) return gate;
  const t = await getTranslations("compliance.records.purposes");
  const [{ data: purposes }, manage, locale] = await Promise.all([
    listPurposes(),
    can(PRIVACY_MANAGE),
    getLocale(),
  ]);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="cp-pu-h">
        <div className="block-head">
          <h2 id="cp-pu-h" className="h2">
            {t("title")}
          </h2>
          {manage ? (
            <FormDialog
              action={addPurpose}
              label={t("add.button")}
              title={t("add.title")}
              intro={t("add.intro")}
              submit={t("add.submit")}
              done={t("add.done")}
              fields={[
                {
                  kind: "text",
                  name: "key",
                  label: t("add.key"),
                  mono: true,
                  placeholder: "marketing.zalo",
                },
                { kind: "text", name: "description_vi", label: t("add.descriptionVi") },
                { kind: "text", name: "description_en", label: t("add.descriptionEn") },
                {
                  kind: "select",
                  name: "legal_basis",
                  label: t("basis"),
                  defaultValue: "consent",
                  options: LEGAL_BASES.map((b) => ({ value: b, label: t(`bases.${b}`) })),
                  hint: t("add.basisHint"),
                },
                {
                  kind: "checks",
                  name: "data_categories",
                  label: t("categories"),
                  options: DATA_CATEGORIES.map((c) => ({ value: c, label: t(`data.${c}`) })),
                },
                {
                  kind: "select",
                  name: "retention",
                  label: t("retention"),
                  defaultValue: "P1Y",
                  options: RETENTIONS.map((r) => ({ value: r, label: t(`retentions.${r}`) })),
                },
              ]}
            />
          ) : null}
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("purpose")}</Th>
                <Th>{t("basis")}</Th>
                <Th>{t("categories")}</Th>
                <Th>{t("retention")}</Th>
                <Th>{t("state")}</Th>
                {manage ? (
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {purposes.map((purpose) => (
                <tr key={purpose.key}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <b>{locale === "vi" ? purpose.description.vi : purpose.description.en}</b>
                      <span className="sub">
                        <span className="mono">{purpose.key}</span> ·{" "}
                        {t(`source.${purpose.source}`)}
                        {purpose.consents
                          ? ` · ${t("consents", {
                              granted: formatCount(purpose.consents.granted, locale),
                              withdrawn: formatCount(purpose.consents.withdrawn, locale),
                            })}`
                          : ""}
                      </span>
                    </span>
                  </Td>
                  <Td label={t("basis")}>{t(`bases.${purpose.legal_basis}`)}</Td>
                  <Td label={t("categories")}>
                    {purpose.data_categories.map((c) => t(`data.${c}`)).join(", ")}
                  </Td>
                  <Td label={t("retention")}>{t(`retentions.${purpose.retention}`)}</Td>
                  <Td label={t("state")}>
                    <span className={purpose.active ? "badge b-ok" : "badge b-arch"}>
                      <span className="dot" />
                      {purpose.active ? t("on") : t("off")}
                    </span>
                  </Td>
                  {manage ? (
                    <Td className="rt-acts">
                      {purpose.legal_basis === "legal_obligation" ? (
                        <span className="sub muted">{t("required")}</span>
                      ) : (
                        <ChangeButtons
                          action={togglePurpose}
                          id={purpose.key}
                          expect="-"
                          undo={{ label: t("undo"), done: t("undone") }}
                          moves={[
                            purpose.active
                              ? { value: "off", label: t("disable"), done: t("disabled") }
                              : { value: "on", label: t("enable"), done: t("enabled") },
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
        <p className="note">{t("consentNote")}</p>
      </section>
    </div>
  );
}
