import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";

const VOICE_DURATIONS: Record<string, number> = {
  voice_intro: 7.608,
  voice_1: 4.176,
  voice_2: 4.2,
  voice_3: 4.272,
  voice_4: 3.672,
  voice_5: 6.408,
  voice_6: 4.704,
  voice_7: 3.648,
  voice_8: 3.456,
  voice_9: 3.24,
  voice_10: 7.656,
  voice_outro: 8.256,
};

const FPS = 30;
const PADDING_FRAMES = 30; // 1s padding between scenes
const BLOCK_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "cyan", "white", "gold"];

function sceneDuration(voiceKey: string): number {
  return Math.ceil((VOICE_DURATIONS[voiceKey] || 6) * FPS) + PADDING_FRAMES + 30; // extra 30 frames for animations
}

function getTotalFrames(): number {
  let total = sceneDuration("voice_intro");
  for (let i = 1; i <= 10; i++) total += sceneDuration(`voice_${i}`);
  total += sceneDuration("voice_outro");
  return total;
}

// ========== Components ==========

const CosmoCharacter: React.FC<{ bobbing?: boolean }> = ({ bobbing = true }) => {
  const frame = useCurrentFrame();
  const y = bobbing ? Math.sin(frame / 15) * 5 : 0;
  return (
    <Img
      src={staticFile("assets/cosmo.png")}
      style={{
        position: "absolute",
        left: 40,
        bottom: 100 + y,
        width: 200,
        height: 200,
        objectFit: "contain",
      }}
    />
  );
};

const Background: React.FC = () => (
  <Img
    src={staticFile("assets/background.png")}
    style={{ width: "100%", height: "100%", objectFit: "cover" }}
  />
);

const BlockTower: React.FC<{ count: number }> = ({ count }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const BLOCK_SIZE = 50;
  const TOWER_BOTTOM = 620;
  const TOWER_X = 580;

  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const isNew = i === count - 1;
        const y = TOWER_BOTTOM - (i + 1) * BLOCK_SIZE;

        let xOffset = 0;
        let yOffset = 0;
        if (isNew) {
          const s = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
          xOffset = interpolate(s, [0, 1], [400, 0]);
          yOffset = interpolate(s, [0, 1], [-200, 0]);
        }

        return (
          <Img
            key={i}
            src={staticFile(`assets/block_${i + 1}_${BLOCK_COLORS[i]}.png`)}
            style={{
              position: "absolute",
              left: TOWER_X + xOffset,
              top: y + yOffset,
              width: BLOCK_SIZE,
              height: BLOCK_SIZE,
              objectFit: "contain",
            }}
          />
        );
      })}
    </>
  );
};

const NumberGraphic: React.FC<{ num: number }> = ({ num }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 15, fps, config: { damping: 10, stiffness: 80 } });
  const scale = interpolate(s, [0, 1], [0, 1]);
  const opacity = interpolate(s, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Img
      src={staticFile(`assets/num_${num}.png`)}
      style={{
        position: "absolute",
        right: 80,
        top: 60,
        width: 180,
        height: 180,
        objectFit: "contain",
        transform: `scale(${scale})`,
        opacity,
      }}
    />
  );
};

const Confetti: React.FC = () => {
  const frame = useCurrentFrame();
  const particles = Array.from({ length: 30 }).map((_, i) => {
    const x = (i * 137.5) % 1280;
    const speed = 2 + (i % 3);
    const y = (frame * speed + i * 50) % 900 - 100;
    const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#ffa500"];
    const color = colors[i % colors.length];
    const size = 8 + (i % 5) * 2;
    const rotation = frame * (3 + i % 5);
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: i % 2 === 0 ? "50%" : "0%",
          transform: `rotate(${rotation}deg)`,
          opacity: 0.8,
        }}
      />
    );
  });
  return <AbsoluteFill>{particles}</AbsoluteFill>;
};

const TitleText: React.FC<{ text: string; fontSize?: number }> = ({ text, fontSize = 72 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12 } });
  const scale = interpolate(s, [0, 1], [0, 1]);

  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        width: "100%",
        textAlign: "center",
        fontSize,
        fontFamily: "Arial Black, sans-serif",
        fontWeight: "bold",
        color: "#FFD700",
        textShadow: "3px 3px 6px rgba(0,0,0,0.5)",
        transform: `scale(${scale})`,
      }}
    >
      {text}
    </div>
  );
};

// ========== Scenes ==========

const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cosmoSlide = spring({ frame, fps, config: { damping: 12 } });
  const cosmoX = interpolate(cosmoSlide, [0, 1], [1300, 40]);

  return (
    <AbsoluteFill>
      <Background />
      <Img
        src={staticFile("assets/cosmo.png")}
        style={{
          position: "absolute",
          left: cosmoX,
          bottom: 100,
          width: 250,
          height: 250,
          objectFit: "contain",
        }}
      />
      <TitleText text="Count to 10!" />
      <Audio src={staticFile("assets/voice_intro.mp3")} startFrom={0} />
    </AbsoluteFill>
  );
};

const CountScene: React.FC<{ num: number }> = ({ num }) => {
  const isMilestone = num === 5 || num === 10;

  return (
    <AbsoluteFill>
      <Background />
      <CosmoCharacter />
      <BlockTower count={num} />
      <NumberGraphic num={num} />
      {isMilestone && (
        <Sequence from={Math.ceil(FPS * 1.5)}>
          <Confetti />
        </Sequence>
      )}
      <Audio src={staticFile(`assets/voice_${num}.mp3`)} startFrom={0} />
      {/* SFX */}
      <Sequence from={15}>
        <Audio src={staticFile("assets/sfx_pop.mp3")} volume={0.7} />
      </Sequence>
      <Sequence from={30}>
        <Audio src={staticFile("assets/sfx_ding.mp3")} volume={0.5} />
      </Sequence>
      {isMilestone && (
        <Sequence from={Math.ceil(FPS * 1.5)}>
          <Audio src={staticFile("assets/sfx_fanfare.mp3")} volume={0.6} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

const OutroScene: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <CosmoCharacter />
    <BlockTower count={10} />
    <TitleText text="Subscribe!" fontSize={64} />
    <Audio src={staticFile("assets/voice_outro.mp3")} startFrom={0} />
    <Confetti />
  </AbsoluteFill>
);

// ========== Main Composition ==========

export const CountingVideo: React.FC = () => {
  let offset = 0;

  const introFrames = sceneDuration("voice_intro");
  const scenes: React.ReactNode[] = [];

  // Intro
  scenes.push(
    <Sequence key="intro" from={offset} durationInFrames={introFrames}>
      <IntroScene />
    </Sequence>
  );
  offset += introFrames;

  // Count 1-10
  for (let i = 1; i <= 10; i++) {
    const dur = sceneDuration(`voice_${i}`);
    scenes.push(
      <Sequence key={`count-${i}`} from={offset} durationInFrames={dur}>
        <CountScene num={i} />
      </Sequence>
    );
    offset += dur;
  }

  // Outro
  const outroFrames = sceneDuration("voice_outro");
  scenes.push(
    <Sequence key="outro" from={offset} durationInFrames={outroFrames}>
      <OutroScene />
    </Sequence>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {scenes}
      {/* Background music throughout */}
      <Audio src={staticFile("assets/bgm.mp3")} volume={0.12} loop />
    </AbsoluteFill>
  );
};
