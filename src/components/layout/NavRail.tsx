import { Link, NavLink, useMatch } from "react-router";
import {
  Bell,
  ChartLine,
  Cpu,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { hasRole, useSession } from "@/lib/auth/session";
import { Tooltip } from "@/components/ui/Tooltip";

interface Destination {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const PRIMARY: Destination[] = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/map", label: "Environmental map", icon: Map },
  { to: "/analytics", label: "Historical analytics", icon: ChartLine },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/health", label: "Sensor health", icon: HeartPulse },
  { to: "/devices", label: "Devices", icon: Cpu },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/simulator", label: "Simulator", icon: FlaskConical, adminOnly: true },
];

const itemClass = (active: boolean) =>
  cn(
    "relative flex size-11 items-center justify-center rounded-md transition-colors duration-tick ease-standard",
    active ? "bg-brand-subtle text-brand" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
  );

function RailLink({ d, alertCount }: { d: Destination; alertCount?: number }) {
  const Icon = d.icon;
  // Resolve active state here: Radix Slot (the tooltip trigger) can't merge NavLink's function className.
  const isActive = useMatch({ path: d.to, end: false }) !== null;
  const hasDot = d.to === "/alerts" && !!alertCount;
  const name = hasDot ? `${d.label}, ${alertCount} unacknowledged` : d.label;
  return (
    <li>
      <Tooltip content={name} side="right">
        <Link to={d.to} aria-label={name} aria-current={isActive ? "page" : undefined} className={itemClass(isActive)}>
          <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
          {hasDot && (
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 size-2 rounded-pill bg-state-critical ring-2 ring-surface-1"
            />
          )}
        </Link>
      </Tooltip>
    </li>
  );
}

/** Floating 56px rail: mark at the top, eight destinations, settings and sign out at the bottom. */
export function NavRail({ unacknowledged }: { unacknowledged: number }) {
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const isAdmin = hasRole(user, "admin");

  return (
    <nav
      aria-label="Main"
      className="fixed top-4 bottom-4 left-4 z-30 flex w-14 flex-col items-center rounded-xl border border-line bg-surface-1 py-3"
    >
      <NavLink to="/overview" aria-label="EnviroWatch overview" className="mb-4 rounded-md p-1">
        <img src="/brand/envirowatch-mark.svg" alt="" width={28} height={28} />
      </NavLink>
      <ul className="flex flex-col items-center gap-1">
        {PRIMARY.filter((d) => !d.adminOnly || isAdmin).map((d) => (
          <RailLink key={d.to} d={d} alertCount={unacknowledged} />
        ))}
      </ul>
      <ul className="mt-auto flex flex-col items-center gap-1">
        {isAdmin && <RailLink d={{ to: "/settings", label: "Settings", icon: Settings }} />}
        <li>
          <Tooltip content="Sign out" side="right">
            <button type="button" aria-label="Sign out" onClick={() => void signOut()} className={itemClass(false)}>
              <LogOut size={20} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </Tooltip>
        </li>
      </ul>
    </nav>
  );
}
