"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { RequestsAPI, EventsAPI } from "../../services/api";
import { useEffect } from "react";

export default function EventRequestPage() {
  const { token, role, user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<'BloodDrive' | 'Advocacy' | 'Training'>('BloodDrive');
  const [date, setDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Category-specific minimal fields
  const [targetDonation, setTargetDonation] = useState<number>(50);
  const [venueType, setVenueType] = useState<string>("Indoor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requestsList, setRequestsList] = useState<any[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  

  // Allow coordinators, admins and stakeholders to open the request page.
  // Admins/coordinators can publish directly; stakeholders will create a request.
  if (role !== 'coordinator' && role !== 'admin' && role !== 'stakeholder') {
    if (typeof window !== "undefined") router.replace('/dashboard');
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      // Resolve coordinator id: use explicit fields if present, otherwise try to
      // look up the coordinator for the stakeholder's district so the backend
      // receives a Coordinator ID (the backend requires it).
      // Prefer explicit Coordinator_ID on the user object (added server-side).
      let resolvedCoordinatorId: any = role === 'coordinator' ? user?.id : (user?.Coordinator_ID ?? user?.role_data?.coordinator_id ?? user?.MadeByCoordinatorID ?? undefined);
      if (role === 'stakeholder' && !resolvedCoordinatorId) {
        const districtId = user?.role_data?.district_id ?? user?.District_ID ?? user?.district_id;
        if (districtId) {
          try {
            const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
            const url = `${base}/coordinators?district_id=${encodeURIComponent(districtId)}`;
            const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: 'include' });
            const data = await res.json();
            const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
            const first = list[0];
            resolvedCoordinatorId = first?.Coordinator_ID ?? first?.CoordinatorId ?? first?.id ?? first?.CoordinatorID ?? undefined;
          } catch (fetchErr) {
            // ignore — we'll surface a friendly error below if still undefined
          }
        }
      }

      if (role === 'stakeholder' && !resolvedCoordinatorId) {
        throw new Error('Coordinator not found for your district. Please contact your coordinator or system admin.');
      }

      const payload: any = {
        // Provide both shapes just in case the backend expects one or the other.
        coordinatorId: resolvedCoordinatorId,
        Coordinator_ID: resolvedCoordinatorId,
        categoryType: type,
        Event_Title: title,
        Location: location,
        Start_Date: date,
        End_Date: endDate || undefined,
        Email: email,
        Phone_Number: phone,
      };
      // If a stakeholder created the request, include their stakeholder id for traceability.
      if (role === 'stakeholder') {
        payload.MadeByStakeholderID = user?.Stakeholder_ID ?? user?.StakeholderId ?? user?.id ?? undefined;
      }
      if (type === 'BloodDrive') {
        payload.Target_Donation = targetDonation;
        payload.VenueType = venueType;
      }
      // Auto-publish when role is admin or coordinator
      if (role === 'admin' || role === 'coordinator') {
        await EventsAPI.createDirect(token, {
          ...payload,
          creatorId: user?.id,
          creatorRole: role === 'admin' ? 'Admin' : 'Coordinator',
          MadeByCoordinatorID: role === 'coordinator' ? user?.id : undefined,
        });
      } else {
        await RequestsAPI.create(token, payload);
      }
      setSuccess("Request submitted");
      setTimeout(() => router.push('/dashboard'), 800);
    } catch (err: any) {
      const details = err?.errors ? `\n${JSON.stringify(err.errors)}` : '';
      setError((err?.message || 'Failed to submit request') + details);
    } finally {
      setLoading(false);
    }
  };

  // Load persisted requests for the current user role
  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoadingList(true);
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
          // Prefer role_data.coordinator_id (provided by backend) then Coordinator_ID then id
          const coordinatorId = user?.role_data?.coordinator_id ?? user?.Coordinator_ID ?? user?.id ?? undefined;
          if (coordinatorId) {
            const res = await RequestsAPI.getCoordinatorRequests(token, coordinatorId);
            
            const payload: any = res as any;
            setRequestsList(Array.isArray(payload.data) ? payload.data : payload.requests ?? payload.data ?? []);
          } else {
            setRequestsList([]);
          }
        } else if (role === 'admin') {
          // For admins show all requests (history + current)
          const res = await RequestsAPI.getAll(token);
          
          const payload: any = res as any;
          setRequestsList(Array.isArray(payload.data) ? payload.data : payload.requests ?? payload.data ?? []);
        }
      } catch (err) {
        // ignore — show empty list
        setRequestsList([]);
      } finally {
        setLoadingList(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role, user]);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-xl mx-auto border rounded-md p-6">
        <h1 className="text-xl font-semibold text-red-600 mb-4">New Event Request</h1>
  <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Title</label>
            <input className="w-full border px-3 py-2 rounded" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm mb-1">Type</label>
            <select className="w-full border px-3 py-2 rounded" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="BloodDrive">Blood Drive</option>
              <option value="Advocacy">Advocacy</option>
              <option value="Training">Training</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Date</label>
            <input type="date" className="w-full border px-3 py-2 rounded" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm mb-1">End Date (optional)</label>
            <input type="date" className="w-full border px-3 py-2 rounded" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">Location</label>
            <input className="w-full border px-3 py-2 rounded" value={location} onChange={(e) => setLocation(e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Contact Email</label>
              <input type="email" className="w-full border px-3 py-2 rounded" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm mb-1">Contact Phone</label>
              <input className="w-full border px-3 py-2 rounded" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </div>
          {type === 'BloodDrive' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Target Donation (bags)</label>
                <input type="number" className="w-full border px-3 py-2 rounded" value={targetDonation} onChange={(e) => setTargetDonation(parseInt(e.target.value || '0', 10))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Venue Type</label>
                <input className="w-full border px-3 py-2 rounded" value={venueType} onChange={(e) => setVenueType(e.target.value)} />
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-700">{success}</p>}
          <button disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded">{loading ? 'Submitting...' : 'Submit Request'}</button>
        </form>
      </div>
        <div className="max-w-3xl mx-auto mt-8">
          <h2 className="text-lg font-semibold mb-3">Your requests</h2>
          {loadingList && <p>Loading...</p>}
          {!loadingList && (!requestsList || requestsList.length === 0) && <p className="text-sm text-gray-600">No requests found.</p>}
          {!loadingList && requestsList && requestsList.length > 0 && (
            <div className="overflow-x-auto">
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


