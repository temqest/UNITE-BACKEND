"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { UsersAPI, StakeholdersAPI } from "../../services/api";

export default function UsersPage() {
  const { role, token, user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (role === 'admin') {
        const res: any = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/coordinators`, { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to load coordinators');
        setItems(data?.data || []);
      } else if (role === 'coordinator') {
        const params = new URLSearchParams();
        if (user?.role_data?.district_id) params.set('district_id', user.role_data.district_id);
        const res: any = await StakeholdersAPI.list(token, params);
        const r: any = res as any;
        setItems(Array.isArray(r?.data) ? r.data : []);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, role]);

  // Only admin and coordinator may access this page.
  if (role !== 'admin' && role !== 'coordinator') {
    if (typeof window !== 'undefined') {
      const { useRouter } = require('next/navigation');
      const router = useRouter();
      router.replace('/dashboard');
    }
    return null;
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-red-600">Users</h1>
          {role === 'admin' && (
            <Link href="/coordinators/new" className="px-3 py-2 border border-red-600 text-red-600 rounded">Create Coordinator</Link>
          )}
          {role === 'coordinator' && (
            <Link href="/coordinators/registration-codes" className="px-3 py-2 border border-red-600 text-red-600 rounded">Invite Stakeholders</Link>
          )}
        </div>
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="divide-y border rounded">
          {items.map((it: any) => (
            <li key={it.Coordinator_ID || it.Stakeholder_ID} className="p-3">
              {role === 'admin' ? (
                <div>
                  <p className="font-medium">{it?.Staff?.First_Name} {it?.Staff?.Last_Name}</p>
                  <p className="text-sm text-zinc-600">{it?.Staff?.Email} • District: {it?.District?.District_Name || it?.District_ID}</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium">{it.First_Name} {it.Last_Name}</p>
                  <p className="text-sm text-zinc-600">{it.Email} • {it.Organization_Institution || 'Stakeholder'}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


