"use client";

// Trình soạn thân bài bằng Tiptap (W-007). Thân bài của core là JSON của ProseMirror / Tiptap
// với danh sách node cho phép (docs/CONTENT.md của core), nên trình soạn chỉ bật đúng các node
// đó: đoạn văn, tiêu đề 2–4, danh sách, trích dẫn, mã, đường kẻ, bảng, ảnh (giữ id media), nhúng.
// JSON lấy ra luôn qua `toCoreBody` để bỏ thuộc tính Tiptap tự thêm mà core không nhận.
import { type JSONContent, mergeAttributes, Node } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useTranslations } from "next-intl";
import { type Ref, useId, useImperativeHandle, useRef, useState } from "react";
import { type BodyNode, isSafeHref, toCoreBody } from "@/lib/content";

/** Ảnh trong thân bài: chỉ giữ id của media (core không nhận `src`). */
const MediaImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      mediaId: { default: null, rendered: false },
      alt: { default: null, rendered: false },
      caption: { default: null, rendered: false },
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-media-id]",
        getAttrs: (element) => ({
          mediaId: element.getAttribute("data-media-id"),
          alt: element.getAttribute("data-alt"),
          caption: element.getAttribute("data-caption"),
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const caption = typeof node.attrs.caption === "string" ? node.attrs.caption : "";
    const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        class: "ce-media",
        "data-media-id": String(node.attrs.mediaId ?? ""),
        "data-alt": alt,
        "data-caption": caption,
      }),
      ["span", { class: "mono" }, `media ${String(node.attrs.mediaId ?? "")}`],
      ["span", {}, alt ? `alt: ${alt}` : "alt: —"],
      ...(caption ? [["figcaption", {}, caption]] : []),
    ];
  },
});

/** Nhúng (video…) theo địa chỉ `https://` trên host core cho phép. */
const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: null, rendered: false } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-embed-url]",
        getAttrs: (element) => ({ url: element.getAttribute("data-embed-url") }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const url = String(node.attrs.url ?? "");
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "ce-embed", "data-embed-url": url }),
      ["span", { class: "mono" }, url],
    ];
  },
});

/** Thân bài của core là JSON của Tiptap; khác nhau chỉ ở kiểu (`null` thay cho thiếu). */
function asTiptap(body: BodyNode): JSONContent {
  return body as unknown as JSONContent;
}

export interface BodyEditorHandle {
  /** Thân bài hiện tại, đúng hình dạng core nhận. */
  getBody(): BodyNode;
  /** Thay toàn bộ thân bài (khôi phục phiên bản cũ). */
  setBody(body: BodyNode): void;
}

export function BodyEditor({
  ref,
  initial,
  label,
  invalid = false,
  describedBy,
  onChange,
}: {
  ref: Ref<BodyEditorHandle>;
  initial: BodyNode;
  label: string;
  invalid?: boolean;
  describedBy?: string | undefined;
  onChange: () => void;
}) {
  const t = useTranslations("content.editor");
  const changed = useRef(onChange);
  changed.current = onChange;
  const editor = useEditor({
    // Next.js render trang ở máy chủ trước: trình soạn chỉ dựng ở trình duyệt.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          isAllowedUri: (url) => isSafeHref(url),
        },
      }),
      TableKit.configure({ table: { resizable: false } }),
      MediaImage,
      Embed,
    ],
    content: asTiptap(initial),
    editorProps: {
      attributes: {
        class: "ce-prose",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(invalid ? { "aria-invalid": "true" } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      },
    },
    onUpdate: () => changed.current(),
  });

  useImperativeHandle(
    ref,
    () => ({
      getBody: () => (editor ? toCoreBody(editor.getJSON()) : initial),
      setBody: (body) => editor?.commands.setContent(asTiptap(body), { emitUpdate: false }),
    }),
    [editor, initial],
  );

  return (
    <div className="ce-body">
      {editor ? <Toolbar editor={editor} /> : <div className="ce-toolbar" aria-hidden="true" />}
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="ce-prose ce-loading">{t("loading")}</div>
      )}
    </div>
  );
}

type Block = "paragraph" | "h2" | "h3" | "h4";

