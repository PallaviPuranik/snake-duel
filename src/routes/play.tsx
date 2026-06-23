import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, setDir, step, type Dir, type GameState, type Mode } from "@/game/snake";
import { getService } from "@/services";
import { useAuth } from "@/services/auth-context";
import { GameBoard } from "@/components/GameBoard";

export const Route = createFileRoute("/play")({
  component: PlayPage,
});

const TICK_MS = 110;

function PlayPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("walls");
  const [state, setState] = useState<GameState>(() => createGame("walls"));
  const [gameId, setGameId] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // redirect unauthenticated
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, Dir> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
        W: "up", S: "down", A: "left", D: "right",
      };
      const d = map[e.key];
      if (d) {
        e.preventDefault();
        setState((s) => setDir(s, d));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = useCallback(async () => {
    if (!user) return;
    const fresh = createGame(mode);
    setState(fresh);
    const id = await getService().startGame(mode);
    setGameId(id);
  }, [mode, user]);

  // tick loop
  useEffect(() => {
    if (!gameId) return;
    const t = setInterval(() => {
      const cur = stateRef.current;
      if (!cur.alive) return;
      const next = step(cur);
      setState(next);
      const svc = getService();
      if (!next.alive) {
        svc.endGame(gameId, next);
        setGameId(null);
      } else {
        svc.pushState(gameId, next);
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [gameId]);

  if (loading || !user) {
    return <main className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-bold">Play</h1>
          <p className="text-sm text-muted-foreground">Arrows or WASD to steer.</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onChange={(m) => { setMode(m); setState(createGame(m)); setGameId(null); }} disabled={!!gameId} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex justify-center">
          <GameBoard state={state} />
        </div>
        <aside className="space-y-4">
          <Stat label="Score" value={state.score} />
          <Stat label="Mode" value={mode === "walls" ? "Walls" : "Wrap"} />
          <Stat label="Length" value={state.snake.length} />
          {!gameId ? (
            <button onClick={start} className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground hover:opacity-90">
              {state.tick === 0 ? "Start game" : "Play again"}
            </button>
          ) : (
            <p className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
              Live · others can watch you at <Link to="/watch" className="text-primary underline">/watch</Link>
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

function ModeToggle({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-1 text-sm">
      {(["walls", "wrap"] as Mode[]).map((m) => (
        <button
          key={m}
          disabled={disabled}
          onClick={() => onChange(m)}
          className={
            "rounded-sm px-3 py-1.5 transition " +
            (mode === m
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground disabled:opacity-50")
          }
        >
          {m === "walls" ? "🧱 Walls" : "🌀 Wrap"}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-3xl font-bold text-primary">{value}</div>
    </div>
  );
}
