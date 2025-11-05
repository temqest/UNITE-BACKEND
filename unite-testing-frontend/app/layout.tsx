import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../contexts/AuthContext";
import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Sidebar from "../components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unite — Blood Donation",
  description: "Unite: coordinate and publish blood donation events",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-slate-900 min-h-screen flex flex-col`}
      >
        <AuthProvider>
          {/* top header — hidden when user is logged in via the Header client component */}
          <Header />

          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-grow">{children}</main>
          </div>

          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
