import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { hasRole, useSession } from "@/lib/auth/session";
import type { Role } from "@/lib/api/types";
import { StatusPage } from "@/features/placeholder/StatusPage";
import { RealtimeProvider } from "./RealtimeProvider";

/** Signed-in routes. Restores the session from the refresh cookie once, then decides. */
export function RequireAuth() {
  const status = useSession((s) => s.status);
  const restore = useSession((s) => s.restore);
  const location = useLocation();

  useEffect(() => {
    if (status === "unknown") void restore();
  }, [status, restore]);

  if (status === "unknown") {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center text-body text-fg-muted">
        Restoring your session…
      </div>
    );
  }
  if (status === "anonymous") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return (
    <RealtimeProvider>
      <Outlet />
    </RealtimeProvider>
  );
}

/** Hides admin pages from operators. The API rejects them too; hiding is never the only guard. */
export function RequireRole({ allow }: { allow: Role }) {
  const user = useSession((s) => s.user);
  if (!hasRole(user, allow)) {
    return (
      <StatusPage
        code="403"
        title="You don’t have access to this page"
        description="This page is for administrators. Ask an administrator if you need access."
      />
    );
  }
  return <Outlet />;
}
