import { useId } from "react";

/** Radar quét (SVG động) dùng cho trạng thái "đang nạp dữ liệu" / "đang phân tích". Hoạt ảnh định nghĩa trong globals.css. */
export function Radar({ size = 165 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  const glow = `radarGlow${uid}`;
  const sweep = `radarSweep${uid}`;
  const neon = `radarNeon${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" role="img" aria-hidden="true" className="drop-shadow-[0_0_16px_rgba(255,30,66,0.5)]">
      <defs>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff1e42" stopOpacity="0.8" />
          <stop offset="35%" stopColor="#ff1e42" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ff1e42" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={sweep} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff1e42" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#ff1e42" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ff1e42" stopOpacity="0" />
        </linearGradient>
        <filter id={neon} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="150" cy="150" r="142" fill="#07070a" stroke="#2a080e" strokeWidth="3" />
      <circle cx="150" cy="150" r="142" fill={`url(#${glow})`} />
      <circle className="radar-ring" cx="150" cy="150" r="130" fill="none" stroke="#ff1e42" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx="150" cy="150" r="95" fill="none" stroke="#ff1e42" strokeOpacity="0.4" strokeWidth="1.2" />
      <circle cx="150" cy="150" r="60" fill="none" stroke="#ff1e42" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="2 3" />
      <circle cx="150" cy="150" r="25" fill="none" stroke="#ff1e42" strokeOpacity="0.7" strokeWidth="1.5" />
      <line x1="150" y1="12" x2="150" y2="288" stroke="#ff1e42" strokeOpacity="0.3" />
      <line x1="12" y1="150" x2="288" y2="150" stroke="#ff1e42" strokeOpacity="0.3" />
      <line x1="50" y1="50" x2="250" y2="250" stroke="#ff1e42" strokeOpacity="0.15" strokeWidth="0.7" strokeDasharray="3 3" />
      <line x1="50" y1="250" x2="250" y2="50" stroke="#ff1e42" strokeOpacity="0.15" strokeWidth="0.7" strokeDasharray="3 3" />
      {["M 30,55 L 30,30 L 55,30", "M 270,55 L 270,30 L 245,30", "M 30,245 L 30,270 L 55,270", "M 270,245 L 270,270 L 245,270"].map((d) => (
        <path key={d} d={d} fill="none" stroke="#ff1e42" strokeWidth="2" filter={`url(#${neon})`} />
      ))}
      <g className="radar-beam">
        <path d="M 150,150 L 150,15 A 135,135 0 0,1 245,55 Z" fill={`url(#${sweep})`} />
        <line x1="150" y1="150" x2="245" y2="55" stroke="#ff4d6d" strokeWidth="2.5" filter={`url(#${neon})`} />
        <circle cx="245" cy="55" r="3" fill="#fff" filter={`url(#${neon})`} />
      </g>
      <g className="radar-blip-1">
        <circle cx="195" cy="105" r="4.5" fill="#ff1e42" filter={`url(#${neon})`} />
        <circle cx="195" cy="105" r="8" fill="none" stroke="#ff1e42" strokeWidth="1.2" opacity="0.6" />
      </g>
      <g className="radar-blip-2">
        <circle cx="100" cy="185" r="3.5" fill="#ff1e42" filter={`url(#${neon})`} />
        <circle cx="100" cy="185" r="7" fill="none" stroke="#ff1e42" strokeWidth="1" opacity="0.5" />
      </g>
      <circle cx="150" cy="150" r="6" fill="#ff1e42" filter={`url(#${neon})`} />
      <circle cx="150" cy="150" r="2.5" fill="#fff" />
      <circle cx="150" cy="150" r="139" fill="none" stroke="#ff1e42" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="2 10" />
    </svg>
  );
}
