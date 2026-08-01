import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DemoModal } from "@/components/landing/DemoModal";

/**
 * About Olia — companion page to the Sunday-remix landing experiment.
 * Same design system (white + teal blue #00E5CC, Hanken Grotesk / Cormorant Garamond).
 * Local preview only, not linked from any nav or the real site.
 */

const css = `
  .olia-remix *, .olia-remix *::before, .olia-remix *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .olia-remix {
    --ink: #0B0F0C;
    --ink-soft: #4B564F;
    --ink-faint: #7C877F;
    --white: #FFFFFF;
    --paper: #FAFCF8;
    --line: rgba(11,15,12,0.1);
    --line-mid: rgba(11,15,12,0.16);
    --neon: #00E5CC;
    --neon-deep: #007E70;
    --black-panel: #0B0F0C;
    --black-panel-soft: #151A16;
    --shadow-sm: 0 2px 14px rgba(11,15,12,0.06);
    --shadow-lg: 0 20px 56px rgba(11,15,12,0.12);
    --r: 14px;
    font-family: 'Hanken Grotesk', system-ui, sans-serif;
    color: var(--ink);
    background: var(--white);
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  .olia-remix h1, .olia-remix h2, .olia-remix h3 {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; line-height: 1.12; color: var(--ink);
  }

  .rx-badge {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 10.5px; font-weight: 600; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--ink); margin-bottom: 16px;
  }
  .rx-badge-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--neon); box-shadow: 0 0 0 4px rgba(0,229,204,0.18); flex-shrink: 0; }
  .rx-badge.on-dark { color: rgba(255,255,255,0.82); }
  .rx-badge.centered { justify-content: center; }

  .rx-container { max-width: 1180px; margin: 0 auto; padding: 0 40px; }
  .olia-remix section { padding: 56px 0; }

  /* NAV */
  .rx-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
    height: 68px; display: flex; align-items: center; padding: 0 40px;
    transition: background 0.3s, box-shadow 0.3s;
  }
  .rx-nav.scrolled { background: rgba(255,255,255,0.92); backdrop-filter: blur(14px); box-shadow: 0 1px 0 var(--line); }
  .rx-nav-inner { display: flex; align-items: center; width: 100%; max-width: 1180px; margin: 0 auto; }
  .rx-logo {
    display: flex; align-items: center; gap: 9px;
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: 22px; font-weight: 600; color: var(--ink); text-decoration: none; margin-right: 48px;
  }
  .rx-logo-mark { width: 26px; height: 26px; display: block; flex-shrink: 0; }
  .rx-nav-links { display: flex; gap: 30px; list-style: none; }
  .rx-nav-links a { font-size: 13.5px; color: var(--ink-soft); text-decoration: none; transition: color 0.2s; }
  .rx-nav-links a:hover, .rx-nav-links a.active { color: var(--ink); }
  .rx-nav-actions { margin-left: auto; display: flex; align-items: center; gap: 16px; }
  .rx-signin { font-size: 13.5px; color: var(--ink-soft); text-decoration: none; transition: color 0.2s; }
  .rx-signin:hover { color: var(--ink); }
  .rx-btn-ghost {
    font-size: 13px; font-weight: 500; color: var(--ink); background: #fff;
    border: 1.5px solid var(--line-mid); padding: 8px 18px; border-radius: 8px;
    cursor: pointer; text-decoration: none; transition: border-color 0.2s, background 0.2s;
  }
  .rx-btn-ghost:hover { border-color: var(--ink); background: #f2f2f2; }
  .rx-btn-neon {
    display: block; font-size: 13px; font-weight: 700; color: #fff; background: var(--black-panel);
    border: 1.5px solid var(--black-panel); padding: 8px 18px; border-radius: 8px;
    cursor: pointer; text-decoration: none; transition: transform 0.15s, background 0.2s;
  }
  .rx-btn-neon:hover { background: var(--black-panel-soft); transform: translateY(-1px); }

  /* SHINE BORDER */
  .rx-shine-wrap { position: relative; display: inline-block; padding: 3px; border-radius: 13px; overflow: hidden; background: rgba(0,229,204,0.55); }
  .rx-shine-wrap::before {
    content: ''; position: absolute; inset: -60%;
    background: conic-gradient(from 0deg, transparent 0deg, transparent 220deg, rgba(0,229,204,0.5) 255deg, var(--neon) 285deg, #ffffff 300deg, var(--neon) 315deg, rgba(0,229,204,0.5) 345deg, transparent 360deg);
    animation: rx-shine-spin 2.8s linear infinite;
  }
  .rx-shine-wrap > * { position: relative; z-index: 1; }
  @keyframes rx-shine-spin { to { transform: rotate(360deg); } }

  .rx-hl {
    font-style: italic; color: var(--ink);
    background: rgba(0,229,204,0.6);
    padding: 0 4px; margin: 0 -4px; line-height: 0.86;
    box-decoration-break: clone; -webkit-box-decoration-break: clone;
    border-radius: 60% 8px 60% 8px / 20% 60% 20% 60%;
    display: inline; transform: rotate(-1deg);
  }
  .rx-mark {
    font-style: inherit; color: inherit; font-weight: 700;
    background: rgba(0,229,204,0.6); padding: 0 4px; margin: 0 -4px; white-space: nowrap;
    box-decoration-break: clone; -webkit-box-decoration-break: clone;
    border-radius: 50% 6px 50% 6px / 16% 50% 16% 50%; transform: rotate(-1deg);
  }
  .rx-strike { position: relative; color: var(--ink-faint); }
  .rx-strike::after {
    content: ''; position: absolute; left: -2%; right: -2%; top: 52%; height: 3px;
    background: var(--neon); transform: rotate(-2deg);
  }

  /* HAND-DRAWN DOODLES */
  .rx-doodle-word { position: relative; display: inline-block; white-space: nowrap; }
  .rx-doodle-underline {
    position: absolute; left: 0; bottom: -9px; width: 100%; height: 12px;
    color: var(--neon); transform: rotate(-1deg);
  }

  .rx-section-header { text-align: center; margin-bottom: 36px; }
  .rx-section-header h2 { font-size: clamp(30px, 3.8vw, 46px); max-width: 640px; margin: 0 auto 14px; }
  .rx-section-header p { font-size: 15.5px; font-weight: 300; color: var(--ink-soft); max-width: 540px; margin: 0 auto; line-height: 1.65; }

  /* ABOUT HERO */
  .rx-about-hero { padding: 100px 0 44px; background: var(--white); position: relative; }
  .rx-about-hero::before {
    content: ''; position: absolute; top: -120px; right: -140px; width: 520px; height: 520px;
    background: radial-gradient(circle, rgba(0,229,204,0.22) 0%, transparent 70%);
    filter: blur(10px); pointer-events: none;
  }
  .rx-about-hero-inner {
    display: grid; grid-template-columns: 1fr 420px; gap: 48px; align-items: center;
    max-width: 1180px; margin: 0 auto; padding: 0 40px; position: relative;
  }
  .rx-about-hero h1 { font-size: clamp(40px, 5vw, 60px); letter-spacing: -0.01em; margin-bottom: 20px; }
  .rx-about-hero-sub { font-size: 17.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; max-width: 480px; }

  /* founders preview panel in hero */
  .rx-founders-card { background: var(--black-panel); border-radius: 20px; padding: 22px 26px; box-shadow: var(--shadow-lg), 0 0 0 1px rgba(0,229,204,0.12); transform: rotate(-1.4deg); }
  .rx-founders-label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(0,229,204,0.75); margin-bottom: 16px; }
  .rx-founders-row { display: flex; gap: 16px; }
  .rx-founder-mini { flex: 1; text-align: center; }
  .rx-avatar {
    width: 116px; height: 116px; border-radius: 50%; margin: 0 auto 12px;
    display: flex; align-items: center; justify-content: center; overflow: hidden;
    background: var(--black-panel-soft); border: 2px solid var(--neon);
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: var(--neon);
  }
  .rx-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .rx-founder-mini-name { font-size: 14.5px; font-weight: 700; color: #fff; margin-bottom: 2px; }
  .rx-founder-mini-role { font-size: 10.5px; color: var(--neon); opacity: 0.85; }

  /* COMPANY / STORY (centered) */
  .rx-story { background: var(--paper); }
  .rx-story-inner { max-width: 700px; margin: 0 auto; text-align: center; }
  .rx-story-inner .rx-badge { justify-content: center; }
  .rx-story-copy h2 { font-size: clamp(28px, 3.4vw, 42px); margin-bottom: 16px; line-height: 1.18; }
  .rx-story-copy p { font-size: 15.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.75; margin-bottom: 16px; text-align: left; }

  /* FOUNDERS (side-by-side cards) */
  .rx-founders { background: var(--white); }
  .rx-founder-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: stretch; }
  .rx-founder-card {
    background: var(--paper); border: 1px solid var(--line); border-radius: var(--r);
    padding: 28px 26px; display: flex; flex-direction: column;
  }
  .rx-founder-portrait {
    width: 96px; height: 96px; border-radius: 50%; margin-bottom: 20px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: var(--black-panel); border: 2px solid var(--neon);
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; color: var(--neon);
  }
  .rx-founder-portrait img { width: 100%; height: 100%; object-fit: cover; }
  .rx-founder-name { font-size: 21px; margin-bottom: 3px; }
  .rx-founder-role { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--neon); margin-bottom: 16px; }
  .rx-founder-bio p { font-size: 14px; font-weight: 300; color: var(--ink-soft); line-height: 1.7; margin-bottom: 12px; }
  .rx-founder-offclock {
    margin-top: auto; padding-top: 16px; border-top: 1px dashed var(--line-mid);
  }
  .rx-founder-offclock-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 8px; }
  .rx-founder-offclock p { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 15px; font-weight: 500; color: var(--ink); line-height: 1.5; }
  .rx-founder-link { align-self: flex-start; margin-top: 16px; font-size: 12.5px; font-weight: 600; color: var(--ink); text-decoration: none; border-bottom: 1.5px solid var(--neon); padding-bottom: 1px; }

  /* VALUES (after founders) */
  .rx-values { background: var(--white); }
  .rx-values-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
  .rx-value-num { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 15px; color: var(--neon-deep); display: block; margin-bottom: 10px; }
  .rx-value-col h3 { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 7px; letter-spacing: -0.01em; }
  .rx-value-col p { font-size: 13.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; }

  /* CLOSING NOTE */
  .rx-note { background: var(--paper); text-align: center; }
  .rx-note-inner { max-width: 780px; margin: 0 auto; }
  .rx-note p { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: clamp(20px, 2.6vw, 28px); font-weight: 500; color: var(--ink); line-height: 1.5; }

  /* MANIFESTO */
  .rx-manifesto { background: var(--black-panel); position: relative; overflow: hidden; }
  .rx-manifesto::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(0,229,204,0.05) 1px, transparent 1px); background-size: 30px 30px; pointer-events: none; }
  .rx-manifesto-inner { position: relative; }
  .rx-manifesto-header { text-align: center; max-width: 680px; margin: 0 auto 40px; }
  .rx-manifesto-header h2 { color: var(--white); font-size: clamp(32px, 4.4vw, 52px); line-height: 1.15; margin-bottom: 18px; }
  .rx-manifesto-header p { font-size: 15.5px; font-weight: 300; color: rgba(255,255,255,0.55); line-height: 1.7; }
  .rx-manifesto-list { list-style: none; counter-reset: manifesto; max-width: 760px; margin: 0 auto; }
  .rx-manifesto-item {
    counter-increment: manifesto; display: flex; gap: 22px; padding: 20px 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .rx-manifesto-item:first-child { padding-top: 0; }
  .rx-manifesto-item:last-child { border-bottom: none; padding-bottom: 0; }
  .rx-manifesto-item::before {
    content: counter(manifesto, decimal-leading-zero);
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; color: var(--neon);
    flex-shrink: 0; width: 34px; padding-top: 2px;
  }
  .rx-manifesto-item h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 22px; font-weight: 500; color: var(--white); margin-bottom: 6px; }
  .rx-manifesto-item p { font-size: 14px; font-weight: 300; color: rgba(255,255,255,0.55); line-height: 1.7; }

  /* CTA */
  .rx-cta { background: var(--paper); text-align: center; padding: 60px 0; }
  .rx-cta h2 { font-size: clamp(30px, 4vw, 46px); max-width: 600px; margin: 0 auto 18px; line-height: 1.15; }
  .rx-cta-sub { font-size: 16px; font-weight: 300; color: var(--ink-soft); max-width: 440px; margin: 0 auto 28px; line-height: 1.6; }
  .rx-cta-btns { display: flex; align-items: center; justify-content: center; gap: 14px; }
  .rx-btn-hero {
    display: block; font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 700;
    color: #fff; background: var(--black-panel); border: 1.5px solid var(--black-panel);
    padding: 13px 26px; border-radius: 9px; text-decoration: none; transition: transform 0.15s, background 0.2s;
  }
  .rx-btn-hero:hover { background: var(--black-panel-soft); transform: translateY(-2px); }

  /* FOOTER */
  .rx-footer { background: var(--white); border-top: 1px solid var(--line); padding: 36px 0 28px; }
  .rx-footer-inner { display: grid; grid-template-columns: 220px 1fr auto; gap: 32px; align-items: center; max-width: 1180px; margin: 0 auto; padding: 0 40px; }
  .rx-footer-logo { display: flex; align-items: center; gap: 9px; font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 21px; font-weight: 600; color: var(--ink); text-decoration: none; margin-bottom: 6px; }
  .rx-footer-logo-mark { width: 26px; height: 26px; display: block; flex-shrink: 0; }
  .rx-footer-tagline { font-size: 11.5px; font-weight: 300; color: var(--ink-faint); line-height: 1.5; }
  .rx-footer-links { display: flex; gap: 28px; flex-wrap: wrap; justify-content: center; }
  .rx-footer-links a { font-size: 12.5px; color: var(--ink-faint); text-decoration: none; transition: color 0.2s; }
  .rx-footer-links a:hover { color: var(--ink); }
  .rx-footer-copy { font-size: 11.5px; color: var(--ink-faint); white-space: nowrap; }

  /* ANIMATIONS */
  .rx-fade { opacity: 0; transform: translateY(22px); transition: opacity 0.62s ease, transform 0.62s ease; }
  .rx-fade.visible { opacity: 1; transform: translateY(0); }
  .rx-d1 { transition-delay: 0.08s; }
  .rx-d2 { transition-delay: 0.16s; }

  /* FLOATING CTA */
  .rx-float-cta {
    position: fixed; left: 50%; bottom: 28px; z-index: 1200;
    transform: translateX(-50%) translateY(24px); opacity: 0; pointer-events: none;
    transition: opacity 0.4s ease, transform 0.4s ease;
  }
  .rx-float-cta.visible { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
  .rx-float-pill {
    display: flex; align-items: center; gap: 16px; background: var(--black-panel);
    border-radius: 999px; padding: 7px 7px 7px 24px; overflow: hidden;
    box-shadow: 0 18px 46px rgba(11,15,12,0.35), 0 0 0 1px rgba(255,255,255,0.06);
  }
  .rx-float-laurel { width: 12px; height: 18px; color: rgba(255,255,255,0.4); flex-shrink: 0; }
  .rx-float-laurel.right { transform: scaleX(-1); }
  .rx-float-text { position: relative; height: 17px; min-width: 220px; overflow: hidden; }
  .rx-float-msg {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 13px; color: rgba(255,255,255,0.72); white-space: nowrap;
    opacity: 0; transition: opacity 0.5s ease;
  }
  .rx-float-msg.active { opacity: 1; }
  .rx-float-btn-wrap { position: relative; border-radius: 999px; flex-shrink: 0; }
  .rx-float-btn-wrap::before {
    content: ''; position: absolute; inset: -6px; border-radius: 999px;
    background: conic-gradient(from 0deg, transparent 0deg, transparent 210deg, rgba(0,229,204,0.35) 250deg, var(--neon) 278deg, #ffffff 290deg, var(--neon) 302deg, rgba(0,229,204,0.35) 330deg, transparent 360deg);
    filter: blur(6px); animation: rx-shine-spin 3.2s linear infinite;
  }
  .rx-float-btn {
    position: relative; z-index: 1; display: block; background: #fff; color: var(--ink);
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-weight: 700; font-size: 13.5px;
    padding: 12px 22px; border-radius: 999px; text-decoration: none; white-space: nowrap;
    border: none; cursor: pointer; transition: transform 0.15s ease;
  }
  .rx-float-btn:hover { transform: translateY(-1px); }

  @media (max-width: 900px) {
    .rx-about-hero-inner { grid-template-columns: 1fr; }
    .rx-founder-grid, .rx-values-grid { grid-template-columns: 1fr; }
    .rx-footer-inner { grid-template-columns: 1fr; }
    .rx-footer-links { justify-content: flex-start; }
    .rx-footer-copy { text-align: left; }
  }
  @media (max-width: 640px) {
    .rx-nav { padding: 0 20px; height: 56px; }
    .rx-nav-links { display: none; }
    .rx-nav-actions .rx-btn-ghost { display: none; }
    .rx-signin { display: none; }
    .rx-container { padding: 0 20px; }
    .rx-about-hero { padding: 92px 0 48px; }
    .rx-manifesto-item { gap: 14px; }
    .rx-float-text { min-width: 160px; }
    .rx-float-msg { font-size: 12px; }
    .rx-float-cta { bottom: 18px; }
  }
`;

