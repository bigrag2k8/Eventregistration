import { Composition } from "remotion";
import { Promo } from "./Promo";
import { PromoAI } from "./PromoAI";
import { ImagePromo, WHY_SCENES, COMPARE_SCENES, MONEY_SCENES } from "./ImagePromo";

const common = { component: Promo, durationInFrames: 1374, fps: 30 } as const;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Promo" {...common} width={1920} height={1080} />
      <Composition id="Promo-9x16" {...common} width={1080} height={1920} />
      <Composition id="Promo-1x1" {...common} width={1080} height={1080} />
      <Composition id="Promo-4x5" {...common} width={1080} height={1350} />
      <Composition id="PromoAI" component={PromoAI} durationInFrames={1050} fps={30} width={1920} height={1080} />
      <Composition id="PromoAI-9x16" component={PromoAI} durationInFrames={1050} fps={30} width={1080} height={1920} />
      <Composition id="PromoAI-1x1" component={PromoAI} durationInFrames={1050} fps={30} width={1080} height={1080} />
      <Composition id="PromoAI-4x5" component={PromoAI} durationInFrames={1050} fps={30} width={1080} height={1350} />
      <Composition id="Why-16x9" component={ImagePromo} defaultProps={{ scenes: WHY_SCENES }} durationInFrames={1050} fps={30} width={1920} height={1080} />
      <Composition id="Compare-16x9" component={ImagePromo} defaultProps={{ scenes: COMPARE_SCENES }} durationInFrames={1050} fps={30} width={1920} height={1080} />
      <Composition id="Money-16x9" component={ImagePromo} defaultProps={{ scenes: MONEY_SCENES }} durationInFrames={1050} fps={30} width={1920} height={1080} />
    </>
  );
};
