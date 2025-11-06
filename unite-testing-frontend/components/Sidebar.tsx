"use client";

import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { usePathname, useRouter } from "next/navigation";

export default function Sidebar() {
  const { role, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Determine whether to show the full sidebar content. We still render the
  // outer <aside> on the server to keep HTML structure stable between server
  // and client renders (prevents hydration mismatches). The inner nav is
  // conditionally rendered based on auth/pathname which may only be known on
  // the client.
  const publicPaths = ["/", "/login", "/signup"];
  const showSidebar = !!role && !!pathname && !publicPaths.includes(pathname);

  return (
    <aside className="flex flex-col items-center w-20 bg-white border-r">
      {/* Branding / avatar area (always present to keep DOM stable) */}
      <div className="py-6">
        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white font-bold">U</div>
      </div>

      {/* Always render the <nav> element so server and client markup stays the
          same (prevents hydration mismatches). When `showSidebar` is false we
          render no interactive links inside and mark it aria-hidden. */}
  <nav className="flex-1 flex flex-col items-center gap-4 py-6">
        {showSidebar && (
          <>
            <Link href="/dashboard" title="Campaign" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">📅</Link>
            <Link href="/calendar" title="Calendar" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">🗓️</Link>
            {/* Requests / Review page: admins/coordinators will see the review table */}
            <Link href="/review" title="Requests" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">📨</Link>

            {/* Users visible only to admin/coordinator */}
            {(role === 'admin' || role === 'coordinator') && (
              <Link href="/users" title="Users" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">👥</Link>
            )}

            <Link href="/notifications" title="Notifications" className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center text-slate-700">🔔</Link>
          </>
        )}
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
