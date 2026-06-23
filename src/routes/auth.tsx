import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { getService } from "@/services";
import { useAuth } from "@/services/auth-context";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-muted-foreground">You're signed in as @{user.username}.</p>
        <button
          onClick={() => navigate({ to: "/play" })}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >Start playing</button>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const svc = getService();
      if (mode === "login") await svc.login(username, password);
      else await svc.signup(username, password);
      navigate({ to: "/play" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-lg border border-border bg-card p-8">
        <h1 className="font-mono text-2xl font-bold">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mock auth — data lives in your browser. Try{" "}
          <code className="rounded bg-muted px-1">guest / guest</code>.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Username">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Sign up"}
          </button>
        </form>
        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
