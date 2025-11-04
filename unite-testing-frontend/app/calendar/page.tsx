"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { CalendarAPI } from "../../services/api";

export default function CalendarPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        const today = new Date();
        params.set('year', String(today.getFullYear()));
        params.set('month', String(today.getMonth() + 1));
        const res = await CalendarAPI.month(token, params);
        const r: any = res as any;
        const arr = Array.isArray(r?.data?.events) ? r.data.events : [];
        setItems(arr);
      } catch (e: any) {
        setError(e?.message || 'Failed to load calendar');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token]);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-semibold text-red-600 mb-4">Global Calendar</h1>
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((ev: any) => (
            <div key={ev.Event_ID} className="border rounded p-4">
              <p className="font-medium">{ev.Event_Title ?? 'Event'}</p>
              <p className="text-sm text-zinc-600">{new Date(ev.Start_Date).toLocaleDateString()} • {ev.Location}</p>
              <p className="text-sm">Status: {ev.Status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


