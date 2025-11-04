"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { RequestsAPI } from "../../services/api";

export default function EventRequestPage() {
  const { token, role } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
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
      await RequestsAPI.create(token, { title, date, location, notes });
      setSuccess("Request submitted");
      setTimeout(() => router.push('/dashboard'), 800);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit request');
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
            <label className="block text-sm mb-1">Date</label>
            <input type="date" className="w-full border px-3 py-2 rounded" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm mb-1">Location</label>
            <input className="w-full border px-3 py-2 rounded" value={location} onChange={(e) => setLocation(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm mb-1">Notes</label>
            <textarea className="w-full border px-3 py-2 rounded" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-700">{success}</p>}
          <button disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded">{loading ? 'Submitting...' : 'Submit Request'}</button>
        </form>
      </div>
    </div>
  );
}


