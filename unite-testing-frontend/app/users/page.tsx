"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { UsersAPI, StakeholdersAPI } from "../../services/api";
import { useRouter } from 'next/navigation';

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
        // Use combined users endpoint
        const res: any = await UsersAPI.listUsers(token);
        // res.data can be { coordinators, stakeholders }
        const data = res?.data ?? {};
        // flatten coordinators into expected table shape (take Staff object)
        const combined: any[] = [];
        if (Array.isArray(data.coordinators)) {
          for (const c of data.coordinators) {
            combined.push({
              type: 'coordinator',
              id: c.id || c.Coordinator_ID,
              First_Name: c.staff?.First_Name,
              Last_Name: c.staff?.Last_Name,
              Email: c.staff?.Email,
              Phone_Number: c.staff?.Phone_Number,
              District_Name: c.district?.District_Name || c.district?.District_Name
            });
          }
        }
        if (Array.isArray(data.stakeholders)) {
          for (const s of data.stakeholders) {
            combined.push({
              type: 'stakeholder',
              id: s.id || s.Stakeholder_ID,
              First_Name: s.first_name || s.First_Name,
              Last_Name: s.last_name || s.Last_Name,
              Email: s.email || s.Email,
              Phone_Number: s.phone || s.Phone_Number,
              District_Name: s.district_id || s.District_ID
            });
          }
        }
        setItems(combined);
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
  const router = useRouter();

  // Only admin and coordinator may access this page.
  if (role !== 'admin' && role !== 'coordinator') {
    // redirect client-side; router is available as a hook at top-level
    if (typeof window !== 'undefined') {
      router.replace('/dashboard');
    }
    return null;
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white border rounded-md p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">Coordinator Management</h1>
              <p className="text-sm text-zinc-500">{role === 'admin' ? 'Admin view' : 'Coordinator view'}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input placeholder="Search user..." className="px-4 py-2 border rounded-full w-64" />
              </div>
              <button className="px-3 py-2 border rounded text-sm">Export</button>
              <button className="px-3 py-2 border rounded text-sm">Quick Filter</button>
              <button className="px-3 py-2 border rounded text-sm">Advanced Filter</button>
              {role === 'admin' && (
                <Link href="/coordinators/new" className="px-4 py-2 bg-zinc-900 text-white rounded">Add a coordinator</Link>
              )}
            </div>
          </div>

          {loading && <p>Loading...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-sm text-zinc-500">
                  <th className="p-3 w-12"> </th>
                  <th className="p-3">Staff</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone Number</th>
                  <th className="p-3">District</th>
                  <th className="p-3">Province</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => {
                  const id = it.Coordinator_ID || it.Stakeholder_ID || it.id || it._id;
                  const staff = it.Staff || it;
                  const district = it.District || { District_Name: it?.District_Name ?? it?.District_ID };
                  return (
                    <tr key={id} className="border-t text-sm">
                      <td className="p-3 align-top">
                        <input type="checkbox" className="w-4 h-4" />
                      </td>
                      <td className="p-3 align-top">
                        <div className="font-medium">{staff?.First_Name} {staff?.Last_Name}</div>
                      </td>
                      <td className="p-3 align-top">{staff?.Email}</td>
                      <td className="p-3 align-top">{staff?.Phone_Number || staff?.Phone}</td>
                      <td className="p-3 align-top">{district?.District_Name || it?.District_Name || it?.district}</td>
                      <td className="p-3 align-top">{it?.Province_Name || it?.Province || '—'}</td>
                      <td className="p-3 align-top">
                        <button className="px-2 py-1 rounded border">•••</button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-sm text-zinc-500">No coordinators found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


