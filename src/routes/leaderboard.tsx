import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getService, type LeaderboardEntry } from "@/services";
import type { Mode } from "@/game/snake";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const [mode, setMode] = useState<Mode>("walls");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const svc = getService();
    let active = true;
    svc.getLeaderboard(mode).then((e) => { if (active) setEntries(e); });
    const off = svc.onLeaderboardChange(mode, setEntries);
    return () => { active = false; off(); };
  }, [mode]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-mono text-2xl font-bold">Leaderboard</h1>
        <div className="inline-flex rounded-md border border-border bg-card p-1 text-sm">
          {(["walls", "wrap"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                "rounded-sm px-3 py-1.5 " +
                (mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {m === "walls" ? "🧱 Walls" : "🌀 Wrap"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No scores yet. Be the first!</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left font-mono text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-16 px-4 py-3">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">@{e.username}</td>
                  <td className="px-4 py-3 text-right font-mono text-primary">{e.score}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{timeAgo(e.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function timeAgo(t: number) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
