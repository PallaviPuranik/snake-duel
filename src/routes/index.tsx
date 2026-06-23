import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <section className="text-center">
        <h1 className="font-mono text-5xl font-bold tracking-tight text-primary md:text-7xl">
          Snake Arena
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Classic snake — two flavors. Smash walls or wrap through them.
          Climb the leaderboard. Watch others stake their claim.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/play" className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90">
            Play now
          </Link>
          <Link to="/watch" className="rounded-md border border-border bg-card px-6 py-3 font-medium hover:bg-muted">
            Watch others
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-2">
        <Card title="Walls mode" desc="One wrong move and it's over. Pure precision." emoji="🧱" />
        <Card title="Wrap mode" desc="Edges loop. The board has no end — just your tail." emoji="🌀" />
      </section>
    </main>
  );
}

function Card({ title, desc, emoji }: { title: string; desc: string; emoji: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="text-3xl">{emoji}</div>
      <h3 className="mt-3 font-mono text-xl font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
