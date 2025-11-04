import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <main className="w-full max-w-xl p-8 border rounded-md">
        <h1 className="text-2xl font-semibold text-red-600 mb-2">UNITE Blood Bank</h1>
        <p className="text-zinc-700 mb-6">Schedule, approve, and publish blood donation events.</p>
        <div className="flex gap-4">
          <Link href="/login" className="px-4 py-2 bg-red-600 text-white rounded">Login</Link>
          <Link href="/signup" className="px-4 py-2 border border-red-600 text-red-600 rounded">Stakeholder Sign-Up</Link>
        </div>
      </main>
    </div>
  );
}
