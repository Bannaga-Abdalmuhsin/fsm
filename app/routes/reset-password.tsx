import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { Card, Notice, Page, RequireMember } from "@/components/pmr/pmr-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export default function ResetPasswordRoute() {
  return <RequireMember render={() => <ResetForm />} />;
}

function ResetForm() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      await updatePassword(password);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Set a new password">
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <Button type="submit" disabled={busy} className="w-full">
            Save password
          </Button>
        </form>
      </Card>
      {error && <Notice>{error}</Notice>}
    </Page>
  );
}
