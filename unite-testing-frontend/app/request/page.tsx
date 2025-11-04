"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { RequestsAPI, EventsAPI } from "../../services/api";

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

  if (role !== 'coordinator') {
    if (typeof window !== "undefined") router.replace('/dashboard');
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const payload: any = {
        coordinatorId: user?.id,
        categoryType: type,
        Event_Title: title,
        Location: location,
        Start_Date: date,
        End_Date: endDate || undefined,
        Email: email,
        Phone_Number: phone,
      };
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
    </div>
  );
}


