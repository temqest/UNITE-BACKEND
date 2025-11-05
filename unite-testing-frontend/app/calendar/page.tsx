"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { CalendarAPI } from "../../services/api";

function startOfWeek(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  c.setHours(0, 0, 0, 0);
  return c;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state: week or month view and the current focused date
  const [view, setView] = useState<"month" | "week">("month");
  const [focusDate, setFocusDate] = useState<Date>(new Date());

  // Fetch the current month events whenever token or focus month changes
  useEffect(() => {
    const run = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        const year = focusDate.getFullYear();
        const month = focusDate.getMonth() + 1;
        params.set("year", String(year));
        params.set("month", String(month));
        const res = await CalendarAPI.month(token, params);
        const r: any = res as any;
        const arr = Array.isArray(r?.data?.events) ? r.data.events : Array.isArray(r?.data) ? r.data : [];
        setItems(arr);
      } catch (e: any) {
        setError(e?.message || "Failed to load calendar");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token, focusDate]);

  // Group events by ISO date string (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const ev of items) {
      const raw = ev.Start_Date ?? ev.startDate ?? ev.StartDate ?? ev.date ?? ev.Date;
      const d = raw ? new Date(raw) : null;
      if (!d || isNaN(d.getTime())) continue;
      const key = isoDate(d);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [items]);

  // Helpers for navigation
  const goPrev = () => {
    const d = new Date(focusDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setFocusDate(d);
  };
  const goNext = () => {
    const d = new Date(focusDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setFocusDate(d);
  };

  const weekStart = startOfWeek(focusDate);
  const weekDates = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-red-600">Calendar</h1>
            <div className="text-sm text-slate-600">Bicol Medical Center</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white rounded shadow px-2">
              <button onClick={() => setView("week")} className={`px-3 py-1 ${view === "week" ? "bg-red-600 text-white rounded" : "text-slate-700"}`}>Week</button>
              <button onClick={() => setView("month")} className={`px-3 py-1 ${view === "month" ? "bg-red-600 text-white rounded" : "text-slate-700"}`}>Month</button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={goPrev} className="px-3 py-1 border rounded">‹</button>
              <div className="px-3 text-sm">{view === "month" ? focusDate.toLocaleString(undefined, { month: "long", year: "numeric" }) : `${weekDates[0].toLocaleDateString()} - ${weekDates[6].toLocaleDateString()}`}</div>
              <button onClick={goNext} className="px-3 py-1 border rounded">›</button>
            </div>

            <div className="ml-4 flex items-center gap-2">
              <button className="px-3 py-1 bg-white rounded shadow">Export</button>
              <button className="px-3 py-1 bg-white rounded shadow">Quick Filter</button>
              <button className="px-3 py-1 bg-white rounded shadow">Advanced Filter</button>
              <button className="px-3 py-1 bg-black text-white rounded">Create an event</button>
            </div>
          </div>
        </header>

        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {view === "week" ? (
          <div className="bg-white rounded shadow p-4">
            <div className="grid grid-cols-7 gap-4 text-center">
              {weekDates.map((d) => {
                const key = isoDate(d);
                const evs = eventsByDate[key] ?? [];
                const isToday = isoDate(new Date()) === key;
                return (
                  <div key={key} className="border rounded p-3 h-48 flex flex-col">
                    <div className="flex items-center justify-center">
                      <div className={`w-8 h-8 flex items-center justify-center ${isToday ? 'bg-red-600 text-white rounded-full' : ''}`}>{d.getDate()}</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                    <div className="mt-3 flex-1 overflow-auto text-left">
                      {evs.length === 0 && <div className="text-xs text-slate-400">No events</div>}
                      {evs.map((ev: any) => (
                        <div key={ev.Event_ID ?? ev.id} className="mb-2 p-2 rounded bg-slate-50 border text-xs">
                          <div className="font-medium">{ev.Event_Title ?? ev.title ?? 'Event'}</div>
                          <div className="text-xs text-slate-500">{ev.Location}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Month view: simple month grid similar to previous implementation
          <div className="bg-white rounded shadow p-4">
            <h2 className="text-sm font-medium mb-3">{focusDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <div className="grid grid-cols-7 gap-2 text-sm text-slate-600">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d)=> (
                <div key={d} className="text-center font-medium">{d}</div>
              ))}
              {
                // build days for month with leading blanks
                (() => {
                  const year = focusDate.getFullYear();
                  const month = focusDate.getMonth();
                  const first = new Date(year, month, 1);
                  const lead = first.getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const cells: React.ReactNode[] = [];
                  for (let i = 0; i < lead; i++) cells.push(<div key={`b-${i}`} />);
                  for (let d = 1; d <= daysInMonth; d++) {
                    const cur = new Date(year, month, d);
                    const key = isoDate(cur);
                    const evs = eventsByDate[key] ?? [];
                    cells.push(
                      <div key={key} className={`h-14 p-2 rounded ${evs.length ? 'bg-slate-50' : ''}`}>
                        <div className="text-sm font-medium">{d}</div>
                        {evs.slice(0,2).map((ev:any, idx:number) => (
                          <div key={idx} className="text-xs text-slate-600 truncate">{ev.Event_Title ?? ev.title}</div>
                        ))}
                      </div>
                    );
                  }
                  return cells;
                })()
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


