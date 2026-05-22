import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { RequestAccessForm } from "@/components/request-access-form";

export default function RequestAccessPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#1b1f1c]">
      <section className="border-b border-[#d9ded4] bg-[#0a0f0c] text-[#f6f2e8]">
        <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
          <Link className="inline-flex items-center gap-2 text-sm text-[#c9d2ca] hover:text-white" href="/">
            <ArrowLeft size={16} aria-hidden />
            Back
          </Link>
          <div className="mt-10 max-w-3xl">
            <span className="grid size-10 place-items-center rounded-md border border-[#416a5a] bg-[#10251d] text-[#dff3e4]">
              <ShieldCheck size={20} aria-hidden />
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Request access to a controlled RFQ pilot.
            </h1>
            <p className="mt-4 text-base leading-7 text-[#c8d1ca]">
              Tell us about the sourcing workflow, review burden, and RFQ volume. Do not include
              controlled drawings, export-controlled data, or sensitive supplier files.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_0.7fr]">
        <RequestAccessForm />
        <aside className="rounded-lg border border-[#dfc47a] bg-[#fff9e7] p-5">
          <h2 className="text-lg font-semibold text-[#2c2719]">What happens next</h2>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-[#5e4d20]">
            <p>We review whether the workflow fits a demo, paid pilot, or metal quote-to-order intake.</p>
            <p>Production data access stays off until auth, tenant isolation, storage, and audit controls are deployed.</p>
            <p>No platform compliance certification is implied by requesting access.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
