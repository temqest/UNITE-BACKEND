"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { NotificationsAPI } from "../../services/api";

export default function NotificationsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await NotificationsAPI.list(token);
      setItems((res as any)?.data ?? (res as any) ?? []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const markAll = async () => {
    if (!token) return;
    await NotificationsAPI.markAllRead(token);
    await load();
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-red-600">Notifications</h1>
          <button onClick={markAll} className="px-3 py-1 border border-red-600 text-red-600 rounded">Mark all read</button>
        </div>
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="space-y-3">
          {items.map((n: any) => (
            <li key={n._id} className="border rounded p-3">
              <p className="font-medium">{n.title ?? 'Notification'}</p>
              <p className="text-sm text-zinc-600">{n.message}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


