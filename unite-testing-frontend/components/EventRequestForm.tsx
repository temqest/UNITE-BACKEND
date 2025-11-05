"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { RequestsAPI, EventsAPI, DistrictsAPI } from "../services/api";

interface Props {
  initialDate?: string;
  onSuccess?: () => void;
}

export default function EventRequestForm({ initialDate, onSuccess }: Props) {
  const { token, role, user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<'BloodDrive' | 'Advocacy' | 'Training'>('BloodDrive');
  const [date, setDate] = useState<string>(initialDate ?? "");
  const [endDate, setEndDate] = useState<string>("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [targetDonation, setTargetDonation] = useState<number>(50);
  const [venueType, setVenueType] = useState<string>("Indoor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  // Allow coordinators, admins and stakeholders to open the request page.
  if (role !== 'coordinator' && role !== 'admin' && role !== 'stakeholder') {
    return null;
  }

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
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
            // ignore
          }
        }
      }

      if (role === 'stakeholder' && !resolvedCoordinatorId) {
        throw new Error('Coordinator not found for your district. Please contact your coordinator or system admin.');
      }

      const payload: any = {
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
      if (role === 'stakeholder') {
        payload.MadeByStakeholderID = user?.Stakeholder_ID ?? user?.StakeholderId ?? user?.id ?? undefined;
      }
      if (type === 'BloodDrive') {
        payload.Target_Donation = targetDonation;
        payload.VenueType = venueType;
      }
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
      if (onSuccess) onSuccess();
      else setTimeout(() => router.push('/dashboard'), 800);
    } catch (err: any) {
      const details = err?.errors ? `\n${JSON.stringify(err.errors)}` : '';
      setError((err?.message || 'Failed to submit request') + details);
    } finally {
      setLoading(false);
    }
  };

  return (
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
      <div className="flex gap-2">
        <button disabled={loading} type="submit" className="px-4 py-2 bg-red-600 text-white rounded">{loading ? 'Submitting...' : 'Submit Request'}</button>
      </div>
    </form>
  );
}
