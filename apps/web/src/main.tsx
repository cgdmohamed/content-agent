import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import { LoadingState } from "./ui/StateViews";
import "./styles.css";

const queryClient = new QueryClient();
const Dashboard = lazy(() => import("./views/Dashboard").then((module) => ({ default: module.Dashboard })));
const ContentLibrary = lazy(() => import("./views/ContentLibrary").then((module) => ({ default: module.ContentLibrary })));
const ArticleWorkspace = lazy(() => import("./views/ArticleWorkspace").then((module) => ({ default: module.ArticleWorkspace })));
const Sites = lazy(() => import("./views/Sites").then((module) => ({ default: module.Sites })));
const Operations = lazy(() => import("./views/Operations").then((module) => ({ default: module.Operations })));
const Users = lazy(() => import("./views/Users").then((module) => ({ default: module.Users })));
const Settings = lazy(() => import("./views/Settings").then((module) => ({ default: module.Settings })));
const SiteReport = lazy(() => import("./views/SiteReport").then((module) => ({ default: module.SiteReport })));

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<RouteView><Dashboard /></RouteView>} />
            <Route path="content" element={<RouteView><ContentLibrary /></RouteView>} />
            <Route path="content/:id" element={<RouteView><ArticleWorkspace /></RouteView>} />
            <Route path="sites" element={<RouteView><Sites /></RouteView>} />
            <Route path="sites/:id/report" element={<RouteView><SiteReport /></RouteView>} />
            <Route path="operations" element={<RouteView><Operations /></RouteView>} />
            <Route path="users" element={<RouteView><Users /></RouteView>} />
            <Route path="settings" element={<RouteView><Settings /></RouteView>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

function RouteView(props: { children: React.ReactNode }): React.ReactElement {
  return <Suspense fallback={<LoadingState />}>{props.children}</Suspense>;
}
