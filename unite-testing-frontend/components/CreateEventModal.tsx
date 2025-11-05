"use client";

import { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import EventRequestForm from "./EventRequestForm";

function buildCalendar(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number | null; date?: Date }> = [];
  for (let i = 0; i < startDay; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, month, d) });
  return cells;
}

export default function CreateEventModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedDate(undefined);
      const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth());
    }
  }, [open]);

  const cells = useMemo(() => buildCalendar(year, month), [year, month]);

  if (!open) return null;

  return (
    typeof window !== 'undefined' ? ReactDOM.createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white w-full max-w-3xl rounded shadow-lg p-6 z-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Create an event</h3>
            <button onClick={onClose} className="text-sm text-slate-600">Close</button>
          </div>

          {step === 1 && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">{new Date(year, month).toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
                  <div className="flex gap-2">
                    <button onClick={() => { setMonth(m => (m - 1 + 12) % 12); if (month === 0) setYear(y => y - 1); }} className="px-2 py-1 border rounded">‹</button>
                    <button onClick={() => { setMonth(m => (m + 1) % 12); if (month === 11) setYear(y => y + 1); }} className="px-2 py-1 border rounded">›</button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-xs text-slate-600 mb-2">
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center">{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {cells.map((c, i) => (
                    <button key={i} disabled={!c.day} onClick={() => { if (c.date) { setSelectedDate(c.date.toISOString().slice(0,10)); setStep(2); } }} className={`h-10 flex items-center justify-center ${c.day? 'bg-white hover:bg-slate-100' : 'bg-transparent'} rounded`}>{c.day ?? ''}</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3">
                  <div className="text-sm text-slate-700">Selected date</div>
                  <div className="mt-1 font-medium">{selectedDate ?? 'Pick a date from the calendar'}</div>
                </div>
                <div className="text-sm text-slate-600">After selecting a date you'll fill in the event details.</div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="mb-4 text-sm text-slate-600">Selected date: <span className="font-medium">{selectedDate}</span></div>
              <EventRequestForm initialDate={selectedDate} onSuccess={() => { if (onCreated) onCreated(); onClose(); }} />
              <div className="mt-4">
                <button onClick={() => setStep(1)} className="text-sm text-slate-600">← Change date</button>
              </div>
            </div>
          )}
        </div>
      </div>, document.body
    ) : null
  );
}
