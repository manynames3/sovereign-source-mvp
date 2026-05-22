import Link from "next/link";
import {
  ArrowRight,
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
  UsersRound,
} from "lucide-react";
import { CognitoSignInButton } from "@/components/cognito-sign-in-button";
import type { CognitoLogin } from "@/lib/cognito";

type LandingPageProps = {
  cognitoLogin: CognitoLogin;
};

const workflow = [
  {
    title: "Intake package",
    detail: "Drawing, model, PO, BOM, and flowdown files stay attached to one source request.",
    Icon: UploadCloud,
  },
  {
    title: "Review evidence",
    detail: "Facility capability, evidence status, expiration, and manual review states are visible before release.",
    Icon: ClipboardCheck,
  },
  {
    title: "Route RFQ",
    detail: "Controlled RFQs move through buyer-defined access gates instead of uncontrolled attachments.",
    Icon: Route,
  },
  {
    title: "Export audit",
    detail: "Buyer teams can export who saw what, when, and why across the data-room workflow.",
    Icon: FileText,
  },
];

const pilotCards = [
  {
    name: "Source Request",
    detail: "Upload a controlled package and detect package requirements.",
    price: "Intake",
  },
  {
    name: "Evidence Gate",
    detail: "Review supplier evidence, expiration, facility fit, and exceptions.",
    price: "Review",
    featured: true,
  },
  {
    name: "RFQ Release",
    detail: "Invite only approved suppliers and preserve audit records.",
    price: "Route",
  },
];

const proofSignals = [
  "Deterministic match reasons",
  "Evidence expiration warnings",
  "Manual review workflow",
  "Server-side audit log path",
  "Signed document access path",
  "No platform compliance certification claim",
];

const faqs = [
  {
    question: "Does Sovereign Source certify supplier compliance?",
    answer:
      "No. The platform helps buyers organize evidence, review status, and access decisions. Final supplier and compliance decisions stay with the buyer.",
  },
  {
    question: "Is this a supplier marketplace?",
    answer:
      "No. The pilot workflow is focused on controlled RFQ intake, evidence-gated routing, data-room access, and audit records.",
  },
  {
    question: "What happens when supplier evidence expires?",
    answer:
      "The workflow can show access suspended, route the package to manual review, and preserve the reason in the audit trail.",
  },
  {
    question: "Can suppliers receive files through email?",
    answer: "The intended workflow uses secure data-room access instead of uncontrolled file attachments.",
  },
  {
    question: "Is the instant match result final?",
    answer: "No. Sensitive or uncertain packages can require manual review before RFQ release.",
  },
  {
    question: "Who is this for?",
    answer:
      "Defense, aerospace, naval, and advanced manufacturing buyers sourcing controlled or sensitive metal-part work.",
  },
];

