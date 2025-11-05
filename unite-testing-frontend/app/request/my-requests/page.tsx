"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../contexts/AuthContext";
import { RequestsAPI } from "../../../services/api";

export default function MyRequestsPage() {
  const { token, role, user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  

  useEffect(() => {
    const load = async () => {
      if (!token || role !== 'stakeholder') return;
      setLoading(true);
      setError(null);
      try {
        const stakeholderId = user?.Stakeholder_ID ?? user?.id ?? user?.StakeholderId;
        if (!stakeholderId) throw new Error('Stakeholder ID not available');
        const res: any = await RequestsAPI.getByStakeholder(token, stakeholderId);
  const data = (res?.data ?? res?.requests ?? res) as any[];
  setItems(data || []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load your requests');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, role, user]);

  if (role !== 'stakeholder') return null;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold text-red-600 mb-4">My Requests</h1>
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.Request_ID || r._id} className="border rounded p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-medium">{r.event?.Event_Title || 'Untitled'}</h2>
                  <p className="text-sm text-zinc-600">{r.event?.Location} • {r.event?.Start_Date ? new Date(r.event.Start_Date).toLocaleString() : ''}</p>
                </div>
                <div className="text-sm text-zinc-600">{r.Status}</div>
              </div>
              <div className="mt-2 flex gap-2">
                <Link href={`/request/my-requests/${r.Request_ID || r._id}`} className="px-3 py-1 bg-red-600 text-white rounded">View</Link>
              </div>
            </div>
          ))}
          {items.length === 0 && !loading && <p className="text-sm text-zinc-600">You have no requests yet.</p>}
        </div>
      </div>
    </div>
  );
}
