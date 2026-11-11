import { useEffect } from "react";
import { Link } from "react-router";

// TODO(phase-5): replace with the public portal (hero, readings per area, map, trend, export).
export default function PublicPlaceholder() {
  useEffect(() => {
    document.title = "Air near you | EnviroWatch";
  }, []);
  return (
    <div className="min-h-dvh px-4 py-6">
      <header className="mx-auto flex max-w-5xl items-center justify-between rounded-pill border border-line bg-surface-1 py-2 pr-2 pl-6">
        <img src="/brand/envirowatch-lockup-on-dark.svg" alt="EnviroWatch" width={170} height={24} className="h-6 w-auto" />
        <Link to="/login" className="inline-flex h-11 items-center rounded-pill px-4 text-body-lg text-fg-secondary hover:bg-surface-2">
          Operator sign in
        </Link>
      </header>
      <main className="mx-auto mt-16 max-w-5xl">
        <h1 className="text-display-lg text-fg">Air near you</h1>
        <p className="mt-3 max-w-[60ch] text-body-lg text-fg-secondary">
          The public page with approved readings for each area, a map and a 24-hour trend is coming soon.
        </p>
      </main>
    </div>
  );
}
