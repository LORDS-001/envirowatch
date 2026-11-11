import { NavLink, Outlet } from "react-router";
import { cn } from "@/lib/cn";

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex h-11 items-center rounded-pill px-4 text-body-lg",
    isActive ? "bg-surface-3 text-fg" : "text-fg-secondary hover:bg-surface-2 hover:text-fg",
  );

/** Public portal frame: pill nav with the lockup. 16 px body, 44 px targets. */
export default function PublicLayout() {
  return (
    <div className="min-h-dvh px-4 pt-4 pb-12 text-body-lg">
      <a href="#public-main" className="sr-only rounded-pill bg-brand px-4 py-2 text-on-brand focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50">
        Skip to content
      </a>
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 p-2 pl-4 sm:rounded-pill">
        <NavLink to="/public" end aria-label="EnviroWatch, air near you" className="rounded-pill p-1">
          <img src="/brand/envirowatch-lockup-on-dark.svg" alt="EnviroWatch" width={170} height={24} className="h-6 w-auto" />
        </NavLink>
        <nav aria-label="Public">
          <ul className="flex flex-wrap items-center gap-1">
            <li>
              <NavLink to="/public" end className={link}>
                Air now
              </NavLink>
            </li>
            <li>
              <NavLink to="/public/map" className={link}>
                Map
              </NavLink>
            </li>
            <li>
              <NavLink to="/login" className={link}>
                Operator sign in
              </NavLink>
            </li>
          </ul>
        </nav>
      </header>
      <main id="public-main" className="mx-auto mt-8 max-w-5xl">
        <Outlet />
      </main>
      <footer className="mx-auto mt-16 max-w-5xl border-t border-line pt-6 text-body-sm text-fg-muted">
        Readings from community sensors in Lagos, checked automatically before they’re shown. EnviroWatch is a monitoring project, not an emergency service.
      </footer>
    </div>
  );
}