const founders = [
  {
    name: "Jay Crichton",
    role: "Co-founder & CEO",
    photo: "/brand/team/jay-crichton.jpg",
    bio: [
      "Jay's been solving problems since he left school at 16 to study Automotive Engineering. At 22, he left New Zealand, studied Marine Engineering at Southampton Maritime University in the UK, and spent 11 years at sea rising to Chief Engineer on superyachts — solving problems for billionaires.",
      "Along the way, he built My Crew Kit, a portal that consolidates everything crew need and helps crew-related businesses get noticed. Next came restaurants. Little Fern, his Barcelona restaurant group, now spans two locations, a cafe, a bakery, a central kitchen, and a wholesale business, feeding hundreds of people a day. A few years in, he built Reorderfy to optimise daily supplier orders — still in use across Little Fern and other restaurants today.",
      "Olia came from the same instinct: no proper tool existed for hospitality ops, so he was patching one together himself, out of workarounds.",
    ],
    offClock: "Dad to two girls. Loves a fast-paced game of padel, and is a self-confessed tech geek with a soft spot for simple things done really well. Ask him about music and you'll get a lifelong player, loving music spanning too many genres to list, with a soft spot for polyrhythms.",
    linkedin: "https://www.linkedin.com/in/jay-crichton-a14569194/",
  },
  {
    name: "Dora Angelov",
    role: "Co-founder & CPO",
    photo: "/brand/team/dora-angelov.jpg",
    bio: [
      "Dora's been solving problems since she left Croatia at 18 — bachelor in Graz, master in Berlin, her first \"real\" job in Munich — before landing in Barcelona, where she's spent the last decade first in project, then in product management.",
      "Along the way, she spent six years at Netcentric (Cognizant) running delivery for enterprise clients worldwide, then moved into product proper: at Wallapop, leading the international expansion into Italy and aligning roadmaps and strategy across teams, before becoming Head of Product at Mood, an American hyper-growth startup. In between, she founded her own consultancy, Digissance, running it for two years until the client list outgrew what a two-person team could deliver.",
    ],
    offClock: "Mum to three girls. Loves cooking for friends and family, and stress-bakes when things get chaotic — so if there's fresh banana bread around, something's probably on fire. Ask her about music and you'll get Arctic Monkeys, Tracy Chapman, Rawayana, and The Beatles in the same breath, no apologies.",
    linkedin: "https://www.linkedin.com/in/dora-angelov/",
  },
];

