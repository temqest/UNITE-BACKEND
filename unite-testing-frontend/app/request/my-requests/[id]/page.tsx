"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../contexts/AuthContext";
import { RequestsAPI } from "../../../../services/api";

export default function MyRequestDetail() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const { token, role, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token || !id) return;
      setLoading(true);
      try {
        const res: any = await RequestsAPI.getById(token, id);
        const d = res?.data ?? res?.request ?? res;
        setDetail(d);
      } catch (e: any) {
        setError(e?.message || 'Failed to load request');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, id]);

  if (role !== 'stakeholder') return null;

  const doConfirm = async (action: 'Accepted') => {
    if (!token || !id) return;
    setActionLoading(true);
    setError(null);
    try {
      const stakeholderId = user?.Stakeholder_ID ?? user?.id ?? null;
      if (!stakeholderId) throw new Error('Stakeholder ID not available');
      await RequestsAPI.stakeholderConfirm(token, id, action, stakeholderId);
      const res: any = await RequestsAPI.getById(token, id);
      const d = res?.data ?? res?.request ?? res;
      setDetail(d);
    } catch (e: any) {
      setError(e?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-red-600 mb-4">My Request</h1>
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {detail && (
          <div className="border rounded p-4 space-y-4">
            <div>
              <h2 className="font-medium text-lg">{detail?.event?.Event_Title ?? 'Untitled'}</h2>
              <p className="text-sm text-zinc-600">{detail?.event?.Location} • {detail?.event?.Start_Date ? new Date(detail.event.Start_Date).toLocaleString() : ''}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium">Status</h3>
              <p className="text-sm">{detail?.Status}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium">Admin/Coordinator Decision</h3>
              <p className="text-sm">{detail?.AdminAction ?? detail?.CoordinatorFinalAction ?? 'Pending'}</p>
            </div>

            <div className="flex gap-2">
              {/* Show accept only when admin/coordinator has acted and stakeholder hasn't already confirmed */}
              { (detail?.AdminAction || detail?.CoordinatorFinalAction) && !detail?.StakeholderFinalAction && (
                <button onClick={() => doConfirm('Accepted')} disabled={actionLoading} className="px-3 py-1 bg-red-600 text-white rounded">Accept Review</button>
              ) }
              {/* If stakeholder already confirmed, show status */}
              { detail?.StakeholderFinalAction && (
                <span className="text-sm text-green-700">You {detail.StakeholderFinalAction}</span>
              ) }
            </div>

            <div>
              <button onClick={() => router.back()} className="text-sm text-zinc-600">Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
