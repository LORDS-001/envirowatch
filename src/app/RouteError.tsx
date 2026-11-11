import { isRouteErrorResponse, useRouteError } from "react-router";
import { ErrorState } from "@/components/ui/Feedback";

/** Last-resort boundary for a page that throws while rendering or loading. */
export function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined;
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <ErrorState
        title="This page stopped working"
        detail={detail ? `${detail}. Reload to try again.` : "Reload to try again."}
        onRetry={() => window.location.reload()}
      />
    </main>
  );
}
