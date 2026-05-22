import { LandingPage } from "@/components/landing-page";
import { buildCognitoLogin } from "@/lib/cognito";

export default function Home() {
  return <LandingPage cognitoLogin={buildCognitoLogin()} />;
}
