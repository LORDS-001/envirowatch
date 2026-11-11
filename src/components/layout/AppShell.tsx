import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/endpoints";
import { NavRail } from "./NavRail";
import { TopBar } from "./TopBar";

interface PageMeta {
  title: string;
  subtitle?: ReactNode;
}

const PageMetaContext = createContext<(meta: PageMeta) => void>(() => {});

/** Pages declare their title and subtitle; the shell renders the top bar and sets the document title. */
export function usePageTitle(title: string, subtitle?: string) {
  const set = useContext(PageMetaContext);
  useEffect(() => {
    set({ title, subtitle });
    document.title = `${title} | EnviroWatch`;
  }, [set, title, subtitle]);
}

export function useOpenAlerts() {
  return useQuery({
    queryKey: ["alerts", "open"],
    queryFn: ({ signal }) => api.alerts({ status: ["pending", "active", "acknowledged"] }, signal),
    refetchInterval: 30_000,
  });
}

export function AppShell() {
  const [meta, setMeta] = useState<PageMeta>({ title: "" });
  const alerts = useOpenAlerts();
  const unacknowledged = alerts.data?.items.filter((a) => a.status === "active").length ?? 0;

  return (
    <PageMetaContext.Provider value={setMeta}>
      <a
        href="#main"
        className="sr-only z-50 rounded-pill bg-brand px-4 py-2 text-on-brand focus:not-sr-only focus:fixed focus:top-4 focus:left-24"
      >
        Skip to content
      </a>
      <NavRail unacknowledged={unacknowledged} />
      <div className="min-h-dvh py-4 pr-4 pl-24">
        <TopBar title={meta.title} subtitle={meta.subtitle} unacknowledged={unacknowledged} />
        <main id="main" tabIndex={-1} className="outline-none">
          <Outlet />
        </main>
      </div>
    </PageMetaContext.Provider>
  );
}
