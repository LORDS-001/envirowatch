import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

export default function AcceptInvitationPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return setError("Open the invitation link your administrator shared with you.");
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirmation) return setError("The passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await api.acceptInvitation(token, password);
      setDone(true);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-h1">Set your password</h1>
      {done ? (
        <p>
          Password saved.{" "}
          <Link to="/login" className="underline">
            Sign in
          </Link>{" "}
          with the email your administrator invited.
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {error && <p role="alert">{error}</p>}
          <Button type="submit" variant="primary" loading={busy}>
            Save password
          </Button>
        </form>
      )}
    </main>
  );
}
