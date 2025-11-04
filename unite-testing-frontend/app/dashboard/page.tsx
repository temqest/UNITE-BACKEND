"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";

export default function DashboardPage() {
  const { role, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!role) router.replace('/login');
  }, [role, router]);
  if (!role) return null;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-red-600">Dashboard ({role})</h1>
          <button onClick={() => { logout(); router.push('/'); }} className="px-3 py-2 border border-red-600 text-red-600 rounded">Logout</button>
        </header>
        <nav className="flex gap-3 mb-6">
          <Link className="px-3 py-2 bg-red-600 text-white rounded" href="/calendar">Global Calendar</Link>
          <Link className="px-3 py-2 border border-red-600 text-red-600 rounded" href="/users">Users</Link>
          {role !== 'stakeholder' && (
            <Link className="px-3 py-2 border border-red-600 text-red-600 rounded" href="/review">Request Review</Link>
          )}
          {role === 'coordinator' && (
            <Link className="px-3 py-2 border border-red-600 text-red-600 rounded" href="/request">New Event Request</Link>
          )}
          {role === 'admin' && (
            <Link className="px-3 py-2 border border-red-600 text-red-600 rounded" href="/settings">System Settings</Link>
          )}
          {role === 'admin' && (
            <Link className="px-3 py-2 border border-red-600 text-red-600 rounded" href="/coordinators/new">Create Coordinator</Link>
          )}
          <Link className="px-3 py-2 border border-red-600 text-red-600 rounded" href="/notifications">Notifications</Link>
        </nav>
        <p className="text-zinc-700">Use the navigation above to access core features.</p>
      </div>
    </div>
  );
}