const values = [
  { title: "Human first", desc: "We design for the person on the floor at 11pm, not the person building the pitch deck." },
  { title: "Radically simple", desc: "If it takes a training session, we haven't finished building it yet." },
  { title: "Built to be trusted", desc: "Owners should get visibility without staff feeling watched. We hold that line." },
];

// Honest, early-stage social proof — no invented numbers.
const floatMessages = [
  "Built with real restaurant operators",
  "Live in many kitchens",
  "Founder-tested, every single shift",
];

function Laurel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 30" fill="currentColor" stroke="none">
      <path d="M9.8 29c-5-8 -2-15 1-19s2-8 7-10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <ellipse cx="8.3" cy="25.3" rx="2.7" ry="1.15" transform="rotate(-48 8.3 25.3)" />
      <ellipse cx="10.7" cy="25.6" rx="2.7" ry="1.15" transform="rotate(30 10.7 25.6)" />
      <ellipse cx="7.2" cy="20.8" rx="2.5" ry="1.05" transform="rotate(-58 7.2 20.8)" />
      <ellipse cx="9.6" cy="20.6" rx="2.5" ry="1.05" transform="rotate(15 9.6 20.6)" />
      <ellipse cx="7.6" cy="15.8" rx="2.3" ry="1" transform="rotate(-40 7.6 15.8)" />
      <ellipse cx="10" cy="16.4" rx="2.3" ry="1" transform="rotate(28 10 16.4)" />
      <ellipse cx="9.6" cy="11.2" rx="2" ry="0.85" transform="rotate(-25 9.6 11.2)" />
      <ellipse cx="11.9" cy="12.2" rx="2" ry="0.85" transform="rotate(40 11.9 12.2)" />
      <ellipse cx="12.2" cy="7.4" rx="1.7" ry="0.72" transform="rotate(-15 12.2 7.4)" />
      <ellipse cx="14.1" cy="8.6" rx="1.7" ry="0.72" transform="rotate(48 14.1 8.6)" />
      <ellipse cx="14.9" cy="4.2" rx="1.3" ry="0.55" transform="rotate(-5 14.9 4.2)" />
      <ellipse cx="16.5" cy="5.6" rx="1.3" ry="0.55" transform="rotate(55 16.5 5.6)" />
    </svg>
  );
}

