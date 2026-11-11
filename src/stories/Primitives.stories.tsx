import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { IconButton } from "@/components/ui/IconButton";
import { EstimatedFlag, QualityFlag } from "@/components/ui/QualityFlag";
import { StatusBadge, type BadgeStatus } from "@/components/ui/StatusBadge";

const meta: Meta = { title: "Primitives" };
export default meta;
type Story = StoryObj;

const LIFECYCLE: BadgeStatus[] = ["pending", "active", "acknowledged", "resolved"];
const HEALTH: BadgeStatus[] = ["online", "silent", "drifting", "suspicious", "deactivated"];

export const StatusBadges: Story = {
  name: "StatusBadge",
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">{LIFECYCLE.map((s) => <StatusBadge key={s} status={s} />)}</div>
      <div className="flex flex-wrap gap-2">{HEALTH.map((s) => <StatusBadge key={s} status={s} />)}</div>
    </div>
  ),
};

export const QualityFlags: Story = {
  name: "QualityFlag",
  render: () => (
    <ul className="flex flex-col gap-3">
      <li><QualityFlag quality={{ status: "valid", reason: null, ageMs: 4000 }} showValid /></li>
      <li><QualityFlag quality={{ status: "stale", reason: null, ageMs: 12 * 60_000 }} /></li>
      <li><QualityFlag quality={{ status: "suspicious", reason: "spike +340 %", ageMs: 4000 }} /></li>
      <li><QualityFlag quality={{ status: "estimated", reason: null, ageMs: 4000 }} /></li>
      <li><QualityFlag quality={{ status: "quarantined", reason: "clock error", ageMs: 4000 }} /></li>
      <li><QualityFlag quality={{ status: "valid", reason: null, ageMs: 4000, lateByMs: 180_000 }} /></li>
      <li><EstimatedFlag>Estimated (IDW)</EstimatedFlag></li>
    </ul>
  ),
};

export const Buttons: Story = {
  name: "Button and IconButton",
  render: () => (
    <div className="flex flex-col gap-4">
      {(["primary", "secondary", "ghost", "destructive"] as const).map((v) => (
        <div key={v} className="flex flex-wrap items-center gap-2">
          <Button variant={v} size="sm">Acknowledge alert</Button>
          <Button variant={v}>Acknowledge alert</Button>
          <Button variant={v} size="lg">Acknowledge alert</Button>
          <Button variant={v} disabled>Disabled</Button>
          <Button variant={v} loading>Saving</Button>
        </div>
      ))}
      <div className="flex gap-2">
        <IconButton label="Alerts" icon={<Bell size={18} strokeWidth={1.5} />} />
        <IconButton label="Alerts, 2 unacknowledged" dot icon={<Bell size={18} strokeWidth={1.5} />} />
        <IconButton label="Refresh" disabled icon={<RefreshCw size={18} strokeWidth={1.5} />} />
      </div>
    </div>
  ),
};

export const FeedbackStates: Story = {
  name: "Loading, empty, error",
  render: () => (
    <div className="grid max-w-4xl gap-4 md:grid-cols-3">
      <div className="rounded-lg border border-line bg-surface-1 p-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-3 h-32" />
      </div>
      <div className="rounded-lg border border-line bg-surface-1">
        <EmptyState title="No readings in this range" description="Pick a longer range, or check that sensors are reporting." />
      </div>
      <div className="rounded-lg border border-line bg-surface-1">
        <ErrorState title="Couldn’t load readings" detail="Couldn't reach the server. Check your connection" onRetry={() => {}} />
      </div>
    </div>
  ),
};
