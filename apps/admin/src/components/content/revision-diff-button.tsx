"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { revisionPair } from "@/app/(admin)/content/structure/actions";
import { Dialog } from "@/components/ui/dialog";
import { diffSnapshots, type RevisionDiff } from "@/lib/revision-diff";
import { RevisionDiffView } from "./revision-diff";

/**
 * "Xem khác biệt" của một phiên bản trong trình soạn: so phiên bản `beforeId` với phiên bản mới hơn
 * ngay sau nó (`afterId`), hoặc với bản nháp đã lưu khi đó là phiên bản mới nhất (`afterId` null).
 */
export function RevisionDiffButton({
  entryId,
  beforeId,
  afterId,
  title,
}: {
  entryId: string;
  beforeId: string;
  afterId: string | null;
  title: string;
}) {
  const t = useTranslations("structure.diff");
  return (
    <Dialog label={t("open")} title={title} intro={afterId ? undefined : t("againstDraft")}>
      {() => <DiffBody entryId={entryId} beforeId={beforeId} afterId={afterId} />}
    </Dialog>
  );
}

function DiffBody({
  entryId,
  beforeId,
  afterId,
}: {
  entryId: string;
  beforeId: string;
  afterId: string | null;
}) {
  const t = useTranslations("structure.diff");
  const [diff, setDiff] = useState<RevisionDiff | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void revisionPair(entryId, beforeId, afterId).then((result) => {
      if (!live) return;
      if (result.ok) setDiff(diffSnapshots(result.data.before, result.data.after));
      else setError(result.problem.detail);
    });
    return () => {
      live = false;
    };
  }, [entryId, beforeId, afterId]);
  if (error) {
    return (
      <p role="alert" className="falert">
        {error}
      </p>
    );
  }
  return diff ? <RevisionDiffView diff={diff} /> : <p className="fhint">{t("loading")}</p>;
}
