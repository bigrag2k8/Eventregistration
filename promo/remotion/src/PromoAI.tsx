import React from "react";
import { AbsoluteFill, OffthreadVideo, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

const SEG = 150; // 5s per clip at 30fps
const BLUE = "#599cff";
const SOFT = "#c3d0ee";
const SHADOW = "0 2px 14px rgba(0,0,0,.55)";

type Shot = { src: string; caption?: string; variant: "lower" | "cta" };

const SHOTS: Shot[] = [
  { src: "clips/01.mp4", caption: "Event management without the hidden fees, the complexity, or the wait for your money.", variant: "lower" },
  { src: "clips/02.mp4", caption: "Publish your branded event page in minutes.", variant: "lower" },
  { src: "clips/03.mp4", caption: "QR tickets and fast check-in, built in.", variant: "lower" },
  { src: "clips/04.mp4", caption: "Vendors apply, pay, and get approved — all in one place.", variant: "lower" },
  { src: "clips/05.mp4", caption: "Direct payouts to your bank in about 2 days. We never hold your money.", variant: "lower" },
  { src: "clips/06.mp4", caption: "Flat 5% fee — keep an extra $420 on a 200-person event.", variant: "lower" },
  { src: "clips/07.mp4", variant: "cta" },
];

const CtaText: React.FC<{ px: (n: number) => number; big: number }> = ({ px, big }) => (
  <div style={{ color: "#fff" }}>
    <div style={{ fontSize: px(big), fontWeight: 800, lineHeight: 1.05, textShadow: SHADOW }}>
      Start free at <span style={{ color: BLUE }}>yourevents.app</span>
    </div>
    <div style={{ display: "inline-block", marginTop: px(2.6), fontSize: px(2.6), fontWeight: 700, color: "#fff", background: "#205aea", padding: `${px(0.8)}px ${px(1.8)}px`, borderRadius: 999 }}>
      Get started free
    </div>
    <div style={{ fontSize: px(2), color: SOFT, marginTop: px(2), textShadow: SHADOW }}>
      Free events stay free forever. Paid events: flat 5%.
    </div>
  </div>
);

const Clip: React.FC<{ shot: Shot }> = ({ shot }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const px = (n: number) => (n * width) / 100;
  const framed = width / height < 1.45; // portrait/square use the framed layout

  const op = interpolate(f, [0, 8, SEG - 8, SEG], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const enter = interpolate(f, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ty = (1 - enter) * px(2.2);

  if (framed) {
    const clipW = width * 0.94;
    const clipH = (clipW * 9) / 16;
    const clipTop = 0.38 * height - clipH / 2;
    const capTop = clipTop + clipH + px(5);
    return (
      <AbsoluteFill style={{ opacity: op, backgroundColor: "#05101f" }}>
        <OffthreadVideo src={staticFile(shot.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.25)", filter: "blur(34px) brightness(0.5)" }} />
        <AbsoluteFill style={{ background: "rgba(5,12,25,.45)" }} />
        <div style={{ position: "absolute", top: clipTop, left: 0, width: "100%", display: "flex", justifyContent: "center" }}>
          <div style={{ width: clipW, height: clipH, borderRadius: px(1.6), overflow: "hidden", boxShadow: "0 24px 70px rgba(0,0,0,.55)", opacity: enter, transform: `translateY(${ty}px)` }}>
            <OffthreadVideo src={staticFile(shot.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
        <div style={{ position: "absolute", top: capTop, left: "6%", right: "6%", textAlign: "center", opacity: enter, transform: `translateY(${ty}px)` }}>
          {shot.variant === "cta" ? (
            <CtaText px={px} big={5.6} />
          ) : (
            <div style={{ fontSize: px(4), fontWeight: 700, lineHeight: 1.22, color: "#fff", textShadow: SHADOW }}>{shot.caption}</div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity: op, backgroundColor: "#05101f" }}>
      <OffthreadVideo src={staticFile(shot.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {shot.variant === "cta" ? (
        <>
          <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(5,12,25,.8), rgba(5,12,25,.45) 55%, rgba(5,12,25,.25))" }} />
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <div style={{ opacity: enter, transform: `translateY(${ty}px)` }}>
              <CtaText px={px} big={5.4} />
            </div>
          </AbsoluteFill>
        </>
      ) : (
        <>
          <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(5,12,25,.85) 0%, rgba(5,12,25,.35) 24%, transparent 46%)" }} />
          <div style={{ position: "absolute", left: px(6), bottom: px(8), maxWidth: px(72), textAlign: "left", opacity: enter, transform: `translateY(${ty}px)` }}>
            <div style={{ fontSize: px(3.4), fontWeight: 700, lineHeight: 1.18, color: "#fff", textShadow: SHADOW }}>{shot.caption}</div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

export const PromoAI: React.FC = () => {
  const f = useCurrentFrame();
  const { width, durationInFrames } = useVideoConfig();
  const px = (n: number) => (n * width) / 100;
  const progW = Math.min(100, (f / durationInFrames) * 100);
  const wmOpacity = interpolate(f, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily }}>
      <Series>
        {SHOTS.map((shot, i) => (
          <Series.Sequence key={i} durationInFrames={SEG}>
            <Clip shot={shot} />
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
