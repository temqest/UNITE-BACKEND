"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";

export default function LoginPage() {
  const { loginStaff, loginStakeholder } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [type, setType] = useState<"staff" | "stakeholder">("staff");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (type === "staff") await loginStaff(email, password);
      else await loginStakeholder(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left red gradient panel (large) */}
      <div className="hidden md:block md:w-2/3 lg:w-3/4 bg-gradient-to-b from-red-500 to-red-800 min-h-screen p-6">
        <div className="text-white max-w-2xl mt-8">
          <div className="text-sm font-bold">unite</div>
        </div>
      </div>

      {/* Right form panel (narrow) */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-white min-h-screen flex items-start justify-center">
        <form onSubmit={onSubmit} className="w-full max-w-md p-8">
          <button type="button" onClick={() => router.back()} className="text-sm text-slate-600 mb-4">← Go Back</button>

          <h1 className="text-2xl font-extrabold text-red-600 mb-4">Sign in</h1>
          <p className="text-sm text-slate-500 mb-6">Sign in to your account to manage events and requests.</p>

          <div className="mb-3">
            <label className="block text-sm mb-1">Login as</label>
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full border px-3 py-2 rounded">
              <option value="staff">System Admin / Coordinator</option>
              <option value="stakeholder">Stakeholder</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm mb-1">Email</label>
            <input className="w-full border px-3 py-2 rounded" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="mb-4">
            <label className="block text-sm mb-1">Password</label>
            <input type="password" className="w-full border px-3 py-2 rounded" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <button disabled={loading} className="w-full px-4 py-3 bg-red-600 text-white rounded">{loading ? "Signing in..." : "Sign In"}</button>
        </form>
      </div>
    </div>
  );
}


