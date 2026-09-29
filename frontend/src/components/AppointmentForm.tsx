"use client";

import { FormEvent, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Props = {
  onCreated?: () => void;
};

export function AppointmentForm({ onCreated }: Props) {
  const { token } = useAuth();
  const [title, setTitle] = useState("Consultation");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !startsAt) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + durationMin * 60 * 1000);
      await api.createAppointment(token, {
        title,
        description: description || undefined,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        source: "form",
      });
      setMessage("Appointment created.");
      onCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create appointment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900">Book with form</h3>
      <p className="text-xs text-slate-500">
        Fallback when chat input is incomplete or you prefer structured booking.
      </p>

      <label className="block text-xs font-medium text-slate-700">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          required
        />
      </label>

      <label className="block text-xs font-medium text-slate-700">
        Notes
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-xs font-medium text-slate-700">
        Start
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          required
        />
      </label>

      <label className="block text-xs font-medium text-slate-700">
        Duration (minutes)
        <input
          type="number"
          min={15}
          step={15}
          value={durationMin}
          onChange={(e) => setDurationMin(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      {message && <p className="text-xs text-emerald-700">{message}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Create appointment"}
      </button>
    </form>
  );
}
