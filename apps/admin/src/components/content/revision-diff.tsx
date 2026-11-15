import { useTranslations } from "next-intl";
import { type RevisionDiff, trimContext } from "@/lib/revision-diff";

/**
 * Khác biệt giữa hai phiên bản: bảng các ô đã đổi (trước → sau) và thân bài theo từng khối (dòng
 * thêm xanh, dòng bớt đỏ, dòng giống nhau ở xa chỗ đổi được gập). Dùng ở màn Lịch sử phiên bản và
 * trong hộp "Xem khác biệt" của trình soạn.
 */
export function RevisionDiffView({ diff }: { diff: RevisionDiff }) {
  const t = useTranslations("structure.diff");
  if (diff.fields.length === 0 && diff.added === 0 && diff.removed === 0) {
    return <p className="empty">{t("identical")}</p>;
  }
  return (
    <div className="st-diff">
      {diff.fields.length > 0 ? (
        <dl className="st-difffields">
          {diff.fields.map((change) => (
            <div key={change.field}>
              <dt>{t(`fields.${change.field}`)}</dt>
              <dd>
                <del>{change.before || t("empty")}</del>
                <ins>{change.after || t("empty")}</ins>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <h4 className="cap">
        {t("body")}{" "}
        <span className="st-count">
          {t("counts", { added: diff.added, removed: diff.removed })}
        </span>
      </h4>
      {diff.added === 0 && diff.removed === 0 ? (
        <p className="fhint">{t("bodySame")}</p>
      ) : (
        <ol className="st-lines">
          {trimContext(diff.body).map((line, index) =>
            line.op === "gap" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: dòng không có id; thứ tự cố định trong một lần so
              <li key={index} className="gap">
                {t("gap", { count: line.count })}
              </li>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: dòng không có id; thứ tự cố định trong một lần so
              <li key={index} className={line.op}>
                <span className="vh">{t(line.op)}</span>
                <span aria-hidden="true" className="st-sign">
                  {line.op === "add" ? "+" : line.op === "remove" ? "−" : " "}
                </span>
                <span>{line.text || " "}</span>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
