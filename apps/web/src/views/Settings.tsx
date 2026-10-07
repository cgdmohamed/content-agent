import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactElement } from "react";
import { api, type ModelSpecDto, type ProviderStatusDto } from "../api/client";
import { OperationModelPickers, readOperationModels } from "../ui/ModelPickers";
import { PageHeader } from "../ui/PageHeader";
import { Pill } from "../ui/Pill";
import { ActionError, ErrorState, LoadingState } from "../ui/StateViews";

export function Settings(): ReactElement {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [customModels, setCustomModels] = useState<ModelSpecDto[] | null>(null);
  const [draft, setDraft] = useState({ provider: "openai", kind: "text", model: "", label: "", inputPerM: "", outputPerM: "", imageUsd: "", imageOutputPerM: "", cachedInputPerM: "", cacheWritePerM: "", requestUsd: "" });
  const updateSettings = useMutation({
    meta: { successMessage: "تم حفظ الإعدادات" },
    mutationFn: api.updateSettings,
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  if (settings.isLoading) return <LoadingState />;
  if (settings.isError || !settings.data) return <ErrorState />;
  const savedCustom = settings.data.modelCatalog.filter((spec) => spec.custom);
  const custom = customModels ?? savedCustom;

  function addCustomModel(): void {
    setLocalError(null);
    const isImage = draft.kind === "image";
    if (!draft.model.trim()) return setLocalError("معرّف الموديل مطلوب.");
    if (isImage ? draft.imageUsd === "" : draft.inputPerM === "" || draft.outputPerM === "") return setLocalError("أدخل أسعار الموديل.");
    const spec: ModelSpecDto = {
      provider: isImage ? "gemini" : (draft.provider as ModelSpecDto["provider"]),
      model: draft.model.trim(),
      label: draft.label.trim() || draft.model.trim(),
      kind: isImage ? "image" : "text",
      custom: true,
      providerConfigured: true,
      ...(isImage
        ? {
            imageUsd: Number(draft.imageUsd),
            ...(draft.imageOutputPerM !== "" ? { imageOutputPerM: Number(draft.imageOutputPerM) } : {}),
            ...(draft.inputPerM !== "" ? { inputPerM: Number(draft.inputPerM) } : {}),
            ...(draft.outputPerM !== "" ? { outputPerM: Number(draft.outputPerM) } : {})
          }
        : {
            inputPerM: Number(draft.inputPerM),
            outputPerM: Number(draft.outputPerM),
            ...(draft.cachedInputPerM !== "" ? { cachedInputPerM: Number(draft.cachedInputPerM) } : {}),
            ...(draft.cacheWritePerM !== "" ? { cacheWritePerM: Number(draft.cacheWritePerM) } : {}),
            ...(draft.requestUsd !== "" ? { requestUsd: Number(draft.requestUsd) } : {})
          })
    };
    setCustomModels([...custom.filter((item) => !(item.provider === spec.provider && item.model === spec.model)), spec]);
    setDraft({ ...draft, model: "", label: "", inputPerM: "", outputPerM: "", imageUsd: "", imageOutputPerM: "", cachedInputPerM: "", cacheWritePerM: "", requestUsd: "" });
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(false);
    setLocalError(null);
    const data = new FormData(event.currentTarget);
    const monthlyAiBudgetUsd = Number(data.get("monthlyAiBudgetUsd") ?? 0);
    const monthlyAiHardLimitUsd = Number(data.get("monthlyAiHardLimitUsd") ?? 0);
    if (monthlyAiHardLimitUsd > 0 && monthlyAiHardLimitUsd < monthlyAiBudgetUsd) {
      setLocalError("حد الإيقاف الصارم يجب ألا يقل عن الميزانية الشهرية.");
      return;
    }
    updateSettings.mutate({
      monthlyAiBudgetUsd,
      monthlyAiHardLimitUsd,
      defaultIdeasCount: Number(data.get("defaultIdeasCount") ?? 5),
      defaultMarket: String(data.get("defaultMarket") ?? "SA"),
      autoPublishAfterApproval: data.get("autoPublishAfterApproval") === "on",
      operationModels: readOperationModels(data, "model", settings.data!.modelOperations, settings.data!.modelCatalog),
      customModels: custom.map(({ provider, model, label, kind, inputPerM, outputPerM, imageUsd, imageOutputPerM, cachedInputPerM, cacheWritePerM, requestUsd }) => ({ provider, model, label, kind, inputPerM, outputPerM, imageUsd, imageOutputPerM, cachedInputPerM, cacheWritePerM, requestUsd })),
      imageSize: (String(data.get("imageSize") ?? "") as "" | "1K" | "2K" | "4K")
    });
  }

  const providers: Array<[string, ProviderStatusDto]> = [
    ["أوبن إيه آي", settings.data.providers.openai],
    ["أنثروبيك", settings.data.providers.anthropic],
    ["بيربلكسيتي", settings.data.providers.perplexity],
    ["جيميني للصور", settings.data.providers.gemini]
  ];
  return (
    <form onSubmit={submit} noValidate className="space-y-5 pb-20">
      <PageHeader title="الإعدادات" description="الميزانية، والموديل المستخدم لكل عملية، وأسعار الموديلات." />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold">المزودون</h2>
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map(([label, status]) => (
            <li key={label} className="flex items-center justify-between gap-2 text-sm">
              <span>{label}</span>
              <Pill tone={status.configured ? "ok" : "muted"} label={status.configured ? `مهيأ ${status.maskedKey?.slice(-4) ?? ""}` : "غير مهيأ"} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">مفاتيح المزودين تحفظ في متغيرات البيئة ولا تظهر هنا إلا آخر أربعة أحرف.</p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold">الميزانية والمحتوى</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input name="monthlyAiBudgetUsd" label="الميزانية الشهرية ($)" type="number" defaultValue={settings.data.monthlyAiBudgetUsd} min={0} step="0.01" />
          <Input name="monthlyAiHardLimitUsd" label="حد الإيقاف الصارم ($)" type="number" defaultValue={settings.data.monthlyAiHardLimitUsd} min={0} step="0.01" />
          <Input name="defaultIdeasCount" label="عدد الأفكار الافتراضي" type="number" defaultValue={settings.data.defaultIdeasCount} min={1} max={20} step="1" />
          <Input name="defaultMarket" label="السوق الافتراضي" defaultValue={settings.data.defaultMarket} maxLength={20} />
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input name="autoPublishAfterApproval" type="checkbox" defaultChecked={settings.data.autoPublishAfterApproval} className="h-4 w-4" />
          النشر التلقائي بعد اعتماد المدير
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold">الموديل لكل عملية</h2>
        <p className="mt-1 text-sm text-slate-500">"افتراضي النظام" يعني الترتيب والموديلات من متغيرات البيئة. يمكن تخصيصها لكل موقع من شاشة المواقع.</p>
        <div className="mt-4">
          <OperationModelPickers prefix="model" operations={settings.data.modelOperations} catalog={settings.data.modelCatalog} value={settings.data.operationModels} emptyLabel="افتراضي النظام" />
        </div>
        <label className="mt-4 block max-w-xs">
          <span className="text-sm font-medium text-slate-600">دقة الصورة المميزة</span>
          <select name="imageSize" defaultValue={settings.data.imageSize ?? ""} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">افتراضي الموديل</option>
            <option value="1K">1K (الأرخص)</option>
            <option value="2K">2K</option>
            <option value="4K">4K (الأغلى)</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">الدقة الأعلى ترفع سعر الصورة. بعض الموديلات القديمة لا تدعم هذا الخيار.</span>
        </label>
      </section>

      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
          <span>
            <span className="block text-base font-semibold">موديلات مخصصة وأسعارها</span>
            <span className="block text-sm text-slate-500">أضف موديلًا جديدًا أو صحّح سعر موديل موجود. {custom.length > 0 ? `لديك ${custom.length} موديل مخصص.` : "لا توجد موديلات مخصصة."}</span>
          </span>
          <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="border-t border-slate-100 p-5">
          <p className="text-xs text-slate-500">نفس المعرّف يستبدل السعر الافتراضي. الأسعار تُستخدم لحساب الميزانية، وبعد الحفظ يظهر الموديل في القوائم أعلاه.</p>
          {custom.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {custom.map((spec) => (
                <li key={`${spec.provider}:${spec.model}`} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                  <span>{spec.label} <span className="text-xs text-slate-500">({spec.provider}:{spec.model} · {spec.kind === "image" ? `${spec.imageUsd}$ / صورة` : `${spec.inputPerM}$ / ${spec.outputPerM}$ لكل مليون`})</span></span>
                  <button type="button" className="text-xs font-semibold text-red-600" onClick={() => setCustomModels(custom.filter((item) => item !== spec))}>إزالة</button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label><span className="text-xs text-slate-500">النوع</span>
              <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm">
                <option value="text">نص</option><option value="image">صورة (Gemini)</option>
              </select>
            </label>
            {draft.kind === "text" ? (
              <label><span className="text-xs text-slate-500">المزود</span>
                <select value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm">
                  <option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="perplexity">Perplexity</option>
                </select>
              </label>
            ) : null}
            <label><span className="text-xs text-slate-500">معرّف الموديل</span><input dir="ltr" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
            <label><span className="text-xs text-slate-500">الاسم الظاهر</span><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
            {draft.kind === "text" ? (
              <>
                <label><span className="text-xs text-slate-500">سعر الدخل $/مليون</span><input type="number" min={0} step="0.01" value={draft.inputPerM} onChange={(event) => setDraft({ ...draft, inputPerM: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
                <label><span className="text-xs text-slate-500">سعر الخرج $/مليون</span><input type="number" min={0} step="0.01" value={draft.outputPerM} onChange={(event) => setDraft({ ...draft, outputPerM: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
                <label><span className="text-xs text-slate-500">قراءة الكاش $/مليون (اختياري)</span><input type="number" min={0} step="0.001" value={draft.cachedInputPerM} onChange={(event) => setDraft({ ...draft, cachedInputPerM: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
                <label><span className="text-xs text-slate-500">كتابة الكاش $/مليون (اختياري)</span><input type="number" min={0} step="0.001" value={draft.cacheWritePerM} onChange={(event) => setDraft({ ...draft, cacheWritePerM: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
                <label><span className="text-xs text-slate-500">رسم ثابت لكل طلب $ (اختياري)</span><input type="number" min={0} step="0.001" value={draft.requestUsd} onChange={(event) => setDraft({ ...draft, requestUsd: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
              </>
            ) : (
              <>
                <label><span className="text-xs text-slate-500">سعر الصورة $</span><input type="number" min={0} step="0.001" value={draft.imageUsd} onChange={(event) => setDraft({ ...draft, imageUsd: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
                <label><span className="text-xs text-slate-500">سعر توكن الصورة $/مليون (اختياري)</span><input type="number" min={0} step="0.01" value={draft.imageOutputPerM} onChange={(event) => setDraft({ ...draft, imageOutputPerM: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
                <label><span className="text-xs text-slate-500">نص الإدخال $/مليون (اختياري)</span><input type="number" min={0} step="0.01" value={draft.inputPerM} onChange={(event) => setDraft({ ...draft, inputPerM: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
                <label><span className="text-xs text-slate-500">نص/تفكير الخرج $/مليون (اختياري)</span><input type="number" min={0} step="0.01" value={draft.outputPerM} onChange={(event) => setDraft({ ...draft, outputPerM: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
              </>
            )}
            <div className="flex items-end"><button type="button" onClick={addCustomModel} className="rounded-md border border-teal px-3 py-2 text-sm font-semibold text-teal">إضافة</button></div>
          </div>
        </div>
      </details>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:pr-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 sm:px-2">
          <button className="rounded-md bg-teal px-5 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
          </button>
          {saved ? <span className="text-sm text-teal">تم الحفظ.</span> : null}
          {localError ? <span role="alert" className="text-sm text-red-600">{localError}</span> : null}
          <ActionError error={updateSettings.error} />
        </div>
      </div>
    </form>
  );
}

function Input(props: { name: string; label: string; type?: string; defaultValue: string | number; min?: number; max?: number; step?: string; maxLength?: number }): ReactElement {
  return (
    <label>
      <span className="text-sm font-medium text-slate-600">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        min={props.min}
        max={props.max}
        step={props.step}
        maxLength={props.maxLength}
        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
      />
    </label>
  );
}