function Squiggle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 18" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M2 9c7-6 12-6 15 0 8 7 13 7 17 0 7-5 11-5 14 0 8 8 12 8 16 0 7-6 12-6 15 0 9 5 15 5 19 0" />
    </svg>
  );
}

// Placeholder manifesto — swap for the real thing before this ships anywhere.
const manifesto = [
  {
    title: "The floor comes first.",
    body: "Every feature gets judged by whether a tired person on a Saturday night would actually use it, not whether it looks good in a demo.",
  },
  {
    title: "Simple beats clever.",
    body: "If it needs training, it's not done yet. Staff should be able to pick it up mid-shift with no explanation.",
  },
  {
    title: "Consistency is the product.",
    body: "The goal isn't more checklists — it's the same standard, on the same shift, at every venue, every time.",
  },
  {
    title: "Trust, not surveillance.",
    body: "We build tools that give owners visibility, not tools that make staff feel watched. Those aren't the same thing.",
  },
  {
    title: "Boring is a feature.",
    body: "Reliable, unglamorous software that never goes down beats a flashy product that breaks during service.",
  },
];

export default function SundayRemixAbout() {
  const navRef = useRef<HTMLElement>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [floatVisible, setFloatVisible] = useState(false);
  const [floatMsgIndex, setFloatMsgIndex] = useState(0);
  const openDemo = (e: React.MouseEvent) => { e.preventDefault(); setDemoOpen(true); };

  useEffect(() => {
    const nav = navRef.current;
    const handleScroll = () => {
      nav?.classList.toggle("scrolled", window.scrollY > 24);
      const nearBottom = window.scrollY + window.innerHeight > document.body.scrollHeight - 260;
      setFloatVisible(window.scrollY > 480 && !nearBottom);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" }
    );
    document.querySelectorAll(".rx-fade").forEach((el) => obs.observe(el));

    const msgInterval = setInterval(() => {
      setFloatMsgIndex((i) => (i + 1) % floatMessages.length);
    }, 3200);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      obs.disconnect();
      clearInterval(msgInterval);
    };
  }, []);

  return (
    <>
    <div className="olia-remix">
      <style>{css}</style>

      <nav className="rx-nav" ref={navRef}>
        <div className="rx-nav-inner">
          <Link to="/experiments/sunday-remix" className="rx-logo">
            <img src="/brand/logo/olia-mark-dark.svg" alt="" className="rx-logo-mark" />
            Olia
          </Link>
          <ul className="rx-nav-links">
            <li><Link to="/experiments/sunday-remix">Home</Link></li>
            <li><a href="#story">Company</a></li>
            <li><a href="#team">Team</a></li>
            <li><a href="#manifesto" className="active">Manifesto</a></li>
          </ul>
          <div className="rx-nav-actions">
            <Link to="/login" className="rx-signin">Sign in</Link>
            <a href="#" className="rx-btn-ghost" onClick={openDemo}>Book a demo</a>
            <span className="rx-shine-wrap"><Link to="/signup" className="rx-btn-neon">Get started</Link></span>
          </div>
        </div>
      </nav>

      <section className="rx-about-hero">
        <div className="rx-about-hero-inner">
          <div>
            <div className="rx-badge"><span className="rx-badge-dot" />About Olia</div>
            <h1>We built the tool<br />we couldn't find <span className="rx-hl">ourselves.</span></h1>
            <p className="rx-about-hero-sub">Olia started because running a shift shouldn't depend on who happened to show up. We're a small team building operations software for hospitality — the kind that gets used, not ignored.</p>
          </div>
          <div className="rx-founders-card">
            <div className="rx-founders-label">The founders</div>
            <div className="rx-founders-row">
              {founders.map((f) => (
                <div key={f.name} className="rx-founder-mini">
                  <div className="rx-avatar"><img src={f.photo} alt={f.name} /></div>
                  <div className="rx-founder-mini-name">{f.name.split(" ")[0]}</div>
                  <div className="rx-founder-mini-role">{f.role}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rx-story" id="story">
        <div className="rx-container rx-story-inner">
          <div className="rx-story-copy rx-fade">
            <div className="rx-badge"><span className="rx-badge-dot" />The company</div>
            <h2>Olia started, as most good ideas do, with a not-so-subtle nudge from the universe.</h2>
            <p>Dora had just walked out of her corporate job for the last time when she ran into Jay outside a cafe.</p>
            <p>His locations had been running without him on site for years — but keeping tabs on everything from a distance meant leaning on a patchwork of apps that refused to talk to each other. He'd already built two tools to solve his own problems along the way; nothing existed yet for the one that mattered most — everyday hospitality operations.</p>
            <p>Dora had spent a decade building large-scale products, Wallapop among them. What followed was months of increasingly unhinged WhatsApp voice memos, and eventually, <span className="rx-mark">Olia</span>.</p>
          </div>
        </div>
      </section>

      <section className="rx-founders" id="team">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />Who's behind it</div>
            <h2>Two co-founders, one shared <span className="rx-doodle-word">frustration<Squiggle className="rx-doodle-underline" /></span>.</h2>
            <p>We started Olia together after seeing the same problem from opposite sides of the business.</p>
          </div>
          <div className="rx-founder-grid">
            {founders.map((f, i) => (
              <div key={f.name} className={`rx-founder-card rx-fade${i > 0 ? " rx-d1" : ""}`}>
                <div className="rx-founder-portrait"><img src={f.photo} alt={f.name} /></div>
                <h3 className="rx-founder-name">{f.name}</h3>
                <div className="rx-founder-role">{f.role}</div>
                <div className="rx-founder-bio">
                  {f.bio.map((p, j) => <p key={j}>{p}</p>)}
                </div>
                <div className="rx-founder-offclock">
                  <div className="rx-founder-offclock-label">Off the clock</div>
                  <p>{f.offClock}</p>
                </div>
                <a href={f.linkedin} target="_blank" rel="noopener noreferrer" className="rx-founder-link">Connect on LinkedIn</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rx-note">
        <div className="rx-container rx-note-inner rx-fade">
          <p>Basically: one of them can untangle any operational problem you throw at him, the other can turn it into a roadmap. Together, they're building the ultimate operational system for any hospitality business — so operators can spend less time firefighting and more time on everything else that makes a business worth running.</p>
        </div>
      </section>

      <section className="rx-values">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />What we believe</div>
            <h2>A few strong <span className="rx-doodle-word">opinions<Squiggle className="rx-doodle-underline" /></span>.</h2>
          </div>
          <div className="rx-values-grid">
            {values.map((v, i) => (
              <div key={v.title} className={`rx-value-col rx-fade${i > 0 ? ` rx-d${Math.min(i, 2)}` : ""}`}>
                <span className="rx-value-num">{String(i + 1).padStart(2, "0")}</span>
                <h3>{v.title}</h3>
                <p>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rx-manifesto" id="manifesto">
        <div className="rx-container rx-manifesto-inner">
          <div className="rx-manifesto-header">
            <div className="rx-badge on-dark centered"><span className="rx-badge-dot" />Our manifesto</div>
            <h2 className="rx-fade">Doing things <span className="rx-strike">complicated</span> simple.</h2>
            <p className="rx-fade rx-d1">From day one, the people actually running the shift have been our #1 priority. Here's what that means in practice.</p>
          </div>
          <ol className="rx-manifesto-list">
            {manifesto.map((m, i) => (
              <li key={m.title} className={`rx-manifesto-item rx-fade${i % 2 === 1 ? " rx-d1" : ""}`}>
                <div><h3>{m.title}</h3><p>{m.body}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rx-cta">
        <div className="rx-container">
          <h2 className="rx-fade">Want to see it running<br />in your venue?</h2>
          <p className="rx-cta-sub rx-fade">Set up your first checklist today. Most venues are running in under an hour.</p>
          <div className="rx-cta-btns rx-fade">
            <span className="rx-shine-wrap"><Link to="/signup" className="rx-btn-hero">Set up your first checklist →</Link></span>
          </div>
        </div>
      </section>

      <footer className="rx-footer">
        <div className="rx-footer-inner">
          <div>
            <Link to="/experiments/sunday-remix" className="rx-footer-logo">
              <img src="/brand/logo/olia-mark-dark.svg" alt="" className="rx-footer-logo-mark" />
              Olia
            </Link>
            <p className="rx-footer-tagline">Operations software for<br />Hospitality teams.</p>
          </div>
          <div className="rx-footer-links">
            <Link to="/experiments/sunday-remix">Home</Link>
            <a href="#story">Company</a>
            <a href="#team">Team</a>
            <a href="#manifesto">Manifesto</a>
            <a href="#" onClick={openDemo}>Book a demo</a>
            <Link to="/login">Sign in</Link>
          </div>
          <p className="rx-footer-copy">© 2026 Olia. All rights reserved.</p>
        </div>
      </footer>

      <div className={`rx-float-cta${floatVisible ? " visible" : ""}`}>
        <div className="rx-float-pill">
          <Laurel className="rx-float-laurel" />
          <div className="rx-float-text">
            {floatMessages.map((m, i) => (
              <span key={m} className={`rx-float-msg${i === floatMsgIndex ? " active" : ""}`}>{m}</span>
            ))}
          </div>
          <Laurel className="rx-float-laurel right" />
          <div className="rx-float-btn-wrap">
            <a href="#" className="rx-float-btn" onClick={openDemo}>Try it now</a>
          </div>
        </div>
      </div>
    </div>
    <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </>
  );
}
