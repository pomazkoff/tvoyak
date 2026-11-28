import type { Metadata } from "next";
import { LandingView } from "@/components/seo/landing-view";
import { birthdayLanding, landingMetadata } from "@/lib/seo/landings";

export const metadata: Metadata = landingMetadata(birthdayLanding);

export default function BirthdayQuizPage() {
  return <LandingView page={birthdayLanding} />;
}
