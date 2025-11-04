"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { SettingsAPI } from "../../services/api";

export default function SettingsPage() {
  const { token, role } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await SettingsAPI.getAll(token);
        setSettings(res);
      } catch (e: any) {
        setError(e?.message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (role !== 'admin') return null;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-red-600 mb-4">System Settings</h1>
        {loading && <p>Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {settings && (
          <pre className="text-sm whitespace-pre-wrap border rounded p-3 bg-zinc-50">{JSON.stringify(settings, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}


