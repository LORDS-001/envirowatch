import { useEffect, useId, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { Button } from "@/components/ui/Button";
import { StateIcon } from "@/components/ui/StateIcon";

const field =
  "h-11 w-full rounded-pill border border-line bg-surface-2 px-4 text-body text-fg placeholder:text-fg-muted hover:border-line-strong aria-[invalid=true]:border-state-critical";

export default function LoginPage() {
  const status = useSession((s) => s.status);
  const restore = useSession((s) => s.restore);
  const signIn = useSession((s) => s.signIn);
  const [params] = useSearchParams();
  const next = params.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/overview";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  useEffect(() => {
    document.title = "Sign in | EnviroWatch";
    if (status === "unknown") void restore();
  }, [status, restore]);

  if (status === "authenticated") return <Navigate to={target} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <img src="/brand/envirowatch-lockup-on-dark.svg" alt="EnviroWatch" width={226} height={32} className="mb-8 h-8 w-auto" />
        <h1 className="text-h1 text-fg">Sign in</h1>
        <p className="mt-1 text-body text-fg-secondary">Use your operator or administrator account.</p>

        <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={emailId} className="text-label text-fg-secondary">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={field}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={passwordId} className="text-label text-fg-secondary">
              Password
            </label>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={field}
            />
          </div>
          {error && (
            <p id={errorId} role="alert" className="flex items-center gap-2 text-body-sm text-state-critical">
              <StateIcon shape="octagon" size={10} />
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-2 w-full">
            Sign in
          </Button>
        </form>

        {config.useMocks && (
          <p className="mt-8 rounded-md border border-dashed border-line px-4 py-3 text-body-sm text-fg-muted">
            Mock mode. Sign in as <span className="num text-fg-secondary">admin@envirowatch.test</span> or{" "}
            <span className="num text-fg-secondary">operator@envirowatch.test</span> with password{" "}
            <span className="num text-fg-secondary">envirowatch-demo</span>.
          </p>
        )}
      </div>
    </main>
  );
}
