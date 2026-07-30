import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DemoModal } from "@/components/landing/DemoModal";

/**
 * Experimental remix — Sunday's marketing-site structure/density, Olia's copy,
 * white + neon pink (#FF10F0) skin. Local preview only, not linked from any nav.
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
    --neon: #FF10F0;
    --neon-deep: #990A90;
    --neon-dark-tint: #330330;
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
  .rx-badge-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--neon); box-shadow: 0 0 0 4px rgba(255,16,240,0.18); flex-shrink: 0; }
  .rx-badge.on-dark { color: rgba(255,255,255,0.82); }
  .rx-badge.centered { justify-content: center; }

  .rx-tag {
    display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--ink); background: rgba(255,16,240,0.55);
    padding: 3px 9px; border-radius: 4px;
  }

  .rx-container { max-width: 1180px; margin: 0 auto; padding: 0 40px; }
  .olia-remix section { padding: 76px 0; }

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
  .rx-nav-links a:hover { color: var(--ink); }
  .rx-nav-actions { margin-left: auto; display: flex; align-items: center; gap: 16px; }
  .rx-signin { font-size: 13.5px; color: var(--ink-soft); text-decoration: none; transition: color 0.2s; }
  .rx-signin:hover { color: var(--ink); }
  .rx-btn-ghost {
    font-size: 13px; font-weight: 500; color: var(--ink); background: transparent;
    border: 1.5px solid var(--line-mid); padding: 8px 18px; border-radius: 8px;
    cursor: pointer; text-decoration: none; transition: border-color 0.2s, background 0.2s;
  }
  .rx-btn-ghost:hover { border-color: var(--ink); background: rgba(11,15,12,0.03); }
  .rx-btn-neon {
    font-size: 13px; font-weight: 700; color: var(--ink); background: var(--neon);
    border: 1.5px solid var(--neon); padding: 8px 18px; border-radius: 8px;
    cursor: pointer; text-decoration: none; transition: transform 0.15s, box-shadow 0.2s, background 0.2s;
  }
  .rx-btn-neon:hover { background: #FF4CF4; transform: translateY(-1px); box-shadow: 0 8px 22px rgba(255,16,240,0.35); }

  /* HERO */
  .rx-hero { padding: 128px 0 64px; background: var(--white); position: relative; }
  .rx-hero::before {
    content: ''; position: absolute; top: -120px; right: -140px; width: 520px; height: 520px;
    background: radial-gradient(circle, rgba(255,16,240,0.22) 0%, transparent 70%);
    filter: blur(10px); pointer-events: none;
  }
  .rx-hero-inner {
    display: grid; grid-template-columns: 1fr 420px; gap: 64px; align-items: center;
    max-width: 1180px; margin: 0 auto; padding: 0 40px; position: relative;
  }
  .rx-hero h1 { font-size: clamp(44px, 5.4vw, 68px); letter-spacing: -0.01em; margin-bottom: 20px; }
  .rx-hl {
    font-style: italic; color: var(--ink);
    background: rgba(255,16,240,0.6);
    padding: 0 4px;
    margin: 0 -4px;
    line-height: 0.86;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    border-radius: 60% 8px 60% 8px / 20% 60% 20% 60%;
    display: inline;
    transform: rotate(-1deg);
  }

  /* Smaller inline USP marker for body copy / list items */
  .rx-mark {
    font-style: inherit; color: inherit; font-weight: 700;
    background: rgba(255,16,240,0.6);
    padding: 0 4px;
    margin: 0 -4px;
    white-space: nowrap;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    border-radius: 50% 6px 50% 6px / 16% 50% 16% 50%;
    transform: rotate(-1deg);
  }
  .rx-hero-sub { font-size: 17.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; max-width: 460px; margin-bottom: 30px; }
  .rx-hero-ctas { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .rx-btn-hero {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 700;
    color: var(--ink); background: var(--neon); border: 1.5px solid var(--neon);
    padding: 13px 26px; border-radius: 9px; text-decoration: none;
    transition: transform 0.15s, box-shadow 0.2s, background 0.2s;
  }
  .rx-btn-hero:hover { background: #FF4CF4; transform: translateY(-2px); box-shadow: 0 10px 28px rgba(255,16,240,0.4); }
  .rx-btn-hero-ghost {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 400;
    color: var(--ink); background: transparent; border: 1.5px solid var(--line-mid);
    padding: 13px 26px; border-radius: 9px; text-decoration: none; transition: border-color 0.2s, background 0.2s;
  }
  .rx-btn-hero-ghost:hover { border-color: var(--ink); background: rgba(11,15,12,0.03); }
  .rx-hero-note { font-size: 12px; color: var(--ink-faint); letter-spacing: 0.01em; }

  /* KIOSK CARD */
  .rx-kiosk-card { background: var(--black-panel); border-radius: 20px; padding: 26px; box-shadow: var(--shadow-lg), 0 0 0 1px rgba(255,16,240,0.12); transform: rotate(1.6deg); animation: rx-float 7s ease-in-out infinite; }
  @keyframes rx-float { 0%, 100% { transform: rotate(1.6deg) translateY(0); } 50% { transform: rotate(1.6deg) translateY(-10px); } }
  .rx-kiosk-venue { font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,16,240,0.75); margin-bottom: 10px; }
  .rx-kiosk-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 500; color: #fff; margin-bottom: 18px; }
  .rx-kprog { height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-bottom: 5px; overflow: hidden; }
  .rx-kprog-fill { height: 100%; width: 0; background: linear-gradient(90deg, #990A90, #FF10F0); border-radius: 2px; transition: width 0.55s cubic-bezier(0.4,0,0.2,1); }
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
  @keyframes rx-kpulse { 0%, 100% { border-color: rgba(255,255,255,0.09); } 50% { border-color: rgba(255,16,240,0.4); } }
  .rx-kdot { width: 6px; height: 6px; border-radius: 50%; background: var(--neon); animation: rx-blink 1.6s ease-in-out infinite; }
  @keyframes rx-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  .rx-kactive-text { font-size: 12.5px; color: rgba(255,255,255,0.6); }

  /* TRUST STRIP */
  .rx-trust-strip { padding: 40px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .rx-trust-strip-inner { display: flex; align-items: center; gap: 40px; flex-wrap: wrap; justify-content: space-between; }
  .rx-trust-label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); white-space: nowrap; }
  .rx-logo-wall { display: flex; gap: 36px; flex-wrap: wrap; align-items: center; opacity: 0.55; }
  .rx-logo-wall span { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 18px; color: var(--ink); }

  /* PROBLEM */
  .rx-problem { background: var(--paper); }
  .rx-section-header { text-align: center; margin-bottom: 48px; }
  .rx-section-header h2 { font-size: clamp(30px, 3.8vw, 46px); max-width: 600px; margin: 0 auto 14px; }
  .rx-section-header p { font-size: 15.5px; font-weight: 300; color: var(--ink-soft); max-width: 520px; margin: 0 auto; line-height: 1.65; }
  .rx-pain-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .rx-pain-card { background: var(--white); padding: 28px 30px; transition: background 0.2s; }
  .rx-pain-card:hover { background: var(--paper); }
  .rx-pain-icon { width: 28px; height: 28px; color: var(--ink); opacity: 0.7; margin-bottom: 14px; }
  .rx-pain-card h3 { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 700; color: var(--ink); margin-bottom: 9px; letter-spacing: -0.01em; }
  .rx-pain-card p { font-size: 13.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; }

  /* PRODUCT SHOWCASE (dark) */
  .rx-showcase { background: var(--black-panel); position: relative; overflow: hidden; }
  .rx-showcase::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(255,16,240,0.05) 1px, transparent 1px); background-size: 30px 30px; pointer-events: none; }
  .rx-showcase-inner { position: relative; }
  .rx-showcase h2 { color: var(--white); font-size: clamp(30px, 3.8vw, 48px); max-width: 560px; margin-bottom: 14px; }
  .rx-showcase-sub { font-size: 15.5px; font-weight: 300; color: rgba(255,255,255,0.55); max-width: 520px; line-height: 1.65; margin-bottom: 40px; }
  .rx-showcase-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .rx-show-card { background: var(--black-panel-soft); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--r); padding: 28px; transition: transform 0.22s, border-color 0.22s; }
  .rx-show-card:hover { transform: translateY(-5px); border-color: rgba(255,16,240,0.35); }
  .rx-show-icon { width: 34px; height: 34px; color: var(--neon); margin-bottom: 18px; }
  .rx-show-card h3 { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 16px; font-weight: 700; color: var(--white); margin-bottom: 9px; letter-spacing: -0.01em; }
  .rx-show-card p { font-size: 13.5px; font-weight: 300; color: rgba(255,255,255,0.5); line-height: 1.65; }

  /* HOW IT WORKS */
  .rx-how { background: var(--white); }
  .rx-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px; }
  .rx-step-num { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 12px; font-weight: 500; color: var(--neon-deep); letter-spacing: 0.06em; margin-bottom: 12px; }
  .rx-step-icon { width: 42px; height: 42px; background: var(--paper); border-radius: 10px; border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; color: var(--ink); box-shadow: var(--shadow-sm); }
  .rx-step-icon svg { width: 19px; height: 19px; }
  .rx-step h3 { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 8px; letter-spacing: -0.01em; }
  .rx-step p { font-size: 14px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; }

  /* TEAM */
  .rx-team { background: var(--paper); }
  .rx-team-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
  .rx-team-vis { background: var(--black-panel); border-radius: 20px; padding: 28px; position: relative; overflow: hidden; }
  .rx-team-vis::after { content: ''; position: absolute; top: -50px; right: -50px; width: 180px; height: 180px; background: radial-gradient(circle, rgba(255,16,240,0.14) 0%, transparent 70%); pointer-events: none; }
  .rx-vis-label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,16,240,0.8); margin-bottom: 16px; }
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

  /* FEATURES */
  .rx-features { background: var(--white); }
  .rx-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .rx-feat-card { background: var(--paper); border-radius: var(--r); padding: 26px 28px; border: 1px solid var(--line); transition: transform 0.22s, box-shadow 0.22s, border-color 0.22s; }
  .rx-feat-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-lg); border-color: rgba(255,16,240,0.4); }
  .rx-feat-icon { width: 30px; height: 30px; color: var(--ink); opacity: 0.75; margin-bottom: 14px; }
  .rx-feat-card h3 { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 9px; letter-spacing: -0.01em; }
  .rx-feat-card p { font-size: 13.5px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; }

  /* VALUE PROP (3 col) */
  .rx-value { background: var(--paper); }
  .rx-value-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .rx-value-card { padding: 4px; }
  .rx-value-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--black-panel); color: var(--neon); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; }
  .rx-value-icon svg { width: 21px; height: 21px; }
  .rx-value-card h3 { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 17px; font-weight: 700; color: var(--ink); margin-bottom: 10px; }
  .rx-value-card p { font-size: 14px; font-weight: 300; color: var(--ink-soft); line-height: 1.65; }

  /* TESTIMONIALS */
  .rx-testimonials { background: var(--white); }
  .rx-test-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .rx-test-card { background: var(--paper); border: 1px solid var(--line); border-radius: var(--r); padding: 28px; position: relative; }
  .rx-test-sample { position: absolute; top: 16px; right: 16px; }
  .rx-test-quote { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-style: italic; line-height: 1.45; color: var(--ink); margin-bottom: 18px; }
  .rx-test-author { font-size: 12.5px; font-weight: 700; color: var(--ink); }
  .rx-test-role { font-size: 11.5px; color: var(--ink-faint); margin-top: 2px; }

  /* TRUST STATS */
  .rx-stats { background: var(--black-panel); }
  .rx-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--r); overflow: hidden; }
  .rx-stat { background: var(--black-panel-soft); padding: 32px 28px; text-align: center; }
  .rx-stat-num { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 40px; font-weight: 500; color: var(--neon); margin-bottom: 6px; }
  .rx-stat-label { font-size: 12.5px; color: rgba(255,255,255,0.55); }

  /* PRICING */
  .rx-pricing { background: var(--paper); }
  .rx-pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; align-items: start; }
  .rx-pcard { border-radius: var(--r); padding: 30px; border: 1px solid var(--line); background: var(--white); transition: transform 0.22s, box-shadow 0.22s; }
  .rx-pcard:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
  .rx-pcard.featured { background: var(--black-panel); border-color: var(--black-panel); transform: translateY(-14px); box-shadow: 0 22px 60px rgba(11,15,12,0.24); }
  .rx-pcard.featured:hover { transform: translateY(-18px); }
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
  .rx-pbtn-outline { color: var(--ink); background: transparent; border: 1.5px solid var(--line-mid); }
  .rx-pbtn-outline:hover { border-color: var(--ink); background: rgba(11,15,12,0.04); }
  .rx-pbtn-neon { color: var(--ink); background: var(--neon); border: 1.5px solid var(--neon); }
  .rx-pbtn-neon:hover { background: #FF4CF4; }
  .rx-pricing-note { text-align: center; font-size: 12px; color: var(--ink-faint); margin-top: 20px; }

  /* CTA */
  .rx-cta { background: var(--black-panel); text-align: center; padding: 84px 0; position: relative; overflow: hidden; }
  .rx-cta::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(255,16,240,0.12) 0%, transparent 68%); pointer-events: none; }
  .rx-cta h2 { color: var(--white); font-size: clamp(32px, 4.2vw, 54px); max-width: 600px; margin: 0 auto 18px; line-height: 1.15; position: relative; }
  .rx-cta-sub { font-size: 16px; font-weight: 300; color: rgba(255,255,255,0.55); max-width: 440px; margin: 0 auto 28px; line-height: 1.6; position: relative; }
  .rx-cta-btns { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 18px; position: relative; }
  .rx-btn-outline-light { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 400; color: rgba(255,255,255,0.78); background: transparent; border: 1.5px solid rgba(255,255,255,0.22); padding: 13px 26px; border-radius: 9px; text-decoration: none; transition: all 0.2s; }
  .rx-btn-outline-light:hover { border-color: rgba(255,255,255,0.55); color: var(--white); }
  .rx-cta-fine { font-size: 11.5px; color: rgba(255,255,255,0.32); position: relative; }

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

  @media (max-width: 900px) {
    .rx-hero-inner, .rx-team-inner { grid-template-columns: 1fr; }
    .rx-pain-grid, .rx-steps, .rx-feat-grid, .rx-showcase-grid, .rx-value-grid, .rx-test-grid, .rx-stats-grid, .rx-pricing-grid { grid-template-columns: 1fr; }
    .rx-pcard.featured { transform: none; }
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
    .rx-hero { padding: 92px 0 48px; }
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

const painCards = [
  { title: "Paper checklists", desc: "Staff cut corners without being called on it. Ticks get put in by the pass to satisfy after the fact.", icon: <svg className="rx-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/><path d="M9 17h4"/></svg> },
  { title: "WhatsApp chasing", desc: '"Did you do the fridge check?" Sent at 7am. Read at 11am. Answered never.', icon: <svg className="rx-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="12" y2="13"/></svg> },
  { title: "Inconsistent shifts", desc: "Monday morning runs differently to Wednesday afternoon, to Saturday night. Quietly noticed until it matters.", icon: <svg className="rx-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg> },
  { title: "Missed checks", desc: "A task gets skipped. Noticed. Staff get blamed. You vow to tighten things up. Nothing actually changes.", icon: <svg className="rx-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m10.29 3.86-8.51 14.74A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.72-3l-8.51-14.74a2 2 0 0 0-3.44 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  { title: "Compliance risk", desc: "No paperwork log, allergen checks, fridge temperature records — sometimes backdated, always fragile.", icon: <svg className="rx-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
  { title: "No visibility across sites", desc: "You find out your other venue is doing things differently. You find out when something goes wrong.", icon: <svg className="rx-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="10" r="6"/><path d="m21 21-4.35-4.35"/><path d="M8 10h6M11 7v6"/></svg> },
];

const showcase = [
  { title: "Kiosk-first, app-free", desc: "Staff don't download anything. The kiosk lives on a tablet in your venue. No login, no friction — tap and go.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="m9 12 2 2 4-4"/><path d="M9 17h6"/></svg> },
  { title: "Compliance-grade logging", desc: "Every completion is timestamped and stored. Allergen checks, hygiene standards, and audit trails — automatically.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> },
  { title: "Multi-location dashboard", desc: "One clear view of every venue. Spot inconsistencies, maintain standards, and stay in control from your phone.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg> },
];

const steps = [
  { num: "01", title: "Set up your routines", desc: "Build opening, closing, and compliance checklists for your venue — or start from templates. Takes about an hour.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M8 8h8M8 16h5"/></svg> },
  { num: "02", title: "Staff complete tasks on the kiosk", desc: <>Staff tap through their tasks on a tablet in your venue. <span className="rx-mark">No app to download</span>, no account to log in, no training required.</>, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="m9 12 2 2 4-4"/><path d="M9 17h6"/></svg> },
  { num: "03", title: "Managers see what's happening", desc: "Every completion is timestamped and logged. Check in from your phone, office, or across all your locations in real time.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> },
];

const features = [
  { title: "Daily checklists", desc: "Opening, closing, and mid-shift routines built for your venue, fully customisable by your team.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="m9 7 2 2 4-4"/><path d="M9 13h6M9 17h4"/></svg> },
  { title: "Compliance logs", desc: <>Allergen checks, fridge temperature records, all timestamped. Downloadable and <span className="rx-mark">audit-ready</span>.</>, icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> },
  { title: "Issue reporting", desc: "Managers get notified directly in the app. Issues are tracked to resolution.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  { title: "SOP & training hub", desc: "Procedures, recipes, cleaning standards in one place. New starters get up to speed fast.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h5"/></svg> },
  { title: "Reporting & analytics", desc: "Completion rates, recurring issues, training history — surfaced automatically. No manual logging.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg> },
  { title: "Multi-location visibility", desc: "Compliance status from a central dashboard. Spot inconsistencies, maintain standards, stay in control.", icon: <svg className="rx-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg> },
];

const valueProps = [
  { title: "For owners", desc: "Real-time visibility across every venue. Know standards are being kept without having to be there.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg> },
  { title: "For managers", desc: "Fewer WhatsApp threads, fewer surprises. One place to see what's done, what's late, and what needs attention.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"/></svg> },
  { title: "For staff", desc: "No app to install, no account to remember. Tap through the shift on a tablet that's already there.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg> },
];

// Placeholder quotes — swap for real Olia customer testimonials before shipping.
const testimonials = [
  { quote: "Opening used to be whoever got there first, doing whatever they remembered. Now it's the same, every time.", author: "Placeholder name", role: "Placeholder role, Placeholder venue" },
  { quote: "We stopped finding out about problems from a guest complaint. We find out from the dashboard, that morning.", author: "Placeholder name", role: "Placeholder role, Placeholder venue" },
  { quote: "New starters are running a shift properly by day two, not week two.", author: "Placeholder name", role: "Placeholder role, Placeholder venue" },
];

const delay = (i: number) => i % 3 === 1 ? " rx-d1" : i % 3 === 2 ? " rx-d2" : "";

const KIOSK_TASKS = [
  { label: "Confirm fridge temp", time: "06:47" },
  { label: "Bar stocked and ready", time: "06:51" },
  { label: "Floor mopped and dry", time: "07:04" },
  { label: "Menus updated", time: "07:12" },
  { label: "Staff briefed", time: "07:18" },
];

export default function SundayRemixLanding() {
  const navRef = useRef<HTMLElement>(null);
  const [completed, setCompleted] = useState(0);
  const [demoOpen, setDemoOpen] = useState(false);
  const openDemo = (e: React.MouseEvent) => { e.preventDefault(); setDemoOpen(true); };
  const total = KIOSK_TASKS.length;

  useEffect(() => {
    const nav = navRef.current;
    const handleScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 24);
    window.addEventListener("scroll", handleScroll, { passive: true });

    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" }
    );
    document.querySelectorAll(".rx-fade").forEach((el) => obs.observe(el));

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
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <>
    <div className="olia-remix">
      <style>{css}</style>

      <nav className="rx-nav" ref={navRef}>
        <div className="rx-nav-inner">
          <a href="#" className="rx-logo">
            <img src="/brand/logo/olia-mark-dark.svg" alt="" className="rx-logo-mark" />
            Olia
          </a>
          <ul className="rx-nav-links">
            <li><a href="#how">How it works</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#pricing">Pricing</a></li>
          </ul>
          <div className="rx-nav-actions">
            <Link to="/login" className="rx-signin">Sign in</Link>
            <a href="#" className="rx-btn-ghost" onClick={openDemo}>Book a demo</a>
            <Link to="/signup" className="rx-btn-neon">Get started</Link>
          </div>
        </div>
      </nav>

      <section className="rx-hero">
        <div className="rx-hero-inner">
          <div>
            <div className="rx-badge"><span className="rx-badge-dot" />Built exclusively for hospitality managers</div>
            <h1>Run every shift<br />the same way — <span className="rx-hl">every time.</span></h1>
            <p className="rx-hero-sub">Olia replaces paper checklists and WhatsApp chasing with a simple system your team actually uses.</p>
            <div className="rx-hero-ctas">
              <Link to="/signup" className="rx-btn-hero">Set up your first checklist →</Link>
              <a href="#" className="rx-btn-hero-ghost" onClick={openDemo}>Book a demo</a>
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
                <div className="rx-kactive" style={{ borderColor: "rgba(255,16,240,0.4)" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#FF10F0" strokeWidth="2" strokeLinecap="round"><polyline points="1.5 6 4.5 9 10.5 3"/></svg>
                  <span className="rx-kactive-text" style={{ color: "rgba(255,16,240,0.9)" }}>Shift complete — all tasks done</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="rx-trust-strip">
        <div className="rx-container rx-trust-strip-inner">
          <span className="rx-trust-label">Built for venues like&nbsp;— <span style={{ opacity: 0.6 }}>(sample placeholder logos)</span></span>
          <div className="rx-logo-wall">
            {["The Anchor", "Marchetti's", "Nº9 Bistro", "Harbour Kitchen", "The Copper Room", "Fielding & Sons"].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>
      </div>

      <section className="rx-problem">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />The daily chaos</div>
            <h2>The daily chaos that costs you more than you think.</h2>
            <p>Most hospitality teams manage operations with a mix of instinct, habit, and luck. It works — until it doesn't.</p>
          </div>
          <div className="rx-pain-grid">
            {painCards.map((c, i) => (
              <div key={c.title} className={`rx-pain-card rx-fade${delay(i)}`}>
                {c.icon}<h3>{c.title}</h3><p>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rx-showcase">
        <div className="rx-container rx-showcase-inner">
          <div className="rx-badge on-dark rx-fade"><span className="rx-badge-dot" />Built different</div>
          <h2 className="rx-fade">Not a repurposed task manager.</h2>
          <p className="rx-showcase-sub rx-fade">Olia was built from the ground up for shift-based teams, compliance logging, and multi-location oversight.</p>
          <div className="rx-showcase-grid">
            {showcase.map((s, i) => (
              <div key={s.title} className={`rx-show-card rx-fade${i > 0 ? ` rx-d${i}` : ""}`}>
                <div className="rx-show-icon">{s.icon}</div>
                <h3>{s.title}</h3><p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rx-how" id="how">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />How it works</div>
            <h2>One system for your whole operation.</h2>
            <p>Olia works in two places at once — on the floor for your team, and in your pocket for you.</p>
          </div>
          <div className="rx-steps">
            {steps.map((s, i) => (
              <div key={s.num} className={`rx-step rx-fade${i > 0 ? ` rx-d${i}` : ""}`}>
                <div className="rx-step-num">{s.num}</div>
                <div className="rx-step-icon">{s.icon}</div>
                <h3>{s.title}</h3><p>{s.desc}</p>
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
              <p>Staff aren't asked to download anything, create accounts, or learn new software. They find the app on a tablet in your venue, tap through tasks, and move on with their shift.</p>
              <ul className="rx-bullets">
                {["No app to download. No account to create.", "Staff log through tasks on a tablet already in your venue.", "Nothing to learn. Nothing to remember. Just show up and do the shift.", "New starters are operational on day one."].map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="rx-features" id="features">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />Every feature</div>
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

      <section className="rx-value">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />Every check now drives value</div>
            <h2>Built to work for everyone on shift.</h2>
          </div>
          <div className="rx-value-grid">
            {valueProps.map((v, i) => (
              <div key={v.title} className={`rx-value-card rx-fade${delay(i)}`}>
                <div className="rx-value-icon">{v.icon}</div>
                <h3>{v.title}</h3><p>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rx-testimonials">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />What teams say</div>
            <h2>Sample layout — real quotes go here.</h2>
            <p>These cards are placeholders to show the layout. Swap in real Olia customer quotes before this ships anywhere.</p>
          </div>
          <div className="rx-test-grid">
            {testimonials.map((t, i) => (
              <div key={i} className={`rx-test-card rx-fade${delay(i)}`}>
                <span className="rx-test-sample rx-tag">Sample</span>
                <p className="rx-test-quote">"{t.quote}"</p>
                <div className="rx-test-author">{t.author}</div>
                <div className="rx-test-role">{t.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rx-stats">
        <div className="rx-container">
          <div className="rx-stats-grid">
            <div className="rx-stat rx-fade">
              <div className="rx-stat-num">&lt;1hr</div>
              <div className="rx-stat-label">To set up your first checklist</div>
            </div>
            <div className="rx-stat rx-fade rx-d1">
              <div className="rx-stat-num">0</div>
              <div className="rx-stat-label">Apps for staff to install</div>
            </div>
            <div className="rx-stat rx-fade rx-d2">
              <div className="rx-stat-num">14 days</div>
              <div className="rx-stat-label">Free trial, no card required</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rx-pricing" id="pricing">
        <div className="rx-container">
          <div className="rx-section-header rx-fade">
            <div className="rx-badge centered"><span className="rx-badge-dot" />Pricing</div>
            <h2>Simple pricing per location.</h2>
            <p>No per user. <span className="rx-mark">Unlimited staff</span>. Cancel anytime.</p>
          </div>
          <div className="rx-pricing-grid">
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
            <div className="rx-pcard featured rx-fade rx-d1">
              <div className="rx-pbadge">Most popular</div>
              <div className="rx-pname">Growth</div>
              <div className="rx-pamount"><span className="rx-pcur">€</span>99<span className="rx-pper"> / month</span></div>
              <div className="rx-punit">per location · billed monthly</div>
              <div className="rx-pdiv" />
              <ul className="rx-pfeats">
                {["Unlimited checklists", "Full compliance suite", "Issue tracking", "Reporting & analytics", "Multi-location dashboard (up to 10)", "12-month data retention", "Priority support"].map((f) => <li key={f}><PCheck />{f}</li>)}
              </ul>
              <Link to="/signup" className="rx-pbtn rx-pbtn-neon">Start with Growth</Link>
            </div>
            <div className="rx-pcard rx-fade rx-d2">
              <div className="rx-pname">Enterprise</div>
              <div className="rx-pamount" style={{ fontSize: 34, letterSpacing: "-0.01em" }}>Custom</div>
              <div className="rx-punit">tailored to your requirements</div>
              <div className="rx-pdiv" />
              <ul className="rx-pfeats">
                {["Everything in Growth", "Unlimited locations", "Advanced permissions", "R&B account management", "Custom SLA"].map((f) => <li key={f}><PCheck />{f}</li>)}
              </ul>
              <a href="#" className="rx-pbtn rx-pbtn-outline">Contact sales</a>
            </div>
          </div>
          <p className="rx-pricing-note rx-fade">All plans include a 14-day free trial. No credit card required to start.</p>
        </div>
      </section>

      <section className="rx-cta">
        <div className="rx-container">
          <div className="rx-badge centered on-dark rx-fade" style={{ justifyContent: "center" }}><span className="rx-badge-dot" />Get started</div>
          <h2 className="rx-fade">Ready to stop chasing<br />your team on WhatsApp?</h2>
          <p className="rx-cta-sub rx-fade">Set up your first checklist today. Most venues are running in under an hour.</p>
          <div className="rx-cta-btns rx-fade">
            <Link to="/signup" className="rx-btn-hero">Set up your first checklist →</Link>
            <a href="#" className="rx-btn-outline-light" onClick={openDemo}>Book a demo</a>
          </div>
          <p className="rx-cta-fine rx-fade">No long-term contract. No setup fee.</p>
        </div>
      </section>

      <footer className="rx-footer">
        <div className="rx-footer-inner">
          <div>
            <a href="#" className="rx-footer-logo">
              <img src="/brand/logo/olia-mark-dark.svg" alt="" className="rx-footer-logo-mark" />
              Olia
            </a>
            <p className="rx-footer-tagline">Operations software for<br />Hospitality teams.</p>
          </div>
          <div className="rx-footer-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#" onClick={openDemo}>Book a demo</a>
            <Link to="/login">Sign in</Link>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
          <p className="rx-footer-copy">© 2026 Olia. All rights reserved.</p>
        </div>
      </footer>
    </div>
    <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </>
  );
}
