import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { DemoModal } from "@/components/landing/DemoModal";

/**
 * Olia's marketing site — single scrolling page, one nav
 * (Home / Features / Who we are / Pricing) anchored to sections below.
 * Served at "/" and mirrored at /experiments/sunday-remix-site.
 */

const css = `
  .olia-remix *, .olia-remix *::before, .olia-remix *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .olia-remix {
    --ink: #0B0F0C;
    --ink-soft: #4B564F;
    --ink-faint: #7C877F;
    --white: #FFFFFF;
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
  .rx-nav.scrolled, .rx-nav.menu-open { background: rgba(255,255,255,0.92); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); box-shadow: 0 1px 0 var(--line); }
  .rx-nav-inner { display: flex; align-items: center; width: 100%; max-width: 1180px; margin: 0 auto; }
  .rx-logo {
    display: flex; align-items: center; gap: 9px;
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: 22px; font-weight: 600; color: var(--ink); text-decoration: none; margin-right: 48px;
  }
  .rx-logo-mark { width: 26px; height: 26px; display: block; flex-shrink: 0; }
  .rx-nav-links { display: flex; gap: 30px; list-style: none; }
  .rx-nav-links a { font-size: 13.5px; color: var(--ink-soft); text-decoration: none; transition: color 0.2s; }
  .rx-nav-links a:hover { color: var(--ink); }
  .rx-nav-actions { margin-left: auto; display: flex; align-items: center; gap: 16px; }
  .rx-signin { font-size: 13.5px; color: var(--ink-soft); text-decoration: none; transition: color 0.2s; }
  .rx-signin:hover { color: var(--ink); }
  .rx-shine-wrap.rx-cta-mobile { display: none; }

  /* MOBILE MENU (hamburger) */
  .rx-menu-btn {
    display: none; align-items: center; justify-content: center;
    width: 40px; height: 40px; margin: -8px 0 -8px -8px; border: none; background: none;
    color: var(--ink); cursor: pointer; flex-shrink: 0;
  }
  .rx-mobile-menu {
    position: fixed; top: 56px; left: 0; right: 0; bottom: 0; z-index: 998; background: var(--white);
    display: flex; flex-direction: column; border-top: 1px solid var(--line);
    opacity: 0; visibility: hidden; transform: translateY(-8px);
    transition: opacity 0.22s ease, transform 0.22s ease, visibility 0s linear 0.22s;
  }
  .rx-mobile-menu.open {
    opacity: 1; visibility: visible; transform: translateY(0);
    transition: opacity 0.22s ease, transform 0.22s ease;
  }
  .rx-mobile-menu-links { display: flex; flex-direction: column; padding: 20px 24px 12px; gap: 4px; }
  .rx-mobile-menu-links a {
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; font-weight: 500;
    color: var(--ink); text-decoration: none; padding: 12px 0; border-bottom: 1px solid var(--line);
  }
  .rx-mobile-menu-actions { margin-top: auto; padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 12px; }
  .rx-mobile-menu-signin {
    text-align: center; font-size: 14.5px; color: var(--ink-soft); text-decoration: none; padding: 14px 0;
  }
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
  .rx-shine-wrap.block { display: block; width: 100%; }
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

  /* HOME HERO */
  .rx-hero { padding: 100px 0 48px; background: var(--white); position: relative; }
  .rx-hero::before {
    content: ''; position: absolute; top: -120px; right: -140px; width: 520px; height: 520px;
    background: radial-gradient(circle, rgba(0,229,204,0.22) 0%, transparent 70%);
    filter: blur(10px); pointer-events: none;
  }
  .rx-hero-inner {
    display: grid; grid-template-columns: 1fr 420px; gap: 56px; align-items: center;
    max-width: 1180px; margin: 0 auto; padding: 0 40px; position: relative;
  }
  .rx-hero h1 { font-size: clamp(44px, 5.4vw, 66px); letter-spacing: -0.01em; margin-bottom: 20px; }
  .rx-hero-sub { font-size: 17.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; max-width: 460px; margin-bottom: 28px; }
  .rx-hero-ctas { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .rx-btn-hero {
    display: block; font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 700;
    color: #fff; background: var(--black-panel); border: 1.5px solid var(--black-panel);
    padding: 13px 26px; border-radius: 9px; text-decoration: none; transition: transform 0.15s, background 0.2s;
  }
  .rx-btn-hero:hover { background: var(--black-panel-soft); transform: translateY(-2px); }
  .rx-hero-note { font-size: 12px; color: var(--ink-faint); letter-spacing: 0.01em; }

  /* KIOSK CARD */
  .rx-kiosk-card { background: var(--black-panel); border-radius: 20px; padding: 26px; box-shadow: var(--shadow-lg), 0 0 0 1px rgba(0,229,204,0.12); transform: rotate(1.6deg); }
  .rx-kiosk-venue { font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(0,229,204,0.75); margin-bottom: 10px; }
  .rx-kiosk-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 500; color: #fff; margin-bottom: 18px; }
  .rx-kprog { height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-bottom: 5px; overflow: hidden; }
  .rx-kprog-fill { height: 100%; width: 0; background: linear-gradient(90deg, #007E70, #00E5CC); border-radius: 2px; transition: width 0.55s cubic-bezier(0.4,0,0.2,1); }
  .rx-kprog-label { font-size: 10px; color: rgba(255,255,255,0.35); margin-bottom: 18px; }
  @keyframes rx-check-pop { 0% { transform: scale(0); opacity: 0; } 55% { transform: scale(1.25); } 80% { transform: scale(0.92); } 100% { transform: scale(1); opacity: 1; } }
  .rx-kcircle.done { animation: rx-check-pop 0.35s ease forwards; background: var(--neon); border-color: var(--neon); }
  .rx-ktask { display: flex; align-items: center; gap: 11px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.055); transition: opacity 0.3s; }
  .rx-ktask:last-of-type { border-bottom: none; }
  .rx-ktask.pending { opacity: 0.35; }
  .rx-kcircle { width: 19px; height: 19px; border-radius: 50%; flex-shrink: 0; border: 1.5px solid rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; }
  .rx-ktext { font-size: 13px; color: rgba(255,255,255,0.82); flex: 1; }
  .rx-ktask.done .rx-ktext { text-decoration: line-through; color: rgba(255,255,255,0.35); }
  .rx-ktime { font-size: 10px; color: rgba(255,255,255,0.28); }
  .rx-kactive { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 12px 14px; background: rgba(255,255,255,0.055); border-radius: 10px; border: 1px solid rgba(255,255,255,0.09); animation: rx-kpulse 2.2s ease-in-out infinite; }
  @keyframes rx-kpulse { 0%, 100% { border-color: rgba(255,255,255,0.09); } 50% { border-color: rgba(0,229,204,0.4); } }
  .rx-kdot { width: 6px; height: 6px; border-radius: 50%; background: var(--neon); animation: rx-blink 1.6s ease-in-out infinite; }
  @keyframes rx-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  .rx-kactive-text { font-size: 12.5px; color: rgba(255,255,255,0.6); }

  /* FEATURES */
  .rx-features { background: var(--white); }
  .rx-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .rx-feat-card { background: var(--white); border-radius: var(--r); padding: 26px 28px; border: 1px solid var(--line); transition: transform 0.22s, box-shadow 0.22s, border-color 0.22s; }
  .rx-feat-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-lg); border-color: rgba(0,229,204,0.4); }
  .rx-feat-icon { width: 30px; height: 30px; color: var(--ink); opacity: 0.75; margin-bottom: 14px; }
  .rx-feat-card h3 { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 9px; letter-spacing: -0.01em; }
  .rx-feat-card p { font-size: 13.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; }

  /* TEAM ADOPTION */
  .rx-team { background: var(--white); }
  .rx-team-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
  .rx-team-vis { background: var(--black-panel); border-radius: 20px; padding: 28px; position: relative; overflow: hidden; }
  .rx-team-vis::after { content: ''; position: absolute; top: -50px; right: -50px; width: 180px; height: 180px; background: radial-gradient(circle, rgba(0,229,204,0.14) 0%, transparent 70%); pointer-events: none; }
  .rx-vis-label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(0,229,204,0.8); margin-bottom: 16px; }
  .rx-mini-task { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.055); }
  .rx-mini-task:last-of-type { border-bottom: none; }
  .rx-mini-circle { width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; border: 1.5px solid rgba(255,255,255,0.16); display: flex; align-items: center; justify-content: center; }
  .rx-mini-circle.done { background: var(--neon); border-color: var(--neon); }
  .rx-mini-text { font-size: 13.5px; color: rgba(255,255,255,0.75); }
  .rx-mini-task.done .rx-mini-text { text-decoration: line-through; color: rgba(255,255,255,0.32); }
  .rx-tap-note { margin-top: 14px; padding: 11px 14px; background: rgba(255,255,255,0.05); border-radius: 10px; font-size: 12px; color: rgba(255,255,255,0.4); text-align: center; letter-spacing: 0.02em; }
  .rx-team-content h2 { font-size: clamp(28px, 3.4vw, 42px); margin-bottom: 14px; line-height: 1.2; }
  .rx-team-content > p { font-size: 15.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; margin-bottom: 24px; }
  .rx-bullets { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .rx-bullets li { display: flex; align-items: flex-start; gap: 12px; font-size: 14.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.55; }
  .rx-bullets li::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--neon); margin-top: 7px; flex-shrink: 0; }

  /* BUILT DIFFERENT (dark showcase) */
  .rx-showcase { background: var(--black-panel); position: relative; overflow: hidden; }
  .rx-showcase::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(0,229,204,0.05) 1px, transparent 1px); background-size: 30px 30px; pointer-events: none; }
  .rx-showcase-inner { position: relative; }
  .rx-showcase h2 { color: var(--white); font-size: clamp(30px, 3.8vw, 48px); max-width: 560px; margin-bottom: 14px; }
  .rx-showcase-sub { font-size: 15.5px; font-weight: 300; color: rgba(255,255,255,0.55); max-width: 520px; line-height: 1.65; margin-bottom: 36px; }
  .rx-showcase-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .rx-show-card { background: var(--black-panel-soft); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--r); padding: 28px; transition: transform 0.22s, border-color 0.22s; }
  .rx-show-card:hover { transform: translateY(-5px); border-color: rgba(0,229,204,0.35); }
  .rx-show-icon { width: 34px; height: 34px; color: var(--neon); margin-bottom: 18px; }
  .rx-show-card h3 { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 16px; font-weight: 700; color: var(--white); margin-bottom: 9px; letter-spacing: -0.01em; }
  .rx-carousel-dots { display: none; align-items: center; justify-content: center; gap: 8px; margin-top: 18px; }
  .rx-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,0.25); transition: background 0.2s, transform 0.2s; }
  .rx-dot.active { background: var(--neon); transform: scale(1.35); }
  .rx-show-card p { font-size: 13.5px; font-weight: 300; color: rgba(255,255,255,0.5); line-height: 1.65; }

  /* COMPANY / STORY (centered) */
  .rx-story { background: var(--white); }
  .rx-story-inner { max-width: 700px; margin: 0 auto; text-align: center; }
  .rx-story-inner .rx-badge { justify-content: center; }
  .rx-story-copy h2 { font-size: clamp(28px, 3.4vw, 42px); margin-bottom: 16px; line-height: 1.18; }
  .rx-story-copy p { font-size: 15.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.75; margin-bottom: 16px; text-align: left; }

  /* FOUNDERS (side-by-side cards) */
  .rx-founders { background: var(--white); }
  .rx-founder-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: stretch; }
  .rx-founder-card {
    background: var(--white); border: 1px solid var(--line); border-radius: var(--r);
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
  .rx-founder-bio p { font-size: 15.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.7; margin-bottom: 12px; }
  .rx-founder-offclock {
    margin-top: auto; padding-top: 16px; border-top: 1px dashed var(--line-mid);
  }
  .rx-founder-offclock-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 8px; }
  .rx-founder-offclock p { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 15px; font-weight: 500; color: var(--ink); line-height: 1.5; }
  .rx-founder-link { align-self: flex-start; margin-top: 16px; font-size: 12.5px; font-weight: 600; color: var(--ink); text-decoration: none; border-bottom: 1.5px solid var(--neon); padding-bottom: 1px; }

  /* VALUES */
  .rx-values { background: var(--white); }
  .rx-values-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
  .rx-value-num { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 15px; color: var(--neon-deep); display: block; margin-bottom: 10px; }
  .rx-value-col h3 { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 7px; letter-spacing: -0.01em; }
  .rx-value-col p { font-size: 13.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; }

  /* CLOSING NOTE */
  .rx-note { background: var(--white); text-align: center; }
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

  /* PRICING */
  .rx-pricing { background: var(--white); }
  .rx-pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; align-items: center; }
  .rx-pcard { border-radius: var(--r); padding: 30px; border: 1px solid var(--line); background: var(--white); transition: transform 0.22s, box-shadow 0.22s; }
  .rx-pcard:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
  .rx-pcard.featured { background: var(--black-panel); border-color: var(--black-panel); box-shadow: 0 22px 60px rgba(11,15,12,0.24); }
  .rx-pbadge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink); background: var(--neon); padding: 4px 10px; border-radius: 4px; margin-bottom: 18px; }
  .rx-pname { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 15px; font-weight: 600; color: var(--ink); margin-bottom: 7px; }
  .rx-pcard.featured .rx-pname { color: var(--white); }
  .rx-pamount { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 40px; font-weight: 500; color: var(--ink); letter-spacing: -0.02em; line-height: 1; }
  .rx-pcard.featured .rx-pamount { color: var(--white); }
  .rx-pcur { font-size: 20px; vertical-align: super; }
  .rx-pper { font-size: 13px; font-weight: 300; color: var(--ink-faint); }
  .rx-pcard.featured .rx-pper { color: rgba(255,255,255,0.45); }
  .rx-punit { font-size: 11.5px; color: var(--ink-faint); margin-bottom: 18px; margin-top: 4px; }
  .rx-pcard.featured .rx-punit { color: rgba(255,255,255,0.38); }
  .rx-pdiv { height: 1px; background: var(--line); margin-bottom: 16px; }
  .rx-pcard.featured .rx-pdiv { background: rgba(255,255,255,0.12); }
  .rx-pfeats { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; }
  .rx-pfeats li { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; font-weight: 300; color: var(--ink-soft); line-height: 1.5; }
  .rx-pcard.featured .rx-pfeats li { color: rgba(255,255,255,0.7); }
  .rx-pcheck { width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px; color: var(--neon-deep); }
  .rx-pcard.featured .rx-pcheck { color: var(--neon); }
  .rx-pbtn { display: block; width: 100%; text-align: center; font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 13.5px; font-weight: 700; padding: 12px 20px; border-radius: 8px; cursor: pointer; text-decoration: none; transition: all 0.2s; }
  .rx-pbtn-outline { color: var(--ink); background: #fff; border: 1.5px solid var(--line-mid); }
  .rx-pbtn-outline:hover { border-color: var(--ink); background: #f2f2f2; }
  .rx-pbtn-neon { color: var(--ink); background: #fff; border: none; }
  .rx-pbtn-neon:hover { background: #f2f2f2; }

  /* CTA */
  .rx-cta { background: var(--white); text-align: center; padding: 60px 0; }
  .rx-cta h2 { font-size: clamp(30px, 4vw, 46px); max-width: 600px; margin: 0 auto 18px; line-height: 1.15; }
  .rx-cta-sub { font-size: 16px; font-weight: 300; color: var(--ink-soft); max-width: 440px; margin: 0 auto 28px; line-height: 1.6; }
  .rx-cta-btns { display: flex; align-items: center; justify-content: center; gap: 14px; }

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
    .rx-hero-inner, .rx-founder-grid, .rx-values-grid, .rx-team-inner { grid-template-columns: 1fr; }
    .rx-feat-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .rx-footer-inner { grid-template-columns: 1fr; }
    .rx-footer-links { justify-content: flex-start; }
    .rx-footer-copy { text-align: left; }

    /* BUILT DIFFERENT — carousel instead of stacked list */
    .rx-showcase-grid {
      display: flex; grid-template-columns: unset; overflow-x: auto; scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch; gap: 14px; margin: 0 -20px; padding: 4px 20px 8px;
      scrollbar-width: none;
    }
    .rx-showcase-grid::-webkit-scrollbar { display: none; }
    .rx-show-card { flex: 0 0 78%; scroll-snap-align: center; }
    .rx-carousel-dots { display: flex; }

    /* PRICING — center card fully visible, neighbors peek at the edges */
    .rx-pricing-grid {
      display: flex; grid-template-columns: unset; align-items: stretch; overflow-x: auto;
      scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; gap: 16px;
      margin: 0 -20px; padding: 4px 9% 8px; scrollbar-width: none;
    }
    .rx-pricing-grid::-webkit-scrollbar { display: none; }
    .rx-pcard {
      flex: 0 0 65%; scroll-snap-align: center; align-self: center;
      border: 1.5px solid var(--line-mid); box-shadow: var(--shadow-sm);
    }
    .rx-pcard.featured { flex: 0 0 82%; }
    .rx-pcard:hover, .rx-pcard.featured:hover { transform: none; }
  }
  @media (max-width: 640px) {
    .olia-remix section { padding: 40px 0; }
    .rx-nav { padding: 0 20px; height: 56px; }
    .rx-nav-links { display: none; }
    .rx-signin { display: none; }
    .rx-menu-btn { display: flex; }
    .rx-nav-inner { position: relative; justify-content: space-between; }
    .rx-logo { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0; }
    .rx-shine-wrap.rx-cta-desktop { display: none; }
    .rx-shine-wrap.rx-cta-mobile { display: inline-block; }
    .rx-container { padding: 0 20px; }
    .olia-remix .rx-hero { padding: 88px 0 24px; }
    .rx-hero-inner { gap: 36px; }
    .rx-section-header { margin-bottom: 26px; }
    .rx-feat-card { padding: 18px 16px; }
    .rx-feat-card p { font-size: 12.5px; }
    .olia-remix .rx-founders { padding-top: 24px; }
    .rx-founder-card { padding: 22px 20px; }
    .rx-founder-portrait { margin-left: auto; margin-right: auto; }
    .rx-founder-name, .rx-founder-role { text-align: center; }
    .olia-remix .rx-note { padding-top: 24px; }
    .olia-remix .rx-values { padding-top: 24px; }
    .rx-value-col { text-align: center; }
    .rx-manifesto-header { margin-bottom: 28px; }
    .rx-manifesto-item { gap: 14px; }
    .rx-float-cta { display: none; }
  }
`;

