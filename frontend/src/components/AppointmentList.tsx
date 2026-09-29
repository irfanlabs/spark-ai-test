"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Appointment } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function formatRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleString()} – ${e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function AppointmentList({ refreshKey }: { refreshKey: number }) {
  const { token } = useAuth();
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAppointments(token);
      setItems(res.appointments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Your appointments</h3>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs font-medium text-teal-700 hover:text-teal-900"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-slate-500">No appointments yet.</p>
      )}

      <ul className="space-y-2">
        {items.map((appt) => (
          <li
            key={appt.id}
            className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{appt.title}</p>
                <p className="text-xs text-slate-600">{formatRange(appt.starts_at, appt.ends_at)}</p>
                {appt.description && (
                  <p className="mt-1 text-xs text-slate-500">{appt.description}</p>
                )}
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600 ring-1 ring-slate-200">
                {appt.status}
              </span>
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
              via {appt.source}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
