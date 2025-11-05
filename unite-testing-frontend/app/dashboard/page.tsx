"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { CalendarAPI } from "../../services/api";
import CreateEventModal from "../../components/CreateEventModal";

export default function DashboardPage() {
  const { role, logout, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!role) router.replace('/login');
  }, [role, router]);
  if (!role) return null;

  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [errorEvents, setErrorEvents] = useState<string | null>(null);
  // Dashboard will show the month's events (use same logic as calendar page)
  const [page, setPage] = useState(1);
  const [limit] = useState(6);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const loadEvents = async () => {
    if (!role) return;
    if (!token) return;
    setLoadingEvents(true);
    setErrorEvents(null);
    try {
      // Use the same month-based calendar logic as the calendar page so the
      // dashboard shows the same events.
      const params = new URLSearchParams();
      const today = new Date();
      params.set('year', String(today.getFullYear()));
      params.set('month', String(today.getMonth() + 1));
      const res: any = await CalendarAPI.month(token ?? '', params);
      const payload: any = res as any;
      const list = Array.isArray(payload?.data?.events) ? payload.data.events : Array.isArray(payload?.data) ? payload.data : [];
      setEvents(list);
      // Month response is not paginated here — keep totalPages as 1
      setTotalPages(1);
    } catch (e: any) {
      setErrorEvents(e?.message || 'Failed to load events');
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, token]);

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="flex-1 p-6">
        <div className="max-w-full mx-auto">
          <header className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-extrabold">Campaign</h1>
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-600">Bicol Medical Center</div>
              <button onClick={() => setModalOpen(true)} className="px-3 py-2 bg-black text-white rounded">Create an event</button>
            </div>
          </header>

          <div className="mb-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="px-3 py-2 bg-white rounded shadow">All</div>
              <div className="px-3 py-2 text-slate-500">Approved</div>
              <div className="px-3 py-2 text-slate-500">Pending</div>
              <div className="px-3 py-2 text-slate-500">Rejected</div>
              <div className="px-3 py-2 text-slate-500">Finished</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button className="px-3 py-2 text-sm bg-white rounded shadow">Export</button>
              <button className="px-3 py-2 text-sm bg-white rounded shadow">Quick Filter</button>
              <button className="px-3 py-2 text-sm bg-white rounded shadow">Advanced Filter</button>
            </div>
          </div>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar column */}
            <div className="lg:col-span-1 bg-white rounded shadow p-4">
              <h3 className="text-sm font-medium mb-3">January 2025</h3>
              <div className="grid grid-cols-7 gap-2 text-sm text-slate-600">
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d)=> (
                  <div key={d} className="text-center font-medium">{d}</div>
                ))}
                {Array.from({length: 35}).map((_,i)=> (
                  <div key={i} className={`h-10 flex items-center justify-center ${i===16?'bg-black text-white rounded-full':''}`}>{i+1}</div>
                ))}
              </div>
            </div>

            {/* Events column span 2 */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {loadingEvents && <div>Loading events…</div>}
              {!loadingEvents && events.length === 0 && <div className="text-sm text-slate-600">No events found.</div>}
              {events.map((ev: any) => (
                <article key={ev.Event_ID ?? ev.id} className="bg-white rounded shadow p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold">{ev.Event_Title ?? ev.title ?? 'Event'}</h4>
                      <div className="text-sm text-slate-500">{ev.MadeByStakeholderName ?? ev.Organization ?? 'Local Government Unit'} • {ev.District_Name ?? ev.District ?? ''} — <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">{ev.Status ?? ev.status ?? 'Approved'}</span></div>
                      <div className="mt-3 text-sm text-slate-600">Location — {ev.Location ?? ev.Address ?? ''}</div>
                    </div>
                    <div className="text-sm text-slate-400">{new Date(ev.Start_Date ?? ev.startDate ?? ev.StartDate).toLocaleString()}</div>
                  </div>
                </article>
              ))}

              {totalPages > 1 && (
                <div className="flex items-center gap-2 justify-end mt-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1 border rounded">Prev</button>
                  <div className="text-sm">Page {page} / {totalPages}</div>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 border rounded">Next</button>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      <CreateEventModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => { loadEvents(); }} />
    </div>
  );
}