function Tick() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="#0B0F0C" strokeWidth="2" strokeLinecap="round">
      <polyline points="1.5 4.5 3.5 6.5 7.5 2.5" />
    </svg>
  );
}

function PCheck({ className }: { className?: string }) {
  return (
    <svg className={className ?? "rx-pcheck"} viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <polyline points="2 7.5 5.5 11 13 4" />
    </svg>
  );
}

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

const delay = (i: number) => i % 3 === 1 ? " rx-d1" : i % 3 === 2 ? " rx-d2" : "";

const KIOSK_TASKS = [
  { label: "Confirm fridge temp", time: "06:47" },
  { label: "Bar stocked and ready", time: "06:51" },
  { label: "Floor mopped and dry", time: "07:04" },
  { label: "Menus updated", time: "07:12" },
  { label: "Staff briefed", time: "07:18" },
];

const showcase = [
  { title: "Kiosk-first, app-free", desc: "Staff don't download anything. The kiosk lives on a tablet in your venue. No login, no friction — tap and go.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="m9 12 2 2 4-4"/><path d="M9 17h6"/></svg> },
  { title: "Compliance-grade logging", desc: "Every completion is timestamped and stored. Allergen checks, hygiene standards, and audit trails — automatically.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> },
  { title: "Multi-location dashboard", desc: "One clear view of every venue. Spot inconsistencies, maintain standards, and stay in control from your phone.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg> },
];

const features = [
  { title: "Daily checklists", desc: "Opening, closing, and mid-shift routines built for your venue, fully customisable by your team.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="m9 7 2 2 4-4"/><path d="M9 13h6M9 17h4"/></svg> },
  { title: "Compliance logs", desc: <>Allergen checks, fridge temperature records, all timestamped. Downloadable and <span className="rx-mark">audit-ready</span>.</>, icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> },
  { title: "Issue reporting", desc: "Managers get notified directly in the app. Issues are tracked to resolution.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  { title: "SOP & training hub", desc: "Procedures, recipes, cleaning standards in one place. New starters get up to speed fast.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h5"/></svg> },
  { title: "Reporting & analytics", desc: "Completion rates, recurring issues, training history — surfaced automatically. No manual logging.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg> },
  { title: "Multi-location visibility", desc: "Compliance status from a central dashboard. Spot inconsistencies, maintain standards, stay in control.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg> },
];

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

// Our operating principles. The full manifesto essay is a future addition —
// these are the real principles for now, not placeholders.
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

// Honest, early-stage social proof — no invented numbers.
const floatMessages = [
  "Built with real restaurant operators",
  "Live in many kitchens",
  "Founder-tested, every single shift",
];

export default function SundayRemixSite() {
  const navRef = useRef<HTMLElement>(null);
  const pricingGridRef = useRef<HTMLDivElement>(null);
  const featuredCardRef = useRef<HTMLDivElement>(null);
  const showcaseGridRef = useRef<HTMLDivElement>(null);
  const [completed, setCompleted] = useState(0);
  const [demoOpen, setDemoOpen] = useState(false);
  const [floatVisible, setFloatVisible] = useState(false);
  const [floatMsgIndex, setFloatMsgIndex] = useState(0);
  const [showcaseActive, setShowcaseActive] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const openDemo = (e: React.MouseEvent) => { e.preventDefault(); setDemoOpen(true); };
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const total = KIOSK_TASKS.length;

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    navRef.current?.classList.toggle("menu-open", mobileMenuOpen);
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

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

    const TICK = 900;
    const PAUSE = 2500;
    const INITIAL = 700;
    let timeouts: ReturnType<typeof setTimeout>[] = [];

    function runSequence() {
      timeouts = [];
      setCompleted(0);
      for (let i = 1; i <= total; i++) {
        timeouts.push(setTimeout(() => setCompleted(i), INITIAL + i * TICK));
      }
      timeouts.push(setTimeout(() => runSequence(), INITIAL + total * TICK + PAUSE));
    }
    runSequence();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      obs.disconnect();
      clearInterval(msgInterval);
      timeouts.forEach(clearTimeout);
    };
  }, [total]);

  useEffect(() => {
    const centerFeaturedCard = () => {
      const wrap = pricingGridRef.current;
      const card = featuredCardRef.current;
      if (!wrap || !card || !window.matchMedia("(max-width: 900px)").matches) return;
      wrap.scrollLeft = card.offsetLeft - (wrap.clientWidth - card.clientWidth) / 2;
    };
    centerFeaturedCard();
    window.addEventListener("resize", centerFeaturedCard);
    return () => window.removeEventListener("resize", centerFeaturedCard);
  }, []);

  useEffect(() => {
    const el = showcaseGridRef.current;
    if (!el) return;
    const handleScroll = () => {
      const center = el.scrollLeft + el.clientWidth / 2;
      let closest = 0;
      let closestDist = Infinity;
      Array.from(el.children).forEach((child, i) => {
        const c = (child as HTMLElement).offsetLeft + (child as HTMLElement).clientWidth / 2;
        const dist = Math.abs(c - center);
        if (dist < closestDist) { closestDist = dist; closest = i; }
      });
      setShowcaseActive(closest);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
    <div className="olia-remix">
      <style>{css}</style>

      <nav className="rx-nav" ref={navRef}>
        <div className="rx-nav-inner">
          <button
            type="button"
            className="rx-menu-btn"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            {mobileMenuOpen ? <X size={22} strokeWidth={1.8} /> : <Menu size={22} strokeWidth={1.8} />}
          </button>
          <a href="#home" className="rx-logo">
            <img src="/brand/logo/olia-mark-dark.svg" alt="" className="rx-logo-mark" />
            Olia
          </a>
          <ul className="rx-nav-links">
            <li><a href="#home">Home</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#who-we-are">Who we are</a></li>
            <li><a href="#pricing">Pricing</a></li>
          </ul>
          <div className="rx-nav-actions">
            <Link to="/login" className="rx-signin">Sign in</Link>
            <span className="rx-shine-wrap rx-cta-desktop"><Link to="/signup" className="rx-btn-neon">Get started</Link></span>
            <span className="rx-shine-wrap rx-cta-mobile"><Link to="/login" className="rx-btn-neon">Sign in</Link></span>
          </div>
        </div>
      </nav>

      <div className={`rx-mobile-menu${mobileMenuOpen ? " open" : ""}`} aria-hidden={!mobileMenuOpen}>
        <nav className="rx-mobile-menu-links" aria-label="Primary">
          <a href="#home" onClick={closeMobileMenu}>Home</a>
          <a href="#features" onClick={closeMobileMenu}>Features</a>
          <a href="#who-we-are" onClick={closeMobileMenu}>Who we are</a>
          <a href="#pricing" onClick={closeMobileMenu}>Pricing</a>
        </nav>
        <div className="rx-mobile-menu-actions">
          <span className="rx-shine-wrap block">
            <Link to="/signup" className="rx-btn-neon" onClick={closeMobileMenu} style={{ textAlign: "center" }}>Get started</Link>
          </span>
          <Link to="/login" className="rx-mobile-menu-signin" onClick={closeMobileMenu}>Sign in</Link>
        </div>
      </div>

      <section className="rx-hero" id="home">
        <div className="rx-hero-inner">
          <div>
            <div className="rx-badge"><span className="rx-badge-dot" />Built exclusively for hospitality managers</div>
            <h1>Run every shift<br />the same way — <span className="rx-hl">every time.</span></h1>
            <p className="rx-hero-sub">Olia replaces paper checklists and WhatsApp chasing with a simple system your team actually uses.</p>
            <div className="rx-hero-ctas">
              <span className="rx-shine-wrap"><Link to="/signup" className="rx-btn-hero">Set up your first checklist →</Link></span>
            </div>
            <p className="rx-hero-note">Starter from €49 · per location · <span className="rx-mark">no per-user fees</span></p>
          </div>
          <div>
            <div className="rx-kiosk-card">
              <div className="rx-kiosk-venue">The Anchor — Wednesday morning</div>
              <div className="rx-kiosk-title">Opening Checklist</div>
              <div className="rx-kprog">
                <div className="rx-kprog-fill" style={{ width: `${(completed / total) * 100}%` }} />
              </div>
              <div className="rx-kprog-label">
                {completed < total ? `${completed} of ${total} complete` : `${total} of ${total} complete`}
              </div>
              {KIOSK_TASKS.map((t, i) => {
                const done = i < completed;
                const pending = i > completed;
                return (
                  <div key={t.label} className={`rx-ktask${done ? " done" : ""}${pending ? " pending" : ""}`}>
                    <div className={`rx-kcircle${done ? " done" : ""}`}>{done && <Tick />}</div>
                    <span className="rx-ktext">{t.label}</span>
                    {done && <span className="rx-ktime">{t.time}</span>}
                  </div>
                );
              })}
              {completed < total && (
                <div className="rx-kactive">
                  <div className="rx-kdot" />
                  <span className="rx-kactive-text">{KIOSK_TASKS[completed].label} — tap to complete</span>
                </div>
              )}
              {completed === total && (
                <div className="rx-kactive" style={{ borderColor: "rgba(0,229,204,0.4)" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#00E5CC" strokeWidth="2" strokeLinecap="round"><polyline points="1.5 6 4.5 9 10.5 3"/></svg>
                  <span className="rx-kactive-text" style={{ color: "rgba(0,229,204,0.9)" }}>Shift complete — all tasks done</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rx-features" id="features">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />Features</div>
            <h2>Everything you need to run a consistent operation.</h2>
            <p>Purpose-built features for hospitality — not adapted from a generic task manager.</p>
          </div>
          <div className="rx-feat-grid">
            {features.map((f, i) => (
              <div key={f.title} className={`rx-feat-card rx-fade${delay(i)}`}>
                {f.icon}<h3>{f.title}</h3><p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rx-team">
        <div className="rx-container">
          <div className="rx-team-inner">
            <div className="rx-team-vis rx-fade">
              <div className="rx-vis-label">Staff experience — kiosk view</div>
              {["Confirm fridge temp", "Bar stocked and ready", "Staff briefed"].map((t) => (
                <div key={t} className="rx-mini-task done">
                  <div className="rx-mini-circle done"><Tick /></div>
                  <span className="rx-mini-text">{t}</span>
                </div>
              ))}
              <div className="rx-mini-task">
                <div className="rx-mini-circle" />
                <span className="rx-mini-text" style={{ color: "rgba(255,255,255,0.88)" }}>Floor mopped and dry</span>
              </div>
              <div className="rx-tap-note">Tap to confirm · Done in 3 minutes</div>
            </div>
            <div className="rx-team-content rx-fade rx-d2">
              <div className="rx-badge">Team adoption</div>
              <h2>Your team <span className="rx-hl">won't fight this</span>.</h2>
              <p>Staff aren't asked to create accounts or learn new software. They tap through tasks on a tablet in your venue and move on with their shift.</p>
              <ul className="rx-bullets">
                {["Staff see exactly what's expected, no guessing.", "Staff log through tasks on a tablet already in your venue.", "Nothing to learn. Nothing to remember. Just show up and do the shift.", "New starters are operational on day one."].map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="rx-showcase">
        <div className="rx-container rx-showcase-inner">
          <div className="rx-badge on-dark rx-fade"><span className="rx-badge-dot" />Built different</div>
          <h2 className="rx-fade">Not a repurposed task manager.</h2>
          <p className="rx-showcase-sub rx-fade">Olia was built from the ground up for shift-based teams, compliance logging, and multi-location oversight.</p>
          <div className="rx-showcase-grid" ref={showcaseGridRef}>
            {showcase.map((s, i) => (
              <div key={s.title} className={`rx-show-card rx-fade${i > 0 ? ` rx-d${i}` : ""}`}>
                <div className="rx-show-icon">{s.icon}</div>
                <h3>{s.title}</h3><p>{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="rx-carousel-dots">
            {showcase.map((s, i) => (
              <span key={s.title} className={`rx-dot${i === showcaseActive ? " active" : ""}`} />
            ))}
          </div>
        </div>
      </section>

      <section className="rx-story" id="who-we-are">
        <div className="rx-container rx-story-inner">
          <div className="rx-story-copy rx-fade">
            <div className="rx-badge"><span className="rx-badge-dot" />Who we are</div>
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

      <section className="rx-pricing" id="pricing">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />Pricing</div>
            <h2>Simple pricing per location.</h2>
            <p>No per user. <span className="rx-mark">Unlimited staff</span>. Cancel anytime.</p>
          </div>
          <div className="rx-pricing-grid" ref={pricingGridRef}>
            <div className="rx-pcard rx-fade">
              <div className="rx-pname">Starter</div>
              <div className="rx-pamount"><span className="rx-pcur">€</span>49<span className="rx-pper"> / month</span></div>
              <div className="rx-punit">per location · billed monthly</div>
              <div className="rx-pdiv" />
              <ul className="rx-pfeats">
                {["Up to 3 checklists", "Compliance temperature logging", "Issue reporting", "Kiosk access, unlimited staff", "30-day data history", "Email support"].map((f) => <li key={f}><PCheck />{f}</li>)}
              </ul>
              <Link to="/signup" className="rx-pbtn rx-pbtn-outline">Start with Starter</Link>
            </div>
            <div className="rx-pcard featured rx-fade rx-d1" ref={featuredCardRef}>
              <div className="rx-pbadge">Most popular</div>
              <div className="rx-pname">Growth</div>
              <div className="rx-pamount"><span className="rx-pcur">€</span>99<span className="rx-pper"> / month</span></div>
              <div className="rx-punit">per location · billed monthly</div>
              <div className="rx-pdiv" />
              <ul className="rx-pfeats">
                {["Unlimited checklists", "Full compliance suite", "Issue tracking", "Reporting & analytics", "Multi-location dashboard (up to 10)", "12-month data retention", "Priority support"].map((f) => <li key={f}><PCheck />{f}</li>)}
              </ul>
              <span className="rx-shine-wrap block"><Link to="/signup" className="rx-pbtn rx-pbtn-neon">Start with Growth</Link></span>
            </div>
            <div className="rx-pcard rx-fade rx-d2">
              <div className="rx-pname">Enterprise</div>
              <div className="rx-pamount" style={{ fontSize: 34, letterSpacing: "-0.01em" }}>Custom</div>
              <div className="rx-punit">tailored to your requirements</div>
              <div className="rx-pdiv" />
              <ul className="rx-pfeats">
                {["Everything in Growth", "Unlimited locations", "Advanced permissions", "R&B account management", "Custom SLA"].map((f) => <li key={f}><PCheck />{f}</li>)}
              </ul>
              <a href="#" className="rx-pbtn rx-pbtn-outline" onClick={openDemo}>Contact sales</a>
            </div>
          </div>
        </div>
      </section>

      <section className="rx-cta">
        <div className="rx-container">
          <h2 className="rx-fade">Ready to clean up<br />your operational mess?</h2>
          <p className="rx-cta-sub rx-fade">Set up your first checklist today. Most venues are running in under an hour.</p>
          <div className="rx-cta-btns rx-fade">
            <span className="rx-shine-wrap"><Link to="/signup" className="rx-btn-hero">Set up your first checklist →</Link></span>
          </div>
        </div>
      </section>

      <footer className="rx-footer">
        <div className="rx-footer-inner">
          <div>
            <a href="#home" className="rx-footer-logo">
              <img src="/brand/logo/olia-mark-dark.svg" alt="" className="rx-footer-logo-mark" />
              Olia
            </a>
            <p className="rx-footer-tagline">Operations software for<br />Hospitality teams.</p>
          </div>
          <div className="rx-footer-links">
            <a href="#home">Home</a>
            <a href="#features">Features</a>
            <a href="#who-we-are">Who we are</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login">Sign in</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
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
