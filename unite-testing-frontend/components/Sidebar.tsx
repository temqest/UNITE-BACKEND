"use client";

import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const { role, logout } = useAuth();
  const pathname = usePathname();

  // Do not render sidebar for public (not logged in)
  // Also hide on auth/public pages regardless of auth state (login/signup/home)
  if (!role) return null;
  if (!pathname) return null;
  const publicPaths = ["/", "/login", "/signup"];
  if (publicPaths.includes(pathname)) return null;

  return (
    <aside className="flex flex-col items-center w-20 bg-white border-r">
      <div className="py-6">
        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white font-bold">U</div>
      </div>
      <nav className="flex-1 flex flex-col items-center gap-4 py-6">
        <Link href="/dashboard" title="Campaign" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">📅</Link>
      <Link href="/calendar" title="Calendar" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">🗓️</Link>
        {/* Create event / event request form (keeps existing /request route) */}
        <Link href="/request" title="Create Event" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">✉️</Link>
        {/* Requests list page (view all requests) */}
        <Link href="/requests" title="Requests" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">�</Link>

        {/* Users visible only to admin/coordinator */}
        {(role === 'admin' || role === 'coordinator') && (
          <Link href="/users" title="Users" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">👥</Link>
        )}

        <Link href="/notifications" title="Notifications" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">🔔</Link>
      </nav>

      <div className="py-6">
        <button onClick={() => { logout(); }} title="Logout" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-red-600">⎋</button>
      </div>
    </aside>
  );
}
