import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DemoModal } from "@/components/landing/DemoModal";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Hanken+Grotesk:wght@300;400;500;600;700&display=swap');

  .olia-landing *, .olia-landing *::before, .olia-landing *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .olia-landing {
    --navy: #15213E;
    --navy-mid: #1E2F52;
    --cream: #F4EFE5;
    --white: #FFFFFF;
    --gold: #C2A15B;
    --gold-light: #E4CFA0;
    --text-mid: #4A5468;
    --text-light: #687080;
    --border: rgba(21,33,62,0.1);
    --border-mid: rgba(21,33,62,0.16);
    --shadow-sm: 0 2px 12px rgba(21,33,62,0.06);
    --shadow-lg: 0 16px 48px rgba(21,33,62,0.14);
    --r: 12px;
    font-family: 'Hanken Grotesk', system-ui, sans-serif;
    color: var(--navy);
    background: var(--cream);
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  .olia-landing h1, .olia-landing h2, .olia-landing h3 {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; line-height: 1.15; color: var(--navy);
  }

  .ol-label {
    display: flex; align-items: center; gap: 12px;
    font-size: 10.5px; font-weight: 500; letter-spacing: 0.13em;
    text-transform: uppercase; color: var(--gold); margin-bottom: 16px;
  }
  .ol-label::before {
    content: ''; display: block; width: 26px; height: 1px;
    background: var(--gold); flex-shrink: 0;
  }
  .ol-label.centered { justify-content: center; }
  .ol-label.centered::after {
    content: ''; display: block; width: 26px; height: 1px;
    background: var(--gold); flex-shrink: 0;
  }
  .ol-label.on-dark { color: rgba(201,169,110,0.75); }
  .ol-label.on-dark::before, .ol-label.on-dark::after { background: rgba(201,169,110,0.45); }

  .ol-container { max-width: 1140px; margin: 0 auto; padding: 0 40px; }
  .olia-landing section { padding: 72px 0; }

  /* NAV */
  .ol-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
    height: 66px; display: flex; align-items: center; padding: 0 40px;
    transition: background 0.3s, box-shadow 0.3s;
  }
  .ol-nav.scrolled {
    background: rgba(247,243,238,0.94);
    backdrop-filter: blur(14px);
    box-shadow: 0 1px 0 var(--border);
  }
  .ol-nav-inner { display: flex; align-items: center; width: 100%; max-width: 1140px; margin: 0 auto; }
  .ol-logo {
    display: flex; align-items: center; gap: 9px;
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: 22px; font-weight: 600; color: var(--navy);
    text-decoration: none; margin-right: 48px;
  }
  .ol-logo-mark { width: 28px; height: 28px; display: block; flex-shrink: 0; }
  .ol-nav-links { display: flex; gap: 30px; list-style: none; }
  .ol-nav-links a { font-size: 13.5px; color: var(--text-mid); text-decoration: none; transition: color 0.2s; }
  .ol-nav-links a:hover { color: var(--navy); }
  .ol-nav-actions { margin-left: auto; display: flex; align-items: center; gap: 18px; }
  .ol-signin { font-size: 13.5px; color: var(--text-mid); text-decoration: none; transition: color 0.2s; }
  .ol-signin:hover { color: var(--navy); }
  .ol-btn-ghost {
    font-size: 13px; font-weight: 500; color: var(--navy); background: transparent;
    border: 1px solid var(--border-mid); padding: 8px 18px; border-radius: 6px;
    cursor: pointer; text-decoration: none; transition: border-color 0.2s, background 0.2s;
  }
  .ol-btn-ghost:hover { border-color: var(--navy); background: rgba(27,42,74,0.03); }
  .ol-btn-solid {
    font-size: 13px; font-weight: 500; color: var(--cream); background: var(--navy);
    border: 1px solid var(--navy); padding: 8px 18px; border-radius: 6px;
    cursor: pointer; text-decoration: none; transition: background 0.2s;
  }
  .ol-btn-solid:hover { background: var(--navy-mid); }

  /* HERO */
  .ol-hero {
    padding: 120px 0 72px;
    background-color: var(--cream);
    background-image: radial-gradient(circle, rgba(27,42,74,0.06) 1px, transparent 1px);
    background-size: 28px 28px;
    overflow: hidden;
  }
  .ol-hero-inner {
    display: grid; grid-template-columns: 1fr 400px;
    gap: 64px; align-items: center;
    max-width: 1140px; margin: 0 auto; padding: 0 40px;
  }
  .ol-eyebrow {
    display: flex; align-items: center; gap: 10px;
    font-size: 10.5px; font-weight: 500; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--gold); margin-bottom: 20px;
  }
  .ol-eyebrow::before { content: ''; width: 22px; height: 1px; background: var(--gold); }
  .ol-hero h1 {
    font-size: clamp(42px, 5.2vw, 64px); font-weight: 400;
    line-height: 1.1; letter-spacing: -0.01em; margin-bottom: 18px;
  }
  .ol-hero h1 em { font-style: italic; color: var(--gold); }
  .ol-hero-sub {
    font-size: 17px; font-weight: 300; color: var(--text-mid);
    line-height: 1.65; max-width: 460px; margin-bottom: 28px;
  }
  .ol-hero-ctas { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
  .ol-btn-hero {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 500;
    color: var(--cream); background: var(--navy); border: 1.5px solid var(--navy);
    padding: 12px 24px; border-radius: 7px; text-decoration: none;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .ol-btn-hero:hover { background: var(--navy-mid); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(27,42,74,0.22); }
  .ol-btn-hero-ghost {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 400;
    color: var(--navy); background: transparent;
    border: 1.5px solid var(--border-mid); padding: 12px 24px; border-radius: 7px;
    text-decoration: none; transition: border-color 0.2s, background 0.2s;
  }
  .ol-btn-hero-ghost:hover { border-color: var(--navy); background: rgba(27,42,74,0.03); }
  .ol-hero-note { font-size: 12px; color: var(--text-light); letter-spacing: 0.01em; }

  /* KIOSK CARD */
  .ol-kiosk-card {
    background: var(--navy); border-radius: 18px; padding: 26px;
    box-shadow: 0 28px 72px rgba(27,42,74,0.28), 0 0 0 1px rgba(255,255,255,0.05);
    transform: rotate(1.8deg);
    animation: ol-float 7s ease-in-out infinite;
  }
  @keyframes ol-float {
    0%, 100% { transform: rotate(1.8deg) translateY(0); }
    50% { transform: rotate(1.8deg) translateY(-10px); }
  }
  .ol-kiosk-venue {
    font-size: 9.5px; font-weight: 500; letter-spacing: 0.12em;
    text-transform: uppercase; color: rgba(201,169,110,0.7); margin-bottom: 10px;
  }
  .ol-kiosk-title {
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 500;
    color: #fff; margin-bottom: 18px;
  }
  .ol-kprog { height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-bottom: 5px; overflow: hidden; }
  .ol-kprog-fill {
    height: 100%; width: 0; background: linear-gradient(90deg, #4ADE80, #22C55E);
    border-radius: 2px; transition: width 0.55s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .ol-kprog-label { font-size: 10px; color: rgba(255,255,255,0.35); margin-bottom: 18px; transition: opacity 0.3s; }
  @keyframes ol-check-pop {
    0%   { transform: scale(0); opacity: 0; }
    55%  { transform: scale(1.25); }
    80%  { transform: scale(0.92); }
    100% { transform: scale(1); opacity: 1; }
  }
  .ol-kcircle.done { animation: ol-check-pop 0.35s ease forwards; }
  .ol-ktask { transition: opacity 0.3s; }
  .ol-ktask.pending { opacity: 0.35; }
  .ol-ktask {
    display: flex; align-items: center; gap: 11px;
    padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.055);
  }
  .ol-ktask:last-of-type { border-bottom: none; }
  .ol-kcircle {
    width: 19px; height: 19px; border-radius: 50%; flex-shrink: 0;
    border: 1.5px solid rgba(255,255,255,0.18);
    display: flex; align-items: center; justify-content: center;
  }
  .ol-kcircle.done { background: #22C55E; border-color: #22C55E; }
  .ol-ktext { font-size: 13px; color: rgba(255,255,255,0.82); flex: 1; }
  .ol-ktask.done .ol-ktext { text-decoration: line-through; color: rgba(255,255,255,0.35); }
  .ol-ktime { font-size: 10px; color: rgba(255,255,255,0.28); }
  .ol-kactive {
    display: flex; align-items: center; gap: 10px;
    margin-top: 12px; padding: 12px 14px;
    background: rgba(255,255,255,0.055); border-radius: 9px;
    border: 1px solid rgba(255,255,255,0.09);
    animation: ol-kpulse 2.2s ease-in-out infinite;
  }
  @keyframes ol-kpulse {
    0%, 100% { border-color: rgba(255,255,255,0.09); }
    50% { border-color: rgba(201,169,110,0.35); }
  }
  .ol-kdot {
    width: 6px; height: 6px; border-radius: 50%; background: var(--gold);
    animation: ol-blink 1.6s ease-in-out infinite;
  }
  @keyframes ol-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  .ol-kactive-text { font-size: 12.5px; color: rgba(255,255,255,0.6); }

  /* PROBLEM */
  .ol-problem { background: var(--white); }
  .ol-section-header { text-align: center; margin-bottom: 44px; }
  .ol-section-header h2 { font-size: clamp(30px, 3.8vw, 46px); max-width: 580px; margin: 0 auto 14px; }
  .ol-section-header p { font-size: 15.5px; font-weight: 300; color: var(--text-light); max-width: 500px; margin: 0 auto; line-height: 1.65; }
  .ol-pain-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 1px; background: var(--border);
    border: 1px solid var(--border); border-radius: var(--r); overflow: hidden;
  }
  .ol-pain-card { background: var(--white); padding: 26px 28px; transition: background 0.2s; }
  .ol-pain-card:hover { background: var(--cream); }
  .ol-pain-icon { width: 28px; height: 28px; color: var(--navy); opacity: 0.65; margin-bottom: 14px; }
  .ol-pain-card h3 {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 600;
    color: var(--navy); margin-bottom: 9px; letter-spacing: -0.01em;
  }
  .ol-pain-card p { font-size: 13.5px; font-weight: 300; color: var(--text-light); line-height: 1.65; }

  /* HOW IT WORKS */
  .ol-how {
    background-color: var(--cream);
    background-image: radial-gradient(circle, rgba(27,42,74,0.06) 1px, transparent 1px);
    background-size: 28px 28px;
  }
  .ol-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px; }
  .ol-step-num {
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 12px; font-weight: 400;
    color: var(--gold); letter-spacing: 0.06em; margin-bottom: 12px; opacity: 0.8;
  }
  .ol-step-icon {
    width: 42px; height: 42px; background: var(--white); border-radius: 9px;
    border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;
    margin-bottom: 16px; color: var(--navy); box-shadow: var(--shadow-sm);
  }
  .ol-step-icon svg { width: 19px; height: 19px; }
  .ol-step h3 {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 16px; font-weight: 600;
    color: var(--navy); margin-bottom: 8px; letter-spacing: -0.01em;
  }
  .ol-step p { font-size: 14px; font-weight: 300; color: var(--text-mid); line-height: 1.65; }

  /* TEAM */
  .ol-team { background: var(--white); }
  .ol-team-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
  .ol-team-vis {
    background: var(--navy); border-radius: 18px; padding: 28px;
    position: relative; overflow: hidden;
  }
  .ol-team-vis::after {
    content: ''; position: absolute; top: -50px; right: -50px;
    width: 180px; height: 180px;
    background: radial-gradient(circle, rgba(201,169,110,0.1) 0%, transparent 70%);
    pointer-events: none;
  }
  .ol-vis-label {
    font-size: 9.5px; font-weight: 500; letter-spacing: 0.12em;
    text-transform: uppercase; color: rgba(201,169,110,0.65); margin-bottom: 16px;
  }
  .ol-mini-task {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.055);
  }
  .ol-mini-task:last-of-type { border-bottom: none; }
  .ol-mini-circle {
    width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
    border: 1.5px solid rgba(255,255,255,0.16);
    display: flex; align-items: center; justify-content: center;
  }
  .ol-mini-circle.done { background: #22C55E; border-color: #22C55E; }
  .ol-mini-text { font-size: 13.5px; color: rgba(255,255,255,0.75); }
  .ol-mini-task.done .ol-mini-text { text-decoration: line-through; color: rgba(255,255,255,0.32); }
  .ol-tap-note {
    margin-top: 14px; padding: 11px 14px; background: rgba(255,255,255,0.05);
    border-radius: 9px; font-size: 12px; color: rgba(255,255,255,0.38);
    text-align: center; letter-spacing: 0.02em;
  }
  .ol-team-content h2 { font-size: clamp(28px, 3.4vw, 42px); margin-bottom: 14px; line-height: 1.2; }
  .ol-team-content > p { font-size: 15.5px; font-weight: 300; color: var(--text-light); line-height: 1.65; margin-bottom: 24px; }
  .ol-bullets { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .ol-bullets li {
    display: flex; align-items: flex-start; gap: 12px;
    font-size: 14.5px; font-weight: 300; color: var(--text-mid); line-height: 1.55;
  }
  .ol-bullets li::before {
    content: ''; width: 5px; height: 5px; border-radius: 50%;
    background: var(--gold); margin-top: 8px; flex-shrink: 0;
  }

  /* FEATURES */
  .ol-features {
    background-color: var(--cream);
    background-image: radial-gradient(circle, rgba(27,42,74,0.06) 1px, transparent 1px);
    background-size: 28px 28px;
  }
  .ol-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .ol-feat-card {
    background: var(--white); border-radius: var(--r); padding: 26px 28px;
    border: 1px solid var(--border); transition: transform 0.22s, box-shadow 0.22s;
  }
  .ol-feat-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-lg); }
  .ol-feat-icon { width: 30px; height: 30px; color: var(--navy); opacity: 0.72; margin-bottom: 14px; }
  .ol-feat-card h3 {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 15px; font-weight: 600;
    color: var(--navy); margin-bottom: 9px; letter-spacing: -0.01em;
  }
  .ol-feat-card p { font-size: 13.5px; font-weight: 300; color: var(--text-light); line-height: 1.65; }

  /* BUILT FOR */
  .ol-built { background: var(--navy); position: relative; overflow: hidden; }
  .ol-built::before {
    content: ''; position: absolute; inset: 0;
    background-image: radial-gradient(circle, rgba(201,169,110,0.04) 1px, transparent 1px);
    background-size: 30px 30px; pointer-events: none;
  }
  .ol-built-inner { position: relative; }
  .ol-built h2 { color: var(--cream); font-size: clamp(30px, 3.8vw, 48px); max-width: 520px; margin-bottom: 14px; }
  .ol-built-sub { font-size: 15.5px; font-weight: 300; color: rgba(247,243,238,0.55); max-width: 500px; line-height: 1.65; margin-bottom: 36px; }
  .ol-built-cards {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 1px; background: rgba(255,255,255,0.06);
    border-radius: var(--r); overflow: hidden; border: 1px solid rgba(255,255,255,0.06);
  }
  .ol-built-card { padding: 26px 28px; background: rgba(255,255,255,0.03); transition: background 0.2s; }
  .ol-built-card:hover { background: rgba(255,255,255,0.07); }
  .ol-built-n {
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 34px; font-weight: 400;
    color: rgba(201,169,110,0.18); margin-bottom: 8px; line-height: 1;
  }
  .ol-built-card h3 {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 16px; font-weight: 600;
    color: var(--cream); margin-bottom: 10px; letter-spacing: -0.01em;
  }
  .ol-built-card p { font-size: 13.5px; font-weight: 300; color: rgba(247,243,238,0.48); line-height: 1.65; }

  /* PRICING */
  .ol-pricing { background: var(--white); }
  .ol-pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; align-items: start; }
  .ol-pcard {
    border-radius: var(--r); padding: 30px;
    border: 1px solid var(--border); background: var(--white);
    transition: transform 0.22s, box-shadow 0.22s;
  }
  .ol-pcard:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
  .ol-pcard.featured {
    background: var(--navy); border-color: var(--navy);
    transform: translateY(-14px);
    box-shadow: 0 20px 60px rgba(27,42,74,0.24);
  }
  .ol-pcard.featured:hover { transform: translateY(-18px); }
  .ol-pbadge {
    display: inline-block; font-size: 10px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--navy); background: var(--gold-light);
    padding: 4px 10px; border-radius: 4px; margin-bottom: 18px;
  }
  .ol-pname { font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 15px; font-weight: 500; color: var(--navy); margin-bottom: 7px; }
  .ol-pcard.featured .ol-pname { color: var(--cream); }
  .ol-pamount {
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 40px; font-weight: 400;
    color: var(--navy); letter-spacing: -0.02em; line-height: 1;
  }
  .ol-pcard.featured .ol-pamount { color: var(--cream); }
  .ol-pcur { font-size: 20px; vertical-align: super; }
  .ol-pper { font-size: 13px; font-weight: 300; color: var(--text-light); }
  .ol-pcard.featured .ol-pper { color: rgba(247,243,238,0.45); }
  .ol-punit { font-size: 11.5px; color: var(--text-light); margin-bottom: 18px; margin-top: 4px; }
  .ol-pcard.featured .ol-punit { color: rgba(247,243,238,0.38); }
  .ol-pdiv { height: 1px; background: var(--border); margin-bottom: 16px; }
  .ol-pcard.featured .ol-pdiv { background: rgba(255,255,255,0.1); }
  .ol-pfeats { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; }
  .ol-pfeats li {
    display: flex; align-items: flex-start; gap: 9px;
    font-size: 13px; font-weight: 300; color: var(--text-mid); line-height: 1.5;
  }
  .ol-pcard.featured .ol-pfeats li { color: rgba(247,243,238,0.68); }
  .ol-pcheck { width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px; color: var(--gold); }
  .ol-pcard.featured .ol-pcheck { color: #4ADE80; }
  .ol-pbtn {
    display: block; width: 100%; text-align: center;
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 13.5px; font-weight: 500;
    padding: 12px 20px; border-radius: 7px; cursor: pointer;
    text-decoration: none; transition: all 0.2s;
  }
  .ol-pbtn-outline { color: var(--navy); background: transparent; border: 1.5px solid var(--border-mid); }
  .ol-pbtn-outline:hover { border-color: var(--navy); background: rgba(27,42,74,0.04); }
  .ol-pbtn-gold { color: var(--navy); background: var(--gold-light); border: 1.5px solid transparent; }
  .ol-pbtn-gold:hover { background: var(--gold); color: var(--white); }
  .ol-pricing-note { text-align: center; font-size: 12px; color: var(--text-light); margin-top: 20px; }

  /* CTA */
  .ol-cta { background: var(--navy); text-align: center; padding: 80px 0; position: relative; overflow: hidden; }
  .ol-cta::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(ellipse at center, rgba(201,169,110,0.07) 0%, transparent 68%);
    pointer-events: none;
  }
  .ol-cta h2 { color: var(--cream); font-size: clamp(32px, 4.2vw, 54px); max-width: 580px; margin: 0 auto 18px; line-height: 1.15; position: relative; }
  .ol-cta-sub { font-size: 16px; font-weight: 300; color: rgba(247,243,238,0.55); max-width: 420px; margin: 0 auto 28px; line-height: 1.6; position: relative; }
  .ol-cta-btns { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 18px; position: relative; }
  .ol-btn-cream {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 500;
    color: var(--navy); background: var(--cream);
    border: 1.5px solid var(--cream); padding: 12px 24px; border-radius: 7px;
    text-decoration: none; transition: all 0.2s;
  }
  .ol-btn-cream:hover { background: white; transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.14); }
  .ol-btn-outline-light {
    font-family: 'Hanken Grotesk', system-ui, sans-serif; font-size: 14.5px; font-weight: 400;
    color: rgba(247,243,238,0.78); background: transparent;
    border: 1.5px solid rgba(247,243,238,0.22); padding: 12px 24px; border-radius: 7px;
    text-decoration: none; transition: all 0.2s;
  }
  .ol-btn-outline-light:hover { border-color: rgba(247,243,238,0.55); color: var(--cream); }
  .ol-cta-fine { font-size: 11.5px; color: rgba(247,243,238,0.3); position: relative; }

  /* FOOTER */
  .ol-footer { background: var(--navy); border-top: 1px solid rgba(255,255,255,0.07); padding: 36px 0 28px; }
  .ol-footer-inner {
    display: grid; grid-template-columns: 220px 1fr auto;
    gap: 32px; align-items: center;
    max-width: 1140px; margin: 0 auto; padding: 0 40px;
  }
  .ol-footer-logo {
    display: flex; align-items: center; gap: 9px;
    font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;
    font-size: 21px; font-weight: 600; color: var(--cream); text-decoration: none; margin-bottom: 6px;
  }
  .ol-footer-logo-mark { width: 26px; height: 26px; display: block; flex-shrink: 0; }
  .ol-footer-tagline { font-size: 11.5px; font-weight: 300; color: rgba(247,243,238,0.33); line-height: 1.5; }
  .ol-footer-links { display: flex; gap: 28px; flex-wrap: wrap; justify-content: center; }
  .ol-footer-links a { font-size: 12.5px; color: rgba(247,243,238,0.38); text-decoration: none; transition: color 0.2s; }
  .ol-footer-links a:hover { color: rgba(247,243,238,0.75); }
  .ol-footer-copy { font-size: 11.5px; color: rgba(247,243,238,0.22); white-space: nowrap; }

  /* ANIMATIONS */
  .ol-fade { opacity: 0; transform: translateY(22px); transition: opacity 0.62s ease, transform 0.62s ease; }
  .ol-fade.visible { opacity: 1; transform: translateY(0); }
  .ol-d1 { transition-delay: 0.08s; }
  .ol-d2 { transition-delay: 0.16s; }

  @media (max-width: 900px) {
    .ol-hero-inner, .ol-team-inner { grid-template-columns: 1fr; }
    .ol-pain-grid, .ol-steps, .ol-feat-grid, .ol-built-cards, .ol-pricing-grid { grid-template-columns: 1fr; }
    .ol-pcard.featured { transform: none; }
    .ol-footer-inner { grid-template-columns: 1fr; }
    .ol-footer-links { justify-content: flex-start; }
    .ol-footer-copy { text-align: left; }
  }
