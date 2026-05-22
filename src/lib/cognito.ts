export type CognitoLogin = {
  href: string;
  isConfigured: boolean;
  redirectUri: string;
};

export function buildCognitoLogin(): CognitoLogin {
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const redirectUri =
    process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard`;
  const scope = process.env.NEXT_PUBLIC_COGNITO_SCOPE ?? "openid email profile";
  const responseType = process.env.NEXT_PUBLIC_COGNITO_RESPONSE_TYPE ?? "code";

  if (!domain || !clientId) {
    return {
      href: "/dashboard?auth=demo",
      isConfigured: false,
      redirectUri,
    };
  }

  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const url = new URL("/login", baseUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", responseType);
  url.searchParams.set("scope", scope);
  url.searchParams.set("redirect_uri", redirectUri);

  return {
    href: url.toString(),
    isConfigured: true,
    redirectUri,
  };
}
