import { ExternalLink, Languages, LoaderCircle, Send } from "lucide-react";
import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { findSiteLanguage, sanitizeTargetLanguages, sourceLanguageCode } from "@content-agent/shared";
import { api, type ContentDetailDto, type SiteDto } from "../api/client";
import { StatusBadge } from "../ui/Badge";
import { ActionError } from "../ui/StateViews";

/** States from which an article is final enough to be translated. */
const translatableStates = ["IMAGE_READY", "APPROVED", "SCHEDULED", "PUBLISHED"];

/** Languages still missing for this article: the site's languages minus its own and those already translated. */
export function missingLanguages(site: Pick<SiteDto, "language" | "languages">, content: Pick<ContentDetailDto, "language" | "translations">): string[] {
  const own = sourceLanguageCode(content.language, site.language);
  const taken = content.translations.map((item) => item.language).filter((code): code is string => Boolean(code));
  return sanitizeTargetLanguages(
    site.languages.map((language) => language.code),
    site.languages,
    own
  ).filter((code) => !taken.includes(code));
}

export function ArticleLanguages(props: { content: ContentDetailDto; site: SiteDto | undefined; isAdmin: boolean }): ReactElement {
  const { content, site } = props;
  const queryClient = useQueryClient();
  const connected = site?.polylangStatus === "CONNECTED" && site.languages.length > 1;
  const isTranslation = Boolean(content.translationOf);
  const missing = site && connected && !isTranslation ? missingLanguages(site, content) : [];
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? missing.filter((code) => site?.publishLanguages.includes(code));
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["content"] });
  };
  const translate = useMutation({
    meta: { successMessage: "بدأت الترجمة. ستظهر النسخ هنا خلال دقائق" },
    mutationFn: () => api.createTranslations(content.id, selected),
    onSuccess: async () => {
      setPicked(null);
      await refresh();
    }
  });
  const publish = useMutation({
    meta: { successMessage: "تم اعتماد الترجمات وإضافتها لطابور النشر" },
    mutationFn: () => api.publishTranslations(content.id),
    onSuccess: refresh
  });

  // A null language is the article in the site's own language, whichever article of the group is open.
  const nameOf = (code: string | null): string => {
    const resolved = code ?? site?.language ?? null;
    if (!resolved) return "—";
    return findSiteLanguage(site?.languages ?? [], resolved)?.name ?? resolved;
  };
  const readyToPublish = content.translations.filter((item) => !item.isSource && ["IMAGE_READY", "APPROVED"].includes(item.state)).length;
  const canTranslate = props.isAdmin && translatableStates.includes(content.state);

  if (!connected && content.translations.length === 0) {
    return (
      <div className="space-y-2 text-sm text-slate-600">
        <p>هذا الموقع بلغة واحدة. لنشر المقال نفسه بعدة لغات: فعّل Polylang على ووردبريس، ثبّت جسر Polylang، ثم زامن اللغات.</p>
        <Link to="/sites" className="font-medium text-teal hover:underline">فتح صفحة المواقع</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {content.translations.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {content.translations.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{nameOf(item.language)}{item.isSource ? <span className="mr-2 text-xs font-normal text-slate-500">الأصل</span> : null}</p>
                <p className="truncate text-xs text-slate-500">{item.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge state={item.state} />
                {item.id === content.id ? (
                  <span className="text-xs text-slate-500">الحالي</span>
                ) : (
                  <Link to={`/content/${item.id}`} className="text-xs font-medium text-teal hover:underline">فتح</Link>
                )}
                {item.wordpressPostUrl ? (
                  <a href={item.wordpressPostUrl} target="_blank" rel="noreferrer" aria-label="فتح في ووردبريس" className="text-slate-400 hover:text-teal"><ExternalLink className="h-4 w-4" /></a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">لا توجد ترجمات لهذا المقال بعد.</p>
      )}

      {isTranslation ? (
        <p className="text-xs text-slate-500">هذه ترجمة. اعتمدها وانشرها من هنا أو من المقال الأصلي، وتُربط تلقائيًا بالأصل في Polylang عند النشر.</p>
      ) : null}

      {!isTranslation && missing.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-slate-500">ترجمة إلى</legend>
          <div className="flex flex-wrap gap-2">
            {missing.map((code) => (
              <label key={code} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.includes(code)}
                  onChange={(event) => setPicked(event.target.checked ? [...selected, code] : selected.filter((value) => value !== code))}
                />
                {nameOf(code)}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-teal/30 bg-teal/5 px-3 py-2 text-sm font-semibold text-teal hover:bg-teal/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            disabled={!canTranslate || selected.length === 0 || translate.isPending}
            onClick={() => translate.mutate()}
          >
            {translate.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
            {translate.isPending ? "جاري الإنشاء..." : `ترجمة إلى ${selected.length} لغة`}
          </button>
          {!canTranslate ? <p className="text-xs text-slate-500">{props.isAdmin ? "تتاح الترجمة بعد جاهزية الصورة." : "الترجمة متاحة للمدير فقط."}</p> : null}
        </fieldset>
      ) : null}

      {!isTranslation && readyToPublish > 0 ? (
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-teal px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!props.isAdmin || publish.isPending}
          onClick={() => publish.mutate()}
        >
          {publish.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {publish.isPending ? "جاري الإضافة للطابور..." : `اعتماد ونشر ${readyToPublish} ترجمة`}
        </button>
      ) : null}
      <ActionError error={translate.error} />
      <ActionError error={publish.error} />
    </div>
  );
}
