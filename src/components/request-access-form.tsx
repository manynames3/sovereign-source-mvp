"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

type FormState = "idle" | "submitting" | "success" | "error";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export function RequestAccessForm() {
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setState("submitting");
    setMessage("");

    if (!apiBaseUrl) {
      setState("error");
      setMessage("Request capture is not configured for this deployment yet.");
      return;
    }

    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      company: String(formData.get("company") ?? ""),
      role: String(formData.get("role") ?? ""),
      use_case: String(formData.get("use_case") ?? ""),
      estimated_monthly_rfqs: Number(formData.get("estimated_monthly_rfqs") || 0),
      notes: String(formData.get("notes") ?? ""),
      consent_to_contact: formData.get("consent_to_contact") === "on",
    };

    try {
      const response = await fetch(`${apiBaseUrl}/access/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? "Request could not be submitted.");
      }

      const body = (await response.json()) as { request_id: string };
      setState("success");
      setMessage(`Request captured: ${body.request_id}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Request could not be submitted.");
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
      className="rounded-lg border border-[#d9ded4] bg-white p-5 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" placeholder="Ada Mason" required />
        <Field label="Work email" name="email" placeholder="ada@example.com" required type="email" />
        <Field label="Company" name="company" placeholder="Apex Metal Buyers" required />
        <Field label="Role" name="role" placeholder="Procurement lead" required />
        <Field
          label="Estimated monthly RFQs"
          name="estimated_monthly_rfqs"
          placeholder="25"
          type="number"
        />
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-[#2d352f]">Use case</span>
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border border-[#cfd8cf] bg-[#fbfcf8] px-3 py-2 text-sm outline-none focus:border-[#315c4a]"
          name="use_case"
          placeholder="What controlled RFQ, supplier evidence, or custom metal ordering workflow do you want to pilot?"
          required
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-[#2d352f]">Notes</span>
        <textarea
          className="mt-2 min-h-20 w-full rounded-md border border-[#cfd8cf] bg-[#fbfcf8] px-3 py-2 text-sm outline-none focus:border-[#315c4a]"
          name="notes"
          placeholder="Do not include controlled technical data."
        />
      </label>

      <label className="mt-4 flex gap-3 text-sm leading-6 text-[#4f5a51]">
        <input
          className="mt-1 size-4 rounded border-[#9cab9e]"
          name="consent_to_contact"
          required
          type="checkbox"
        />
        <span>
          I agree to be contacted about a demo or pilot review. I will not upload ITAR, CUI, CDI, or
          controlled technical data through this form.
        </span>
      </label>

      <button
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#173f2f] px-5 py-3 text-sm font-semibold text-white hover:bg-[#225941] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={state === "submitting"}
        type="submit"
      >
        {state === "submitting" ? <Loader2 className="animate-spin" size={16} aria-hidden /> : null}
        Submit request
        {state !== "submitting" ? <ArrowRight size={16} aria-hidden /> : null}
      </button>

      {message ? (
        <div
          className={`mt-4 flex gap-2 rounded-md border p-3 text-sm ${
            state === "success"
              ? "border-[#b8d9bd] bg-[#f0f8ef] text-[#24452a]"
              : "border-[#e8c0b8] bg-[#fff2ef] text-[#7a271d]"
          }`}
        >
          {state === "success" ? <CheckCircle2 className="mt-0.5 shrink-0" size={16} aria-hidden /> : null}
          <span>{message}</span>
        </div>
      ) : null}
    </form>
  );
}

function Field({
  label,
  name,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#2d352f]">{label}</span>
      <input
        className="mt-2 w-full rounded-md border border-[#cfd8cf] bg-[#fbfcf8] px-3 py-2 text-sm outline-none focus:border-[#315c4a]"
        min={type === "number" ? 0 : undefined}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}
