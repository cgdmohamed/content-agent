import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactElement } from "react";
import type { ProviderName } from "@content-agent/shared";
import { api, type ProviderStatusDto } from "../api/client";
import { ActionError, ErrorState, LoadingState } from "../ui/StateViews";

type TextProviderName = Exclude<ProviderName, "gemini-image">;

const providerOptions: Array<{ value: TextProviderName; label: string }> = [
  { value: "anthropic", label: "أنثروبيك" },
  { value: "openai", label: "أوبن إيه آي" },
  { value: "perplexity", label: "بيربلكسيتي" }
];

export function Settings(): ReactElement {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const updateSettings = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  if (settings.isLoading) return <LoadingState />;
  if (settings.isError || !settings.data) return <ErrorState />;

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
      providerRouting: {
        ideas: readProviderOrder(data, "providerIdeas"),
        research: readProviderOrder(data, "providerResearch"),
        writing: readProviderOrder(data, "providerWriting")
      }
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
          <h3 className="text-sm font-semibold text-slate-700">ترتيب مزودي النصوص</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <ProviderOrder name="providerIdeas" label="الأفكار" defaultValue={settings.data.providerRouting.ideas} />
            <ProviderOrder name="providerResearch" label="بحث المنافسين" defaultValue={settings.data.providerRouting.research} />
            <ProviderOrder name="providerWriting" label="الكتابة والمراجعة" defaultValue={settings.data.providerRouting.writing} />
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

function ProviderOrder(props: { name: string; label: string; defaultValue: TextProviderName[] }): ReactElement {
  return (
    <label>
      <span className="text-sm font-medium text-slate-600">{props.label}</span>
      <select name={props.name} multiple defaultValue={props.defaultValue} className="mt-1 h-28 w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
        {providerOptions.map((provider) => (
          <option key={provider.value} value={provider.value}>
            {provider.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function readProviderOrder(data: FormData, name: string): TextProviderName[] {
  const values = data.getAll(name).map(String).filter((value): value is TextProviderName => providerOptions.some((provider) => provider.value === value));
  return values.length > 0 ? values : providerOptions.map((provider) => provider.value);
}
