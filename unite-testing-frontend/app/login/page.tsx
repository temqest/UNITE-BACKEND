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
    <div className="min-h-screen flex items-center justify-center bg-white">
      <form onSubmit={onSubmit} className="w-full max-w-md p-6 border rounded-md">
        <h1 className="text-xl font-semibold text-red-600 mb-4">Login</h1>
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
        <button disabled={loading} className="w-full px-4 py-2 bg-red-600 text-white rounded">{loading ? "Signing in..." : "Sign In"}</button>
      </form>
    </div>
  );
}


