import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getService } from "@/services";
import type { GameState } from "@/game/snake";
import { GameBoard } from "@/components/GameBoard";

export const Route = createFileRoute("/watch/$id")({
  component: WatchOne,
});

function WatchOne() {
  const { id } = Route.useParams();
  const [state, setState] = useState<GameState | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    setEnded(false);
    return getService().watchGame(id, (s) => {
      if (s === null) setEnded(true);
      else setState(s);
    });
  }, [id]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/watch" className="text-sm text-muted-foreground hover:text-foreground">← Back to live games</Link>
      <div className="mt-4 grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex justify-center">
          {state ? <GameBoard state={state} /> : (
            <div className="rounded-lg border border-border bg-card p-16 text-muted-foreground">Loading…</div>
          )}
        </div>
        <aside className="space-y-3">
          {state && (
            <>
              <Stat label="Score" value={state.score} />
              <Stat label="Length" value={state.snake.length} />
              <Stat label="Mode" value={state.mode === "walls" ? "Walls" : "Wrap"} />
            </>
          )}
          {ended && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              This game has ended.
            </p>
          )}
        </aside>
      </div>
    </main>
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
