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
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left red gradient panel (large) */}
      <div className="hidden md:block md:w-2/3 lg:w-3/4 bg-gradient-to-b from-red-500 to-red-800 min-h-screen p-6">
        <div className="text-white max-w-2xl mt-8">
          <div className="text-sm font-bold">unite</div>
          {/* You can add heading/illustration here if desired */}
        </div>
      </div>

      {/* Right form panel (narrow) */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-white min-h-screen flex items-start justify-center">
        <form onSubmit={onSubmit} className="w-full max-w-md p-8">
          <button type="button" onClick={() => router.back()} className="text-sm text-slate-600 mb-4">← Go Back</button>

          <h1 className="text-2xl font-extrabold text-red-600 mb-4">Sign up</h1>
          <p className="text-sm text-slate-500 mb-6">Create an account to start coordinating donation events.</p>

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

          <button disabled={loading} type="submit" className="w-full px-4 py-3 bg-red-600 text-white rounded">{loading ? "Submitting..." : "Sign Up"}</button>
        </form>
      </div>
    </div>
  );
}


