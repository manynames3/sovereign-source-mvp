import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  FileLock2,
  FileText,
  LockKeyhole,
  RadioTower,
  Route,
  SearchCheck,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import type { CognitoLogin } from "@/lib/cognito";

type LandingPageProps = {
  cognitoLogin: CognitoLogin;
};

const painPoints = [
  "RFQs are sent to stale or unqualified suppliers before evidence is checked.",
  "Controlled drawings move through email, folders, and tribal knowledge.",
  "Buyers cannot quickly explain who saw what, when, and why.",
];

const outcomes = [
  "Upload drawings, PO lines, or BOMs into one sourcing intake.",
  "Route work only after capability, facility, and evidence gates are clear.",
  "Keep manual review visible when CMMC, ITAR evidence, or scope is uncertain.",
];

const workflow = [
  {
    title: "Intake",
    detail: "Parse drawings, models, PO lines, process needs, quantities, and control markers.",
    Icon: UploadCloud,
  },
  {
    title: "Curate",
    detail: "Tie supplier fit to facility-level capability, reviewed evidence, and quality documents.",
    Icon: ClipboardCheck,
  },
  {
    title: "Route",
    detail: "Release secure RFQ invites only when evidence is valid or an exception is approved.",
    Icon: Route,
  },
  {
    title: "Audit",
    detail: "Export the access trail for buyer review: who saw what, when, and why.",
    Icon: FileText,
  },
];

const trustSignals = [
  "Deterministic match reasons",
  "Manual review required states",
  "Access suspended states",
  "Server-side architecture plan",
  "No platform compliance certification claim",
];

