import { Link } from "react-router";

interface StatusPageProps {
  code: string;
  title: string;
  description: string;
}

/** 404 and 403: calm, branded, with a way back. */
export function StatusPage({ code, title, description }: StatusPageProps) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <img src="/brand/envirowatch-mark.svg" alt="" width={40} height={40} />
      <p className="num text-reading-md text-fg-muted">{code}</p>
      <h1 className="text-h1 text-fg">{title}</h1>
      <p className="max-w-[52ch] text-body text-fg-secondary">{description}</p>
      <Link
        to="/overview"
        className="mt-2 inline-flex h-9 items-center rounded-pill bg-brand px-4 font-medium text-on-brand hover:bg-brand-hover"
      >
        Go to Overview
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <main className="min-h-dvh">
      <StatusPage
        code="404"
        title="This page doesn’t exist"
        description="The link may be out of date. Live conditions are on the Overview."
      />
    </main>
  );
}
