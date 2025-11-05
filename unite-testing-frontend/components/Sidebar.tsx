"use client";

import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { usePathname, useRouter } from "next/navigation";

export default function Sidebar() {
  const { role, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

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
  {/* Requests / Review page: admins/coordinators will see the review table */}
  <Link href="/review" title="Requests" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">📨</Link>

        {/* Users visible only to admin/coordinator */}
        {(role === 'admin' || role === 'coordinator') && (
          <Link href="/users" title="Users" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">👥</Link>
        )}

        <Link href="/notifications" title="Notifications" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">🔔</Link>
      </nav>

      <div className="py-6">
        <button onClick={() => {
          // navigate to landing page first, then clear auth state to avoid hook-order races
          try {
            router.replace('/');
          } catch (e) {
            try { window.location.href = '/'; } catch {}
          }
          // Delay clearing context so components can unmount after navigation begins
          setTimeout(() => { logout(); }, 60);
        }} title="Logout" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-red-600">⎋</button>
      </div>
    </aside>
  );
}