function Toolbar({ editor }: { editor: Editor }) {
  const t = useTranslations("content.editor");
  const [dialog, setDialog] = useState<"link" | "embed" | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive("heading", { level: 2 })
        ? "h2"
        : e.isActive("heading", { level: 3 })
          ? "h3"
          : e.isActive("heading", { level: 4 })
            ? "h4"
            : "paragraph") as Block,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      table: e.isActive("table"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });

  const setBlock = (block: Block) => {
    const chain = editor.chain().focus();
    if (block === "paragraph") chain.setParagraph().run();
    else chain.setHeading({ level: Number(block.slice(1)) as 2 | 3 | 4 }).run();
  };

  const mark = (
    name: "bold" | "italic" | "underline" | "strike" | "code",
    on: boolean,
    glyph: string,
    run: () => void,
  ) => (
    <button
      type="button"
      className="btn ghost sq ce-tool"
      aria-label={t(`tools.${name}`)}
      aria-pressed={on}
      title={t(`tools.${name}`)}
      onClick={run}
    >
      <span className={`ce-glyph g-${name}`}>{glyph}</span>
    </button>
  );

  const tool = (
    name: string,
    run: () => void,
    options: { on?: boolean; disabled?: boolean } = {},
  ) => (
    <button
      type="button"
      className="btn ghost sm ce-tool"
      aria-pressed={options.on}
      disabled={options.disabled}
      onClick={run}
    >
      {t(`tools.${name}`)}
    </button>
  );

  return (
    <div className="ce-toolbar" role="toolbar" aria-label={t("toolbar")}>
      <label className="ce-blocksel">
        <span className="vh">{t("tools.block")}</span>
        <select
          className="inp"
          value={state.block}
          onChange={(event) => setBlock(event.target.value as Block)}
        >
          <option value="paragraph">{t("tools.paragraph")}</option>
          <option value="h2">{t("tools.h2")}</option>
          <option value="h3">{t("tools.h3")}</option>
          <option value="h4">{t("tools.h4")}</option>
        </select>
      </label>
      {mark("bold", state.bold, "B", () => editor.chain().focus().toggleBold().run())}
      {mark("italic", state.italic, "I", () => editor.chain().focus().toggleItalic().run())}
      {mark("underline", state.underline, "U", () =>
        editor.chain().focus().toggleUnderline().run(),
      )}
      {mark("strike", state.strike, "S", () => editor.chain().focus().toggleStrike().run())}
      {mark("code", state.code, "</>", () => editor.chain().focus().toggleCode().run())}
      {tool(
        "link",
        () => (state.link ? editor.chain().focus().unsetLink().run() : setDialog("link")),
        {
          on: state.link,
        },
      )}
      <span className="ce-sep" aria-hidden="true" />
      {tool("bulletList", () => editor.chain().focus().toggleBulletList().run(), {
        on: state.bulletList,
      })}
      {tool("orderedList", () => editor.chain().focus().toggleOrderedList().run(), {
        on: state.orderedList,
      })}
      {tool("blockquote", () => editor.chain().focus().toggleBlockquote().run(), {
        on: state.blockquote,
      })}
      {tool("codeBlock", () => editor.chain().focus().toggleCodeBlock().run(), {
        on: state.codeBlock,
      })}
      {tool("rule", () => editor.chain().focus().setHorizontalRule().run())}
      {state.table ? (
        <>
          {tool("addRow", () => editor.chain().focus().addRowAfter().run())}
          {tool("addColumn", () => editor.chain().focus().addColumnAfter().run())}
          {tool("deleteTable", () => editor.chain().focus().deleteTable().run())}
        </>
      ) : (
        tool("table", () =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        )
      )}
      {tool("embed", () => setDialog("embed"))}
      <span className="ce-sep" aria-hidden="true" />
      {tool("undo", () => editor.chain().focus().undo().run(), { disabled: !state.undo })}
      {tool("redo", () => editor.chain().focus().redo().run(), { disabled: !state.redo })}
      {dialog ? (
        <UrlDialog
          kind={dialog}
          close={() => setDialog(null)}
          submit={(url) => {
            if (dialog === "link") {
              editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            } else {
              editor.chain().focus().insertContent({ type: "embed", attrs: { url } }).run();
            }
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Hỏi địa chỉ cho link hay nhúng. Kiểm sớm như core: link phải an toàn, nhúng phải `https://`. */
function UrlDialog({
  kind,
  close,
  submit,
}: {
  kind: "link" | "embed";
  close: () => void;
  submit: (url: string) => void;
}) {
  const t = useTranslations("content.editor");
  const form = useTranslations("account.form");
  const id = useId();
  const [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      ref={(node) => {
        ref.current = node;
        if (node && !node.open) node.showModal();
      }}
      className="axdlg"
      aria-labelledby={`${id}-t`}
      onClose={close}
    >
      <div className="dlg-head">
        <h2 id={`${id}-t`} className="h2">
          {t(`${kind}Title`)}
        </h2>
      </div>
      <form
        className="dlg-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const url = String(new FormData(event.currentTarget).get("url") ?? "").trim();
          const ok = kind === "link" ? isSafeHref(url) : url.toLowerCase().startsWith("https://");
          if (!ok) {
            setError(t(`${kind}Invalid`));
            return;
          }
          submit(url);
        }}
      >
        <div className="fld">
          <label className="lab" htmlFor={id}>
            {t("url")}
          </label>
          <input
            id={id}
            name="url"
            className="inp mono"
            inputMode="url"
            autoComplete="off"
            placeholder={kind === "link" ? "https://" : "https://www.youtube.com/watch?v=…"}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-h${error ? ` ${id}-e` : ""}`}
            autoFocus
          />
          <span id={`${id}-h`} className="fhint">
            {t(`${kind}Hint`)}
          </span>
          {error ? (
            <span id={`${id}-e`} className="ferr">
              {error}
            </span>
          ) : null}
        </div>
        <div className="dlg-acts">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            {form("cancel")}
          </button>
          <button type="submit" className="btn pri">
            {t("insert")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
