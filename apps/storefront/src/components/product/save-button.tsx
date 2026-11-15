"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icon";

const KEY = "sf_saved";

function readSaved(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Lưu sản phẩm không cần đăng nhập (Baymard: 89% website không cho): nhớ trên máy này
 * (`localStorage`, tiện ích riêng của người xem). Khi có tài khoản người mua thì đồng bộ lên core.
 */
export function SaveButton({
  id,
  labels,
}: {
  id: string;
  labels: { save: string; unsave: string; saved: string };
}) {
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => setSaved(readSaved().includes(id)), [id]);
  const toggle = () => {
    const next = !saved;
    const list = readSaved().filter((x) => x !== id);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next ? [id, ...list].slice(0, 100) : list));
    } catch {
      // Trình duyệt chặn bộ nhớ (cửa sổ riêng tư): vẫn đổi trạng thái trên trang này.
    }
    setSaved(next);
    if (next) {
      setToast(labels.saved);
      window.setTimeout(() => setToast(""), 2600);
    }
  };
  return (
    <>
      <button
        type="button"
        className={`btn sq pp-save${saved ? " on" : ""}`}
        aria-pressed={saved}
        aria-label={saved ? labels.unsave : labels.save}
        onClick={toggle}
      >
        <Icon name="heart" />
      </button>
      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" />
          {toast}
        </div>
      ) : null}
    </>
  );
}
