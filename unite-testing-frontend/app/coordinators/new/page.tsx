"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../contexts/AuthContext";
import { UsersAPI, DistrictsAPI } from "../../../services/api";

export default function NewCoordinatorPage() {
  const { role, token, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (role !== 'admin') router.replace('/dashboard');
  }, [role, router]);
  if (role !== 'admin') return null;

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("Coord@123");
  const [districtId, setDistrictId] = useState("");
  const [province, setProvince] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoadingDistricts(true);
      try {
        const res: any = await DistrictsAPI.list(token);
        const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setDistricts(items);
      } catch (e) {
        // ignore; page can still function with manual entry fallback
      } finally {
        setLoadingDistricts(false);
      }
    };
    load();
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await UsersAPI.createCoordinator(token, {
        staffData: {
          First_Name: firstName,
          Middle_Name: middleName || null,
          Last_Name: lastName,
          Email: email,
          Phone_Number: phone,
          Password: password,
        },
        coordinatorData: {
          District_ID: districtId,
          Province_Name: province || null,
        },
      });
      setSuccess("Coordinator account created.");
      setTimeout(() => router.push('/dashboard'), 900);
    } catch (e: any) {
      setError(e?.message || 'Failed to create coordinator');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-xl mx-auto border rounded-md p-6">
        <h1 className="text-xl font-semibold text-red-600 mb-4">Create Coordinator</h1>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">First Name</label>
              <input className="w-full border px-3 py-2 rounded" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm mb-1">Middle Name</label>
              <input className="w-full border px-3 py-2 rounded" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Last Name</label>
              <input className="w-full border px-3 py-2 rounded" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input type="email" className="w-full border px-3 py-2 rounded" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm mb-1">Phone</label>
              <input className="w-full border px-3 py-2 rounded" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm mb-1">Temporary Password</label>
              <input className="w-full border px-3 py-2 rounded" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">District</label>
              {districts.length > 0 ? (
                <select className="w-full border px-3 py-2 rounded" value={districtId} onChange={(e) => setDistrictId(e.target.value)} required>
                  <option value="" disabled>{loadingDistricts ? 'Loading...' : 'Select a district'}</option>
                  {districts.map((d: any) => (
                    <option key={d.District_ID} value={d.District_ID}>
                      {d.District_Name} — {d.District_City}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="w-full border px-3 py-2 rounded" value={districtId} onChange={(e) => setDistrictId(e.target.value)} placeholder="Enter District_ID (e.g., CSUR-001)" required />
              )}
            </div>
            <div>
              <label className="block text-sm mb-1">Province (optional)</label>
              <input className="w-full border px-3 py-2 rounded" value={province} onChange={(e) => setProvince(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-700">{success}</p>}
          <button disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded">{loading ? 'Creating...' : 'Create Coordinator'}</button>
        </form>
      </div>
    </div>
  );
}


