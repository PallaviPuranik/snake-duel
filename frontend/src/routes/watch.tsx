import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getService, type ActiveGame } from "@/services";

export const Route = createFileRoute("/watch")({
  component: WatchLayout,
});

function WatchLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/watch") return <Outlet />;
  return <WatchList />;
}

function WatchList() {
  const [games, setGames] = useState<ActiveGame[]>([]);
  useEffect(() => {
    return getService().onActiveGamesChange(setGames);
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-mono text-2xl font-bold">Live games</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Watch other players in real time. (Bots are included for demo purposes.)
      </p>

      <div className="mt-6 space-y-2">
        {games.length === 0 ? (
          <p className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nobody's playing right now.
          </p>
        ) : (
          games.map((g) => (
            <Link
              key={g.id}
              to="/watch/$id"
              params={{ id: g.id }}
              className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 hover:bg-muted"
            >
              <div>
                <div className="font-medium">@{g.username}</div>
                <div className="text-xs text-muted-foreground">
                  {g.mode === "walls" ? "🧱 Walls" : "🌀 Wrap"} · started {Math.round((Date.now() - g.startedAt) / 1000)}s ago
                </div>
              </div>
              <div className="font-mono text-2xl font-bold text-primary">{g.score}</div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
