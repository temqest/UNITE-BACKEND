import Link from "next/link";

export default function Home() {
  return (
    <div className="bg-white">
      <section className="container mx-auto px-6 py-24 lg:py-36">
        <div className="max-w-4xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight mb-6">
            One <span className="text-red-600">donation</span>, infinite
            possibilities
          </h1>

          <p className="text-slate-600 text-lg sm:text-xl max-w-2xl mb-8">
            It's not another health tech platform. It's a movement — coordinate,
            approve, and publish blood donation events with ease.
          </p>

          <div className="flex flex-wrap gap-4 items-center">
            <Link href="/request/new" className="inline-flex items-center px-6 py-3 bg-red-600 text-white rounded-md shadow-lg">Get Started</Link>
            <Link href="#" className="inline-flex items-center px-6 py-3 border border-slate-300 text-slate-700 rounded-md">Learn more</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
