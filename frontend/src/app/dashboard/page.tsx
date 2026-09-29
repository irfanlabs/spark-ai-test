"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppointmentForm } from "@/components/AppointmentForm";
import { AppointmentList } from "@/components/AppointmentList";
import { ChatPanel } from "@/components/ChatPanel";
import { useAuth } from "@/lib/auth";

export default function DashboardPage() {
  const { user, loading, logout, token } = useAuth();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  if (loading || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading dashboard…
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xs font-semibold uppercase tracking-widest text-teal-700">
            Spark Book
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600">
            Signed in as {user?.fullName ?? user?.email}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ChatPanel onBooked={() => setRefreshKey((k) => k + 1)} />
        <div className="space-y-6">
          <AppointmentForm onCreated={() => setRefreshKey((k) => k + 1)} />
          <AppointmentList refreshKey={refreshKey} />
        </div>
      </div>
    </main>
  );
}
