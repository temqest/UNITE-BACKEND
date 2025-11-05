"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useAuth } from "../../../contexts/AuthContext";
import { RequestsAPI } from "../../../services/api";

export default function RequestDetailPage(/* props omitted because client components should use hooks for params */) {
  const params = useParams();
  const id = params?.id as string | undefined;
  const { token, role, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reschedDate, setReschedDate] = useState<string>("");
  const [staffMembers, setStaffMembers] = useState<Array<{ FullName: string; Role: string }>>([]);
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffRole, setNewStaffRole] = useState<string>('');
  const [staffLoading, setStaffLoading] = useState(false);

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

  if (role !== 'admin' && role !== 'coordinator') return null;

  const doAction = async (action: 'approve'|'reject'|'reschedule') => {
  if (!token || !id) return;
    setActionLoading(true);
    setError(null);
    try {
      const body: any = {};
      if (action === 'reschedule') {
        if (!reschedDate) throw new Error('Please pick a reschedule date');
        body.rescheduledDate = reschedDate;
      }

  // Determine adminId from the logged-in user object. Try multiple common fields.
  const adminId = user?.id ?? user?.ID ?? user?.Admin_ID ?? user?.AdminId ?? user?.staff_id ?? null;
  // Map client action names to backend enum values
  const mappedAction = action === 'approve' ? 'Accepted' : action === 'reject' ? 'Rejected' : 'Rescheduled';
      if (!adminId) throw new Error('Admin ID not available in current user context');
  await RequestsAPI.adminAction(token, id, mappedAction, body?.note ?? undefined, adminId, body?.rescheduledDate);
      // Reload details
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
        <h1 className="text-xl font-semibold text-red-600 mb-4">Request Review</h1>
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {detail && (
          <div className="border rounded p-4 space-y-4">
            <div>
              <h2 className="font-medium text-lg">{detail?.event?.Event_Title ?? 'Untitled'}</h2>
              <p className="text-sm text-zinc-600">{detail?.event?.Location} • {detail?.event?.Start_Date ? new Date(detail.event.Start_Date).toLocaleString() : ''}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <h3 className="text-sm font-medium">Requested By</h3>
                <p className="text-sm">{detail?.event?.Email ?? 'Unknown'}</p>
                <p className="text-sm text-zinc-600">{detail?.event?.Phone_Number}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Coordinator / District</h3>
                <p className="text-sm">{detail?.coordinator?.staff ? `${detail.coordinator.staff.First_Name} ${detail.coordinator.staff.Last_Name}` : detail?.coordinator?.Coordinator_ID}</p>
                <p className="text-sm text-zinc-600">{detail?.coordinator?.District_ID}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium">Status</h3>
              <p className="text-sm">{detail?.Status}</p>
            </div>

            {/* Show accept/reject/reschedule only when request is not completed */}
            {!(detail?.Status || '').toString().toLowerCase().includes('completed') && (
              <div className="flex gap-2">
                <button onClick={() => doAction('approve')} disabled={actionLoading} className="px-3 py-1 bg-red-600 text-white rounded">Accept</button>
                <button onClick={() => doAction('reject')} disabled={actionLoading} className="px-3 py-1 border border-red-600 text-red-600 rounded">Reject</button>
                <div className="flex items-center gap-2">
                  <input type="date" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} className="border px-2 py-1 rounded" />
                  <button onClick={() => doAction('reschedule')} disabled={actionLoading} className="px-3 py-1 border border-red-600 text-red-600 rounded">Reschedule</button>
                </div>
              </div>
            )}

            {/* If request is completed, show staff assignment UI instead of admin actions */}
            {(detail?.Status || '').toString().toLowerCase().includes('completed') && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium">Assign Staff for this Event</h3>
                <p className="text-xs text-zinc-600 mb-2">Add staff members who will work the event (Admin only).</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                  <input className="border px-2 py-1 rounded col-span-2" placeholder="Full name" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} />
                  <input className="border px-2 py-1 rounded" placeholder="Role (e.g. Nurse)" value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value)} />
                </div>
                <div className="flex gap-2 mb-3">
                  <button disabled={!newStaffName || !newStaffRole} onClick={() => {
                    setStaffMembers((s) => [...s, { FullName: newStaffName, Role: newStaffRole }]);
                    setNewStaffName(''); setNewStaffRole('');
                  }} className="px-3 py-1 bg-green-600 text-white rounded">Add to list</button>
                  <button onClick={() => { setStaffMembers([]); }} className="px-3 py-1 border rounded">Clear list</button>
                </div>
                {staffMembers.length > 0 && (
                  <div className="mb-3">
                    <div className="text-sm font-medium">Staff to assign</div>
                    <ul className="list-disc pl-5 mt-1">
                      {staffMembers.map((s, idx) => (
                        <li key={idx} className="flex justify-between gap-2 items-center">
                          <span>{s.FullName} — <span className="text-zinc-600">{s.Role}</span></span>
                          <button className="text-sm text-red-600" onClick={() => setStaffMembers((arr) => arr.filter((_, i) => i !== idx))}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  {role === 'admin' ? (
                    <button disabled={staffLoading || staffMembers.length === 0} onClick={async () => {
                      if (!token) return;
                      setStaffLoading(true);
                      try {
                        const adminId = user?.id ?? user?.Admin_ID ?? user?.AdminId ?? null;
                        if (!adminId) throw new Error('Admin ID not available');
                        const eventId = detail?.event?.Event_ID ?? detail?.Event_ID;
                        await RequestsAPI.assignStaff(token, id as string, { adminId, eventId, staffMembers });
                        // reload details
                        const res: any = await RequestsAPI.getById(token, id as string);
                        const d = res?.data ?? res?.request ?? res;
                        setDetail(d);
                        setStaffMembers([]);
                        setNewStaffName(''); setNewStaffRole('');
                      } catch (e: any) {
                        setError(e?.message || 'Failed to assign staff');
                      } finally {
                        setStaffLoading(false);
                      }
                    }} className="px-3 py-1 bg-blue-600 text-white rounded">Assign Staff</button>
                  ) : (
                    <div className="text-sm text-zinc-600">Only administrators may assign staff. Contact your admin.</div>
                  )}
                </div>
              </div>
            )}

            <div>
              <button onClick={() => router.back()} className="text-sm text-zinc-600">Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
