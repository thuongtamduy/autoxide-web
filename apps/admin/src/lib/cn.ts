/** Ghép tên lớp CSS, bỏ giá trị rỗng. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
