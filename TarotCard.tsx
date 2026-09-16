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
const SIZE: Record<CardSize, { w: string; name: string; latin: string; idx: string; radius: string }> = {
  sm: { w: 'w-[92px]', name: 'text-[11px]', latin: 'text-[6px]', idx: 'text-[8px]', radius: 'rounded-xl' },
  md: {
    w: 'w-[92px] sm:w-[132px]',
    name: 'text-[11px] sm:text-[15px]',
    latin: 'text-[6px] sm:text-[7px]',
    idx: 'text-[8px] sm:text-[9px]',
    radius: 'rounded-xl sm:rounded-2xl',
  },
  lg: {
    /*
       手机上从 100px 收到 92px（= md）。
       解读屏三张 lg 并排是 3×100 + 2×12(gap-3) = 324px，
       而 375px 手机减掉 px-7 只剩 319px —— 差 5px，于是折成 2+1。
       上面那条「三张牌必须一屏并排」是这套尺寸存在的理由，
       为了和 md 差 8px 把它牺牲掉不值得。92px 下探到 360px 宽仍然并排。
    */
    w: 'w-[92px] sm:w-[188px]',
    name: 'text-[12px] sm:text-[21px]',
    latin: 'text-[6px] sm:text-[9px]',
    idx: 'text-[8px] sm:text-[11px]',
    radius: 'rounded-xl sm:rounded-[1.75rem]',
  },
};

interface TarotCardProps {
  name: string;
  /**
   * 宽度交给外面的格子（w-full），牌自己只保持 2:3。
   * 牌阵一多就必须这样：凯尔特十字是 4 列，375px 上摆不下 4 张固定 92px 的牌。
   * 交给 grid 之后，任何列数在任何屏宽都不会溢出，也不用为每个牌阵调尺寸。
   */
  fluid?: boolean;
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
export function TarotCardBack({
  size = 'md', className = '', edge = false, fluid = false,
}: { size?: CardSize; className?: string; edge?: boolean; fluid?: boolean }) {
  const s = SIZE[size];
  return (
    <div
      className={`${fluid ? 'w-full' : s.w} aspect-[2/3] ${s.radius} relative overflow-hidden border border-white/10 bg-[#1a0733] ${className}`}
      /*
        edge：扇形牌堆里每张只露出约 3px。没有牌缘时这 3px 全是同一种紫，
        51 张叠起来就是一块实心色板，不是一副牌。
        实物的牌叠在一起，看到的是**一排纸边**——裁切面 + 相邻那张压下来的暗影。

        ⚠️ 亮边不能用白。试过 1.5px 纯 #E8DFCE 加一道硬黑线，51 条等距亮线
        读出来是梳齿/条码，不是纸。改成 1px 暖灰、深度全交给那道紧影之后才像纸。
      */
      style={edge ? { boxShadow: '-3px 0 4px -2px rgba(9,2,20,.75)' } : undefined}
    >
      {edge && (
        <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-px bg-[#D8CCB6]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-sunset-purple via-[#3d0a6b] to-[#1a0733]" />
      {/*
        徽记和辉光这里是全部画的，哪怕扇形里 50 张只露 3px。
        能这么做的前提是 glow-point 已经不用 filter 了（见 styles.css）——
        剩下的都是静态矢量，只在第一次绘制时付一次代价，
        之后 transform 怎么变，合成器都直接复用同一张栅格图。
      */}
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
  fluid = false,
}: TarotCardProps) {
  const s = SIZE[size];
  const w = fluid ? 'w-full' : s.w;
  const id = identifyCard(name);
  const accent = accentFor(id.suit);
  const artSrc = art ?? `/tarot/${cardCode(name)}.jpg`;
  // 图片不存在或加载失败 → 退回线稿，界面永远不会出现破图
  const [artFailed, setArtFailed] = useState(false);

  if (faceDown) {
    return (
      <div onClick={onClick} className={onClick ? `cursor-pointer ${className}` : className}>
        <TarotCardBack size={size} fluid={fluid} />
      </div>
    );
  }

  return (
    /*
      画铺满整张牌，不再塞进一个内窗口。
      母样式把插画定为 full-bleed：顶部弦月、上下边缘的粉色云堆是构图的骨架。
      原来的做法给画开了一个约 0.87 比例的小窗，用 object-cover 一裁，
      切掉的正好是弦月和云堆，还压了一层向卡底色的渐隐，整张牌灰扑扑的。
      插画是 3:4、牌是 2:3，差值只能让给左右各约 11%（那里是背景余量），
      不能让给上下。
    */
    <motion.div
      onClick={onClick}
      whileHover={onClick ? { y: -6 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`${w} aspect-[2/3] ${s.radius} relative overflow-hidden bg-[#150629]
        ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ boxShadow: `0 10px 30px -14px rgba(23,19,14,.55)` }}
    >
      {/* 画。逆位只转画本身 —— 牌名和它的渐隐带必须留在正面朝上 */}
      {!artFailed ? (
        <img
          src={artSrc}
          alt=""
          draggable={false}
          onError={() => setArtFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500
            ${reversed ? 'rotate-180' : ''}`}
        />
      ) : (
        <div className={`absolute inset-0 ${reversed ? 'rotate-180' : ''}`}>
          <GlyphPlate />
          <TarotGlyph name={name} className="absolute inset-0 h-full w-full" />
        </div>
      )}

      {/*
        牌名 + 序号 + 逆位，全部收进底部这条渐隐带。

        原来序号和「逆」是浮在画左上、右上的，白字加投影 —— 但插画的四角
        正好是粉色云堆和橙色器物，那两个标记在上面几乎读不出来。
        浮在画上的小标签本来就是妥协：底色不可控，可读性就没有下限。
        这条带是现成的、稳定的暗底，把它们放进来，画面也彻底干净了。
      */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#150629] via-[#150629]/88 to-transparent px-2.5 pb-2.5 pt-9">
        <div className="relative text-center">
          {/*
            序号只给大阿卡纳。
            小阿卡纳的 index 是「8」「皇后」这种，而牌名本身就叫「圣杯八」「圣杯皇后」——
            等于同一件事说两遍，还把拉丁名挤在两个标记中间。
            只有大阿卡纳的罗马数字是牌的身份的一部分（VI 之于恋人），留着。
          */}
          {id.suit === 'major' && (
            <span className={`${s.idx} absolute left-0 bottom-0.5 font-mono tracking-[0.2em] text-white/50`}>
              {id.index}
            </span>
          )}
          <div className={`${s.name} font-serif leading-none text-white`}>{name}</div>
          {/*
            拉丁名只在 sm: 以上出现。
            100px 宽的牌上它是 6px，本来就读不出来，却会和右下角的「逆」标记撞在一起
            （9 OF WANDS 正好压住逆位标记）。宽度不够就别硬塞：
            它和中文牌名指的是同一张牌，小屏少它一行不丢任何信息。
          */}
          <div className={`${s.latin} mt-1 hidden font-mono uppercase tracking-[0.22em] text-white/45 sm:block`}>
            {id.latin}
          </div>
          {reversed && (
            <span
              className={`${s.idx} absolute right-0 bottom-0.5 flex items-center gap-0.5 font-mono tracking-[0.15em]`}
              style={{ color: accent }}
            >
              <svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden="true">
                <path d="M5 1v8M2 6l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              逆
            </span>
          )}
        </div>
      </div>

      {/* 一道极细的内嵌描边，让牌在纸上仍然是一个「物件」而不是一张贴图 */}
      <span className={`pointer-events-none absolute inset-0 ${s.radius} ring-1 ring-inset ring-black/25`} />
    </motion.div>
  );
}
