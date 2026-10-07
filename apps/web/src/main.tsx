import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { errorMessage, sessionExpiredMessage } from "./api/client";
import { installGlobalErrorReporting } from "./report-client-error";
import { AppShell } from "./ui/AppShell";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { toast } from "./ui/toast";
import { ToastViewport } from "./ui/ToastViewport";
import { LoadingState } from "./ui/StateViews";
import "@fontsource/alexandria/arabic-400.css";
import "@fontsource/alexandria/arabic-600.css";
import "@fontsource/alexandria/arabic-700.css";
import "@fontsource/alexandria/latin-400.css";
import "@fontsource/alexandria/latin-600.css";
import "@fontsource/alexandria/latin-700.css";
import "./styles.css";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Shown as a success toast when the mutation finishes. */
      successMessage?: string;
      /** The caller renders its own error UI (e.g. the login form), so no error toast. */
      silent?: boolean;
    };
  }
}

installGlobalErrorReporting();

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _onMutateResult, mutation) => {
      if (mutation.meta?.successMessage) toast.success(mutation.meta.successMessage);
    },
    onError: (error, _variables, _onMutateResult, mutation) => {
      if (mutation.meta?.silent) return;
      // The session-expiry flow already shows the login screen with an explanation.
      if (error instanceof Error && error.message === sessionExpiredMessage) return;
      toast.error(errorMessage(error));
    }
  })
});
const Dashboard = lazy(() => import("./views/Dashboard").then((module) => ({ default: module.Dashboard })));
const ContentLibrary = lazy(() => import("./views/ContentLibrary").then((module) => ({ default: module.ContentLibrary })));
const ArticleWorkspace = lazy(() => import("./views/ArticleWorkspace").then((module) => ({ default: module.ArticleWorkspace })));
const Sites = lazy(() => import("./views/Sites").then((module) => ({ default: module.Sites })));
const Operations = lazy(() => import("./views/Operations").then((module) => ({ default: module.Operations })));
const Users = lazy(() => import("./views/Users").then((module) => ({ default: module.Users })));
const Settings = lazy(() => import("./views/Settings").then((module) => ({ default: module.Settings })));
const SiteReport = lazy(() => import("./views/SiteReport").then((module) => ({ default: module.SiteReport })));
const Usage = lazy(() => import("./views/Usage").then((module) => ({ default: module.Usage })));
const SiteAudit = lazy(() => import("./views/SiteAudit").then((module) => ({ default: module.SiteAudit })));

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary scope="page">
    <QueryClientProvider client={queryClient}>
      <ToastViewport />
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<RouteView><Dashboard /></RouteView>} />
            <Route path="content" element={<RouteView><ContentLibrary /></RouteView>} />
            <Route path="content/:id" element={<RouteView><ArticleWorkspace /></RouteView>} />
            <Route path="sites" element={<RouteView><Sites /></RouteView>} />
            <Route path="site-audit" element={<RouteView><SiteAudit /></RouteView>} />
            <Route path="sites/:id/report" element={<RouteView><SiteReport /></RouteView>} />
            <Route path="usage" element={<RouteView><Usage /></RouteView>} />
            <Route path="operations" element={<RouteView><Operations /></RouteView>} />
            <Route path="users" element={<RouteView><Users /></RouteView>} />
            <Route path="settings" element={<RouteView><Settings /></RouteView>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

function RouteView(props: { children: React.ReactNode }): React.ReactElement {
  const location = useLocation();
  // A crash in one screen keeps the navigation usable, and moving to another route clears it.
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<LoadingState />}>{props.children}</Suspense>
    </ErrorBoundary>
  );
}
