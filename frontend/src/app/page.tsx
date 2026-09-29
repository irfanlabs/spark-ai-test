import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">
          Full stack assessment
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          AI-assisted appointment booking
        </h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          React frontend, Express API, PostgreSQL, JWT auth, WebSocket chat with OpenRouter
          integration (mock fallback when no API key).
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Create account
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-teal-700 hover:text-teal-900"
          >
            Go to dashboard →
          </Link>
        </div>
      </div>
    </main>
  );
}
