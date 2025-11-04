"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StakeholdersAPI, DistrictsAPI } from "../../services/api";

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [districts, setDistricts] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res: any = await DistrictsAPI.list();
        const arr = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setDistricts(arr);
      } catch {}
    };
    load();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await StakeholdersAPI.register({
        First_Name: firstName,
        Middle_Name: middleName || undefined,
        Last_Name: lastName,
        Email: email,
        Phone_Number: phone,
        Password: password,
        Province_Name: province,
        City_Municipality: city,
        District_ID: districtId,
        Registration_Code: inviteCode || undefined,
      });
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm mb-1">First Name</label>
            <input className="w-full border px-3 py-2 rounded" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm mb-1">Middle Name</label>
            <input className="w-full border px-3 py-2 rounded" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Last Name</label>
            <input className="w-full border px-3 py-2 rounded" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">Email</label>
          <input className="w-full border px-3 py-2 rounded" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">Phone Number</label>
          <input className="w-full border px-3 py-2 rounded" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">Password</label>
          <input type="password" className="w-full border px-3 py-2 rounded" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">District</label>
          {districts.length > 0 ? (
            <select className="w-full border px-3 py-2 rounded" value={districtId} onChange={(e) => setDistrictId(e.target.value)} required>
              <option value="" disabled>Select a district</option>
              {districts.map((d: any) => (
                <option key={d.District_ID} value={d.District_ID}>
                  District {d.District_Number} — {d.District_Name}
                </option>
              ))}
            </select>
          ) : (
            <input className="w-full border px-3 py-2 rounded" value={districtId} onChange={(e) => setDistrictId(e.target.value)} placeholder="Enter District_ID" required />
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm mb-1">Province</label>
            <input className="w-full border px-3 py-2 rounded" value={province} onChange={(e) => setProvince(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm mb-1">City/Municipality</label>
            <input className="w-full border px-3 py-2 rounded" value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm mb-1">Invitation Code</label>
          <input className="w-full border px-3 py-2 rounded" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Required if provided by coordinator" />
          <p className="text-xs text-zinc-600 mt-1">Note: Code must belong to the selected district. The server validates this.</p>
        </div>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {success && <p className="text-sm text-green-700 mb-2">{success}</p>}
        <button disabled={loading} className="w-full px-4 py-2 bg-red-600 text-white rounded">{loading ? "Submitting..." : "Sign Up"}</button>
      </form>
    </div>
  );
}


