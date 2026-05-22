"use client";

import type { DemoData } from "@/lib/domain";

export type StoredAuth = {
  idToken: string;
  accessToken?: string;
  expiresAt: number;
  email?: string;
  tenantId?: string;
  roles: string[];
};

type TokenResponse = {
  id_token: string;
  access_token?: string;
  expires_in?: number;
};

const authStorageKey = "sovereign_source_auth";
const verifierStorageKey = "sovereign_source_pkce_verifier";

export function apiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
}

export function cognitoConfig() {
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const fallbackOrigin =
    typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  const redirectUri =
    process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? fallbackOrigin}/dashboard`;
  return {
    domain: domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : "",
    clientId: clientId ?? "",
    redirectUri,
    scope: process.env.NEXT_PUBLIC_COGNITO_SCOPE ?? "openid email profile",
  };
}

export function isAuthConfigured() {
  const config = cognitoConfig();
  return Boolean(config.domain && config.clientId);
}

export async function startCognitoLogin() {
  const config = cognitoConfig();
  if (!config.domain || !config.clientId) {
    window.location.assign("/dashboard?auth=demo");
    return;
  }

  const verifier = randomVerifier();
  const challenge = await pkceChallenge(verifier);
  window.localStorage.setItem(verifierStorageKey, verifier);

  const url = new URL("/login", config.domain);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  window.location.assign(url.toString());
}

export async function completeCognitoRedirect() {
  if (!isAuthConfigured()) {
    return undefined;
  }

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) {
    return getStoredAuth();
  }

  const verifier = window.localStorage.getItem(verifierStorageKey);
  if (!verifier) {
    throw new Error("Missing Cognito login verifier. Please sign in again.");
  }

  const config = cognitoConfig();
  const response = await fetch(`${config.domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    throw new Error("Cognito sign-in could not be completed.");
  }

  const token = (await response.json()) as TokenResponse;
  const auth = authFromToken(token);
  window.localStorage.setItem(authStorageKey, JSON.stringify(auth));
  window.localStorage.removeItem(verifierStorageKey);
  window.history.replaceState(null, "", "/dashboard");
  return auth;
}

export function getStoredAuth() {
  const raw = window.localStorage.getItem(authStorageKey);
  if (!raw) {
    return undefined;
  }
  const auth = JSON.parse(raw) as StoredAuth;
  if (auth.expiresAt <= Date.now() + 30_000) {
    clearStoredAuth();
    return undefined;
  }
  return auth;
}

export function clearStoredAuth() {
  window.localStorage.removeItem(authStorageKey);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, auth = getStoredAuth()) {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) {
    throw new Error("API base URL is not configured.");
  }
  if (!auth?.idToken) {
    throw new Error("Sign in required.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${auth.idToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { detail?: string } | undefined;
    throw new Error(body?.detail ?? `API request failed with ${response.status}.`);
  }
  return (await response.json()) as T;
}

export type DashboardStateResponse = {
  tenant_id: string;
  data: DemoData;
};

function authFromToken(token: TokenResponse): StoredAuth {
  const claims = parseJwt(token.id_token);
  const groups = Array.isArray(claims["cognito:groups"]) ? claims["cognito:groups"].map(String) : [];
  return {
    idToken: token.id_token,
    accessToken: token.access_token,
    expiresAt: Date.now() + Number(token.expires_in ?? 3600) * 1000,
    email: typeof claims.email === "string" ? claims.email : undefined,
    tenantId: typeof claims["custom:tenant_id"] === "string" ? claims["custom:tenant_id"] : undefined,
    roles: groups,
  };
}

function parseJwt(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    return {};
  }
  return JSON.parse(window.atob(base64UrlToBase64(payload))) as Record<string, unknown>;
}

function randomVerifier() {
  const bytes = new Uint8Array(64);
  window.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function pkceChallenge(verifier: string) {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBase64(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return padded.replace(/-/g, "+").replace(/_/g, "/");
}
