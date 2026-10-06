import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactElement } from "react";
import { api, type ModelSpecDto, type ProviderStatusDto } from "../api/client";
import { OperationModelPickers, readOperationModels } from "../ui/ModelPickers";
import { ActionError, ErrorState, LoadingState } from "../ui/StateViews";

export function Settings(): ReactElement {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [customModels, setCustomModels] = useState<ModelSpecDto[] | null>(null);
  const [draft, setDraft] = useState({ provider: "openai", kind: "text", model: "", label: "", inputPerM: "", outputPerM: "", imageUsd: "", imageOutputPerM: "" });
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
        ? { imageUsd: Number(draft.imageUsd), ...(draft.imageOutputPerM !== "" ? { imageOutputPerM: Number(draft.imageOutputPerM) } : {}) }
        : { inputPerM: Number(draft.inputPerM), outputPerM: Number(draft.outputPerM) })
    };
    setCustomModels([...custom.filter((item) => !(item.provider === spec.provider && item.model === spec.model)), spec]);
    setDraft({ ...draft, model: "", label: "", inputPerM: "", outputPerM: "", imageUsd: "", imageOutputPerM: "" });
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
      customModels: custom.map(({ provider, model, label, kind, inputPerM, outputPerM, imageUsd, imageOutputPerM }) => ({ provider, model, label, kind, inputPerM, outputPerM, imageUsd, imageOutputPerM })),
      imageSize: (String(data.get("imageSize") ?? "") as "" | "1K" | "2K" | "4K")
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} noValidate className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">الإعدادات</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Input name="monthlyAiBudgetUsd" label="ميزانية الذكاء الاصطناعي الشهرية بالدولار" type="number" defaultValue={settings.data.monthlyAiBudgetUsd} min={0} step="0.01" />
          <Input name="monthlyAiHardLimitUsd" label="حد الإيقاف الصارم بالدولار" type="number" defaultValue={settings.data.monthlyAiHardLimitUsd} min={0} step="0.01" />
          <Input name="defaultIdeasCount" label="عدد الأفكار الافتراضي" type="number" defaultValue={settings.data.defaultIdeasCount} min={1} max={20} step="1" />
          <Input name="defaultMarket" label="السوق الافتراضي" defaultValue={settings.data.defaultMarket} maxLength={20} />
          <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2">
            <input name="autoPublishAfterApproval" type="checkbox" defaultChecked={settings.data.autoPublishAfterApproval} className="h-4 w-4" />
            <span>النشر التلقائي بعد اعتماد المدير</span>
          </label>
        </div>
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700">الموديل لكل عملية</h3>
          <p className="mt-1 text-xs text-slate-500">اختر الموديل الأساسي وبديلًا عند الفشل لكل عملية. "افتراضي النظام" يعني الترتيب والموديلات من متغيرات البيئة. يمكن تخصيصها لكل موقع من شاشة المواقع.</p>
          <div className="mt-3">
            <OperationModelPickers prefix="model" operations={settings.data.modelOperations} catalog={settings.data.modelCatalog} value={settings.data.operationModels} emptyLabel="افتراضي النظام" />
          </div>
          <label className="mt-4 block max-w-xs">
            <span className="text-sm font-medium text-slate-600">دقة الصورة المميزة</span>
            <select name="imageSize" defaultValue={settings.data.imageSize ?? ""} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
              <option value="">افتراضي الموديل</option>
              <option value="1K">1K (الأرخص)</option>
              <option value="2K">2K</option>
              <option value="4K">4K (الأغلى)</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">الدقة الأعلى ترفع سعر الصورة. بعض الموديلات القديمة لا تدعم هذا الخيار.</span>
          </label>
        </div>
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700">موديلات مخصصة وأسعارها</h3>
          <p className="mt-1 text-xs text-slate-500">أضف أي موديل جديد أو صحّح سعر موديل موجود (نفس المعرّف يستبدل السعر الافتراضي). الأسعار تُستخدم لحساب الميزانية. بعد الحفظ يظهر الموديل في القوائم أعلاه.</p>
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
              </>
            ) : (
              <>
                <label><span className="text-xs text-slate-500">سعر الصورة $</span><input type="number" min={0} step="0.001" value={draft.imageUsd} onChange={(event) => setDraft({ ...draft, imageUsd: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
                <label><span className="text-xs text-slate-500">سعر توكن الصورة $/مليون (اختياري)</span><input type="number" min={0} step="0.01" value={draft.imageOutputPerM} onChange={(event) => setDraft({ ...draft, imageOutputPerM: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm" /></label>
              </>
            )}
            <div className="flex items-end"><button type="button" onClick={addCustomModel} className="rounded-md border border-teal px-3 py-2 text-sm font-semibold text-teal">إضافة</button></div>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white" disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
          </button>
          {saved ? <span className="text-sm text-teal">تم الحفظ.</span> : null}
        </div>
        {localError ? <p className="mt-3 text-sm text-red-600">{localError}</p> : null}
        <div className="mt-3"><ActionError error={updateSettings.error} /></div>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">حالة المزودين</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Provider label="أوبن إيه آي" status={settings.data.providers.openai} />
          <Provider label="أنثروبيك" status={settings.data.providers.anthropic} />
          <Provider label="بيربلكسيتي" status={settings.data.providers.perplexity} />
          <Provider label="جيميني للصور" status={settings.data.providers.gemini} />
        </div>
        <p className="mt-4 text-sm text-slate-500">مفاتيح المزودين تحفظ في متغيرات البيئة، ولا يظهر هنا إلا آخر جزء مقنّع للتحقق التشغيلي.</p>
      </div>
    </div>
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

function Provider(props: { label: string; status: ProviderStatusDto }): ReactElement {
  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <p className="font-medium">{props.label}</p>
      <p className={props.status.configured ? "mt-1 text-teal" : "mt-1 text-slate-500"}>{props.status.configured ? "مهيأ" : "غير مهيأ"}</p>
      <p className="mt-2 text-xs text-slate-500">المفتاح: {props.status.maskedKey ?? "غير محفوظ"}</p>
      <p className="mt-1 text-xs text-slate-500">الموديل: {props.status.model ?? "غير محدد"}</p>
    </div>
  );
}
