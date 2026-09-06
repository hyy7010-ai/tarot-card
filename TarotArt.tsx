import React from 'react';

/**
 * 塔罗牌面的图形系统
 *
 * 全部为手绘 SVG 线稿，不使用 emoji。设计约束：
 *  - 统一 100×100 视图框、统一 1.6 描边、圆角端点，保证 78 张牌视觉一致
 *  - 只用平台既有色板（aurora-pink / neon-green / sunset-orange / aurora-blue）
 *  - 大阿卡纳每张独立符号；小阿卡纳由「花色符号 + 点数排布」程序化生成，
 *    这正是传统塔罗的构成方式，也避免了 56 张手绘带来的风格漂移
 */

export type Suit = 'major' | 'wands' | 'cups' | 'swords' | 'pentacles';

export interface CardIdentity {
  suit: Suit;
  /** 大阿卡纳的罗马数字，或小阿卡纳的点数/宫廷位 */
  index: string;
  /** 拉丁文名，用于卡面下方的小字 */
  latin: string;
  /** 小阿卡纳的点数 1–10，宫廷牌为 0 */
  pips: number;
  /** 宫廷牌位阶 */
  court?: '侍从' | '骑士' | '皇后' | '国王';
}

const SUIT_META: Record<Exclude<Suit, 'major'>, { latin: string; accent: string }> = {
  wands:      { latin: 'WANDS',      accent: 'var(--color-sunset-orange, #FF8C00)' },
  cups:       { latin: 'CUPS',       accent: 'var(--color-aurora-pink, #FFB6C1)' },
  swords:     { latin: 'SWORDS',     accent: 'var(--color-aurora-blue, #87CEEB)' },
  pentacles:  { latin: 'PENTACLES',  accent: 'var(--color-neon-green, #CCFF00)' },
};

const MAJOR_ORDER = [
  '愚者', '魔术师', '女祭司', '皇后', '皇帝', '教皇', '恋人', '战车', '力量',
  '隐士', '命运之轮', '正义', '倒吊人', '死亡', '节制', '恶魔', '高塔',
  '星星', '月亮', '太阳', '审判', '世界',
];

const MAJOR_LATIN: Record<string, string> = {
  愚者: 'THE FOOL', 魔术师: 'THE MAGICIAN', 女祭司: 'THE HIGH PRIESTESS',
  皇后: 'THE EMPRESS', 皇帝: 'THE EMPEROR', 教皇: 'THE HIEROPHANT',
  恋人: 'THE LOVERS', 战车: 'THE CHARIOT', 力量: 'STRENGTH', 隐士: 'THE HERMIT',
  命运之轮: 'WHEEL OF FORTUNE', 正义: 'JUSTICE', 倒吊人: 'THE HANGED MAN',
  死亡: 'DEATH', 节制: 'TEMPERANCE', 恶魔: 'THE DEVIL', 高塔: 'THE TOWER',
  星星: 'THE STAR', 月亮: 'THE MOON', 太阳: 'THE SUN', 审判: 'JUDGEMENT',
  世界: 'THE WORLD',
};

const ROMAN = ['0','I','II','III','IV','V','VI','VII','VIII','IX','X','XI',
  'XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI'];

const PIP_CN: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/** 从中文牌名解析出花色、序号、拉丁名 */
export function identifyCard(name: string): CardIdentity {
  const majorIdx = MAJOR_ORDER.indexOf(name);
  if (majorIdx >= 0) {
    return { suit: 'major', index: ROMAN[majorIdx], latin: MAJOR_LATIN[name], pips: 0 };
  }
  const suitMap: Record<string, Exclude<Suit, 'major'>> = {
    权杖: 'wands', 圣杯: 'cups', 宝剑: 'swords', 星币: 'pentacles',
  };
  const suit = suitMap[name.slice(0, 2)] ?? 'wands';
  const rest = name.slice(2);
  const court = (['侍从', '骑士', '皇后', '国王'] as const).find(c => c === rest);
  if (court) {
    const courtLatin = { 侍从: 'PAGE', 骑士: 'KNIGHT', 皇后: 'QUEEN', 国王: 'KING' }[court];
    return { suit, index: court, latin: `${courtLatin} OF ${SUIT_META[suit].latin}`, pips: 0, court };
  }
  const pips = PIP_CN[rest] ?? 1;
  return { suit, index: String(pips), latin: `${pips} OF ${SUIT_META[suit].latin}`, pips };
}