export function LandingPage({ cognitoLogin }: LandingPageProps) {
  return (
    <main className="min-h-screen bg-white text-[#0b1220]">
      <section className="relative isolate overflow-hidden bg-[#043873] text-white">
        <HeroBackground />
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid size-10 place-items-center rounded-md bg-white text-[#043873]">
              <ShieldCheck size={20} aria-hidden />
            </span>
            <span className="text-lg font-semibold tracking-[0.01em]">Sovereign Source</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-white/78 md:flex">
            <Link className="hover:text-white" href="#workflow">
              Workflow
            </Link>
            <Link className="hover:text-white" href="#pilot">
              Pilot
            </Link>
            <Link className="hover:text-white" href="/trust">
              Trust
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className="hidden rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 sm:inline-flex"
              href="/dashboard?auth=demo"
            >
              Dashboard
            </Link>
            <CognitoSignInButton />
          </div>
        </nav>

        <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(520px,1.12fr)] lg:items-center lg:pb-28 lg:pt-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#ffe492]">
              <FileLock2 size={14} aria-hidden />
              Controlled RFQ release
            </div>
            <h1 className="mt-6 max-w-4xl text-5xl font-bold leading-[1.02] tracking-normal sm:text-6xl lg:text-7xl">
              Stop Sending Controlled RFQs Into the Dark
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#d7e8ff]">
              Sovereign Source helps defense, aerospace, and naval buyers qualify supplier capability and evidence
              before releasing sensitive RFQ packages.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#ffe492] px-5 py-3 text-sm font-semibold text-[#043873] hover:bg-white"
                href="/request-access"
              >
                Request pilot access
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/25 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                href="/dashboard?auth=demo"
              >
                View demo dashboard
              </Link>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#b9d7fb]">
              {cognitoLogin.isConfigured
                ? `Cognito redirects back to ${cognitoLogin.redirectUri}.`
                : "Cognito environment variables are not configured yet, so sign-in opens demo mode."}
            </p>
          </div>

          <HeroIllustration />
        </div>
      </section>

      <AlternatingSection
        eyebrow="Project management"
        title="One package, one reviewed release path"
        body="Controlled sourcing still runs through email, spreadsheets, stale supplier lists, and scattered evidence folders. Sovereign Source gives the buyer one place to prepare the package before files move."
        cta="Start pilot review"
        href="/request-access"
        visual={<PackageIllustration />}
      />

      <AlternatingSection
        eyebrow="Work together"
        title="Bring buyer, reviewer, and supplier work into one flow"
        body="Procurement, compliance, and supplier response work should not live in separate inbox threads. The pilot workspace keeps review state, data-room access, and supplier response status connected."
        cta="View demo dashboard"
        href="/dashboard?auth=demo"
        reverse
        visual={<CollaborationIllustration />}
      />

      <section id="workflow" className="relative isolate overflow-hidden bg-[#043873] text-white">
        <HeroBackground />
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#ffe492]">
              Use as controlled sourcing infrastructure
            </p>
            <h2 className="mt-3 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">
              Evidence gates before data-room release
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-[#d7e8ff]">
              Upload a drawing, PO, or work package. Review supplier capability and evidence. Release controlled RFQs
              only when access is valid, manually approved, and logged.
            </p>
            <Link
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-md bg-[#4f9cf9] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2f7fe5]"
              href="/request-access"
            >
              Request access
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workflow.map(({ title, detail, Icon }) => (
              <div key={title} className="rounded-lg border border-white/15 bg-white/8 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.16)]">
                <span className="grid size-10 place-items-center rounded-md bg-[#4f9cf9] text-white">
                  <Icon size={19} aria-hidden />
                </span>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#d7e8ff]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <AlternatingSection
        eyebrow="Customise access to your needs"
        title="Buyer-defined gates for sensitive packages"
        body="Evidence valid, manual review required, and access suspended states keep the workflow honest. The platform does not certify compliance; it records evidence and routes buyer decisions."
        cta="Read trust page"
        href="/trust"
        visual={<EvidenceIllustration />}
      />

      <section id="pilot" className="bg-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f9cf9]">Choose your pilot path</p>
            <h2 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
              Start with the narrow workflow that proves value
            </h2>
            <p className="mt-5 text-base leading-8 text-[#526173]">
              The sellable pilot should prove fewer wasted RFQs and lower data-release risk before broader supplier
              network expansion.
            </p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {pilotCards.map((card) => (
              <div
                key={card.name}
                className={`rounded-lg border p-6 ${
                  card.featured
                    ? "border-[#ffe492] bg-[#043873] text-white shadow-[0_24px_70px_rgba(4,56,115,0.24)]"
                    : "border-[#dbe5f2] bg-[#f8fbff]"
                }`}
              >
                <p className={card.featured ? "text-sm text-[#ffe492]" : "text-sm text-[#4f9cf9]"}>{card.price}</p>
                <h3 className="mt-3 text-2xl font-bold">{card.name}</h3>
                <p className={card.featured ? "mt-4 text-sm leading-6 text-[#d7e8ff]" : "mt-4 text-sm leading-6 text-[#526173]"}>
                  {card.detail}
                </p>
                <Link
                  className={`mt-6 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${
                    card.featured
                      ? "bg-[#ffe492] text-[#043873] hover:bg-white"
                      : "bg-[#4f9cf9] text-white hover:bg-[#2f7fe5]"
                  }`}
                  href="/request-access"
                >
                  Request pilot
                  <ArrowRight size={15} aria-hidden />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#043873] text-white">
        <HeroBackground />
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-20 text-center sm:px-8 lg:py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-4xl font-bold leading-tight sm:text-5xl">
              Your controlled work, everywhere buyers need the record
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#d7e8ff]">
              Keep the access story attached to the RFQ: package intake, review reasons, document access, supplier
              response, and final export.
            </p>
            <Link
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-[#ffe492] px-5 py-3 text-sm font-semibold text-[#043873] hover:bg-white"
              href="/request-access"
            >
              Request pilot access
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <section id="proof" className="bg-[#f7fbff]">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f9cf9]">Product proof</p>
            <h2 className="mt-3 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">
              Trust signals without unsupported compliance claims
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-[#526173]">
              The safe promise: reduce wasted controlled RFQ cycles and document why supplier access was released,
              paused, or routed to manual review.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {proofSignals.map((signal) => (
              <div key={signal} className="flex items-start gap-3 rounded-lg border border-[#dbe5f2] bg-white p-4">
                <SearchCheck className="mt-0.5 shrink-0 text-[#4f9cf9]" size={18} aria-hidden />
                <span className="text-sm font-medium leading-6">{signal}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f9cf9]">FAQ</p>
            <h2 className="mt-3 max-w-lg text-4xl font-bold leading-tight sm:text-5xl">
              Clear boundaries for a controlled pilot
            </h2>
          </div>
          <div className="grid gap-3">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-lg border border-[#dbe5f2] bg-[#f8fbff] p-5">
                <h3 className="font-semibold">{faq.question}</h3>
                <p className="mt-2 text-sm leading-6 text-[#526173]">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#043873] text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#ffe492]">Pilot-ready workflow</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-bold leading-tight">
              Build a safer RFQ release process before the next controlled package
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#d7e8ff]">
              Start with supplier evidence, controlled RFQ routing, and audit-ready data-room access.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#ffe492] px-5 py-3 text-sm font-semibold text-[#043873] hover:bg-white"
            href="/request-access"
          >
            Request pilot access
            <RadioTower size={16} aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  );
}

function HeroBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden opacity-45">
      <div className="absolute -left-24 top-28 h-80 w-80 rounded-full border border-white/15" />
      <div className="absolute right-8 top-24 h-96 w-96 rounded-full border border-white/10" />
      <div className="absolute inset-x-0 top-36 h-px bg-white/10" />
      <div className="absolute inset-x-0 bottom-28 h-px bg-white/10" />
      <div className="absolute left-0 top-0 h-full w-full bg-[linear-gradient(115deg,rgba(255,255,255,0.10)_0_1px,transparent_1px_72px)]" />
    </div>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block">
      <span className="relative z-10">{children}</span>
      <span className="absolute inset-x-0 bottom-1 -z-0 h-3 rounded-full bg-[#ffe492]" />
    </span>
  );
}

function AlternatingSection({
  eyebrow,
  title,
  body,
  cta,
  href,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="overflow-hidden bg-white">
      <div
        className={`mx-auto grid w-full max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-24 ${
          reverse ? "lg:[&>*:first-child]:order-2" : ""
        }`}
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f9cf9]">{eyebrow}</p>
          <h2 className="mt-3 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">
            {title.includes("reviewed") ? (
              <>
                One package, one <Highlight>reviewed</Highlight> release path
              </>
            ) : (
              title
            )}
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-[#526173]">{body}</p>
          <Link
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-md bg-[#4f9cf9] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2f7fe5]"
            href={href}
          >
            {cta}
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        {visual}
      </div>
    </section>
  );
}

function HeroIllustration() {
  return (
    <div className="relative mx-auto min-h-[520px] w-full max-w-[680px]">
      <div className="absolute left-8 top-10 h-80 w-80 rounded-full border border-[#9ecbff]/35" />
      <div className="absolute right-0 top-0 h-96 w-96 rounded-full border border-[#9ecbff]/25" />
      <div className="absolute left-8 top-24 w-[82%] rounded-xl bg-[#cfe7ff] p-6 shadow-[0_28px_70px_rgba(0,0,0,0.22)]">
        <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="grid content-between rounded-lg bg-[#eaf5ff] p-6 text-[#043873]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Supplier evidence</p>
              <h3 className="mt-5 text-3xl font-bold leading-tight">Access before release</h3>
            </div>
            <div className="mt-10 grid gap-3">
              <MiniStatus label="Evidence valid" tone="good" />
              <MiniStatus label="Manual review" tone="warn" />
              <MiniStatus label="Access suspended" tone="bad" />
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-lg bg-[#043873] p-5 text-white">
              <p className="text-xs uppercase tracking-[0.18em] text-[#9ecbff]">Controlled RFQ</p>
              <h3 className="mt-3 text-xl font-bold">Titanium aerospace bracket</h3>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <MetricPill value="25" label="parts" />
                <MetricPill value="5" label="axis" />
                <MetricPill value="3" label="gates" />
              </div>
            </div>
            <div className="grid gap-3 rounded-lg bg-white p-5 text-[#0b1220]">
              <LineItem label="STEP model" />
              <LineItem label="PDF drawing" />
              <LineItem label="PO / BOM workbook" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-14 left-0 hidden rounded-xl bg-white p-4 text-[#0b1220] shadow-xl sm:block">
        <div className="flex items-center gap-3">
          <UsersRound className="text-[#4f9cf9]" size={20} aria-hidden />
          <div>
            <p className="text-sm font-semibold">Buyer + reviewer</p>
            <p className="text-xs text-[#526173]">One access decision record</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-8 right-6 rounded-xl bg-[#ffe492] px-5 py-4 text-[#043873] shadow-xl">
        <p className="text-sm font-bold">RFQ ready</p>
        <p className="text-xs">after review</p>
      </div>
    </div>
  );
}

function PackageIllustration() {
  return (
    <div className="relative mx-auto min-h-[460px] w-full max-w-[620px]">
      <div className="absolute inset-8 rounded-full border border-[#dbe5f2]" />
      <div className="absolute left-0 top-20 rounded-xl bg-[#eaf5ff] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] sm:w-[74%]">
        <div className="rounded-lg bg-white p-5">
          <div className="flex items-center justify-between border-b border-[#dbe5f2] pb-4">
            <div>
              <p className="text-sm font-semibold">Package readiness</p>
              <p className="mt-1 text-xs text-[#526173]">Model, drawing, and PO/BOM present</p>
            </div>
            <span className="text-3xl font-bold text-[#4f9cf9]">100%</span>
          </div>
          <div className="mt-5 grid gap-3">
            {["STEP/STP model", "PDF drawing", "XLSX line list", "QA flowdown"].map((label) => (
              <LineItem key={label} label={label} />
            ))}
          </div>
        </div>
      </div>
      <div className="absolute bottom-4 right-0 w-64 rounded-xl bg-[#043873] p-5 text-white shadow-xl">
        <UploadCloud size={24} aria-hidden />
        <h3 className="mt-8 text-xl font-bold">Structured intake</h3>
        <p className="mt-2 text-sm leading-6 text-[#d7e8ff]">Requirements are normalized before supplier routing.</p>
      </div>
    </div>
  );
}

function CollaborationIllustration() {
  return (
    <div className="relative mx-auto min-h-[470px] w-full max-w-[620px]">
      <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#b9d7fb]" />
      <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#dbe5f2]" />
      <div className="absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-[#043873] text-white shadow-xl">
        <ShieldCheck size={34} aria-hidden />
      </div>
      <PersonaCard className="left-0 top-14" title="Buyer" detail="Prepares package" />
      <PersonaCard className="right-0 top-24" title="Reviewer" detail="Clears exception" />
      <PersonaCard className="bottom-12 left-16" title="Supplier" detail="Quotes or no-bids" />
      <div className="absolute bottom-16 right-6 rounded-xl bg-[#ffe492] px-5 py-4 text-[#043873] shadow-xl">
        <p className="text-sm font-bold">Shared record</p>
        <p className="text-xs">not an inbox thread</p>
      </div>
    </div>
  );
}

function EvidenceIllustration() {
  return (
    <div className="relative mx-auto min-h-[470px] w-full max-w-[620px]">
      <div className="absolute right-6 top-8 h-72 w-72 rounded-full bg-[#eaf5ff]" />
      <div className="absolute left-0 top-20 w-[84%] rounded-xl bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.14)]">
        <div className="rounded-lg bg-[#f8fbff] p-4">
          <p className="font-semibold">Facility evidence graph</p>
          <p className="mt-1 text-sm text-[#526173]">Capability, evidence, expiration, and access state.</p>
          <div className="mt-5 grid gap-3">
            <EvidenceRow supplier="Vector Aero Machining" score="100" status="Evidence valid" tone="good" />
            <EvidenceRow supplier="Keystone Secure Fabrication" score="85" status="Manual review required" tone="warn" />
            <EvidenceRow supplier="Talon Precision Group" score="44" status="Access suspended" tone="bad" />
          </div>
        </div>
      </div>
      <div className="absolute bottom-6 right-0 w-64 rounded-xl bg-[#043873] p-5 text-white shadow-xl">
        <LockKeyhole size={22} aria-hidden />
        <h3 className="mt-6 text-xl font-bold">Signed access path</h3>
        <p className="mt-2 text-sm leading-6 text-[#d7e8ff]">Data-room links are routed through invite state.</p>
      </div>
    </div>
  );
}

function MiniStatus({ label, tone }: { label: string; tone: "good" | "warn" | "bad" }) {
  const toneClass = {
    good: "bg-[#dff8ea] text-[#047857]",
    warn: "bg-[#fff5c2] text-[#8a6100]",
    bad: "bg-[#ffe1df] text-[#b42318]",
  }[tone];

  return <div className={`rounded-md px-3 py-2 text-sm font-semibold ${toneClass}`}>{label}</div>;
}

function MetricPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md bg-white/10 px-3 py-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs uppercase tracking-[0.14em] text-[#9ecbff]">{label}</p>
    </div>
  );
}

function LineItem({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[#dbe5f2] bg-white px-3 py-2 text-sm">
      <span>{label}</span>
      <CheckCircle2 size={15} className="text-[#16a34a]" aria-hidden />
    </div>
  );
}

function PersonaCard({ title, detail, className }: { title: string; detail: string; className: string }) {
  return (
    <div className={`absolute rounded-xl bg-white p-4 shadow-xl ${className}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-[#eaf5ff] text-[#4f9cf9]">
          <UsersRound size={18} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-[#526173]">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function EvidenceRow({
  supplier,
  score,
  status,
  tone,
}: {
  supplier: string;
  score: string;
  status: string;
  tone: "good" | "warn" | "bad";
}) {
  const toneClass = {
    good: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]",
    warn: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    bad: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
  }[tone];

  return (
    <div className="grid gap-3 rounded-lg border border-[#dbe5f2] bg-white p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="font-semibold">{supplier}</p>
        <p className="mt-1 text-sm text-[#526173]">Facility score {score}</p>
      </div>
      <span className={`w-max rounded-md border px-3 py-1 text-xs font-semibold ${toneClass}`}>{status}</span>
    </div>
  );
}
