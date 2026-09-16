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

/** 横向 ∞。用贝塞尔而非两个圆——两个圆在小尺寸下会被读成一对眼睛 */

/**
 * 大阿卡纳：**实心色块**，和小阿卡纳同一套语言。
 *
 * 旧版是 1.6px 描边的几何符号，而小阿卡纳早已改成实心 ——
 * 两套语言混在一个牌组里，只要有一张图加载失败就会露馅。
 *
 * 配色沿用从实物读出的规矩：**人物用粉，器物用橙**。
 * 荧光绿只有一个例外：高塔的闪电（母样式里写死的，闪电是高塔的专属符号）。
 */
/** 四色油墨里真正上到牌面主体的两支：人物用粉，器物用橙 —— 取自 s03 / m16 实物 */
const INK = { pink: '#FFB6C1', orange: '#FF8C00' };
const G = '#CCFF00';

/** 无脸剪影：头 + 长袍。22 张里反复用到，抽出来保证比例一致 */
const FIG = (cx: number, hy: number, r: number, w: number, bottom: number) => (
  <>
    <circle cx={cx} cy={hy} r={r} />
    <path d={`M${cx} ${hy + r + 1}c-${w} 0-${w * 1.3} ${w} -${w * 1.3} ${w * 1.7}l-1 ${bottom - hy - r - w * 1.7}h${w * 2.6 + 2}l-1 -${bottom - hy - r - w * 1.7}c0-${w * 0.7}-${w * 0.3}-${w}-${w * 1.3}-${w}z`} />
  </>
);

