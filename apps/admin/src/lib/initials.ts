/** Hai chữ cái đầu cho ảnh đại diện: "Lan Phạm" → "LP", "ada@example.com" → "AD". */
export function initialsOf(name: string): string {
  const base = name.includes("@") ? (name.split("@")[0] ?? "") : name;
  const words = base.split(/[\s._-]+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase() || "?";
}
