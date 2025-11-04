"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthAPI } from "../../services/api";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await AuthAPI.registerStakeholder({ name, email, password, districtId, inviteCode });
      setSuccess("Registration submitted. You can now log in.");
      setTimeout(() => router.push("/login"), 1000);
    } catch (err: any) {
      setError(err?.message || "Sign-up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <form onSubmit={onSubmit} className="w-full max-w-md p-6 border rounded-md">
        <h1 className="text-xl font-semibold text-red-600 mb-4">Stakeholder Sign-Up</h1>
        <div className="mb-3">
          <label className="block text-sm mb-1">Full Name</label>
          <input className="w-full border px-3 py-2 rounded" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">Email</label>
          <input className="w-full border px-3 py-2 rounded" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">Password</label>
          <input type="password" className="w-full border px-3 py-2 rounded" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">District ID</label>
          <input className="w-full border px-3 py-2 rounded" value={districtId} onChange={(e) => setDistrictId(e.target.value)} placeholder="e.g., 65f..." />
        </div>
        <div className="mb-4">
          <label className="block text-sm mb-1">Invitation Code</label>
          <input className="w-full border px-3 py-2 rounded" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Required if provided by coordinator" />
        </div>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {success && <p className="text-sm text-green-700 mb-2">{success}</p>}
        <button disabled={loading} className="w-full px-4 py-2 bg-red-600 text-white rounded">{loading ? "Submitting..." : "Sign Up"}</button>
      </form>
    </div>
  );
}


