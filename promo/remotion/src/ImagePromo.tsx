import React from "react";
import { AbsoluteFill, Img, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

const SEG = 150; // 5s per scene at 30fps
const BLUE = "#599cff";
const EMERALD = "#34d399";
const AMBER = "#fbbf24";
const SOFT = "#c3d0ee";
const SHADOW = "0 2px 16px rgba(0,0,0,.6)";

type Tone = "bad" | "good" | "info";
type Row = { label: string; value: string; tone: Tone };
type Scene = { img: string; title: string; sub?: string; rows?: Row[]; variant?: "hero" | "cta"; pan?: "in" | "lr" | "rl" | "up" };

const toneColor = (t: Tone) => (t === "bad" ? AMBER : t === "info" ? BLUE : EMERALD);
const toneBorder = (t: Tone) => (t === "bad" ? "rgba(251,191,36,.45)" : t === "info" ? "rgba(89,156,255,.45)" : "rgba(52,211,153,.5)");

function accent(title: string) {
  const parts = title.split("yourevents.app");
  if (parts.length === 1) return title;
  return (
    <>
      {parts[0]}
      <span style={{ color: BLUE }}>yourevents.app</span>
      {parts[1]}
    </>
  );
}

const RowCard: React.FC<{ px: (n: number) => number; row: Row }> = ({ px, row }) => (
  <div style={{ display: "flex", alignItems: "center", gap: px(1.5), background: "rgba(8,18,38,.55)", border: `1px solid ${toneBorder(row.tone)}`, borderRadius: px(1.2), padding: `${px(1.2)}px ${px(1.8)}px`, marginTop: px(1.2) }}>
    <span style={{ fontSize: px(2.3), fontWeight: 600, color: "#dfe8ff" }}>{row.label}</span>
    <span style={{ marginLeft: "auto", fontSize: px(3.6), fontWeight: 800, color: toneColor(row.tone) }}>{row.value}</span>
  </div>
);

const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const px = (n: number) => (n * width) / 100;

  const op = interpolate(f, [0, 8, SEG - 8, SEG], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const enter = interpolate(f, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ty = (1 - enter) * px(2.2);
  const z = interpolate(f, [0, SEG], [1.06, 1.17], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  let tx = 0;
  let tyi = 0;
  if (scene.pan === "lr") tx = interpolate(f, [0, SEG], [px(-1.6), px(1.6)]);
  else if (scene.pan === "rl") tx = interpolate(f, [0, SEG], [px(1.6), px(-1.6)]);
  else if (scene.pan === "up") tyi = interpolate(f, [0, SEG], [px(1.6), px(-1.6)]);

  const isCenter = scene.variant === "hero" || scene.variant === "cta";

  return (
    <AbsoluteFill style={{ opacity: op, backgroundColor: "#05101f", overflow: "hidden" }}>
      <Img src={staticFile(scene.img)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z}) translate(${tx}px, ${tyi}px)` }} />

      <AbsoluteFill
        style={{
          background: isCenter
            ? "linear-gradient(to top, rgba(5,12,25,.78), rgba(5,12,25,.5) 55%, rgba(5,12,25,.4))"
            : "linear-gradient(to top, rgba(5,12,25,.88) 0%, rgba(5,12,25,.4) 30%, transparent 52%)",
        }}
      />

      {scene.variant === "cta" ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ opacity: enter, transform: `translateY(${ty}px)`, color: "#fff" }}>
            <div style={{ fontSize: px(5.4), fontWeight: 800, lineHeight: 1.05, textShadow: SHADOW }}>{accent(scene.title)}</div>
            <div style={{ display: "inline-block", marginTop: px(2.6), fontSize: px(2.6), fontWeight: 700, color: "#fff", background: "#205aea", padding: `${px(0.8)}px ${px(1.8)}px`, borderRadius: 999 }}>Get started free</div>
            <div style={{ fontSize: px(2), color: SOFT, marginTop: px(2), textShadow: SHADOW }}>Free events stay free forever. Paid events: flat 5%.</div>
          </div>
        </AbsoluteFill>
      ) : scene.variant === "hero" ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ opacity: enter, transform: `translateY(${ty}px)`, color: "#fff", maxWidth: px(82) }}>
            <div style={{ fontSize: px(6), fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em", textShadow: SHADOW }}>{accent(scene.title)}</div>
            {scene.sub && <div style={{ fontSize: px(2.8), color: SOFT, marginTop: px(2.2), fontWeight: 500, textShadow: SHADOW }}>{scene.sub}</div>}
          </div>
        </AbsoluteFill>
      ) : (
        <div style={{ position: "absolute", left: px(6), right: px(6), bottom: px(7), maxWidth: px(80), opacity: enter, transform: `translateY(${ty}px)` }}>
          <div style={{ fontSize: px(3.5), fontWeight: 700, lineHeight: 1.18, color: "#fff", textShadow: SHADOW }}>{accent(scene.title)}</div>
          {scene.rows && <div style={{ maxWidth: px(58), marginTop: px(2) }}>{scene.rows.map((r, i) => <RowCard key={i} px={px} row={r} />)}</div>}
          {scene.sub && <div style={{ fontSize: px(2.2), color: SOFT, marginTop: px(1.4), textShadow: SHADOW }}>{scene.sub}</div>}
        </div>
      )}
    </AbsoluteFill>
  );
};

export const ImagePromo: React.FC<{ scenes: Scene[] }> = ({ scenes }) => {
  const f = useCurrentFrame();
  const { width, durationInFrames } = useVideoConfig();
  const px = (n: number) => (n * width) / 100;
  const progW = Math.min(100, (f / durationInFrames) * 100);
  const wmOpacity = interpolate(f, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily }}>
      <Series>
        {scenes.map((scene, i) => (
          <Series.Sequence key={i} durationInFrames={SEG}>
            <SceneView scene={scene} />
          </Series.Sequence>
        ))}
      </Series>

      <div style={{ position: "absolute", top: px(4.5), left: px(5), fontSize: px(2.6), fontWeight: 800, color: "#fff", opacity: wmOpacity, textShadow: "0 2px 14px rgba(0,0,0,.6)" }}>
        Your<span style={{ color: BLUE }}>Events</span>
      </div>

      <div style={{ position: "absolute", left: 0, bottom: 0, height: px(0.6), width: "100%", background: "rgba(255,255,255,.14)" }}>
        <div style={{ height: "100%", width: `${progW}%`, background: "linear-gradient(90deg, #599cff, #34d399)" }} />
      </div>
    </AbsoluteFill>
  );
};

export const WHY_SCENES: Scene[] = [
  { img: "ai/01_open.png", variant: "hero", title: "Why organizers choose YourEvents", pan: "in", sub: "Honest, all-in-one event management" },
  { img: "ai/02_organizer.png", title: "Publish a branded event page in minutes", pan: "in" },
  { img: "ai/03_qr.png", title: "Tickets, QR check-in and refunds — one dashboard", pan: "lr" },
  { img: "ai/04_vendor.png", title: "A built-in vendor application and payment flow", pan: "rl" },
  { img: "ai/05_payout.png", title: "Direct payouts to your bank in about 2 days", sub: "We never hold your money.", pan: "in" },
  { img: "ai/06_savings.png", title: "Flat 5% fee. No surprise charges for your attendees.", pan: "up" },
  { img: "ai/07_cta.png", variant: "cta", title: "Start free at yourevents.app" },
];

export const COMPARE_SCENES: Scene[] = [
  { img: "ai/01_open.png", variant: "hero", title: "YourEvents vs Eventbrite", pan: "in", sub: "Same event. More in your pocket." },
  { img: "ai/05_payout.png", title: "A $20 ticket — who really pays the fee?", rows: [{ label: "Eventbrite", value: "$23.11", tone: "bad" }, { label: "YourEvents", value: "$20.00", tone: "good" }], pan: "in" },
  { img: "ai/06_savings.png", title: "We charge the organizer 5% — never the attendee", pan: "lr" },
  { img: "ai/02_organizer.png", title: "Eventbrite can hold your money until after the event", pan: "rl" },
  { img: "ai/03_qr.png", title: "We never touch your funds — Stripe pays you in ~2 days", pan: "in" },
  { img: "ai/04_vendor.png", title: "Vendors, check-in and refunds — built in, not bolted on", pan: "up" },
  { img: "ai/07_cta.png", variant: "cta", title: "See the difference at yourevents.app" },
];

export const MONEY_SCENES: Scene[] = [
  { img: "ai/06_savings.png", variant: "hero", title: "Keep more of what you earn", pan: "in", sub: "More for you — and your attendees" },
  { img: "ai/05_payout.png", title: "On a $20 ticket, your attendee pays:", rows: [{ label: "Other platforms", value: "$23.11", tone: "bad" }, { label: "YourEvents", value: "$20.00", tone: "good" }], pan: "in" },
  { img: "ai/01_open.png", title: "On a 200-person event, that adds up:", rows: [{ label: "More in your pocket", value: "+$420", tone: "good" }, { label: "Less your attendees pay", value: "−$620", tone: "info" }], pan: "lr" },
  { img: "ai/02_organizer.png", title: "Flat 5% with a $1.25 minimum. That's the whole fee.", pan: "rl" },
  { img: "ai/03_qr.png", title: "No service fees. No surprise charges at checkout.", pan: "in" },
  { img: "ai/04_vendor.png", title: "Direct payouts in about 2 days. No holds, no waiting.", pan: "up" },
  { img: "ai/07_cta.png", variant: "cta", title: "Keep more of every ticket — yourevents.app" },
];
