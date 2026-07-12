import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

const COL = {
  blue4: "#599cff",
  blue6: "#205aea",
  emerald: "#34d399",
  amber: "#fbbf24",
  soft: "#c3d0ee",
  muted: "#9fb0d6",
  chip: "#dfe8ff",
};

function sceneOpacity(t: number, a: number, b: number, holdEnd = false) {
  const fi = interpolate(t, [a, a + 0.55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (holdEnd) return fi;
  const fo = interpolate(t, [b - 0.55, b], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return Math.min(fi, fo);
}

const Up: React.FC<{
  t: number;
  start: number;
  delay: number;
  shift: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ t, start, delay, shift, style, children }) => {
  const lt = t - start - delay;
  const p = interpolate(lt, [0, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ease = 1 - Math.pow(1 - p, 3);
  const ty = (1 - ease) * shift;
  return <div style={{ ...style, opacity: p, transform: `translateY(${ty}px)` }}>{children}</div>;
};

const CHIPS: [string, number][] = [
  ["Ticketing", 0.16],
  ["QR check-in", 0.24],
  ["Vendor applications", 0.32],
  ["Refunds", 0.4],
  ["Promo codes", 0.48],
  ["Team roles", 0.56],
];

export const Promo: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 30;

  // Responsive sizing: 1 unit = 1% of width; portrait gets a slight type bump
  // because there is extra vertical room, square/landscape stay at 1.0.
  const r = width / height;
  const scale = r < 0.9 ? 1.1 : 1.0;
  const px = (cq: number) => cq * (width / 100) * scale;
  const shift = px(2.6);
  const stackCards = r < 1.4; // side-by-side only on 16:9-ish; stack on square/portrait

  const sceneBase: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: `0 ${px(7)}px`,
  };

  const cardCommon: React.CSSProperties = {
    flex: stackCards ? "none" : 1,
    width: stackCards ? "100%" : "auto",
    borderRadius: px(2),
    padding: `${px(stackCards ? 2.4 : 3)}px ${px(2.4)}px`,
  };

  const p5 = interpolate(t, [32.6, 39.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const e5 = 1 - Math.pow(1 - p5, 3);
  const pocket = Math.round(420 * e5);
  const attv = Math.round(620 * e5);
  const progW = Math.min(100, (t / 45.8) * 100);

  return (
    <AbsoluteFill
      style={{
        fontFamily,
        backgroundColor: "#0a1733",
        backgroundImage:
          "radial-gradient(120% 80% at 78% 16%, rgba(52,120,246,.30), transparent 55%), radial-gradient(95% 75% at 10% 94%, rgba(16,185,129,.16), transparent 55%)",
        color: "#fff",
      }}
    >
      <AbsoluteFill style={{ ...sceneBase, opacity: sceneOpacity(t, 0, 7.4) }}>
        <Up t={t} start={0} delay={0.08} shift={shift} style={{ fontWeight: 800, letterSpacing: "-0.02em", fontSize: px(9), lineHeight: 1 }}>
          Your<span style={{ color: COL.blue4 }}>Events</span>
        </Up>
        <Up t={t} start={0} delay={0.34} shift={shift} style={{ fontSize: px(3), color: COL.soft, fontWeight: 500, marginTop: px(2.4), maxWidth: px(84), lineHeight: 1.35 }}>
          Event management without the hidden fees, the complexity, or the wait for your money.
        </Up>
      </AbsoluteFill>

      <AbsoluteFill style={{ ...sceneBase, opacity: sceneOpacity(t, 7.4, 16.1) }}>
        <Up t={t} start={7.4} delay={0.05} shift={shift} style={{ fontSize: px(3.6), fontWeight: 700, marginBottom: px(3) }}>
          A $20 ticket. Who pays the fees?
        </Up>
        <div style={{ display: "flex", flexDirection: stackCards ? "column" : "row", gap: px(stackCards ? 2 : 3), width: "100%", maxWidth: px(stackCards ? 78 : 84), justifyContent: "center" }}>
          <Up t={t} start={7.4} delay={0.2} shift={shift} style={{ ...cardCommon, background: "rgba(255,255,255,.04)", border: "1px solid rgba(251,191,36,.4)" }}>
            <div style={{ fontSize: px(1.9), fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: COL.muted }}>Other platforms</div>
            <div style={{ fontSize: px(6), fontWeight: 800, margin: `${px(0.5)}px 0 ${px(0.2)}px`, lineHeight: 1, color: COL.amber }}>$23.11</div>
            <div style={{ fontSize: px(1.85), color: COL.muted, lineHeight: 1.35 }}>Attendee pays ticket + service + processing fees</div>
          </Up>
          <Up t={t} start={7.4} delay={0.34} shift={shift} style={{ ...cardCommon, background: "rgba(16,185,129,.08)", border: "1px solid rgba(52,211,153,.5)" }}>
            <div style={{ fontSize: px(1.9), fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: COL.muted }}>YourEvents</div>
            <div style={{ fontSize: px(6), fontWeight: 800, margin: `${px(0.5)}px 0 ${px(0.2)}px`, lineHeight: 1, color: COL.emerald }}>$20.00</div>
            <div style={{ fontSize: px(1.85), color: COL.muted, lineHeight: 1.35 }}>Attendee pays the price you set. Nothing added.</div>
          </Up>
        </div>
        <Up t={t} start={7.4} delay={0.5} shift={shift} style={{ marginTop: px(3), fontSize: px(2.8), fontWeight: 700 }}>
          We charge the organizer. <span style={{ color: COL.emerald }}>Never the attendee.</span>
        </Up>
      </AbsoluteFill>

      <AbsoluteFill style={{ ...sceneBase, opacity: sceneOpacity(t, 16.1, 24.5) }}>
        <Up t={t} start={16.1} delay={0.05} shift={shift} style={{ fontSize: px(13), fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.03em" }}>
          <span style={{ color: COL.blue4 }}>5%</span>
        </Up>
        <Up t={t} start={16.1} delay={0.2} shift={shift} style={{ fontSize: px(3), fontWeight: 600, marginTop: px(2) }}>
          One flat fee. $1.25 minimum on paid tickets.
        </Up>
        <Up t={t} start={16.1} delay={0.34} shift={shift} style={{ fontSize: px(2.1), color: COL.muted, marginTop: px(1.4), maxWidth: px(80) }}>
          Direct payouts to your own bank in about 2 business days.
        </Up>
        <Up t={t} start={16.1} delay={0.5} shift={shift} style={{ fontSize: px(2.6), color: COL.emerald, fontWeight: 700, marginTop: px(2.2) }}>
          We never hold your money.
        </Up>
      </AbsoluteFill>

      <AbsoluteFill style={{ ...sceneBase, opacity: sceneOpacity(t, 24.5, 32.6) }}>
        <Up t={t} start={24.5} delay={0.05} shift={shift} style={{ fontSize: px(4), fontWeight: 800, marginBottom: px(3) }}>
          Everything in one dashboard.
        </Up>
        <div style={{ display: "flex", flexWrap: "wrap", gap: px(1.6), justifyContent: "center", maxWidth: px(82) }}>
          {CHIPS.map(([label, d]) => (
            <Up key={label} t={t} start={24.5} delay={d} shift={shift} style={{ fontSize: px(2.4), fontWeight: 600, color: COL.chip, background: "rgba(52,120,246,.16)", border: "1px solid rgba(89,156,255,.32)", padding: `${px(0.7)}px ${px(1.2)}px`, borderRadius: 999 }}>
              {label}
            </Up>
          ))}
        </div>
        <Up t={t} start={24.5} delay={0.66} shift={shift} style={{ fontSize: px(2.2), color: COL.muted, marginTop: px(3) }}>
          No more juggling three different tools.
        </Up>
      </AbsoluteFill>

      <AbsoluteFill style={{ ...sceneBase, opacity: sceneOpacity(t, 32.6, 39.7) }}>
        <Up t={t} start={32.6} delay={0.05} shift={shift} style={{ fontSize: px(3), fontWeight: 600, color: COL.soft }}>
          On a 200-person event&hellip;
        </Up>
        <Up t={t} start={32.6} delay={0.16} shift={shift} style={{ fontSize: px(15), fontWeight: 900, color: COL.emerald, lineHeight: 1, letterSpacing: "-0.03em", margin: `${px(0.08)}px 0` }}>
          ${pocket}
        </Up>
        <Up t={t} start={32.6} delay={0.24} shift={shift} style={{ fontSize: px(2.8), fontWeight: 700 }}>
          more in your pocket
        </Up>
        <Up t={t} start={32.6} delay={0.4} shift={shift} style={{ fontSize: px(2.4), color: COL.muted, marginTop: px(2.6) }}>
          and your attendees pay <span style={{ color: COL.blue4, fontWeight: 700 }}>${attv}</span> less in surcharges
        </Up>
      </AbsoluteFill>

      <AbsoluteFill style={{ ...sceneBase, opacity: sceneOpacity(t, 39.7, 45.8, true) }}>
        <Up t={t} start={39.7} delay={0.05} shift={shift} style={{ fontSize: px(5), fontWeight: 800, lineHeight: 1.05 }}>
          Start free at <span style={{ color: COL.blue4 }}>yourevents.app</span>
        </Up>
        <Up t={t} start={39.7} delay={0.2} shift={shift} style={{ marginTop: px(3), fontSize: px(2.6), fontWeight: 700, color: "#fff", background: COL.blue6, padding: `${px(0.8)}px ${px(1.8)}px`, borderRadius: 999 }}>
          Get started free
        </Up>
        <Up t={t} start={39.7} delay={0.34} shift={shift} style={{ fontSize: px(2), color: COL.muted, marginTop: px(2.4) }}>
          Free events stay free forever. Paid events: flat 5%.
        </Up>
        <Up t={t} start={39.7} delay={0.48} shift={shift} style={{ fontSize: px(2.6), fontWeight: 800, marginTop: px(3) }}>
          Your<span style={{ color: COL.blue4 }}>Events</span>
        </Up>
      </AbsoluteFill>

      <div style={{ position: "absolute", left: 0, bottom: 0, height: px(0.6), width: "100%", background: "rgba(255,255,255,.08)" }}>
        <div style={{ height: "100%", width: `${progW}%`, background: "linear-gradient(90deg, #599cff, #34d399)" }} />
      </div>
    </AbsoluteFill>
  );
};
