import React, { useId, useState } from 'react';
import { motion } from 'motion/react';
import { TarotGlyph, identifyCard, accentFor, cardCode } from './TarotArt';

/**
 * 线稿兜底的底图。
 *
 * 构图直接照 public/tarot/s03.jpg（宝剑三）—— 那是目前唯一出图的小阿卡纳，
 * 也就是另外 55 张该长的样子：深紫纸纹底、四角粉色扇贝云堆、
 * 顶部橙色弦月、竖向雨丝、荧光绿小星芒。
 *
 * 没插画的牌以前是「透明底 + 一个描边符号」，摆在插画旁边完全不是一套牌。
 */
function GlyphPlate() {
  const uid = useId().replace(/:/g, '');
  const grain = `grain-${uid}`;
  const sky = `sky-${uid}`;
  const spark = (x: number, y: number, r: number) =>
    `M${x} ${y - r * 2.6}q${r * 0.55} ${r * 2.05} ${r * 2.6} ${r * 2.6}` +
    `q-${r * 2.05} ${r * 0.55} -${r * 2.6} ${r * 2.6}` +
    `q-${r * 0.55} -${r * 2.05} -${r * 2.6} -${r * 2.6}` +
    `q${r * 2.05} -${r * 0.55} ${r * 2.6} -${r * 2.6}z`;

  return (
    <svg viewBox="0 0 100 120" preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id={sky} cx="50%" cy="38%" r="72%">
          <stop offset="0%" stopColor="#3B0F73" /><stop offset="58%" stopColor="#280848" />
          <stop offset="100%" stopColor="#180430" />
        </radialGradient>
        {/* 丝网 / Riso 的纸纹：母样式里「visible paper grain」的实现 */}
        <filter id={grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      <rect width="100" height="120" fill={`url(#${sky})`} />

      {/* 竖向雨丝 */}
      <g stroke="#FF8C00" strokeWidth="0.45" strokeLinecap="round">
        {[6, 14, 23, 31, 40, 49, 58, 66, 75, 83, 92].map((x, i) => (
          <line key={i} x1={x} y1={16 + (i % 3) * 7} x2={x - 1.5} y2={62 + (i % 4) * 11}
            opacity={0.1 + (i % 3) * 0.05} />
        ))}
      </g>

      {/* 四角扇贝状云堆 —— 实物里最认得出的构图特征 */}
      <g fill="#DE93A6" opacity="0.92">
        <rect x="-4" y="-4" width="27" height="12" />
        <circle cx="2" cy="10" r="8" /><circle cx="12" cy="8" r="6.5" /><circle cx="20" cy="11" r="5" />
        <rect x="76" y="-4" width="28" height="10" />
        <circle cx="98" cy="9" r="7" /><circle cx="88" cy="10" r="6" /><circle cx="80" cy="6" r="4.5" />
        <rect x="-4" y="106" width="35" height="18" />
        <circle cx="4" cy="106" r="9" /><circle cx="16" cy="102" r="7.5" /><circle cx="27" cy="107" r="6" />
        <rect x="65" y="104" width="39" height="20" />
        <circle cx="97" cy="104" r="9" /><circle cx="85" cy="101" r="8" /><circle cx="73" cy="107" r="6.5" />
      </g>

      {/* 橙色弦月 */}
      <path d="M50 9a10 10 0 1 0 0 20 8 8 0 1 1 0-20z" fill="#FF8C00" opacity="0.95" />

      {/* 荧光绿只做小星芒 —— 母样式里写死的规矩 */}
      <g fill="#CCFF00">
        {([[22, 24, 1.5], [76, 18, 1.1], [34, 13, 0.9], [64, 30, 1.3], [15, 52, 1],
           [88, 58, 1.2], [11, 84, 1.1], [90, 90, 1.4], [50, 100, 0.9]] as [number, number, number][])
          .map(([x, y, r], i) => <path key={i} d={spark(x, y, r)} opacity={0.75 + (i % 3) * 0.08} />)}
      </g>

      {/* 纸纹压在最上层 */}
      <rect width="100" height="120" filter={`url(#${grain})`} opacity="0.1"
        style={{ mixBlendMode: 'soft-light' }} />
    </svg>
  );
}

export type CardSize = 'sm' | 'md' | 'lg';

/**
 * md / lg 是响应式的：`sm:` 以上就是原来的桌面尺寸，以下收窄。
 * 收窄的依据是「三张牌必须一屏并排」—— 375px 手机减掉 px-6 的边距只剩 327px，
 * 三张 lg 若还是 188px 会竖着堆成 1400px，「依次翻开三张」就得滚两屏才走得完。
 */
const SIZE: Record<CardSize, { w: string; name: string; latin: string; idx: string; pad: string; radius: string }> = {
  sm: { w: 'w-[92px]', name: 'text-[11px]', latin: 'text-[6px]', idx: 'text-[8px]', pad: 'p-2.5', radius: 'rounded-xl' },
  md: {
    w: 'w-[92px] sm:w-[132px]',
    name: 'text-[11px] sm:text-[15px]',
    latin: 'text-[6px] sm:text-[7px]',
    idx: 'text-[8px] sm:text-[9px]',
    pad: 'p-2.5 sm:p-3',
    radius: 'rounded-xl sm:rounded-2xl',
  },
  lg: {
    w: 'w-[100px] sm:w-[188px]',
    name: 'text-[12px] sm:text-[21px]',
    latin: 'text-[6px] sm:text-[9px]',
    idx: 'text-[8px] sm:text-[11px]',
    pad: 'p-2.5 sm:p-4',
    radius: 'rounded-xl sm:rounded-[1.75rem]',
  },
};

interface TarotCardProps {
  name: string;
  /** 插画地址；省略则按 cardCode 自动取 /tarot/<code>.webp，加载失败时退回线稿 */
  art?: string;
  /** 逆位 */
  reversed?: boolean;
  size?: CardSize;
  /** true 显示牌背 */
  faceDown?: boolean;
  className?: string;
  onClick?: () => void;
}

/** 牌背：同心几何 + 平台既有的辉光点 */
export function TarotCardBack({ size = 'md', className = '' }: { size?: CardSize; className?: string }) {
  const s = SIZE[size];
  return (
    <div className={`${s.w} aspect-[2/3] ${s.radius} relative overflow-hidden border border-white/10 bg-[#1a0733] ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-sunset-purple via-[#3d0a6b] to-[#1a0733]" />
      <svg viewBox="0 0 100 150" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <g fill="none" stroke="var(--color-aurora-pink, #FFB6C1)" strokeWidth="0.8" opacity="0.35">
          <rect x="6" y="6" width="88" height="138" rx="8" />
          <rect x="11" y="11" width="78" height="128" rx="5" />
        </g>
        <g fill="none" stroke="var(--color-neon-green, #CCFF00)" strokeWidth="0.7" opacity="0.5">
          <circle cx="50" cy="75" r="26" />
          <circle cx="50" cy="75" r="17" />
          <path d="M50 49l16 26-16 26-16-26z" />
          <path d="M24 75h52M50 49v52" />
        </g>
        <g fill="none" stroke="var(--color-aurora-pink, #FFB6C1)" strokeWidth="0.7" opacity="0.4">
          <circle cx="50" cy="75" r="8" />
          <circle cx="50" cy="33" r="2.5" /><circle cx="50" cy="117" r="2.5" />
        </g>
      </svg>
      <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full glow-point opacity-30" />
    </div>
  );
}

export default function TarotCard({
  name, art, reversed = false, size = 'md', faceDown = false, className = '', onClick,
}: TarotCardProps) {
  const s = SIZE[size];
  const id = identifyCard(name);
  const accent = accentFor(id.suit);
  const artSrc = art ?? `/tarot/${cardCode(name)}.jpg`;
  // 图片不存在或加载失败 → 退回线稿，界面永远不会出现破图
  const [artFailed, setArtFailed] = useState(false);

  if (faceDown) {
    return (
      <div onClick={onClick} className={onClick ? `cursor-pointer ${className}` : className}>
        <TarotCardBack size={size} />
      </div>
    );
  }

  return (
    <motion.div
      onClick={onClick}
      whileHover={onClick ? { y: -6 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`${s.w} aspect-[2/3] ${s.radius} ${s.pad} relative flex flex-col overflow-hidden
        border border-white/12 bg-[#150629]/90 backdrop-blur-xl shadow-2xl
        ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ boxShadow: `0 12px 40px -12px ${accent}40` }}
    >
      {/* 内框 + 四角刻度 */}
      <svg viewBox="0 0 100 150" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <rect x="3.5" y="3.5" width="93" height="143" rx="5" fill="none" stroke={accent} strokeWidth="0.5" opacity="0.3" />
      </svg>
      <span className="pointer-events-none absolute left-2 top-2 h-2 w-2 border-l border-t" style={{ borderColor: accent, opacity: 0.5 }} />
      <span className="pointer-events-none absolute right-2 top-2 h-2 w-2 border-r border-t" style={{ borderColor: accent, opacity: 0.5 }} />
      <span className="pointer-events-none absolute bottom-2 left-2 h-2 w-2 border-b border-l" style={{ borderColor: accent, opacity: 0.5 }} />
      <span className="pointer-events-none absolute bottom-2 right-2 h-2 w-2 border-b border-r" style={{ borderColor: accent, opacity: 0.5 }} />

      {/* 序号 / 逆位标记 */}
      <div className="relative flex items-start justify-between">
        <span className={`${s.idx} font-mono tracking-[0.2em] text-white/45`}>{id.index}</span>
        {reversed && (
          <span className={`${s.idx} font-mono tracking-[0.15em] flex items-center gap-1`} style={{ color: accent }}>
            <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden="true">
              <path d="M5 1v8M2 6l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            逆
          </span>
        )}
      </div>

      {/* 主图形：插画优先，失败退回线稿 */}
      {/*
        逆位整块翻转 —— 图和它的暗角必须一起转。
        以前只转 <img>，遮罩留在原地，于是画面倒过来、压暗却还在下缘，看着像坏图。
      */}
      <div className={`relative flex flex-1 items-center justify-center overflow-hidden -mx-1 my-1 rounded-lg
        transition-transform duration-500 ${reversed ? 'rotate-180' : ''}`}>
        {!artFailed ? (
          <>
            <img
              src={artSrc}
              alt=""
              draggable={false}
              onError={() => setArtFailed(true)}
              className="h-full w-full object-cover"
            />
            {/* 把插画「坐」进卡底：上下各一段向卡底色的渐隐，让不同批次的图统一进同一张牌 */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#150629]/70 via-transparent to-[#150629]/85" />
          </>
        ) : (
          <>
            <GlyphPlate />
            <TarotGlyph name={name} className="relative h-full w-full" />
          </>
        )}
        <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/5" />
      </div>

      {/* 牌名 */}
      <div className="relative text-center">
        <div className="mx-auto mb-1.5 h-px w-8" style={{ background: accent, opacity: 0.45 }} />
        <div className={`${s.name} font-serif leading-none text-white/95`}>{name}</div>
        <div className={`${s.latin} mt-1 font-mono uppercase tracking-[0.22em] text-white/30`}>{id.latin}</div>
      </div>
    </motion.div>
  );
}