`;

function Tick() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
      <polyline points="1.5 4.5 3.5 6.5 7.5 2.5" />
    </svg>
  );
}

function PCheck() {
  return (
    <svg className="ol-pcheck" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <polyline points="2 7.5 5.5 11 13 4" />
    </svg>
  );
}

const painCards = [
  { title: "Paper checklists", desc: "Staff cut corners without being called on it. Ticks get put in by the pass to satisfy after the fact.", icon: <svg className="ol-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/><path d="M9 17h4"/></svg> },
  { title: "WhatsApp chasing", desc: '"Did you do the fridge check?" Sent at 7am. Read at 11am. Answered never.', icon: <svg className="ol-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="12" y2="13"/></svg> },
  { title: "Inconsistent shifts", desc: "Monday morning runs differently to Wednesday afternoon, to Saturday night. Quietly noticed until it matters.", icon: <svg className="ol-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg> },
  { title: "Missed checks", desc: "A task gets skipped. Noticed. Staff get blamed. You vow to tighten things up. Nothing actually changes.", icon: <svg className="ol-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m10.29 3.86-8.51 14.74A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.72-3l-8.51-14.74a2 2 0 0 0-3.44 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  { title: "Compliance risk", desc: "No paperwork log, allergen checks, fridge temperature records — sometimes backdated, always fragile.", icon: <svg className="ol-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
  { title: "No visibility across sites", desc: "You find out your other venue is doing things differently. You find out when something goes wrong.", icon: <svg className="ol-pain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="10" r="6"/><path d="m21 21-4.35-4.35"/><path d="M8 10h6M11 7v6"/></svg> },
];

const steps = [
  { num: "01", title: "Set up your routines", desc: "Build opening, closing, and compliance checklists for your venue — or start from templates. Takes about an hour.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M8 8h8M8 16h5"/></svg> },
  { num: "02", title: "Staff complete tasks on the kiosk", desc: "Staff tap through their tasks on a tablet in your venue. No app to download, no account to log in, no training required.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="m9 12 2 2 4-4"/><path d="M9 17h6"/></svg> },
  { num: "03", title: "Managers see what's happening", desc: "Every completion is timestamped and logged. Check in from your phone, office, or across all your locations in real time.", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> },
];

const features = [
  { title: "Daily checklists", desc: "Opening, closing, and mid-shift routines built for your venue, fully customisable by your team.", icon: <svg className="ol-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="m9 7 2 2 4-4"/><path d="M9 13h6M9 17h4"/></svg> },
  { title: "Compliance logs", desc: "Allergen checks, fridge temperature records, all timestamped. Downloadable and audit-ready.", icon: <svg className="ol-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> },
  { title: "Issue reporting", desc: "Managers get notified directly in the app. Issues are tracked to resolution.", icon: <svg className="ol-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  { title: "SOP & training hub", desc: "Procedures, recipes, cleaning standards in one place. New starters get up to speed fast.", icon: <svg className="ol-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h5"/></svg> },
  { title: "Reporting & analytics", desc: "Completion rates, recurring issues, training history — surfaced automatically. No manual logging.", icon: <svg className="ol-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg> },
  { title: "Multi-location visibility", desc: "Compliance status from a central dashboard. Spot inconsistencies, maintain standards, stay in control.", icon: <svg className="ol-feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg> },
];

const delay = (i: number) => i % 3 === 1 ? " ol-d1" : i % 3 === 2 ? " ol-d2" : "";

const KIOSK_TASKS = [
  { label: "Confirm fridge temp",   time: "06:47" },
  { label: "Bar stocked and ready", time: "06:51" },
  { label: "Floor mopped and dry",  time: "07:04" },
  { label: "Menus updated",         time: "07:12" },
  { label: "Staff briefed",         time: "07:18" },
];

export default function Landing() {
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
    document.querySelectorAll(".ol-fade").forEach((el) => obs.observe(el));

    // Kiosk animation loop: tick a task every 900ms, pause 2.5s at 100%, then reset
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
    <div className="olia-landing">
      <style>{css}</style>

      <nav className="ol-nav" ref={navRef}>
        <div className="ol-nav-inner">
          <a href="#" className="ol-logo">
            <img src="/brand/logo/olia-mark-navy.svg" alt="" className="ol-logo-mark" />
            Olia
          </a>
          <ul className="ol-nav-links">
            <li><a href="#how">How it works</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#pricing">Pricing</a></li>
          </ul>
          <div className="ol-nav-actions">
            <Link to="/login" className="ol-signin">Sign in</Link>
            <a href="#" className="ol-btn-ghost" onClick={openDemo}>Book a demo</a>
            <Link to="/signup" className="ol-btn-solid">Get started</Link>
          </div>
        </div>
      </nav>

      <section className="ol-hero">
        <div className="ol-hero-inner">
          <div>
            <div className="ol-eyebrow">Built exclusively for hospitality managers, not a generic task manager</div>
            <h1>Run every shift<br />the same way —<br /><em>every time.</em></h1>
            <p className="ol-hero-sub">Olia replaces paper checklists and WhatsApp chasing with a simple system your team actually uses.</p>
            <div className="ol-hero-ctas">
              <Link to="/signup" className="ol-btn-hero">Set up your first checklist →</Link>
              <a href="#" className="ol-btn-hero-ghost" onClick={openDemo}>Book a demo</a>
            </div>
            <p className="ol-hero-note">Starter from €49 · per location · no per-user fees</p>
          </div>
          <div>
            <div className="ol-kiosk-card">
              <div className="ol-kiosk-venue">The Anchor — Wednesday morning</div>
              <div className="ol-kiosk-title">Opening Checklist</div>
              <div className="ol-kprog">
                <div className="ol-kprog-fill" style={{ width: `${(completed / total) * 100}%` }} />
              </div>
              <div className="ol-kprog-label">
                {completed < total ? `${completed} of ${total} complete` : `${total} of ${total} complete`}
              </div>
              {KIOSK_TASKS.map((t, i) => {
                const done = i < completed;
                const pending = i > completed;
                return (
                  <div key={t.label} className={`ol-ktask${done ? " done" : ""}${pending ? " pending" : ""}`}>
                    <div className={`ol-kcircle${done ? " done" : ""}`}>
                      {done && <Tick />}
                    </div>
                    <span className="ol-ktext">{t.label}</span>
                    {done && <span className="ol-ktime">{t.time}</span>}
                  </div>
                );
              })}
              {completed < total && (
                <div className="ol-kactive">
                  <div className="ol-kdot" />
                  <span className="ol-kactive-text">{KIOSK_TASKS[completed].label} — tap to complete</span>
                </div>
              )}
              {completed === total && (
                <div className="ol-kactive" style={{ borderColor: "rgba(74,222,128,0.4)" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round"><polyline points="1.5 6 4.5 9 10.5 3"/></svg>
                  <span className="ol-kactive-text" style={{ color: "rgba(74,222,128,0.85)" }}>Shift complete — all tasks done</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="ol-problem">
        <div className="ol-container">
          <div className="ol-section-header ol-fade">
            <div className="ol-label centered">The daily chaos</div>
            <h2>The daily chaos that costs you more than you think.</h2>
            <p>Most hospitality teams manage operations with a mix of instinct, habit, and luck. It works — until it doesn't.</p>
          </div>
          <div className="ol-pain-grid">
            {painCards.map((c, i) => (
              <div key={c.title} className={`ol-pain-card ol-fade${delay(i)}`}>
                {c.icon}<h3>{c.title}</h3><p>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ol-how" id="how">
        <div className="ol-container">
          <div className="ol-section-header ol-fade">
            <div className="ol-label centered">How it works</div>
            <h2>One system for your whole operation.</h2>
            <p>Olia works in two places at once — on the floor for your team, and in your pocket for you.</p>
          </div>
          <div className="ol-steps">
            {steps.map((s, i) => (
              <div key={s.num} className={`ol-step ol-fade${i > 0 ? ` ol-d${i}` : ""}`}>
                <div className="ol-step-num">{s.num}</div>
                <div className="ol-step-icon">{s.icon}</div>
                <h3>{s.title}</h3><p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ol-team">
        <div className="ol-container">
          <div className="ol-team-inner">
            <div className="ol-team-vis ol-fade">
              <div className="ol-vis-label">Staff experience — kiosk view</div>
              {["Confirm fridge temp","Bar stocked and ready","Staff briefed"].map((t) => (
                <div key={t} className="ol-mini-task done">
                  <div className="ol-mini-circle done"><Tick /></div>
                  <span className="ol-mini-text">{t}</span>
                </div>
              ))}
              <div className="ol-mini-task">
                <div className="ol-mini-circle" />
                <span className="ol-mini-text" style={{ color: "rgba(255,255,255,0.88)" }}>Floor mopped and dry</span>
              </div>
              <div className="ol-tap-note">Tap to confirm · Done in 3 minutes</div>
            </div>
            <div className="ol-team-content ol-fade ol-d2">
              <div className="ol-label">Team adoption</div>
              <h2>Your team won't fight this.</h2>
              <p>Staff aren't asked to download anything, create accounts, or learn new software. They find the app on a tablet in your venue, tap through tasks, and move on with their shift.</p>
              <ul className="ol-bullets">
                {["No app to download. No account to create.","Staff log through tasks on a tablet already in your venue.","Nothing to learn. Nothing to remember. Just show up and do the shift.","New starters are operational on day one."].map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="ol-features" id="features">
        <div className="ol-container">
          <div className="ol-section-header ol-fade">
            <div className="ol-label centered">Every feature</div>
            <h2>Everything you need to run a consistent operation.</h2>
            <p>Purpose-built features for hospitality — not adapted from a generic task manager.</p>
          </div>
          <div className="ol-feat-grid">
            {features.map((f, i) => (
              <div key={f.title} className={`ol-feat-card ol-fade${delay(i)}`}>
                {f.icon}<h3>{f.title}</h3><p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ol-built">
        <div className="ol-container">
          <div className="ol-built-inner">
            <div className="ol-label on-dark ol-fade">Built different</div>
            <h2 className="ol-fade">Built for the way restaurants actually work.</h2>
            <p className="ol-built-sub ol-fade">Not a repurposed task manager. Not a generic checklist tool. Olia was built from the ground up for shift-based teams, compliance logging, and multi-location oversight.</p>
            <div className="ol-built-cards">
              {[
                { n: "01", title: "Kiosk-first, app-free", desc: "Staff don't download anything. The kiosk lives on a tablet in your venue. No login. No friction. Tap and go." },
                { n: "02", title: "Shift-smart, not just date-aware", desc: "Olia understands opening shifts, closing delays, morning prep, and last-room checks — not just calendar dates." },
                { n: "03", title: "Compliance-grade logging", desc: "Every completion is timestamped and stored. Allergen checks, hygiene standards, and audit trails — automatically." },
              ].map((c, i) => (
                <div key={c.n} className={`ol-built-card ol-fade${i > 0 ? ` ol-d${i}` : ""}`}>
                  <div className="ol-built-n">{c.n}</div>
                  <h3>{c.title}</h3><p>{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="ol-pricing" id="pricing">
        <div className="ol-container">
          <div className="ol-section-header ol-fade">
            <div className="ol-label centered">Pricing</div>
            <h2>Simple pricing per location.</h2>
            <p>No per user. Unlimited staff. Cancel anytime.</p>
          </div>
          <div className="ol-pricing-grid">
            <div className="ol-pcard ol-fade">
              <div className="ol-pname">Starter</div>
              <div className="ol-pamount"><span className="ol-pcur">€</span>49<span className="ol-pper"> / month</span></div>
              <div className="ol-punit">per location · billed monthly</div>
              <div className="ol-pdiv" />
              <ul className="ol-pfeats">
                {["Up to 3 checklists","Compliance temperature logging","Issue reporting","Kiosk access, unlimited staff","30-day data history","Email support"].map((f) => <li key={f}><PCheck />{f}</li>)}
              </ul>
              <Link to="/signup" className="ol-pbtn ol-pbtn-outline">Start with Starter</Link>
            </div>
            <div className="ol-pcard featured ol-fade ol-d1">
              <div className="ol-pbadge">Most popular</div>
              <div className="ol-pname">Growth</div>
              <div className="ol-pamount"><span className="ol-pcur">€</span>99<span className="ol-pper"> / month</span></div>
              <div className="ol-punit">per location · billed monthly</div>
              <div className="ol-pdiv" />
              <ul className="ol-pfeats">
                {["Unlimited checklists","Full compliance suite","Issue tracking","Reporting & analytics","Multi-location dashboard (up to 10)","12-month data retention","Priority support"].map((f) => <li key={f}><PCheck />{f}</li>)}
              </ul>
              <Link to="/signup" className="ol-pbtn ol-pbtn-gold">Start with Growth</Link>
            </div>
            <div className="ol-pcard ol-fade ol-d2">
              <div className="ol-pname">Enterprise</div>
              <div className="ol-pamount" style={{ fontSize: 34, letterSpacing: "-0.01em" }}>Custom</div>
              <div className="ol-punit">tailored to your requirements</div>
              <div className="ol-pdiv" />
              <ul className="ol-pfeats">
                {["Everything in Growth","Unlimited locations","Advanced permissions","R&B account management","Custom SLA"].map((f) => <li key={f}><PCheck />{f}</li>)}
              </ul>
              <a href="#" className="ol-pbtn ol-pbtn-outline">Contact sales</a>
            </div>
          </div>
          <p className="ol-pricing-note ol-fade">All plans include a 14-day free trial. No credit card required to start.</p>
        </div>
      </section>

      <section className="ol-cta">
        <div className="ol-container">
          <div className="ol-label centered on-dark ol-fade" style={{ justifyContent: "center" }}>Get started</div>
          <h2 className="ol-fade">Ready to stop chasing<br />your team on WhatsApp?</h2>
          <p className="ol-cta-sub ol-fade">Set up your first checklist today. Most venues are running in under an hour.</p>
          <div className="ol-cta-btns ol-fade">
            <Link to="/signup" className="ol-btn-cream">Set up your first checklist →</Link>
            <a href="#" className="ol-btn-outline-light" onClick={openDemo}>Book a demo</a>
          </div>
          <p className="ol-cta-fine ol-fade">No long-term contract. No setup fee.</p>
        </div>
      </section>

      <footer className="ol-footer">
        <div className="ol-footer-inner">
          <div>
            <a href="#" className="ol-footer-logo">
              <img src="/brand/logo/olia-mark-champagne.svg" alt="" className="ol-footer-logo-mark" />
              Olia
            </a>
            <p className="ol-footer-tagline">Operations software for<br />Hospitality teams.</p>
          </div>
          <div className="ol-footer-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#" onClick={openDemo}>Book a demo</a>
            <Link to="/login">Sign in</Link>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
          <p className="ol-footer-copy">© 2026 Olia. All rights reserved.</p>
        </div>
      </footer>
    </div>
    <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </>
  );
}
