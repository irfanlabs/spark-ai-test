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
    <main className="mx-auto flex h-dvh max-h-dvh max-w-6xl flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
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

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[1.4fr_1fr] lg:grid-rows-1 lg:gap-6">
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatPanel onBooked={() => setRefreshKey((k) => k + 1)} />
        </div>
        <div className="min-h-0 max-h-[36dvh] space-y-4 overflow-y-auto pb-2 lg:max-h-none lg:space-y-6">
          <AppointmentForm onCreated={() => setRefreshKey((k) => k + 1)} />
          <AppointmentList refreshKey={refreshKey} />
        </div>
      </div>
    </main>
  );
}
