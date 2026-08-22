import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TiptapLink from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import { Bold, Bot, Check, ExternalLink, Heading2, Heading3, Image, Italic, Link2, LinkIcon, List, ListOrdered, LoaderCircle, Network, Pilcrow, Quote, Redo2, RotateCcw, Save, SearchCheck, Send, Sparkles, Undo2, UploadCloud, X } from "lucide-react";
import { forwardRef, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nextPrimaryOperation, scoreContent, type ContentOperation, type ContentState } from "@content-agent/shared";
import { api, type ContentActivityDto } from "../api/client";
import { useCurrentUser } from "../auth";
import { eventTypeLabel, operationLabel, operationLabels, providerLabel, queueLabel, stateLabels } from "../ui/labels";
import { ActionError, ErrorState, LoadingState } from "../ui/StateViews";
const steps = [
  ["الفكرة", "IDEA_SELECTED"],
  ["البحث", "GAPS_READY"],
  ["المسودة", "DRAFTED"],
  ["المراجعة", "REVIEWED"],
  ["الصورة", "IMAGE_READY"],
  ["الاعتماد", "APPROVED"],
  ["النشر", "PUBLISHED"]
] as const;

export function ArticleWorkspace(): ReactElement {
  const { id = "" } = useParams();
  const titleRef = useRef<HTMLInputElement>(null);
  const metaRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLInputElement>(null);
  const imageAltRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const loadedDraftRef = useRef("");
  const editorDirtyRef = useRef(false);
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [scheduledAt, setScheduledAt] = useState("");
  const [competitorModalOpen, setCompetitorModalOpen] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const content = useQuery({ queryKey: ["content", id], queryFn: () => api.contentItem(id), enabled: Boolean(id), refetchInterval: 5000 });
  const selectIdea = useMutation({
    mutationFn: (ideaIndex: number) => api.selectIdea(id, ideaIndex),
    onSuccess: async (updated) => {
      loadedDraftRef.current = draftContentHtml(updated.draftHtml);
      editorDirtyRef.current = false;
      await queryClient.invalidateQueries({ queryKey: ["content", id] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
    }
  });
  const saveArticle = useMutation({
    mutationFn: () =>
      api.updateContent(id, {
        title: titleRef.current?.value,
        draftHtml: editor?.getHTML() ?? "",
        metaDescription: metaRef.current?.value,
        category: categoryRef.current?.value,
        imageAlt: imageAltRef.current?.value,
        tags: splitArabicList(tagsRef.current?.value ?? "")
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["content", id] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
    }
  });
  const restoreVersion = useMutation({
    mutationFn: (versionId: string) => api.restoreContentVersion(id, versionId),
    onSuccess: async (updated) => {
      loadedDraftRef.current = draftContentHtml(updated.draftHtml);
      editorDirtyRef.current = false;
      if (editor) editor.commands.setContent(loadedDraftRef.current);
      await queryClient.invalidateQueries({ queryKey: ["content", id] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
    }
  });
  const skipImage = useMutation({
    mutationFn: () => api.skipImage(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["content", id] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
    }
  });
  const generateImage = useMutation({
    mutationFn: () => api.runContentOperation(id, "generate-image"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["content", id] });
    }
  });
  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      validateManualImageFile(file);
      const imageBase64 = await fileToBase64(file);
      return api.uploadContentImage(id, {
        imageBase64,
        mimeType: file.type,
        filename: file.name,
        imageAlt: imageAltRef.current?.value || content.data?.imageAlt || content.data?.title || ""
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["content", id] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    }
  });
  const optimizeLinks = useMutation({
    mutationFn: () => api.optimizeContentLinks(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["content", id] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    }
  });
  const scheduleArticle = useMutation({
    mutationFn: () => api.scheduleContent(id, datetimeLocalToIso(scheduledAt)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["content", id] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const runPrimary = useMutation({
    mutationFn: (operation: ContentOperation) => runArticleOperation(id, operation),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["content", id] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" }
      }),
      TiptapImage.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: "ابدأ تحرير المقال هنا..." })
    ],
    content: "",
    onUpdate: ({ editor }) => {
      editorDirtyRef.current = editor.getHTML() !== loadedDraftRef.current;
    },
    editorProps: {
      attributes: { class: "prose max-w-none focus:outline-none min-h-[420px] rtl-editor" }
    }
  });
  useEffect(() => {
    if (!content.data || !editor) return;
    const incomingDraft = draftContentHtml(content.data.draftHtml);
    const currentDraft = editor.getHTML();
    const hasLocalEdits = editorDirtyRef.current && currentDraft !== loadedDraftRef.current;
    if (hasLocalEdits && incomingDraft !== loadedDraftRef.current) return;
    if (currentDraft !== incomingDraft) editor.commands.setContent(incomingDraft);
    loadedDraftRef.current = incomingDraft;
    editorDirtyRef.current = false;
  }, [content.data?.draftHtml, editor]);
  useEffect(() => {
    if (content.data?.scheduledDate) setScheduledAt(isoToDatetimeLocal(content.data.scheduledDate));
  }, [content.data?.scheduledDate]);

  if (content.isLoading) return <LoadingState />;
  if (content.isError || !content.data) return <ErrorState label="تعذر تحميل المقال." />;

  const currentState = content.data.state as ContentState;
  const primaryOperation = nextPrimaryOperation(currentState);
  const score = scoreContent({
    title: content.data.title,
    metaDescription: content.data.metaDescription,
    html: content.data.draftHtml,
    targetKeyword: content.data.targetKeyword,
    imageAlt: content.data.imageAlt,
    siteUrl: content.data.wordpressUrl
  });
  const activeAction = activeArticleAction({
    runPrimary: runPrimary.isPending ? runPrimary.variables : null,
    save: saveArticle.isPending,
    selectIdea: selectIdea.isPending,
    restore: restoreVersion.isPending,
    skipImage: skipImage.isPending,
    generateImage: generateImage.isPending,
    uploadImage: uploadImage.isPending,
    optimizeLinks: optimizeLinks.isPending,
    schedule: scheduleArticle.isPending
  });

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-teal">مساحة تحرير المقال</p>
            <h2 className="mt-1 text-2xl font-semibold">{content.data.title}</h2>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!isRunnableArticleOperation(currentState, primaryOperation, user.role === "ADMIN") || runPrimary.isPending}
            onClick={() => {
              if (isRunnableArticleOperation(currentState, primaryOperation, user.role === "ADMIN")) runPrimary.mutate(primaryOperation);
            }}
          >
            {runPrimary.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {runPrimary.isPending ? actionInProgressLabel(runPrimary.variables) : articleActionLabel(currentState, primaryOperation, user.role === "ADMIN")}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => saveArticle.mutate()}
            disabled={saveArticle.isPending}
          >
            {saveArticle.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saveArticle.isPending ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
        {activeAction ? (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-teal/25 bg-teal/5 px-3 py-2 text-sm font-medium text-teal">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {activeAction}
          </div>
        ) : null}
        <ArticleStepper currentState={currentState} />
        <div className="mt-4 space-y-2">
          <ActionError error={runPrimary.error} />
          <ActionError error={saveArticle.error} />
          <ActionError error={restoreVersion.error} />
          <ActionError error={selectIdea.error} />
          <ActionError error={uploadImage.error} />
          <ActionError error={optimizeLinks.error} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          {content.data.ideas.length > 0 && content.data.state === "IDEAS_READY" ? (
            <div className="mb-5 rounded-md border border-teal/30 bg-teal/5 p-4">
              <h3 className="font-semibold text-teal">اختر فكرة للمتابعة</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {content.data.ideas.map((idea, index) => (
                  <button
                    key={`${idea.title}-${index}`}
                    className="rounded-md border border-slate-200 bg-white p-3 text-right hover:border-teal"
                    onClick={() => selectIdea.mutate(index)}
                    disabled={selectIdea.isPending}
                  >
                    <span className="block font-medium">{idea.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{idea.targetKeyword}</span>
                    <span className="mt-2 block text-sm text-slate-600">{idea.angle}</span>
                    {selectIdea.isPending && selectIdea.variables === index ? <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-teal"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />جاري اختيار الفكرة...</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <label className="text-sm font-semibold text-slate-600">العنوان</label>
          <input ref={titleRef} className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-lg font-semibold" defaultValue={content.data.title} dir="rtl" />
          <div className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white" dir="rtl">
            <RichEditorToolbar editor={editor} />
            <div className="p-4">
            <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <Panel title="تحسين محركات البحث">
            <OptimizationChecks html={content.data.draftHtml} score={score.score} />
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-teal/30 bg-teal/5 px-3 py-2 text-sm font-semibold text-teal hover:bg-teal/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              disabled={!canOptimizeLinks(currentState, content.data.draftHtml) || optimizeLinks.isPending}
              onClick={() => optimizeLinks.mutate()}
            >
              {optimizeLinks.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
              {optimizeLinks.isPending ? "جاري تحسين الروابط..." : "إعادة بناء الروابط والـ CTA"}
            </button>
            <ActionError error={optimizeLinks.error} />
            <Field label="الكلمة المستهدفة" value={content.data.targetKeyword} />
            <Field ref={metaRef} label="الوصف التعريفي" value={content.data.metaDescription} />
            <Field ref={categoryRef} label="التصنيف" value={content.data.category} />
            <Field ref={tagsRef} label="الوسوم" value={content.data.tags.join("، ")} />
          </Panel>

          <Panel title="الجودة">
            <div className="flex items-end justify-between">
              <span className="text-sm text-slate-500">درجة المحتوى</span>
              <strong className="text-3xl">{score.score}</strong>
            </div>
            <div className="mt-3 space-y-2">
              {score.checks.slice(0, 5).map((check) => (
                <p key={check.name} className="rounded-md bg-slate-50 px-3 py-2 text-xs">{translateScoreCheck(check.name)}: {translateScoreMessage(check.message)}</p>
              ))}
            </div>
          </Panel>

          <Panel title="الصورة">
            <div className="flex gap-2">
              <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" onClick={() => generateImage.mutate()} disabled={generateImage.isPending}>
                {generateImage.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                {generateImage.isPending ? "جاري التوليد..." : "توليد"}
              </button>
              <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" onClick={() => generateImage.mutate()} disabled={generateImage.isPending}>
                {generateImage.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {generateImage.isPending ? "جاري..." : "إعادة التوليد"}
              </button>
              <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" onClick={() => skipImage.mutate()} disabled={skipImage.isPending}>
                {skipImage.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {skipImage.isPending ? "جاري التخطي..." : "تخطي"}
              </button>
            </div>
            <div
              className={`rounded-lg border-2 border-dashed px-4 py-5 text-center transition ${
                imageDragActive ? "border-teal bg-teal/5" : "border-slate-200 bg-slate-50"
              } ${uploadImage.isPending ? "opacity-70" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setImageDragActive(true);
              }}
              onDragLeave={() => setImageDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setImageDragActive(false);
                const file = event.dataTransfer.files[0];
                if (file) handleManualImageFile(file, uploadImage.mutate);
              }}
            >
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleManualImageFile(file, uploadImage.mutate);
                  event.currentTarget.value = "";
                }}
              />
              <UploadCloud className="mx-auto h-8 w-8 text-teal" />
              <p className="mt-2 text-sm font-semibold text-slate-800">اسحب صورة هنا أو اختر ملفًا</p>
              <p className="mt-1 text-xs leading-6 text-slate-500">PNG أو JPG أو WebP حتى 8MB. سيتم رفعها مباشرة إلى ووردبريس كصورة المقال.</p>
              <button
                type="button"
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-teal/40 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={uploadImage.isPending}
                onClick={() => imageInputRef.current?.click()}
              >
                {uploadImage.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {uploadImage.isPending ? "جاري الرفع..." : "رفع صورة"}
              </button>
            </div>
            <ActionError error={generateImage.error} />
            <ActionError error={skipImage.error} />
            <ActionError error={uploadImage.error} />
            {content.data.imageUrl ? <img className="mt-3 max-h-48 w-full rounded-md object-cover" src={content.data.imageUrl} alt={content.data.imageAlt || content.data.title} /> : null}
            <Field ref={imageAltRef} label="النص البديل" value={content.data.imageAlt} />
          </Panel>

          <Panel title="النشر">
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">الحالة الحالية: </span>
              <strong>{stateLabels[currentState]}</strong>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">موعد النشر</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                min={minScheduleDatetimeLocal()}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={user.role !== "ADMIN" || currentState !== "APPROVED" || !scheduledAt || scheduleArticle.isPending}
              onClick={() => scheduleArticle.mutate()}
            >
              <span className="inline-flex items-center justify-center gap-2">
                {scheduleArticle.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {scheduleArticle.isPending ? "جاري الجدولة..." : "جدولة في ووردبريس"}
              </span>
            </button>
            {user.role !== "ADMIN" ? <p className="text-xs text-slate-500">الجدولة متاحة للمدير فقط بعد الاعتماد.</p> : null}
            <ActionError error={scheduleArticle.error} />
          </Panel>

          <Panel title="بحث المنافسين">
            <div className="rounded-md border border-teal/20 bg-teal/5 p-3">
              <p className="text-sm font-semibold text-teal">تحليل المنافسين</p>
              <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">
                {content.data.competitorGaps || "لا يوجد تحليل منافسين محفوظ بعد."}
              </p>
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-teal/30 bg-white px-3 py-2 text-sm font-semibold text-teal"
                onClick={() => setCompetitorModalOpen(true)}
              >
                <SearchCheck className="h-4 w-4" />
                عرض التحليل
              </button>
            </div>
            {content.data.sources.length === 0 ? <p className="text-sm text-slate-500">لا توجد مصادر بحث محفوظة بعد.</p> : content.data.sources.map((source, index) => (
              <a key={source} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-teal/40 hover:bg-slate-50" href={source} target="_blank" rel="noreferrer">
                <span className="inline-flex items-center gap-2"><Link2 className="h-4 w-4" />مصدر {index + 1}</span>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </a>
            ))}
          </Panel>

          <Panel title="الإصدارات">
            {content.data.versions.length === 0 ? (
              <p className="text-sm text-slate-500">لم يتم حفظ إصدارات يدوية بعد.</p>
            ) : (
              <div className="space-y-2">
                {content.data.versions.slice(0, 8).map((version) => (
                  <div key={version.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{version.changeSummary}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{version.contentScore}/100</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-slate-600">{version.title || "محتوى بدون عنوان"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {version.actorName ? `بواسطة ${version.actorName} · ` : ""}{formatDateTime(version.createdAt)}
                    </p>
                    <button
                      className="mt-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      disabled={restoreVersion.isPending || content.data.state === "PUBLISHED"}
                      onClick={() => restoreVersion.mutate(version.id)}
                    >
                      <span className="inline-flex items-center gap-2">{restoreVersion.isPending && restoreVersion.variables === version.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}{restoreVersion.isPending && restoreVersion.variables === version.id ? "جاري الاسترجاع..." : "استرجاع"}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="النشاط">
            {content.data.activity.length === 0 ? (
              <p className="text-sm text-slate-500">لا يوجد نشاط محفوظ لهذا المقال بعد.</p>
            ) : (
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {content.data.activity.map((event) => (
                  <ActivityEvent key={`${event.type}-${event.id}`} event={event} />
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </section>
      {competitorModalOpen ? (
        <CompetitorModal
          title={content.data.title}
          gaps={content.data.competitorGaps}
          sources={content.data.sources}
          onClose={() => setCompetitorModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RichEditorToolbar({ editor }: { editor: Editor | null }): ReactElement {
  const disabled = !editor;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <ToolbarButton label="فقرة" icon={Pilcrow} active={editor?.isActive("paragraph")} disabled={disabled} onClick={() => editor?.chain().focus().setParagraph().run()} />
      <ToolbarButton label="عنوان 2" icon={Heading2} active={editor?.isActive("heading", { level: 2 })} disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton label="عنوان 3" icon={Heading3} active={editor?.isActive("heading", { level: 3 })} disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
      <span className="mx-1 h-6 w-px bg-slate-200" />
      <ToolbarButton label="عريض" icon={Bold} active={editor?.isActive("bold")} disabled={disabled} onClick={() => editor?.chain().focus().toggleBold().run()} />
      <ToolbarButton label="مائل" icon={Italic} active={editor?.isActive("italic")} disabled={disabled} onClick={() => editor?.chain().focus().toggleItalic().run()} />
      <ToolbarButton label="اقتباس" icon={Quote} active={editor?.isActive("blockquote")} disabled={disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
      <ToolbarButton label="إضافة رابط" icon={LinkIcon} active={editor?.isActive("link")} disabled={disabled} onClick={() => setEditorLink(editor)} />
      <ToolbarButton label="إضافة صورة" icon={Image} disabled={disabled} onClick={() => insertEditorImage(editor)} />
      <span className="mx-1 h-6 w-px bg-slate-200" />
      <ToolbarButton label="قائمة نقطية" icon={List} active={editor?.isActive("bulletList")} disabled={disabled} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
      <ToolbarButton label="قائمة مرقمة" icon={ListOrdered} active={editor?.isActive("orderedList")} disabled={disabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
      <span className="mx-1 h-6 w-px bg-slate-200" />
      <ToolbarButton label="تراجع" icon={Undo2} disabled={disabled || !editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()} />
      <ToolbarButton label="إعادة" icon={Redo2} disabled={disabled || !editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()} />
    </div>
  );
}

function ArticleStepper({ currentState }: { currentState: ContentState }): ReactElement {
  const currentIndex = Math.max(0, steps.findIndex((step) => step[1] === currentState));
  return (
    <div className="mt-6 overflow-x-auto pb-1">
      <ol className="flex min-w-[760px] items-center" aria-label="خطوات المقال">
        {steps.map(([label, state], index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isReached = index <= currentIndex;
          return (
            <li key={state} className="flex flex-1 items-center">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${
                    isCurrent
                      ? "border-teal bg-teal text-white shadow-sm"
                      : isComplete
                        ? "border-teal bg-teal/10 text-teal"
                        : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className={`max-w-24 truncate text-center text-xs font-semibold ${isReached ? "text-teal" : "text-slate-500"}`}>{label}</span>
              </div>
              {index < steps.length - 1 ? (
                <span className={`mx-2 h-0.5 flex-1 rounded-full ${index < currentIndex ? "bg-teal" : "bg-slate-200"}`} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ToolbarButton(props: {
  label: string;
  icon: typeof Bold;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}): ReactElement {
  const Icon = props.icon;
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-semibold ${
        props.active ? "border-teal bg-teal text-white" : "border-slate-200 bg-white text-slate-700 hover:border-teal/40 hover:bg-white"
      } disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function setEditorLink(editor: Editor | null): void {
  if (!editor) return;
  const previousUrl = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("أدخل رابطًا كاملًا", previousUrl ?? "https://");
  if (url === null) return;
  const clean = url.trim();
  if (!clean) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: clean }).run();
}

function insertEditorImage(editor: Editor | null): void {
  if (!editor) return;
  const src = window.prompt("أدخل رابط الصورة", "https://");
  if (!src?.trim()) return;
  const alt = window.prompt("النص البديل للصورة", "") ?? "";
  editor.chain().focus().setImage({ src: src.trim(), alt: alt.trim() }).run();
}

function handleManualImageFile(file: File, upload: (file: File) => void): void {
  upload(file);
}

function validateManualImageFile(file: File): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("ارفع صورة بصيغة PNG أو JPG أو WebP فقط.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("حجم الصورة يجب ألا يتجاوز 8MB.");
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",").pop() ?? "" : value);
    };
    reader.onerror = () => reject(new Error("تعذر قراءة ملف الصورة."));
    reader.readAsDataURL(file);
  });
}

function activeArticleAction(state: {
  runPrimary: ContentOperation | null;
  save: boolean;
  selectIdea: boolean;
  restore: boolean;
  skipImage: boolean;
  generateImage: boolean;
  uploadImage: boolean;
  optimizeLinks: boolean;
  schedule: boolean;
}): string | null {
  if (state.runPrimary) return actionInProgressLabel(state.runPrimary);
  if (state.save) return "جاري حفظ التعديلات...";
  if (state.selectIdea) return "جاري اختيار الفكرة وتجهيز الخطوة التالية...";
  if (state.restore) return "جاري استرجاع الإصدار...";
  if (state.optimizeLinks) return "جاري تحسين الروابط الداخلية والـ CTA...";
  if (state.generateImage) return "جاري إرسال طلب توليد الصورة...";
  if (state.uploadImage) return "جاري رفع الصورة إلى ووردبريس...";
  if (state.skipImage) return "جاري تخطي الصورة...";
  if (state.schedule) return "جاري جدولة المقال...";
  return null;
}

function canOptimizeLinks(state: ContentState, draftHtml: string): boolean {
  return ["DRAFTED", "REVIEWED", "IMAGE_READY"].includes(state) && stripHtml(draftHtml).length > 200;
}

function actionInProgressLabel(operation?: ContentOperation | null): string {
  if (!operation) return "جاري تنفيذ العملية...";
  const labels: Partial<Record<ContentOperation, string>> = {
    GENERATE_IDEAS: "جاري توليد الأفكار...",
    RESEARCH_GAPS: "جاري تحليل المنافسين...",
    WRITE_DRAFT: "جاري توليد المحتوى...",
    REVIEW_DRAFT: "جاري مراجعة المقال...",
    GENERATE_IMAGE: "جاري توليد الصورة...",
    APPROVE: "جاري اعتماد المقال...",
    PUBLISH: "جاري إرسال المقال إلى ووردبريس...",
    RETRY: "جاري إعادة المحاولة..."
  };
  return labels[operation] ?? `جاري تنفيذ ${operationLabels[operation]}...`;
}

function OptimizationChecks({ html, score }: { html: string; score: number }): ReactElement {
  const plain = stripHtml(html);
  const checks = [
    { label: "SEO", detail: "العنوان والوصف والكلمة المستهدفة", ok: score >= 70, icon: SearchCheck },
    { label: "AEO", detail: "إجابات واضحة وأسئلة شائعة", ok: /سؤال|أسئلة|FAQ|كيف|ما|لماذا/.test(plain), icon: Bot },
    { label: "GEO", detail: "صياغة مناسبة للإجابات التوليدية", ok: plain.length > 1200 && /خلاصة|مقارنة|خطوات|نقاط/.test(plain), icon: Sparkles },
    { label: "الروابط الداخلية", detail: "روابط داخلية داخل المحتوى", ok: /href=["']\/|href=["'][^"']*(?:localhost|\.sa|\.com)/.test(html), icon: Network }
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {checks.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className={`rounded-md border px-3 py-2 ${item.ok ? "border-teal/30 bg-teal/5" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${item.ok ? "text-teal" : "text-amber-700"}`} />
              <span className="text-sm font-semibold">{item.label}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{item.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

function CompetitorModal(props: { title: string; gaps: string; sources: string[]; onClose: () => void }): ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6" role="dialog" aria-modal="true">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-sm font-medium text-teal">بحث المنافسين</p>
            <h3 className="mt-1 text-lg font-semibold">{props.title}</h3>
          </div>
          <button className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" onClick={props.onClose} title="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(88vh-88px)] overflow-y-auto p-5">
          <section>
            <h4 className="font-semibold">ملخص الفجوات والفرص</h4>
            <div className="mt-3 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
              {props.gaps || "لا يوجد تحليل منافسين محفوظ بعد."}
            </div>
          </section>
          <section className="mt-5">
            <h4 className="font-semibold">المصادر</h4>
            {props.sources.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">لا توجد مصادر محفوظة.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {props.sources.map((source, index) => (
                  <a key={source} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-teal/40 hover:bg-slate-50" href={source} target="_blank" rel="noreferrer">
                    <span className="truncate">مصدر {index + 1}: {source}</span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ActivityEvent({ event }: { event: ContentActivityDto }): ReactElement {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{activityTypeLabel(event.type)}</span>
        <span className={`rounded px-2 py-0.5 text-xs ${activityStatusClass(event.status)}`}>{activityStatusLabel(event.status)}</span>
      </div>
      <p className="mt-1 text-slate-700">{activityLabel(event)}</p>
      <p className="mt-1 text-xs text-slate-500">{activityDetail(event)}</p>
      {event.error ? <p className="mt-1 text-xs text-red-700">{event.error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
        <span>{formatDateTime(event.createdAt)}</span>
        {typeof event.durationMs === "number" ? <span>{formatDuration(event.durationMs)}</span> : null}
        {typeof event.estimatedCostUsd === "number" ? <span>{formatCost(event.estimatedCostUsd)}</span> : null}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

const Field = forwardRef(function Field(
  { label, value }: { label: string; value: string },
  ref: React.ForwardedRef<HTMLInputElement>
): ReactElement {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input ref={ref} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" defaultValue={value} />
    </label>
  );
});

function translateScoreCheck(name: string): string {
  const labels: Record<string, string> = {
    "Title quality": "جودة العنوان",
    "Meta description": "الوصف التعريفي",
    "Article depth": "عمق المقال",
    "Internal links": "الروابط الداخلية",
    Structure: "البنية",
    "FAQ coverage": "تغطية الأسئلة الشائعة",
    "GEO summary": "ملخص GEO",
    CTA: "الدعوة للإجراء",
    "Editorial brief": "الموجز التحريري",
    "Image ALT": "النص البديل للصورة",
    "Keyword usage": "استخدام الكلمة المستهدفة",
    "Generic phrases": "العبارات العامة"
  };
  return labels[name] ?? name;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function translateScoreMessage(message: string): string {
  const labels: Record<string, string> = {
    "Title length is suitable": "طول العنوان مناسب",
    "Title should be concise but descriptive": "اجعل العنوان مختصرًا وواضحًا في الوقت نفسه",
    "Meta description is within the recommended range": "الوصف التعريفي ضمن النطاق المناسب",
    "Meta description should be around 90-170 characters": "يفضل أن يكون الوصف التعريفي بين 90 و170 حرفًا",
    "Article is too short for a serious SEO page": "المقال قصير جدًا لصفحة محسنة لمحركات البحث",
    "No internal links found": "لا توجد روابط داخلية",
    "Only one internal link found": "يوجد رابط داخلي واحد فقط",
    "Headings and paragraphs are easy to scan": "العناوين والفقرات سهلة التصفح",
    "Add clearer headings and shorter paragraphs": "أضف عناوين أوضح وفقرات أقصر",
    "FAQ-style content is present": "يوجد محتوى بنمط الأسئلة الشائعة",
    "No FAQ section detected": "لم يتم العثور على قسم للأسئلة الشائعة",
    "Generative answer summary is present": "يوجد ملخص مناسب للإجابات التوليدية",
    "No concise GEO summary detected": "لا يوجد ملخص GEO واضح",
    "Clear call to action is present": "توجد دعوة واضحة للإجراء",
    "No clear call to action detected": "لا توجد دعوة واضحة للإجراء",
    "Article is connected to a saved brief": "المقال مرتبط بموجز تحريري محفوظ",
    "No editorial brief is attached": "لا يوجد موجز تحريري مرتبط",
    "Featured image ALT text is ready": "النص البديل للصورة البارزة جاهز",
    "Image ALT text is missing": "النص البديل للصورة مفقود",
    "No focus keyword selected": "لم يتم تحديد كلمة مستهدفة",
    "Possible keyword stuffing detected": "قد يكون هناك حشو زائد للكلمة المستهدفة",
    "Focus keyword appears naturally": "الكلمة المستهدفة تظهر بشكل طبيعي",
    "Focus keyword was not found in the article": "لم تظهر الكلمة المستهدفة داخل المقال",
    "Generic AI-style phrasing detected": "توجد صياغات عامة تشبه مخرجات الذكاء الاصطناعي",
    "Generic AI-style or form-like phrasing detected": "توجد صياغات عامة أو نصوص تشبه النماذج",
    "No obvious generic opening phrases detected": "لا توجد افتتاحيات عامة واضحة"
  };
  if (message.endsWith("words found")) return message.replace("words found", "كلمة");
  if (message.endsWith("internal links found")) return message.replace("internal links found", "روابط داخلية");
  return labels[message] ?? message;
}

function activityTypeLabel(type: ContentActivityDto["type"]): string {
  const labels: Record<ContentActivityDto["type"], string> = {
    AUDIT: "إجراء",
    JOB: "مهمة",
    USAGE: "مزود"
  };
  return labels[type];
}

function activityStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    INFO: "معلومة",
    WAITING: "بانتظار",
    ACTIVE: "قيد التنفيذ",
    DELAYED: "مؤجلة",
    COMPLETED: "مكتملة",
    SUCCESS: "ناجح",
    FAILED: "فشل",
    ERROR: "خطأ"
  };
  return labels[status.toUpperCase()] ?? status;
}

function activityStatusClass(status: string): string {
  const normalized = status.toUpperCase();
  if (["FAILED", "ERROR"].includes(normalized)) return "bg-red-50 text-red-700";
  if (["COMPLETED", "SUCCESS"].includes(normalized)) return "bg-teal/10 text-teal";
  if (["ACTIVE", "WAITING", "DELAYED"].includes(normalized)) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function activityLabel(event: ContentActivityDto): string {
  if (event.type === "JOB") return operationLabel(event.label);
  if (event.type === "USAGE") return providerLabel(event.label);
  return event.label;
}

function activityDetail(event: ContentActivityDto): string {
  if (event.type === "AUDIT") {
    const actorPrefix = "بواسطة ";
    if (event.detail.startsWith(actorPrefix)) return event.detail;
    return eventTypeLabel(event.detail);
  }
  if (event.type === "JOB") {
    const [queueName, provider] = event.detail.split(" · ");
    return provider ? `${queueLabel(queueName)} · ${providerLabel(provider)}` : queueLabel(queueName);
  }
  if (event.type === "USAGE") {
    const [operation, tokenText] = event.detail.split(" · ");
    return tokenText ? `${operationLabel(operation)} · ${tokenText.replace("tokens", "رمزًا")}` : operationLabel(operation);
  }
  return event.detail;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(value: number): string {
  if (value < 1000) return `${value} مللي ثانية`;
  return `${(value / 1000).toFixed(1)} ثانية`;
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function isoToDatetimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("تاريخ الجدولة غير صالح.");
  return date.toISOString();
}

function minScheduleDatetimeLocal(): string {
  return isoToDatetimeLocal(new Date(Date.now() + 60_000).toISOString());
}

function draftContentHtml(value?: string | null): string {
  return value?.trim() ? value : "<p>لا توجد مسودة بعد.</p>";
}

function isRunnableArticleOperation(state: ContentState, operation: ContentOperation | null, isAdmin: boolean): operation is ContentOperation {
  if (state === "SCHEDULED") return false;
  if (!operation || ["SELECT_IDEA", "SCHEDULE"].includes(operation)) return false;
  if ((operation === "APPROVE" || operation === "PUBLISH") && !isAdmin) return false;
  return true;
}

function articleActionLabel(state: ContentState, operation: ContentOperation | null, isAdmin: boolean): string {
  if (state === "SCHEDULED") return "مجدول للنشر";
  if (!operation) return "لا يوجد إجراء";
  if ((operation === "APPROVE" || operation === "PUBLISH") && !isAdmin) return "بانتظار المدير";
  return operationLabels[operation];
}

function runArticleOperation(id: string, operation: ContentOperation): Promise<unknown> {
  if (operation === "APPROVE") return api.approveContent(id);
  if (operation === "SKIP_IMAGE") return api.skipImage(id);
  if (operation === "RETRY") return api.retryContent(id);
  return api.runContentOperation(id, operationPath(operation));
}

function operationPath(operation: ContentOperation): "generate-ideas" | "research" | "write" | "review" | "generate-image" | "publish" {
  const map: Partial<Record<ContentOperation, "generate-ideas" | "research" | "write" | "review" | "generate-image" | "publish">> = {
    GENERATE_IDEAS: "generate-ideas",
    RESEARCH_GAPS: "research",
    WRITE_DRAFT: "write",
    REVIEW_DRAFT: "review",
    GENERATE_IMAGE: "generate-image",
    PUBLISH: "publish"
  };
  const path = map[operation];
  if (!path) throw new Error("لا يوجد مسار برمجي لهذه العملية");
  return path;
}

function splitArabicList(value: string): string[] {
  return value
    .split(/[،,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
