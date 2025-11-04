"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { NotificationsAPI } from "../../services/api";

export default function NotificationsPage() {
  const { token, role, user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (role === 'admin') {
        params.set('recipientId', user?.id);
        params.set('recipientType', 'Admin');
      } else if (role === 'coordinator') {
        params.set('recipientId', user?.id);
        params.set('recipientType', 'Coordinator');
      }
      const res = await NotificationsAPI.list(token, params);
      setItems((res as any)?.data ?? []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, role]);

  const markAll = async () => {
    if (!token || !user?.id) return;
    await NotificationsAPI.markAllRead(token, user.id, role === 'admin' ? 'Admin' : 'Coordinator');
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


