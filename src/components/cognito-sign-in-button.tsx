"use client";

import { LockKeyhole } from "lucide-react";
import { startCognitoLogin } from "@/lib/auth-client";

export function CognitoSignInButton({ label = "Sign in" }: { label?: string }) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-md border border-[#f2c86b]/70 bg-[#f2c86b] px-3 py-2 text-sm font-medium text-[#12110c] hover:bg-[#ffd77a]"
      onClick={() => void startCognitoLogin()}
      type="button"
    >
      {label}
      <LockKeyhole size={15} aria-hidden />
    </button>
  );
}