export function LandingPage({ cognitoLogin }: LandingPageProps) {
  return (
    <main className="min-h-screen bg-[#080b0a] text-[#f6f2e8]">
      <section className="relative isolate overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 -z-10 opacity-30">
          <div className="absolute inset-x-0 top-0 h-px bg-[#f2c86b]" />
          <div className="grid h-full grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="border-r border-white/5" />
            ))}
          </div>
        </div>

        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid size-9 place-items-center rounded-md border border-[#416a5a] bg-[#10251d] text-[#dff3e4]">
              <ShieldCheck size={19} aria-hidden />
            </span>
            <span className="font-semibold tracking-[0.02em]">Sovereign Source</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link className="hidden text-[#c9d2ca] hover:text-white sm:inline" href="#workflow">
              Workflow
            </Link>
            <Link className="hidden text-[#c9d2ca] hover:text-white sm:inline" href="/trust">
              Trust
            </Link>
            <a
              className="inline-flex items-center gap-2 rounded-md border border-[#f2c86b]/70 bg-[#f2c86b] px-3 py-2 font-medium text-[#12110c] hover:bg-[#ffd77a]"
              href={cognitoLogin.href}
            >
              Sign in
              <ArrowRight size={15} aria-hidden />
            </a>
          </div>
        </nav>

        <div className="mx-auto grid min-h-[720px] w-full max-w-7xl content-end px-5 pb-8 pt-16 sm:px-8 lg:min-h-[760px]">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-end">
            <div className="max-w-4xl pb-4">
              <div className="mb-6 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-[#d7c184]">
                <span>Defense-qualified sourcing</span>
                <span className="h-px w-8 bg-[#d7c184]" />
                <span>Curated network + software layer</span>
              </div>
              <h1 className="max-w-5xl text-5xl font-semibold leading-[0.98] tracking-normal text-white sm:text-6xl lg:text-7xl">
                Stop releasing controlled RFQs to suppliers you cannot defend.
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-[#c8d1ca]">
                Sovereign Source helps aerospace, naval, and defense buyers upload a drawing or PO,
                qualify suppliers by facility and evidence, and route controlled packages through a
                secure RFQ workflow.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#e8f6df] px-5 py-3 text-sm font-semibold text-[#102017] hover:bg-white"
                  href={cognitoLogin.href}
                >
                  Sign in with Cognito
                  <LockKeyhole size={16} aria-hidden />
                </a>
                <Link
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  href="/request-access"
                >
                  Request pilot access
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
              <p className="mt-3 text-sm text-[#91a097]">
                {cognitoLogin.isConfigured
                  ? `Cognito redirects back to ${cognitoLogin.redirectUri}.`
                  : "Cognito environment variables are not configured yet, so sign-in opens demo mode."}
              </p>
            </div>

            <div className="rounded-lg border border-white/12 bg-[#0d1411]/95 p-4 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[#aeb9b1]">Live sourcing packet</p>
                  <p className="mt-1 font-medium text-white">Controlled titanium bracket</p>
                </div>
                <span className="rounded-md border border-[#f2c86b]/50 bg-[#2a2310] px-2 py-1 text-xs text-[#f2d88d]">
                  manual review
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <PreviewRow label="Upload" value="Drawing + PO lines loaded" tone="neutral" />
                <PreviewRow label="Evidence" value="AS9100, ITAR evidence, JCP DD2345" tone="good" />
                <PreviewRow label="Gate" value="CMMC Level 2 manual review required" tone="warn" />
                <PreviewRow label="Data room" value="Access suspended until review clears" tone="bad" />
              </div>

              <div className="mt-5 rounded-lg border border-white/10 bg-[#111a16] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Qualified shortlist</p>
                  <span className="text-xs text-[#aeb9b1]">3 of 5 shown</span>
                </div>
                <div className="mt-3 grid gap-2">
                  <SupplierRow name="Vector Aero Machining" detail="100 score · evidence valid" tone="good" />
                  <SupplierRow name="Keystone Secure Fabrication" detail="85 score · manual review required" tone="warn" />
                  <SupplierRow name="Talon Precision Group" detail="44 score · access suspended" tone="bad" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#d8ddd2] bg-[#f7f8f4] text-[#1b1f1c]">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6f5a17]">The painful gap</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
              Manual sourcing breaks exactly where controlled manufacturing gets risky.
            </h2>
          </div>
          <div className="grid gap-3">
            {painPoints.map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-[#d9ded4] bg-white p-4">
                <FileLock2 className="mt-0.5 shrink-0 text-[#8a2f25]" size={18} aria-hidden />
                <p className="text-sm leading-6 text-[#4e5a51]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="bg-[#f7f8f4] text-[#1b1f1c]">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#315c4a]">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                Instant intake, curated qualification, built for controlled RFQs.
              </h2>
              <p className="mt-4 text-sm leading-6 text-[#5e665d]">
                The product promise is not autonomous compliance. It is faster sourcing with visible
                evidence gates, human review, and controlled file routing.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {workflow.map(({ title, detail, Icon }) => (
                <div key={title} className="rounded-lg border border-[#d9ded4] bg-white p-4">
                  <span className="grid size-9 place-items-center rounded-md bg-[#eef2ea] text-[#315c4a]">
                    <Icon size={18} aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5e665d]">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#101612] text-[#eef6ee]">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f2c86b]">The outcome</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
              Procurement can move faster without pretending risk went away.
            </h2>
          </div>
          <div className="grid gap-3">
            {outcomes.map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
                <CheckCircle2 className="mt-0.5 shrink-0 text-[#aee1b8]" size={18} aria-hidden />
                <p className="text-sm leading-6 text-[#d3ddd5]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="proof" className="bg-[#f7f8f4] text-[#1b1f1c]">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="rounded-lg border border-[#d9ded4] bg-white p-5">
            <div className="flex items-center gap-2">
              <SearchCheck size={20} className="text-[#315c4a]" aria-hidden />
              <h2 className="text-xl font-semibold">What the demo supports today</h2>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {trustSignals.map((signal) => (
                <div key={signal} className="rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 text-sm">
                  {signal}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[#dfc47a] bg-[#fff9e7] p-5">
            <div className="flex items-center gap-2">
              <BadgeCheck size={20} className="text-[#7a5a11]" aria-hidden />
              <h2 className="text-xl font-semibold">Safe promise</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#5e4d20]">
              Reduce wasted controlled RFQ cycles and document why supplier access was released,
              paused, or routed to manual review. The platform records evidence and enforces
              buyer-defined gates; it does not certify supplier compliance.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#080b0a] text-[#f6f2e8]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-14 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f2c86b]">Pilot-ready workflow</p>
            <h2 className="mt-2 text-3xl font-semibold">Bring discipline to your next controlled RFQ.</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#e8f6df] px-5 py-3 text-sm font-semibold text-[#102017] hover:bg-white"
              href={cognitoLogin.href}
            >
              Sign in with Cognito
              <LockKeyhole size={16} aria-hidden />
            </a>
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              href="/request-access"
            >
              Request pilot access
              <RadioTower size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function PreviewRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClass = {
    good: "text-[#aee1b8]",
    warn: "text-[#f2d88d]",
    bad: "text-[#ffb4a8]",
    neutral: "text-[#b6c3bb]",
  }[tone];

  return (
    <div className="grid gap-1 rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-[#8f9d94]">{label}</p>
      <p className={`text-sm ${toneClass}`}>{value}</p>
    </div>
  );
}

function SupplierRow({
  name,
  detail,
  tone,
}: {
  name: string;
  detail: string;
  tone: "good" | "warn" | "bad";
}) {
  const markerClass = {
    good: "bg-[#aee1b8]",
    warn: "bg-[#f2c86b]",
    bad: "bg-[#ff9f8f]",
  }[tone];

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-[#0b100d] p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{name}</p>
        <p className="mt-1 text-xs text-[#9ca9a1]">{detail}</p>
      </div>
      <span className={`size-2 shrink-0 rounded-full ${markerClass}`} />
    </div>
  );
}
