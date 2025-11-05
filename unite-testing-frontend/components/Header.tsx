"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  // Show the public top navbar only on the landing page
  if (pathname !== "/") return null;

  return (
    <header className="w-full border-b border-slate-100">
      <div className="container mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-2xl font-extrabold text-red-600 tracking-tight">unite</Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-700">
            <Link href="#">Resources</Link>
            <Link href="#">Product</Link>
            <Link href="/calendar">Calendar</Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate-700 hover:text-slate-900">Sign In</Link>
          <Link href="/signup" className="inline-flex items-center px-4 py-2 bg-red-600 text-white text-sm rounded-md shadow-sm">Sign Up</Link>
        </div>
      </div>
    </header>
  );
}
