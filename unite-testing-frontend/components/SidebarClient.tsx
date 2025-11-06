"use client";

import Sidebar from "./Sidebar";

export default function SidebarClient() {
  // Thin client wrapper so `app/layout.tsx` (a server component) can import
  // a client-rendered sidebar without using `dynamic(..., { ssr: false })`.
  return <Sidebar />;
}
