"use client";

import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  // Show footer only on the landing page
  if (pathname !== "/") return null;

  return (
    <footer className="w-full border-t border-slate-100">
      <div className="container mx-auto px-6 py-10 text-center">
        <p className="text-sm text-slate-500 mb-6">unite is recognized by leading healthcare industry analysts and independent clinical testing organizations in Naga City.</p>
        <div className="flex items-center justify-center gap-8">
          <svg width="140" height="36" viewBox="0 0 200 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <rect width="200" height="36" rx="4" fill="#F8FAFC" />
            <text x="100" y="22" fill="#0F172A" fontSize="12" fontWeight="700" textAnchor="middle">BICOL MEDICAL CENTER</text>
          </svg>
          <svg width="80" height="36" viewBox="0 0 120 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <rect width="120" height="36" rx="4" fill="#FEF3F2" />
            <text x="60" y="22" fill="#991B1B" fontSize="10" fontWeight="700" textAnchor="middle">Seal</text>
          </svg>
        </div>
      </div>
    </footer>
  );
}
