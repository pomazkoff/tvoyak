import type { Metadata } from "next";
import { LandingView } from "@/components/seo/landing-view";
import { corporateLanding, landingMetadata } from "@/lib/seo/landings";

export const metadata: Metadata = landingMetadata(corporateLanding);

export default function CorporateQuizPage() {
  return <LandingView page={corporateLanding} />;
}
