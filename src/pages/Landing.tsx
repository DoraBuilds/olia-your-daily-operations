/**
 * Landing.tsx — Public marketing homepage for Olia.
 *
 * Lives at route "/" and is fully unauthenticated.
 * Does NOT use the app's Layout.tsx (no bottom nav).
 *
 * Structure:
 *   LandingNav        — sticky top nav with logo + CTAs
 *   HeroSection       — headline, subhead, CTAs, kiosk mockup
 *   PainSection       — 6 pain-point cards (white bg)
 *   HowItWorksSection — 3-step process (alabaster bg)
 *   StaffAdoptionSection — "Your team won't fight this" (white bg)
 *   FeaturesSection   — 6 feature cards (alabaster bg)
 *   HospitalitySection — differentiation, dark bg
 *   PricingSection    — 3-tier pricing (alabaster bg)
 *   FinalCtaSection   — closing CTA, dark bg
 *   LandingFooter     — links + legal
 */

import { LandingNav }            from "@/components/landing/LandingNav";
import { HeroSection }           from "@/components/landing/HeroSection";
import { PainSection }           from "@/components/landing/PainSection";
import { HowItWorksSection }     from "@/components/landing/HowItWorksSection";
import { StaffAdoptionSection }  from "@/components/landing/StaffAdoptionSection";
import { FeaturesSection }       from "@/components/landing/FeaturesSection";
import { HospitalitySection }    from "@/components/landing/HospitalitySection";
import { PricingSection }        from "@/components/landing/PricingSection";
import { FinalCtaSection }       from "@/components/landing/FinalCtaSection";
import { LandingFooter }         from "@/components/landing/LandingFooter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <HeroSection />
        <PainSection />
        <HowItWorksSection />
        <StaffAdoptionSection />
        <FeaturesSection />
        <HospitalitySection />
        <PricingSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
