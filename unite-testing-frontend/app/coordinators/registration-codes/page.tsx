"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";

export default function RegistrationCodesPage() {
  const { role, token, user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState(10);
  const [daysValid, setDaysValid] = useState(14);

  const base = process.env.NEXT_PUBLIC_API_BASE_URL;

  const load = async () => {
    if (!token || role !== 'coordinator') return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/coordinators/${user?.id}/registration-codes`, { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load codes');
      setItems(data?.data || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load registration codes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, role]);

  const createCode = async () => {
    if (!token || role !== 'coordinator') return;
    setError(null);
    setLoading(true);
    try {
      const expiresAt = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`${base}/coordinators/${user?.id}/registration-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify({ districtId: user?.role_data?.district_id, maxUses, expiresAt })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to create code');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to create code');
    } finally {
      setLoading(false);
    }
  };

  if (role !== 'coordinator') return null;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-red-600 mb-4">Stakeholder Invitations</h1>
        <div className="flex items-end gap-3 mb-4">
          <div>
            <label className="block text-sm mb-1">Max Uses</label>
            <input type="number" className="border px-3 py-2 rounded" value={maxUses} onChange={(e) => setMaxUses(parseInt(e.target.value || '1', 10))} />
          </div>
          <div>
            <label className="block text-sm mb-1">Valid (days)</label>
            <input type="number" className="border px-3 py-2 rounded" value={daysValid} onChange={(e) => setDaysValid(parseInt(e.target.value || '1', 10))} />
          </div>
          <button onClick={createCode} className="px-3 py-2 bg-red-600 text-white rounded">Generate Code</button>
        </div>
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="divide-y border rounded">
          {items.map((c: any) => (
            <li key={c._id} className="p-3">
              <p className="font-medium">{c.Code}</p>
              <p className="text-sm text-zinc-600">Uses: {c.Uses}/{c.Max_Uses} • Expires: {c.Expires_At ? new Date(c.Expires_At).toLocaleDateString() : 'N/A'}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


