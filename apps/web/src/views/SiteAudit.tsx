import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Globe2 } from "lucide-react";
import { api } from "../api/client";
import { EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

export function SiteAudit(): ReactElement {
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites });
  if (sites.isLoading) return <LoadingState />;
  if (sites.isError || !sites.data) return <ErrorState label="تعذر تحميل المواقع." />;
  const activeSites = sites.data.filter((site) => site.status === "ACTIVE");
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-teal text-white"><BarChart3 className="h-5 w-5" /></span>
        <div>
          <h2 className="text-lg font-semibold">فحص الموقع</h2>
          <p className="mt-1 text-sm text-slate-500">اختر موقعًا لسحب صفحاته ومقالاته من ووردبريس وإظهار تقرير التحسينات.</p>
        </div>
      </div>
      {activeSites.length === 0 ? (
        <div className="mt-5"><EmptyState label="لا توجد مواقع نشطة للفحص." /></div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activeSites.map((site) => (
            <Link key={site.id} to={`/sites/${site.id}/report`} className="rounded-md border border-slate-200 p-4 hover:border-teal/40 hover:bg-slate-50">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-600"><Globe2 className="h-4 w-4" /></span>
                <div>
                  <h3 className="font-semibold">{site.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{site.wordpressUrl}</p>
                  <p className="mt-3 text-sm font-semibold text-teal">فتح تقرير الفحص</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
