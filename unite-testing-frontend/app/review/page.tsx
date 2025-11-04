"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { RequestsAPI } from "../../services/api";

interface RequestItem {
  _id: string;
  title?: string;
  date?: string;
  location?: string;
  status?: string;
}

export default function ReviewPage() {
  const { token, role } = useAuth();
  const [data, setData] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await RequestsAPI.getPending(token);
      setData((res as any)?.data ?? (res as any) ?? []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  if (role !== 'admin' && role !== 'coordinator') return null;

  const act = async (id: string, action: 'approve' | 'reject' | 'reschedule') => {
    if (!token) return;
    await RequestsAPI.adminAction(token, id, action);
    await load();
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold text-red-600 mb-4">Request Review</h1>
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r._id} className="border rounded p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{r.title ?? 'Untitled'}</p>
                <p className="text-sm text-zinc-600">{r.date} • {r.location}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => act(r._id, 'approve')} className="px-3 py-1 bg-red-600 text-white rounded">Approve</button>
                <button onClick={() => act(r._id, 'reschedule')} className="px-3 py-1 border border-red-600 text-red-600 rounded">Reschedule</button>
                <button onClick={() => act(r._id, 'reject')} className="px-3 py-1 border border-red-600 text-red-600 rounded">Reject</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