const MAJOR_GLYPHS: Record<string, { pink?: React.ReactNode; orange?: React.ReactNode; green?: React.ReactNode }> = {
  愚者: {
    pink: <>{FIG(40, 26, 6.5, 7, 74)}</>,
    orange: <><path d="M62 22h3v46h-3z" /><path d="M64 20l10 4-10 5z" /><path d="M14 78h34l-3 8H14z" /></>,
  },
  魔术师: {
    pink: <>{FIG(50, 34, 7, 7.5, 80)}<path d="M50 20a9 5 0 0 1 9 5 9 5 0 0 1-18 0 9 5 0 0 1 9-5zm0 2.4a6.6 2.6 0 0 0 0 5.2 6.6 2.6 0 0 0 0-5.2z" /></>,
    orange: <><rect x="60" y="26" width="3" height="26" rx="1.5" transform="rotate(24 61 39)" /></>,
  },
  女祭司: {
    pink: <><rect x="22" y="22" width="9" height="58" /><rect x="69" y="22" width="9" height="58" /></>,
    orange: <><path d="M56 34a15 15 0 1 0 0 30 12 12 0 1 1 0-30z" /></>,
  },
  皇后: {
    pink: <>{FIG(50, 40, 7.5, 9, 82)}<path d="M39 30l3-11 8 8 8-8 3 11z" /></>,
    orange: <><path d="M22 82c0-10 2-18 4-18s4 8 4 18zM70 82c0-10 2-18 4-18s4 8 4 18z" /></>,
  },
  皇帝: {
    pink: <>{FIG(50, 38, 7, 8, 78)}</>,
    orange: <><path d="M34 26l4-10 5 7 7-9 7 9 5-7 4 10z" /><rect x="28" y="78" width="44" height="6" rx="2" /></>,
  },
  教皇: {
    pink: <>{FIG(50, 32, 7, 8, 76)}<circle cx="30" cy="70" r="5" /><circle cx="70" cy="70" r="5" /></>,
    orange: <><rect x="48" y="14" width="4" height="34" /><rect x="38" y="20" width="24" height="4" /><rect x="42" y="29" width="16" height="4" /></>,
  },
  恋人: {
    pink: <>{FIG(32, 44, 6.5, 6.5, 80)}{FIG(68, 44, 6.5, 6.5, 80)}</>,
    orange: <><path d="M50 14c10 0 20 6 24 12-8-3-16-4-24-4s-16 1-24 4c4-6 14-12 24-12z" /></>,
  },
  战车: {
    pink: <>{FIG(50, 28, 6.5, 7, 56)}</>,
    orange: <><rect x="28" y="54" width="44" height="20" rx="4" /><circle cx="36" cy="80" r="5" /><circle cx="64" cy="80" r="5" /></>,
  },
  力量: {
    pink: <>{FIG(38, 36, 6.5, 7, 80)}<path d="M50 20a9 5 0 0 1 9 5 9 5 0 0 1-18 0 9 5 0 0 1 9-5zm0 2.4a6.6 2.6 0 0 0 0 5.2 6.6 2.6 0 0 0 0-5.2z" /></>,
    orange: <><circle cx="66" cy="56" r="13" /><path d="M56 46l-6-6 8 1zM76 46l6-6-8 1zM66 69l-4 9h8z" /></>,
  },
  隐士: {
    pink: <><path d="M44 24c-8 0-13 7-13 16l-4 42h34l-4-42c0-9-5-16-13-16z" /></>,
    orange: <><rect x="66" y="20" width="3.5" height="56" rx="1.5" /><path d="M60 40h14v14H60z" /></>,
  },
  命运之轮: {
    orange: <><path fillRule="evenodd" d="M50 22a28 28 0 1 0 0 56 28 28 0 1 0 0-56zm0 9a19 19 0 1 1 0 38 19 19 0 1 1 0-38z" /><path d="M47 20h6v60h-6z" /><path d="M20 47h60v6H20z" transform="rotate(45 50 50)" /><path d="M20 47h60v6H20z" transform="rotate(-45 50 50)" /></>,
    pink: <><circle cx="50" cy="50" r="8" /></>,
  },
  正义: {
    pink: <>{FIG(50, 32, 7, 8, 78)}</>,
    orange: <><rect x="18" y="30" width="64" height="4" rx="2" /><path d="M12 34l-6 13h12zM88 34l6 13H82z" /></>,
  },
  倒吊人: {
    pink: <><circle cx="50" cy="70" r="7" /><path d="M50 63c-6 0-9-5-9-11l-2-22h22l-2 22c0 6-3 11-9 11z" /></>,
    orange: <><rect x="18" y="16" width="64" height="5" rx="2" /><rect x="48" y="19" width="4" height="12" /></>,
  },
  死亡: {
    pink: <><circle cx="42" cy="34" r="13" /><path d="M42 47c-9 0-13 7-13 15l-2 20h30l-2-20c0-8-4-15-13-15z" /></>,
    orange: <><path d="M62 18c10 6 16 18 16 30h-6c0-10-4-19-12-25z" /><rect x="72" y="46" width="4" height="34" rx="2" /></>,
  },
  节制: {
    pink: <>{FIG(50, 26, 6.5, 7, 60)}</>,
    orange: <><path d="M24 54h16a8 9 0 0 1-16 0z" /><path d="M60 66h16a8 9 0 0 1-16 0z" /><path d="M40 56c8 2 12 5 20 9l-2 4c-8-4-12-7-20-9z" /></>,
  },
  恶魔: {
    pink: <><circle cx="50" cy="34" r="12" /><path d="M50 46c-9 0-13 6-13 13l-2 13h30l-2-13c0-7-4-13-13-13z" /><path d="M36 26l-6-10 10 4zM64 26l6-10-10 4z" /></>,
    orange: <><rect x="30" y="74" width="40" height="12" rx="2" /></>,
  },
  高塔: {
    pink: <><path d="M34 80V40h32v40z" /><path d="M28 40l22-18 22 18z" /></>,
    green: <><path d="M62 12l-14 24h9l-8 22 18-26h-9z" /></>,
  },
  星星: {
    orange: <><path d="M50 12l5.5 29L84 50l-28.5 9L50 88l-5.5-29L16 50l28.5-9z" /></>,
    pink: <><path d="M26 74h13a6.5 8 0 0 1-13 0z" /><path d="M61 74h13a6.5 8 0 0 1-13 0z" /></>,
  },
  月亮: {
    orange: <><path d="M58 16a20 20 0 1 0 0 40 16 16 0 1 1 0-40z" /></>,
    pink: <><path d="M18 84V58l8-8 8 8v26z" /><path d="M66 84V58l8-8 8 8v26z" /><path d="M46 84V72h8v12z" /></>,
  },
  太阳: {
    orange: <><circle cx="50" cy="50" r="19" /><path d="M47 12h6v12h-6zM47 76h6v12h-6zM12 47h12v6H12zM76 47h12v6H76z" /><path d="M22 26l4-4 9 9-4 4zM69 69l4-4 9 9-4 4zM74 22l4 4-9 9-4-4zM27 69l4 4-9 9-4-4z" /></>,
  },
  审判: {
    orange: <><path d="M74 20l10-6v14l-10-4z" /><rect x="40" y="22" width="36" height="4" rx="2" /></>,
    pink: <>{FIG(30, 52, 6, 6, 82)}{FIG(50, 46, 6, 6, 82)}{FIG(70, 54, 6, 6, 82)}</>,
  },
  世界: {
    pink: <>{FIG(50, 36, 7, 7.5, 74)}</>,
    orange: <><path fillRule="evenodd" d="M50 12c-14 0-24 17-24 38s10 38 24 38 24-17 24-38-10-38-24-38zm0 8c9 0 16 13 16 30s-7 30-16 30-16-13-16-30 7-30 16-30z" /></>,
  },
};

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


/** 牌面主图形 */
export function TarotGlyph({ name, className = '' }: { name: string; className?: string }) {
  const id = identifyCard(name);

  // 大阿卡纳：粉 / 橙 / 绿三层分开上色，和小阿卡纳同一套实心语言
  if (id.suit === 'major') {
    const g = MAJOR_GLYPHS[name] ?? MAJOR_GLYPHS['星星'];
    return (
      <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
        {g.orange && <g fill={INK.orange}>{g.orange}</g>}
        {g.pink && <g fill={INK.pink}>{g.pink}</g>}
        {/* 荧光绿只有高塔的闪电用得到 —— 母样式里写死的规矩 */}
        {g.green && <g fill={G}>{g.green}</g>}
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
