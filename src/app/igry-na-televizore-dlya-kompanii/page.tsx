import type { Metadata } from "next";
import { LandingView } from "@/components/seo/landing-view";
import { landingMetadata, tvLanding } from "@/lib/seo/landings";

export const metadata: Metadata = landingMetadata(tvLanding);

export default function TvPartyPage() {
  return <LandingView page={tvLanding} />;
}
