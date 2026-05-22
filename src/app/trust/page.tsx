import Link from "next/link";
import {
  ArrowLeft,
  ClipboardCheck,
  FileWarning,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

const verifiedToday = [
  "Demo mode uses fake sourcing data and must not receive real controlled technical data.",
  "The metal quote backend writes server-side audit events for estimates, RFQs, reviews, quotes, approvals, payments, and access requests.",
  "Instant estimates are explicitly budgetary and require human/admin review before final quote, payment, or order creation.",
  "The Cognito login URL builder is present, but a real user pool, app client, domain, and callbacks still need to be configured.",
  "Mock payments are isolated from live payment processors until a real provider is wired and reviewed.",
];

const productionRequired = [
  "Create the Cognito user pool/app client and lock callback/logout URLs to production domains.",
  "Validate sessions server-side and protect /dashboard routes before exposing non-demo data.",
  "Move RBAC and tenant isolation to backend/database enforcement, not browser-only state.",
  "Use signed S3/R2 document URLs with short expirations and server-side access decisions.",
  "Persist audit logs server-side with retention, export, and admin review procedures.",
  "Publish a control-backed security page after the controls are deployed and verified.",
];

const claimsAvoided = [
  "Sovereign Source does not certify ITAR, CMMC, Nadcap, AS9100, JCP, or supplier compliance.",
  "The system does not promise autonomous compliance verification or real-time registry checks.",
  "The demo is not approved for ITAR, CUI, CDI, export-controlled, or classified data.",
  "Budgetary estimates are not guaranteed final prices, lead times, or manufacturability decisions.",
];

export default function TrustPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#1b1f1c]">
      <section className="border-b border-white/10 bg-[#080b0a] text-[#f6f2e8]">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
          <Link className="inline-flex items-center gap-2 text-sm text-[#c9d2ca] hover:text-white" href="/">
            <ArrowLeft size={16} aria-hidden />
            Back
          </Link>
          <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_0.65fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f2c86b]">
                Trust and security position
              </p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-6xl">
                Clear controls before controlled data.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-[#c8d1ca]">
                This page separates implemented demo controls from production controls that still need to
                be deployed and verified before paid customers upload sensitive manufacturing packages.
              </p>
            </div>
            <div className="rounded-lg border border-[#dfc47a] bg-[#fff9e7] p-5 text-[#4c3e16]">
              <div className="flex items-center gap-2">
                <FileWarning size={20} aria-hidden />
                <h2 className="font-semibold">Current boundary</h2>
              </div>
              <p className="mt-3 text-sm leading-6">
                Do not upload ITAR, CUI, CDI, classified, export-controlled, or production-sensitive
                data until the production control set is live.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-12 sm:px-8 lg:grid-cols-3">
        <TrustCard title="Verified Today" items={verifiedToday} Icon={ClipboardCheck} />
        <TrustCard title="Required For Production" items={productionRequired} Icon={LockKeyhole} />
        <TrustCard title="Claims Avoided" items={claimsAvoided} Icon={ShieldCheck} />
      </section>

      <section className="border-t border-[#d9ded4] bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Pilot access starts with a review.</h2>
            <p className="mt-2 text-sm leading-6 text-[#5e665d]">
              The safest first conversion path is a reviewed pilot, not an open self-serve upload flow.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-md bg-[#173f2f] px-5 py-3 text-sm font-semibold text-white hover:bg-[#225941]"
            href="/request-access"
          >
            Request pilot access
          </Link>
        </div>
      </section>
    </main>
  );
}

function TrustCard({
  title,
  items,
  Icon,
}: {
  title: string;
  items: string[];
  Icon: typeof ShieldCheck;
}) {
  return (
    <article className="rounded-lg border border-[#d9ded4] bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-md bg-[#eef2ea] text-[#315c4a]">
          <Icon size={18} aria-hidden />
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <p key={item} className="rounded-md border border-[#e3e8df] bg-[#fbfcf8] p-3 text-sm leading-6 text-[#4f5a51]">
            {item}
          </p>
        ))}
      </div>
    </article>
  );
}
