"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { RequestsAPI } from "../../services/api";

type PendingSummary = {
  requestId: string;
  requester?: string; // email or contact
  district?: string;
  coordinatorName?: string;
  status?: string;
  startDateIso?: string;
};

export default function ReviewPage() {
  const { token, role, user } = useAuth();
  const [items, setItems] = useState<PendingSummary[]>([]);
  // Debug logging to help diagnose blank page / hydration issues
  try {
    console.log('[ReviewPage] init', { role, tokenPresent: !!token, user: user ? { id: user?.id, email: user?.Email ?? user?.email } : null });
  } catch (e) {}
  // helper to format ISO date to 'Oct 13, 2025'
  const formatDate = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return '';
    }
  };

  const simplifyStatus = (s?: string) => {
    if (!s) return 'Pending';
    const key = (s || '').toString().toLowerCase();
    if (key.includes('admin')) return 'Pending Admin';
    if (key.includes('accepted') || key.includes('approved')) return 'Accepted';
    if (key.includes('rejected') || key.includes('declined')) return 'Rejected';
    if (key.includes('resched') || key.includes('rescheduled')) return 'Rescheduled';
    if (key.includes('confirmed')) return 'Confirmed';
    return s;
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  

  const load = async () => {
    if (!token) return;
    console.log('[ReviewPage] load start', { role, tokenPresent: !!token });
    setLoading(true);
    setError(null);
    try {
      let list: any[] = [];

      if (role === 'admin' || role === 'coordinator') {
        const res: any = await RequestsAPI.getPending(token);
        list = (res?.data ?? res) as any[];
        console.log('[ReviewPage] getPending response', { raw: res, len: Array.isArray(list) ? list.length : 'n/a' });

        if ((!list || list.length === 0) && role === 'admin') {
          try {
            const allRes: any = await RequestsAPI.getAll(token);
            list = (allRes?.data ?? allRes) as any[];
          } catch (e) {
            // ignore
          }
        }

        if ((!list || list.length === 0) && role === 'coordinator') {
          try {
            const coordinatorId = user?.role_data?.coordinator_id ?? user?.Coordinator_ID ?? user?.id ?? undefined;
            if (coordinatorId) {
              const coordRes: any = await RequestsAPI.getCoordinatorRequests(token, coordinatorId);
              list = (coordRes?.data ?? coordRes?.requests ?? coordRes) as any[];
            }
          } catch (e) {
            // ignore
          }
        }
      } else if (role === 'stakeholder') {
        // Load only requests made by this stakeholder
        const stakeholderId =
          user?.role_data?.stakeholder_id ?? user?.role_data?.Stakeholder_ID ?? user?.Stakeholder_ID ?? user?.StakeholderId ?? user?.id ?? user?._id;
        if (!stakeholderId) {
          setError('Unable to determine stakeholder id from profile');
          setItems([]);
          return;
        }
        try {
          const res: any = await RequestsAPI.getByStakeholder(token, stakeholderId);
          list = (res?.data ?? res?.requests ?? res) as any[];
          console.log('[ReviewPage] getByStakeholder response', { raw: res, len: Array.isArray(list) ? list.length : 'n/a' });
        } catch (e) {
          // propagate
          throw e;
        }
      }

      // Map/normalize list into PendingSummary items. If the item already
      // contains enough detail use it directly; otherwise fetch full details
      // by id.
      const details = await Promise.all(
        list.map(async (rq) => {
          const id = rq.Request_ID ?? rq.RequestId ?? rq._id ?? rq.id;
          try {
            // If the list item already contains event or stakeholder info, avoid extra fetch
            const hasDetail = !!(rq.event || rq.MadeByStakeholder || rq.stakeholder || rq.Status || rq.Coordinator);
            let requestObj: any = rq;
            if (!hasDetail) {
              const det: any = await RequestsAPI.getById(token, id);
              requestObj = det?.data ?? det?.request ?? det ?? rq;
            }

            const event = requestObj?.event ?? requestObj;
            const coordinator = requestObj?.coordinator ?? requestObj?.Coordinator ?? requestObj?.CoordinatorObj;

            const requesterName =
              requestObj?.MadeByStakeholder?.First_Name && requestObj?.MadeByStakeholder?.Last_Name
                ? `${requestObj.MadeByStakeholder.First_Name} ${requestObj.MadeByStakeholder.Last_Name}`
                : requestObj?.stakeholder?.First_Name && requestObj?.stakeholder?.Last_Name
                ? `${requestObj.stakeholder.First_Name} ${requestObj.stakeholder.Last_Name}`
                : event?.Requester_First_Name && event?.Requester_Last_Name
                ? `${event.Requester_First_Name} ${event.Requester_Last_Name}`
                : event?.ContactName || event?.FullName || event?.Email || 'Unknown';

            const districtName =
              coordinator?.District_Name || coordinator?.districtName || coordinator?.District?.Name || event?.District_Name || event?.DistrictName || rq?.District_Name || rq?.District_ID || 'Unknown';

            const coordinatorName = coordinator?.staff
              ? `${coordinator.staff.First_Name} ${coordinator.staff.Last_Name}`
              : coordinator?.First_Name && coordinator?.Last_Name
              ? `${coordinator.First_Name} ${coordinator.Last_Name}`
              : coordinator?.Coordinator_Name || coordinator?.Coordinator_ID || 'Unknown';

            return {
              requestId: id,
              requester: requesterName,
              district: districtName,
              coordinatorName,
              status: requestObj?.Status ?? requestObj?.status ?? rq.Status ?? 'Pending',
              startDateIso: event?.Start_Date || event?.StartDate || event?.startDate || ''
            } as PendingSummary;
          } catch (err) {
            return {
              requestId: id,
              requester: 'Unknown',
              district: rq?.District_ID ?? 'Unknown',
              coordinatorName: rq?.Coordinator_ID ?? 'Unknown',
              status: rq?.Status ?? 'Pending'
            } as PendingSummary;
          }
        })
      );

      setItems(details);
      console.log('[ReviewPage] set items', { count: details.length });
    } catch (e: any) {
      console.error('[ReviewPage] load error', e);
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, role, user?.id]);

  // While auth is initializing, show a loading placeholder to avoid hydration
  // mismatches and blank screens.
  if (!role) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-semibold text-red-600 mb-4">Request Review</h1>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-semibold text-red-600 mb-4">Request Review</h1>
        
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="overflow-x-auto border rounded">
          <table className="w-full table-auto">
            <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left p-3">Requested By</th>
                  <th className="text-left p-3">District</th>
                  <th className="text-left p-3">Coordinator</th>
                  <th className="text-left p-3">Start Date</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Action</th>
                </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.requestId} className="border-t">
                    <td className="p-3 align-top">{it.requester}</td>
                    <td className="p-3 align-top">{it.district}</td>
                    <td className="p-3 align-top">{it.coordinatorName}</td>
                    <td className="p-3 align-top">{formatDate(it.startDateIso)}</td>
                    <td className="p-3 align-top">{simplifyStatus(it.status)}</td>
                  <td className="p-3 align-top">
                    <Link href={`/review/${it.requestId}`} className="px-3 py-1 bg-red-600 text-white rounded">Review Request</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


