import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import {
  Bold, Italic, Underline as UnderlineIcon, Heading2, Heading3, List, ListOrdered, ListChecks, Quote,
  Link as LinkIcon, Image as ImageIcon, Table as TableIcon, Minus, Undo2, Redo2, Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { shrinkImageFile } from "@/lib/image-resize";
import { sanitizeRichHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { useResolvedHtml, type ImageUrlResolver } from "@/components/RichTextView";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Stored images carry their storage path; the signed src is only for display.
const PathImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      dataPath: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-path"),
        renderHTML: (attrs: { dataPath?: string | null }) => (attrs.dataPath ? { "data-path": attrs.dataPath } : {}),
      },
    };
  },
});

function ToolButton({ label, active, disabled, onClick, children }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // keep the editor selection when tapping toolbar buttons
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground transition-colors disabled:opacity-40",
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Editor({ html, organizationId, onChange }: { html: string; organizationId: string; onChange: (html: string) => void }) {
  const { t } = useTranslation("infohub");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      PathImage.configure({ allowBase64: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: t("docViews.rich.placeholder") }),
    ],
    content: html,
    editorProps: { attributes: { "data-testid": "doc-content-editor" } },
    onUpdate: ({ editor: ed }) => onChange(ed.isEmpty ? "" : sanitizeRichHtml(ed.getHTML())),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed && ({
      bold: ed.isActive("bold"), italic: ed.isActive("italic"), underline: ed.isActive("underline"),
      h2: ed.isActive("heading", { level: 2 }), h3: ed.isActive("heading", { level: 3 }),
      bullet: ed.isActive("bulletList"), ordered: ed.isActive("orderedList"), task: ed.isActive("taskList"),
      quote: ed.isActive("blockquote"), link: ed.isActive("link"), inTable: ed.isActive("table"),
      canUndo: ed.can().undo(), canRedo: ed.can().redo(),
    }),
  });

  if (!editor || !state) return null;
  const chain = () => editor.chain().focus();

  async function uploadImage(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const shrunk = await shrinkImageFile(file);
      if (!shrunk.type.startsWith("image/") || shrunk.size > MAX_IMAGE_BYTES) {
        setUploadError(t("docViews.rich.imageTooLarge"));
        return;
      }
      const ext = shrunk.name.includes(".") ? shrunk.name.slice(shrunk.name.lastIndexOf(".")) : "";
      const path = `${organizationId}/rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const { error } = await supabase.storage.from("infohub-files").upload(path, shrunk);
      if (error) throw error;
      const { data } = await supabase.storage.from("infohub-files").createSignedUrl(path, 3600);
      if (!data?.signedUrl) throw new Error("no signed url");
      editor!.chain().focus().setImage({ src: data.signedUrl, alt: file.name.replace(/\.[^.]+$/, "") }).updateAttributes("image", { dataPath: path }).run();
    } catch {
      setUploadError(t("docViews.rich.imageFailed"));
    } finally {
      setUploading(false);
    }
  }

  function applyLink() {
    const url = linkUrl.trim();
    if (!url) chain().unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}` }).run();
    setLinkOpen(false);
    setLinkUrl("");
  }

  return (
    <div className="border border-border rounded-xl bg-background focus-within:ring-2 focus-within:ring-sage/30">
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 border-b border-border" role="toolbar" aria-label={t("docViews.rich.toolbar")}>
        <ToolButton label={t("docViews.rich.bold")} active={state.bold} onClick={() => chain().toggleBold().run()}><Bold size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.italic")} active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.underline")} active={state.underline} onClick={() => chain().toggleUnderline().run()}><UnderlineIcon size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.heading")} active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.subheading")} active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.bulletList")} active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.numberedList")} active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.checklist")} active={state.task} onClick={() => chain().toggleTaskList().run()}><ListChecks size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.quote")} active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.link")} active={state.link || linkOpen} onClick={() => { setLinkUrl(editor.getAttributes("link").href ?? ""); setLinkOpen((o) => !o); }}><LinkIcon size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.image")} disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
        </ToolButton>
        <ToolButton label={t("docViews.rich.table")} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.divider")} onClick={() => chain().setHorizontalRule().run()}><Minus size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.undo")} disabled={!state.canUndo} onClick={() => chain().undo().run()}><Undo2 size={16} /></ToolButton>
        <ToolButton label={t("docViews.rich.redo")} disabled={!state.canRedo} onClick={() => chain().redo().run()}><Redo2 size={16} /></ToolButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="rich-image-input"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadImage(f); }}
        />
      </div>
      {linkOpen && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
            placeholder="https://"
            aria-label={t("docViews.rich.link")}
            className="flex-1 min-w-0 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none"
          />
          <button type="button" onClick={applyLink} className="text-sm font-medium text-primary px-2">{t("docViews.rich.applyLink")}</button>
        </div>
      )}
      {state.inTable && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border text-xs">
          <button type="button" onClick={() => chain().addRowAfter().run()} className="text-muted-foreground hover:text-foreground">{t("docViews.rich.addRow")}</button>
          <button type="button" onClick={() => chain().addColumnAfter().run()} className="text-muted-foreground hover:text-foreground">{t("docViews.rich.addColumn")}</button>
          <button type="button" onClick={() => chain().deleteRow().run()} className="text-muted-foreground hover:text-foreground">{t("docViews.rich.deleteRow")}</button>
          <button type="button" onClick={() => chain().deleteColumn().run()} className="text-muted-foreground hover:text-foreground">{t("docViews.rich.deleteColumn")}</button>
          <button type="button" onClick={() => chain().deleteTable().run()} className="text-destructive">{t("docViews.rich.deleteTable")}</button>
        </div>
      )}
      {uploadError && <p role="alert" className="px-3 py-2 text-xs text-destructive">{uploadError}</p>}
      <div className="rich-content px-4 py-3 max-h-[60vh] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/**
 * Rich text editor for Infohub documents. Waits for the signed image URLs
 * before mounting so existing images render, then emits sanitized HTML.
 */
export function RichTextEditor({ body, organizationId, resolveImages, onChange }: {
  body: string;
  organizationId: string;
  resolveImages: ImageUrlResolver;
  onChange: (html: string) => void;
}) {
  // Freeze the starting body: the editor owns the content after mount.
  const [initialBody] = useState(body);
  const html = useResolvedHtml(initialBody, resolveImages);
  if (html === null) return <div className="h-40 rounded-xl bg-muted/50 animate-pulse" />;
  return <Editor html={html} organizationId={organizationId} onChange={onChange} />;
}
