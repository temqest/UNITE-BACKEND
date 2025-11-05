"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { RequestsAPI } from "../../services/api";

export default function RequestsPage() {
  const { token, role, user } = useAuth();
  const router = useRouter();
  const [requestsList, setRequestsList] = useState<any[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoadingList(true);
      setError(null);
      try {
        if (role === 'stakeholder') {
          const stakeholderId = user?.Stakeholder_ID ?? user?.StakeholderId ?? user?.id ?? undefined;
          if (stakeholderId) {
            const res = await RequestsAPI.getByStakeholder(token, stakeholderId);
            const payload: any = res as any;
            setRequestsList(Array.isArray(payload.data) ? payload.data : payload.requests ?? payload.data ?? []);
          } else {
            setRequestsList([]);
          }
        } else if (role === 'coordinator') {
          const coordinatorId = user?.role_data?.coordinator_id ?? user?.Coordinator_ID ?? user?.id ?? undefined;
          if (coordinatorId) {
            const res = await RequestsAPI.getCoordinatorRequests(token, coordinatorId);
            const payload: any = res as any;
            setRequestsList(Array.isArray(payload.data) ? payload.data : payload.requests ?? payload.data ?? []);
          } else {
            setRequestsList([]);
          }
        } else if (role === 'admin') {
          const res = await RequestsAPI.getAll(token);
          const payload: any = res as any;
          setRequestsList(Array.isArray(payload.data) ? payload.data : payload.requests ?? payload.data ?? []);
        } else {
          // if role is not allowed, redirect to dashboard
          router.replace('/dashboard');
          return;
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load requests');
        setRequestsList([]);
      } finally {
        setLoadingList(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role, user]);

  if (!role) return null;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold text-red-600 mb-4">Requests</h1>
        {loadingList && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loadingList && (!requestsList || requestsList.length === 0) && <p className="text-sm text-gray-600">No requests found.</p>}

        {!loadingList && requestsList && requestsList.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="p-2">Title / Event ID</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {requestsList.map((r: any) => (
                  <tr key={r.Request_ID || r._id} className="border-t">
                    <td className="p-2">{r.event?.Event_Title ?? r.Event_Title ?? r.event?.Event_Title ?? r.Event_ID ?? r.Event_ID}</td>
                    <td className="p-2">{r.Status ?? r.status ?? 'Unknown'}</td>
                    <td className="p-2">{new Date(r.createdAt || r.created_at || r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
