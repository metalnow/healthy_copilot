import { useId } from "react";
import type { AssistantMood } from "@/lib/assistant";

export type NurseMood = AssistantMood;

const LINE = "#3b2a2a";
const BROW = "#7a4b3a";
const LIP = "#9b3f4c";
const UNIFORM_EDGE = "#e6dcdc";
const CROSS = "#e85a71";

function Eye({ cx, iris }: { cx: number; iris: string }) {
  const side = cx < 60 ? -1 : 1;
  return (
    <g className="nurse-eye" style={{ transformOrigin: `${cx}px 71px` }}>
      <ellipse cx={cx} cy={71} rx={9} ry={11.5} fill="#fff" />
      <ellipse cx={cx} cy={72.5} rx={8} ry={10.2} fill={`url(#${iris})`} />
      <ellipse cx={cx} cy={74} rx={4} ry={5.4} fill="#1d3b33" />
      <ellipse cx={cx - 3} cy={67.5} rx={3} ry={3.6} fill="#fff" />
      <circle cx={cx + 3.2} cy={77.5} r={1.5} fill="#fff" opacity={0.9} />
      <path d={`M${cx - 10} 62.5 Q${cx} 56 ${cx + 10} 62.5`} stroke={LINE} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d={`M${cx + side * 10} 62.5 l${side * 3} -2`} stroke={LINE} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

function Face({ mood, iris }: { mood: NurseMood; iris: string }) {
  const eyes =
    mood === "happy" ? (
      <>
        <path d="M37 71 Q45 62 53 71" stroke={LINE} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d="M67 71 Q75 62 83 71" stroke={LINE} strokeWidth={3} fill="none" strokeLinecap="round" />
      </>
    ) : (
      <>
        <Eye cx={45} iris={iris} />
        <Eye cx={75} iris={iris} />
      </>
    );
  const mouth = {
    happy: (
      <>
        <path d="M54 84 Q60 92 66 84 Z" fill="#c9505f" />
        <path d="M56.5 87.5 Q60 90 63.5 87.5" fill="#f08a99" />
      </>
    ),
    worried: <path d="M55 87 Q60 83.5 65 87" stroke={LIP} strokeWidth={2} fill="none" strokeLinecap="round" />,
    think: <ellipse cx={62} cy={86} rx={2.4} ry={2} fill={LIP} />,
    smile: <path d="M55 84.5 Q60 89 65 84.5" stroke={LIP} strokeWidth={2} fill="none" strokeLinecap="round" />,
  }[mood];
  return (
    <>
      <ellipse cx={36} cy={81} rx={6} ry={3.4} fill="#ff9fb0" opacity={0.55} />
      <ellipse cx={84} cy={81} rx={6} ry={3.4} fill="#ff9fb0" opacity={0.55} />
      {eyes}
      {mouth}
    </>
  );
}

function Brows({ mood }: { mood: NurseMood }) {
  const [left, right] = {
    worried: ["M37 57 L51 53.5", "M83 57 L69 53.5"],
    think: ["M37 56 Q44 53 51 56", "M69 54 Q76 50 83 54"],
    happy: ["M37 56 Q44 52.5 51 55", "M69 55 Q76 52.5 83 56"],
    smile: ["M37 56 Q44 52.5 51 55", "M69 55 Q76 52.5 83 56"],
  }[mood];
  return (
    <g stroke={BROW} strokeWidth={2} fill="none" strokeLinecap="round">
      <path d={left} />
      <path d={right} />
    </g>
  );
}

/** 助理「小晴」：2D 日式動畫風的 Q 版護理師（純 SVG，可切換表情） */
export function NurseAvatar({ mood = "smile", className }: { mood?: NurseMood; className?: string }) {
  const id = useId().replace(/:/g, "");
  const iris = `iris-${id}`;
  const hair = `hair-${id}`;
  return (
    <svg viewBox="0 0 120 150" className={className} aria-hidden>
      <defs>
        <linearGradient id={iris} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7d5b" />
          <stop offset="1" stopColor="#7fd3a8" />
        </linearGradient>
        <linearGradient id={hair} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5a44" />
          <stop offset="1" stopColor="#5e3a2c" />
        </linearGradient>
      </defs>
      {/* 後髮 */}
      <path
        d="M20 62 Q18 26 60 22 Q102 26 100 62 Q104 86 106 100 Q100 110 90 106 Q86 96 84 86 L36 86 Q34 96 30 106 Q20 110 14 100 Q16 86 20 62 Z"
        fill={`url(#${hair})`}
      />
      {/* 護士服 */}
      <path d="M36 106 Q60 98 84 106 L94 146 L26 146 Z" fill="#fff" stroke={UNIFORM_EDGE} strokeWidth={1.2} />
      <path d="M50 102 L60 116 L70 102" fill="#f7c6cf" />
      <path d="M50 102 L60 114 L70 102" fill="none" stroke="#e48a9c" strokeWidth={1.6} />
      <rect x={64} y={122} width={12} height={12} rx={2.5} fill="#fff" stroke={UNIFORM_EDGE} />
      <path d="M70 124.5 v7 M66.5 128 h7" stroke={CROSS} strokeWidth={2.2} strokeLinecap="round" />
      {/* 手：右手揮動 */}
      <ellipse cx={30} cy={124} rx={7} ry={11} fill="#fff" stroke={UNIFORM_EDGE} strokeWidth={1.2} transform="rotate(18 30 124)" />
      <circle cx={26} cy={134} r={5} fill="#ffe3d6" />
      <g className="nurse-wave" style={{ transformOrigin: "88px 116px" }}>
        <ellipse cx={92} cy={110} rx={6.5} ry={11} fill="#fff" stroke={UNIFORM_EDGE} strokeWidth={1.2} transform="rotate(-35 92 110)" />
        <circle cx={99} cy={100} r={5} fill="#ffe3d6" />
      </g>
      {/* 臉 */}
      <rect x={54} y={92} width={12} height={10} rx={4} fill="#f7cfc0" />
      <ellipse cx={60} cy={66} rx={35} ry={32} fill="#ffe8dc" />
      <Face mood={mood} iris={iris} />
      {/* 瀏海與側髮 */}
      <path
        d="M24 62 Q20 28 60 26 Q100 28 96 62 Q92 50 85 45 Q84 52 80 54 Q76 45 69 41 Q68 48 64 51 Q60 42 52 41 Q50 48 45 52 Q42 45 36 45 Q29 51 24 62 Z"
        fill={`url(#${hair})`}
      />
      <path d="M38 36 Q48 30 58 31" stroke="#c48a6c" strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.7} />
      <Brows mood={mood} />
      <path d="M25 58 Q20 80 26 98 Q31 84 31 66 Z" fill={`url(#${hair})`} />
      <path d="M95 58 Q100 80 94 98 Q89 84 89 66 Z" fill={`url(#${hair})`} />
      {/* 護士帽 */}
      <path d="M36 32 Q60 14 84 32 L80 40 Q60 30 40 40 Z" fill="#fff" stroke={UNIFORM_EDGE} strokeWidth={1.2} />
      <path d="M60 22 v10 M55 27 h10" stroke={CROSS} strokeWidth={3} strokeLinecap="round" />
      {mood === "think" && (
        <g fill="#9aa5a0">
          <circle cx={104} cy={40} r={2.5} />
          <circle cx={110} cy={30} r={3.5} />
        </g>
      )}
      {mood === "worried" && <path d="M100 48 q4 7 0 10 q-4 -3 0 -10z" fill="#8fd0f0" />}
    </svg>
  );
}
