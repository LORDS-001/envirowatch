import { Link } from "react-router";
import { usePageTitle } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";

interface PlannedPageProps {
  title: string;
  phase: number;
  /** What the page will do, in one sentence. */
  purpose: string;
}

// TODO(phase-3/4/5): each route using this is replaced by its real page. See docs/FRONTEND_PLAN.md.
export function PlannedPage({ title, phase, purpose }: PlannedPageProps) {
  usePageTitle(title);
  return (
    <Card className="flex flex-col items-start gap-3 p-8">
      <h2 className="text-h2 text-fg">{title} isn’t built yet</h2>
      <p className="max-w-[60ch] text-body text-fg-secondary">
        {purpose} It’s scheduled for phase {phase}.
      </p>
      <Link
        to="/overview"
        className="mt-2 inline-flex h-9 items-center rounded-pill border border-line bg-surface-2 px-4 text-fg hover:bg-surface-3"
      >
        Go to Overview
      </Link>
    </Card>
  );
}

export const planned = (title: string, phase: number, purpose: string) => ({
  Component: () => <PlannedPage title={title} phase={phase} purpose={purpose} />,
});