/**
 * 稳定的插画文件编码：m00–m21 / w01–w14 / c01–c14 / s01–s14 / p01–p14
 * （11 侍从、12 骑士、13 皇后、14 国王）。图片放在 public/tarot/<code>.jpg。
 */
export function cardCode(name: string): string {
  const id = identifyCard(name);
  if (id.suit === 'major') return `m${String(ROMAN.indexOf(id.index)).padStart(2, '0')}`;
  const letter = { wands: 'w', cups: 'c', swords: 's', pentacles: 'p' }[id.suit];
  const n = id.court ? { 侍从: 11, 骑士: 12, 皇后: 13, 国王: 14 }[id.court] : id.pips;
  return `${letter}${String(n).padStart(2, '0')}`;
}

export function accentFor(suit: Suit): string {
  return suit === 'major' ? 'var(--color-aurora-pink, #FFB6C1)' : SUIT_META[suit].accent;
}

// ---------------------------------------------------------------------------
// 大阿卡纳符号：几何线稿，每张 5–15 个元素
// ---------------------------------------------------------------------------
const S = { fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** 横向 ∞。用贝塞尔而非两个圆——两个圆在小尺寸下会被读成一对眼睛 */
const LEMNISCATE = (cy: number) => (
  <path d={`M34 ${cy}C34 ${cy - 8} 46 ${cy - 8} 50 ${cy}C54 ${cy + 8} 66 ${cy + 8} 66 ${cy}C66 ${cy - 8} 54 ${cy - 8} 50 ${cy}C46 ${cy + 8} 34 ${cy + 8} 34 ${cy}Z`} />
);

const MAJOR_GLYPHS: Record<string, React.ReactNode> = {
  // 抽象几何符号语言：不描绘人物。线稿画人在这个尺寸下会退化成火柴人和笑脸，
  // 符号化既更冷峻，也保证 22 张的视觉一致。
  愚者:     <><path d="M50 22a28 28 0 1 0 20 8" /><circle cx="74" cy="24" r="3.5" /><path d="M50 50v0" /></>,
  魔术师:   <>{LEMNISCATE(38)}<path d="M50 52v26" /><path d="M40 78h20" /></>,
  女祭司:   <><path d="M30 24v52M70 24v52" /><path d="M58 34a17 17 0 1 0 0 32 14 14 0 1 1 0-32" /></>,
  皇后:     <><circle cx="50" cy="40" r="15" /><path d="M50 55v23M38 68h24" /></>,
  皇帝:     <><rect x="34" y="42" width="32" height="32" /><path d="M50 42V20" /><path d="M42 28l8-8 8 8" /></>,
  教皇:     <><path d="M50 20v58" /><path d="M32 32h36M36 46h28M40 60h20" /></>,
  恋人:     <><circle cx="39" cy="50" r="19" /><circle cx="61" cy="50" r="19" /></>,
  战车:     <><rect x="30" y="34" width="40" height="32" rx="2" /><path d="M40 56l10-12 10 12" /><circle cx="36" cy="74" r="3" /><circle cx="64" cy="74" r="3" /></>,
  力量:     <>{LEMNISCATE(34)}<path d="M50 48v22" /><path d="M34 74h32" /></>,
  隐士:     <><path d="M64 20v58" /><path d="M32 46l9-12 9 12-9 12z" /><circle cx="41" cy="46" r="17" /></>,
  命运之轮: <><circle cx="50" cy="50" r="27" /><circle cx="50" cy="50" r="10" /><path d="M50 23v11M50 66v11M23 50h11M66 50h11M31 31l8 8M61 61l8 8M69 31l-8 8M39 61l-8 8" /></>,
  正义:     <><path d="M50 20v58M34 78h32" /><path d="M24 34h52" /><path d="M24 34l-8 17h16zM76 34l8 17H68z" /></>,
  倒吊人:   <><path d="M22 22h56" /><path d="M50 22v16" /><path d="M28 38h44L50 80z" /></>,
  死亡:     <><path d="M24 42a30 30 0 0 1 52 0" /><path d="M70 38L46 80" /><path d="M28 62h38" /></>,
  节制:     <><path d="M50 44L34 20h32zM50 56l16 24H34z" /><path d="M26 50h48" /></>,
  恶魔:     <><circle cx="50" cy="50" r="26" /><path d="M50 72L62.9 32.2 29.1 56.8h41.8L37.1 32.2z" /></>,
  高塔:     <><path d="M34 78V38h32v40" /><path d="M28 38l22-18 22 18" /><path d="M56 44l-10 14h9l-7 14" /><circle cx="24" cy="58" r="2" /><circle cx="78" cy="50" r="2" /></>,
  星星:     <><path d="M50 18l4.5 27.5L78 50l-23.5 4.5L50 82l-4.5-27.5L22 50l23.5-4.5z" /><path d="M50 34l16 16-16 16-16-16z" opacity="0.5" /></>,
  月亮:     <><path d="M60 22a21 21 0 1 0 0 38 17 17 0 1 1 0-38" /><path d="M26 78V56h11v22M63 78V56h11v22" /><path d="M46 78V66h8v12" /></>,
  太阳:     <><circle cx="50" cy="50" r="17" /><path d="M50 18v9M50 73v9M18 50h9M73 50h9M27 27l6.5 6.5M66.5 66.5L73 73M73 27l-6.5 6.5M33.5 66.5L27 73" /></>,
  审判:     <><path d="M20 76h60" /><path d="M32 76V58M50 76V46M68 76V64" /><path d="M24 38l26-14 26 14" /></>,
  世界:     <><ellipse cx="50" cy="50" rx="21" ry="31" /><path d="M50 30v40M34 50h32" /><path d="M28 24l-7-7M72 24l7-7M28 76l-7 7M72 76l7 7" /></>,
};

// ---------------------------------------------------------------------------
// 小阿卡纳：花色符号 + 点数排布
// ---------------------------------------------------------------------------
/**
 * 花色符号：**实心色块**，不是描边。
 *
 * 参照 public/tarot/s03.jpg（宝剑三，目前唯一出图的小阿卡纳）——
 * 那是另外 55 张该长的样子：器物是整块橙色，边缘干净，没有线框。
 * 旧版是 1.6px 描边的空心符号，和插画完全不是一个语言。
 */
function SuitMark({ suit, x, y, scale = 1 }: { suit: Exclude<Suit, 'major'>; x: number; y: number; scale?: number }) {
  const g = {
    wands: <>
      <rect x="-2" y="-20" width="4" height="40" rx="2" />
      <path d="M-2 -7c-5.4-1.6-7.4-5.6-7.4-9.6 4.8.8 7.4 4 7.4 9.6z" />
      <path d="M2 -2c5.4-1.6 7.4-5.6 7.4-9.6-4.8.8-7.4 4-7.4 9.6z" />
    </>,
    cups: <>
      <path d="M-9 -14h18a9 11 0 0 1-18 0z" />
      <rect x="-1.8" y="-3" width="3.6" height="8" />
      <ellipse cx="0" cy="7" rx="7.5" ry="2.6" />
    </>,
    swords: <>
      <circle cx="0" cy="-20" r="3.4" />
      <rect x="-2" y="-17.5" width="4" height="8" />
      <rect x="-9" y="-9.5" width="18" height="3" rx="1.5" />
      <circle cx="-10.5" cy="-8" r="2.2" /><circle cx="10.5" cy="-8" r="2.2" />
      <path d="M-3.2 -6.5h6.4l-3.2 27z" />
    </>,
    // 币身实心、星形镂空 —— 用 evenodd 把星从圆里挖掉，和实物的处理一致
    pentacles: (
      <path fillRule="evenodd" d="M0 -12a12 12 0 1 0 0 24 12 12 0 1 0 0-24z
        M0 -8.6l2.5 7.7 8.1 0-6.6 4.8 2.5 7.7-6.5-4.8-6.5 4.8 2.5-7.7-6.6-4.8 8.1 0z" />
    ),
  }[suit];
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>{g}</g>;
}

/** 点数在牌面上的排布，参照传统牌的对称构图 */
const PIP_LAYOUT: Record<number, [number, number][]> = {
  1:  [[50, 50]],
  2:  [[50, 33], [50, 67]],
  3:  [[50, 27], [36, 62], [64, 62]],
  4:  [[36, 33], [64, 33], [36, 67], [64, 67]],
  5:  [[36, 30], [64, 30], [50, 50], [36, 70], [64, 70]],
  6:  [[36, 28], [64, 28], [36, 50], [64, 50], [36, 72], [64, 72]],
  7:  [[36, 26], [64, 26], [36, 46], [64, 46], [50, 60], [36, 76], [64, 76]],
  8:  [[36, 24], [64, 24], [36, 42], [64, 42], [36, 60], [64, 60], [36, 78], [64, 78]],
  9:  [[34, 24], [50, 24], [66, 24], [34, 50], [50, 50], [66, 50], [34, 76], [50, 76], [66, 76]],
  10: [[34, 22], [50, 22], [66, 22], [34, 42], [50, 42], [66, 42], [34, 62], [50, 62], [66, 62], [50, 80]],
};

/**
 * 宫廷牌：无脸、瘦长的装饰艺术剪影 —— 和母样式里插画的人物语言对齐。
 * 旧版是几条抽象折线（骑士是「一条斜线加个小圆」），读不出是谁，
 * 摆进牌面就是用户说的「图很奇怪」。
 */
/** 无脸、瘦长的粉色实心剪影 —— 对应插画里那些没有脸的人物 */
const COURT_GLYPH: Record<string, React.ReactNode> = {
  侍从: <>
    <circle cx="50" cy="28" r="6.5" />
    <path d="M50 36c-6 0-9 5-9 11l-2 37h22l-2-37c0-6-3-11-9-11z" />
    <path d="M58 42l10-9 3 4-10 9z" />
  </>,
  骑士: <>
    <ellipse cx="48" cy="66" rx="22" ry="9" />
    <path d="M66 61l6-16 6-3-1 6-5 3-2 11z" />
    <rect x="31" y="72" width="4" height="14" /><rect x="43" y="73" width="4" height="13" />
    <rect x="58" y="72" width="4" height="14" />
    <circle cx="44" cy="33" r="6" />
    <path d="M44 40c-5 0-7 4-7 9l1 11h12l1-11c0-5-2-9-7-9z" />
    <path d="M50 45l10-6 2 4-10 6z" />
  </>,
  皇后: <>
    <path d="M40 26l3-11 7 8 7-8 3 11z" />
    <circle cx="50" cy="36" r="6.5" />
    <path d="M50 44c-8 0-12 8-13 16l-3 22h32l-3-22c-1-8-5-16-13-16z" />
    <path d="M33 82V48h4v34zM63 82V48h4v34z" />
  </>,
  国王: <>
    <path d="M37 24l3-13 6 9 4-12 4 12 6-9 3 13z" />
    <circle cx="50" cy="35" r="6.5" />
    <path d="M50 43c-9 0-13 7-14 14l-2 25h32l-2-25c-1-7-5-14-14-14z" />
    <path d="M32 82V42h5v40zM63 82V42h5v40zM32 42h36v5H32z" />
  </>,
};

/** 四色油墨里真正上到牌面主体的两支：人物用粉，器物用橙 —— 取自 s03 / m16 实物 */
const INK = { pink: '#FFB6C1', orange: '#FF8C00' };

/** 牌面主图形 */
export function TarotGlyph({ name, className = '' }: { name: string; className?: string }) {
  const id = identifyCard(name);

  // 大阿卡纳 22 张全都有插画，这条线稿只在图加载失败时才会露面，维持原来的描边即可
  if (id.suit === 'major') {
    return (
      <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
        <g {...S} stroke={accentFor(id.suit)} opacity={0.92}>
          {MAJOR_GLYPHS[name] ?? MAJOR_GLYPHS['星星']}
        </g>
      </svg>
    );
  }

  // 提出局部常量，否则窄化后的类型在 map 回调里会丢失
  const suit = id.suit;

  if (id.court) {
    return (
      <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
        <g fill={INK.pink}>{COURT_GLYPH[id.court]}</g>
        <g fill={INK.orange}><SuitMark suit={suit} x={21} y={27} scale={0.5} /></g>
      </svg>
    );
  }

  const layout = PIP_LAYOUT[id.pips] ?? PIP_LAYOUT[1];
  // 实心符号比旧的描边符号占地大得多，缩放要跟着降，否则点数多的牌会糊成一片
  const scale = id.pips <= 2 ? 1.1 : id.pips <= 5 ? 0.8 : 0.55;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill={INK.orange}>
        {layout.map(([x, y], i) => <SuitMark key={i} suit={suit} x={x} y={y} scale={scale} />)}
      </g>
    </svg>
  );
}

export { MAJOR_ORDER, MAJOR_LATIN, SUIT_META };
