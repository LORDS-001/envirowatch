import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { Bell, Settings } from "lucide-react";
import { hasRole, useSession } from "@/lib/auth/session";
import { IconButton } from "@/components/ui/IconButton";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { SearchField } from "@/components/ui/SearchField";

interface TopBarProps {
  title: string;
  subtitle?: ReactNode;
  unacknowledged: number;
}

export function TopBar({ title, subtitle, unacknowledged }: TopBarProps) {
  const navigate = useNavigate();
  const org = useSession((s) => s.organization);
  const user = useSession((s) => s.user);

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-h1 text-fg">{title}</h1>
        <p className="mt-1 truncate text-body text-fg-muted">
          {subtitle ?? org?.name}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <LiveIndicator />
        <SearchField label="Search devices and sites" placeholder="Search devices and sites" className="hidden w-64 lg:block" />
        <IconButton
          label={unacknowledged ? `Alerts, ${unacknowledged} unacknowledged` : "Alerts"}
          dot={unacknowledged > 0}
          icon={<Bell size={18} strokeWidth={1.5} aria-hidden="true" />}
          onClick={() => navigate("/alerts")}
        />
        {hasRole(user, "admin") && (
          <IconButton
            label="Settings"
            icon={<Settings size={18} strokeWidth={1.5} aria-hidden="true" />}
            onClick={() => navigate("/settings")}
          />
        )}
      </div>
    </header>
  );
}
