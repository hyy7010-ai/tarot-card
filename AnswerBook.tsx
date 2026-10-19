import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ANSWERS } from './answers';
import { Candle } from './TarotRoom';

/**
 * 答案之书。
 *
 * 整个产品里唯一不数的地方：心里默念一个问题，按住书，松手翻开一页。
 * 它不读聊天记录、不碰任何算好的数字、不调模型 —— 所以页面上要明说它只是好玩的，
 * 不能让人把随手一翻读成「证据说」。想看事实的路在底下那行字里。
 *
 * 按住才翻：真实的答案之书是「想着问题，拇指压着书口让书页哗哗翻过去，想好了一松手」。
 * 所以按住时书页一直翻，**一松手就停**：不再翻新的页，正在翻的那页落下去，露出来的就是答案。
 * 松手之后还慢慢翻几页，读起来像是书替你挑的；松手即停，才是「你停在了这一页」。
 * 这一下停顿就是仪式本身，点一下就出答案会让它变成抽奖机。
 * 键盘用户按 Enter / 空格：翻一小会儿自己停下，不要求他们按住。
 *
 * 场景和塔罗房间是同一间屋子：深紫的夜、荧光绿的星尘、桌布的粉边橙穗、桌角那支蜡烛。
 * 书上的花纹守牌面的规矩 —— 封面是橙线和粉月亮，荧光绿只做点；纸页上是墨线，朱红只点一处。
 */
const HOLD_MS = 700;
/**
 * 按住时每隔多久翻过一页、每页翻多久。
 * 180ms 一页，连起来是「哗哗」在翻，每一页的页码还认得出在跳。
 */
const RIFFLE_EVERY = 180;
const RIFFLE_MS = 340;
/** 封面打开之后才开始翻页 */
const COVER_MS = 260;
/** 一直按着不松也得停：别让它无限翻下去 */
const MAX_HOLD_MS = 6000;
/** 键盘翻开：翻这么久自己停 */
const KEY_RIFFLE_MS = 900;

type Phase = 'closed' | 'riffling' | 'open';
type Sheet = { page: number };
type Leaf = Sheet & { id: number; ms: number };

/**
 * 随手一页：翻的过程中露出来的那些，不是答案。
 * 只有页码，不印字 —— 翻的时候瞥见别的答案，等于还没问完就先剧透了，
 * 停下来那一页的那句话就不稀奇了。字只在松手停下的那一页上出现。
 */
const randomSheet = (): Sheet => ({
  page: 1 + Math.floor(Math.random() * ANSWERS.length),
});

/** 翻开的一页。不和上一页重复 —— 连着两次同一句，会被读成「它坏了」 */
function pickPage(prev: number | null) {
  let i = Math.floor(Math.random() * ANSWERS.length);
  if (i === prev) i = (i + 1) % ANSWERS.length;
  return i;
}

// ─────────────────────────── 花纹 ───────────────────────────

/** 同一弯月：这副牌 78 张里 77 张的天上都挂着它 */
const MOON = 'M34 6a22 22 0 1 0 14 38A18 18 0 1 1 34 6z';

/** 封面中央的徽记：一圈光芒围着那弯月，外圈一环小点 */
function Medallion({ ray, moon, size = 132 }: { ray: string; moon: string; size?: number }) {
  const rays = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r0 = i % 2 ? 33 : 30;
    const r1 = i % 2 ? 40 : 45;
    return <line key={i} x1={60 + r0 * Math.cos(a)} y1={60 + r0 * Math.sin(a)} x2={60 + r1 * Math.cos(a)} y2={60 + r1 * Math.sin(a)} />;
  });
  const dots = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    return <circle key={i} cx={60 + 54 * Math.cos(a)} cy={60 + 54 * Math.sin(a)} r={i % 9 === 0 ? 1.6 : 0.8} />;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <g stroke={ray} strokeWidth="1" fill="none" strokeLinecap="round">
        {rays}
        <circle cx="60" cy="60" r="49" opacity="0.7" />
        <circle cx="60" cy="60" r="26" opacity="0.5" />
      </g>
      <g fill={ray}>{dots}</g>
      <path d={MOON} fill={moon} transform="translate(32 32) scale(1.04)" />
    </svg>
  );
}

/** 四角的花饰：两道弧线收进一个小菱形。放左上角，其余三个角靠旋转 */
function Corner({ color, className = '' }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={`absolute h-7 w-7 ${className}`} aria-hidden="true">
      <g fill="none" stroke={color} strokeWidth="1" strokeLinecap="round">
        <path d="M3 37V16Q3 3 16 3h21" />
        <path d="M9 37V20Q9 9 20 9h17" opacity="0.55" />
        <path d="M15 22q4-7 11-7" opacity="0.55" />
      </g>
      <path d="M15 11l2.5 2.5L15 16l-2.5-2.5z" fill={color} />
    </svg>
  );
}
const Corners = ({ color, inset }: { color: string; inset: string }) => (
  <>
    <Corner color={color} className={`${inset} left-0 top-0`} />
    <Corner color={color} className={`${inset} right-0 top-0 rotate-90`} />
    <Corner color={color} className={`${inset} bottom-0 right-0 rotate-180`} />
    <Corner color={color} className={`${inset} bottom-0 left-0 -rotate-90`} />
  </>
);

/** 封面内侧的衬纸：月亮和四角星交错铺满 */
const ENDPAPER = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'>
    <path d='${MOON}' fill='#FFB6C1' opacity='.22' transform='translate(4 4) scale(.3)'/>
    <path d='M31 25l1.6 4.4L37 31l-4.4 1.6L31 37l-1.6-4.4L25 31l4.4-1.6z' fill='#FF8C00' opacity='.3'/>
    <circle cx='33' cy='9' r='.9' fill='#FFB6C1' opacity='.4'/><circle cx='9' cy='33' r='.9' fill='#FF8C00' opacity='.4'/>
  </svg>`,
)}")`;

/** 一页纸的版式：双线页框、四角花饰、页眉、页码。答案页和翻过去的每一页共用 */
function Page({ children, page }: { children?: React.ReactNode; page: number | null }) {
  return (
    <div className="paper-grain absolute inset-0 overflow-hidden rounded-r-md rounded-l-sm bg-paper text-ink">
      <div className="pointer-events-none absolute inset-3 border border-ink/20" />
      <div className="pointer-events-none absolute inset-[17px] border border-ink/10" />
      <Corners color="rgba(23,19,14,0.4)" inset="m-[9px]" />
      <p className="absolute inset-x-0 top-7 text-center font-mono text-[8.5px] uppercase tracking-[0.34em] text-ink-faint">
        The book of answers
      </p>
      {/* 一枚很淡的徽记压在字底下：纸上的水印 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07]">
        <Medallion ray="#17130E" moon="#17130E" size={170} />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-7">{children}</div>
      {page !== null && (
        <p className="absolute inset-x-0 bottom-7 text-center font-mono text-[9px] tracking-[0.24em] text-ink-faint tabular-nums">
          — {page} —
        </p>
      )}
    </div>
  );
}

/** 线 · 菱形 · 线 */
const Divider = ({ accent }: { accent: string }) => (
  <span className="flex items-center gap-2" aria-hidden="true">
    <span className="h-px w-9 bg-ink/25" />
    <span className={`h-1.5 w-1.5 rotate-45 ${accent}`} />
    <span className="h-px w-9 bg-ink/25" />
  </span>
);

/** 星尘：和女祭司那间屋子里一样，只做点 */
const STARS = [
  { x: 8, y: 14, s: 8, d: 0 }, { x: 19, y: 46, s: 6, d: 1.4 }, { x: 31, y: 9, s: 7, d: 2.2 },
  { x: 70, y: 11, s: 9, d: 0.7 }, { x: 84, y: 38, s: 6, d: 1.9 }, { x: 93, y: 16, s: 7, d: 2.8 },
  { x: 58, y: 4, s: 5, d: 1.1 },
];

// ─────────────────────────── 页面 ───────────────────────────

export default function AnswerBook({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>('closed');
  const [page, setPage] = useState<number | null>(null);
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  /**
   * 翻的过程中，底下那一页是第几页（只有页码，不印字，见 randomSheet）。
   * 每翻一页，翻起来的是「现在这页」，底下换成新的一页 —— 页码前后接得上。
   */
  const [under, setUnder] = useState<Sheet | null>(null);
  const underRef = useRef<Sheet | null>(null);
  const [hint, setHint] = useState(false);
  const downAt = useRef(0);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);
  const riffle = useRef<number | null>(null);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (riffle.current) clearInterval(riffle.current);
    riffle.current = null;
  };
  useEffect(() => clearAll, []);

  /** 翻过一页：它自己播完动画，时长一到就从 DOM 里拿掉（见 styles.css 的 book-leaf） */
  const turn = (ms: number) => {
    const leaf = { ...(underRef.current ?? randomSheet()), id: nextId.current++, ms };
    const next = randomSheet();
    underRef.current = next;
    setUnder(next);
    setLeaves(ls => [...ls.slice(-5), leaf]);
    // 这一个计时器不进 clearAll：停下来之后，正在翻的那页还要落完
    window.setTimeout(() => setLeaves(ls => ls.filter(l => l.id !== leaf.id)), ms + 40);
  };

  const startRiffle = () => {
    setPage(null);
    const first = randomSheet();
    underRef.current = first;
    setUnder(first);
    setHint(false);
    setPhase('riffling');
    later(() => {
      turn(RIFFLE_MS);
      riffle.current = window.setInterval(() => turn(RIFFLE_MS), RIFFLE_EVERY);
    }, COVER_MS);
  };

  /**
   * 停。不再翻新的页；底下那页此刻换成答案，正在半空的那一两页落下去就露出来。
   * 答案在松手这一刻才抽 —— 停在哪一页，是你松手的那一下决定的。
   */
  const stop = () => {
    clearAll();
    underRef.current = null;
    setUnder(null);
    setPage(p => pickPage(p));
    setPhase('open');
  };

  const onDown = () => {
    if (phase !== 'closed') return;
    downAt.current = Date.now();
    startRiffle();
    later(stop, MAX_HOLD_MS);
  };
  const onUp = () => {
    if (phase !== 'riffling') return;
    // 没按够就松手：合上，告诉他多想一会儿，而不是悄悄给一个答案
    if (Date.now() - downAt.current < HOLD_MS) {
      clearAll();
      setPhase('closed');
      setHint(true);
      return;
    }
    stop();
  };
  const onKey = () => {
    if (phase !== 'closed') return;
    startRiffle();
    later(stop, KEY_RIFFLE_MS);
  };

  const answer = page === null ? '' : ANSWERS[page];
  const opened = phase !== 'closed';

  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip overflow-y-auto bg-sunset-purple text-paper">
      {/* 夜：书背后一团烛光，按住时更亮一点 */}
      <div
        className="pointer-events-none absolute left-1/2 top-[34%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-700"
        style={{
          background: 'radial-gradient(circle, rgba(255,140,0,0.16) 0%, rgba(255,182,193,0.07) 38%, transparent 68%)',
          opacity: phase === 'riffling' ? 1 : 0.7,
        }}
        aria-hidden="true"
      />
      {STARS.map((s, i) => (
        <span
          key={i}
          className="rh-star"
          style={{ left: `${s.x}%`, top: `${s.y}%`, '--s': `${s.s}px`, animationDelay: `${s.d}s` } as React.CSSProperties}
          aria-hidden="true"
        />
      ))}

      <header className="relative z-[1] mx-auto flex w-full max-w-3xl items-baseline gap-3 border-b-2 border-paper/60 px-7 pb-3 pt-8 md:px-12">
        <button onClick={onBack} aria-label="返回" className="shrink-0 text-paper/60 transition-colors hover:text-paper">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-serif text-[22px] font-semibold">答案之书</h1>
        <span className="flex-1" />
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50">
          {ANSWERS.length} 页
        </span>
      </header>

      {/* 书立在桌沿上 */}
      <div className="relative z-[1] flex flex-1 items-end justify-center px-7 pt-12">
        {/* 翻开时整本往右挪半个书宽：宽屏上封面内侧落在左边，摊开的两页居中 */}
        <div className={`transition-transform duration-500 ease-[cubic-bezier(0.7,0,0.2,1)] ${opened ? 'md:translate-x-1/2' : ''}`}>
          <button
            type="button"
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            onPointerCancel={onUp}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKey(); }
            }}
            onContextMenu={e => e.preventDefault()}
            disabled={phase === 'open'}
            aria-label={phase === 'open' ? `翻开的这一页写着：${answer}` : '按住这本书，想好了再松手'}
            className="relative block aspect-[3/4] w-[min(68vw,280px)] select-none outline-none [perspective:1600px] [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-paper/70"
            style={{ touchAction: 'none' }}
          >
            {/* 封底：比书页大一圈，从右下露出来 */}
            <span className="absolute -bottom-2.5 -right-3 left-1 top-1.5 rounded-r-md rounded-l-sm bg-[#240646] shadow-[0_28px_60px_rgba(9,2,20,0.6)]" aria-hidden="true" />
            {/* 书口：右边和下边一叠纸的厚度 */}
            <span className="absolute -right-2 bottom-1 top-1.5 w-2 rounded-r-sm bg-[repeating-linear-gradient(to_right,#efe9dc_0_1px,#d9d1c0_1px_2px)]" aria-hidden="true" />
            <span className="absolute -bottom-1.5 left-2 right-0 h-1.5 rounded-b-sm bg-[repeating-linear-gradient(to_bottom,#efe9dc_0_1px,#d9d1c0_1px_2px)]" aria-hidden="true" />
            {/* 书签丝带：夹在书页里，从下沿垂出来 */}
            <span
              className="absolute -bottom-10 left-[64%] h-12 w-2.5 bg-aurora-pink"
              style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)' }}
              aria-hidden="true"
            />

            {/* 底下那一页：翻的过程中是一页空白的，停下来时换成答案 */}
            <Page page={page !== null ? page + 1 : under?.page ?? null}>
              {page !== null && (
                <>
                  <Divider accent="bg-vermilion" />
                  <p className="my-5 text-center font-serif text-[22px] font-semibold leading-[1.5] [text-wrap:balance] sm:text-[25px]">{answer}</p>
                  <Divider accent="bg-ink/40" />
                </>
              )}
            </Page>

            {/* 正在翻过去的书页：空白的纸页，只有页码 */}
            {leaves.map(l => (
              <div
                key={l.id}
                className="book-leaf absolute inset-0"
                style={{ '--leaf-ms': `${l.ms}ms` } as React.CSSProperties}
                aria-hidden="true"
              >
                <Page page={l.page} />
                <span className="book-leaf-shade absolute inset-0 rounded-r-md bg-gradient-to-l from-black/35 to-transparent" style={{ '--leaf-ms': `${l.ms}ms` } as React.CSSProperties} />
              </div>
            ))}

            {/* 封面：绕左边的书脊转开。正面是布面烫金，背面是衬纸 */}
            <div
              className="absolute inset-0 z-10 transition-transform duration-500 ease-[cubic-bezier(0.7,0,0.2,1)] [transform-style:preserve-3d]"
              style={{ transformOrigin: 'left center', transform: opened ? 'rotateY(-168deg)' : 'rotateY(0deg)' }}
            >
              <div
                className="absolute inset-0 overflow-hidden rounded-r-md rounded-l-sm [backface-visibility:hidden]"
                style={{
                  background: [
                    'radial-gradient(120% 90% at 60% 40%, rgba(255,182,193,0.10), transparent 60%)',
                    'repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px)',
                    'repeating-linear-gradient(-45deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 4px)',
                    '#3A0E66',
                  ].join(','),
                  boxShadow: 'inset 0 0 40px rgba(9,2,20,0.55)',
                }}
              >
                {/* 书脊：一道暗边，三条橙色的脊线 */}
                <span className="absolute inset-y-0 left-0 w-4 bg-black/30" aria-hidden="true">
                  {[18, 50, 82].map(t => (
                    <span key={t} className="absolute inset-x-0 h-[3px] bg-sunset-orange/55" style={{ top: `${t}%` }} />
                  ))}
                </span>
                {/* 烫金双框 + 四角花饰 */}
                <span className="absolute inset-y-3 left-7 right-3 border border-sunset-orange/65" aria-hidden="true" />
                <span className="absolute inset-y-[18px] left-[34px] right-[18px] border border-sunset-orange/30" aria-hidden="true" />
                <div className="absolute inset-y-0 left-4 right-0"><Corners color="#FF8C00" inset="m-[14px]" /></div>

                <div className="absolute inset-y-0 left-4 right-0 flex flex-col items-center justify-center">
                  <Medallion ray="#FF8C00" moon="#FFB6C1" size={128} />
                  <p className="mt-5 font-serif text-[23px] font-semibold tracking-[0.32em] text-paper">答案之书</p>
                  <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.34em] text-paper/55">
                    Realheart · {ANSWERS.length} 页
                  </p>
                </div>
                <span className="absolute bottom-7 left-[calc(50%+8px)] h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-neon-green" aria-hidden="true" />
              </div>

              {/* 封面内侧：衬纸。宽屏上翻开之后它就是左边那一页 */}
              <div
                className="absolute inset-0 overflow-hidden rounded-l-md rounded-r-sm [backface-visibility:hidden]"
                style={{ transform: 'rotateY(180deg)', backgroundImage: ENDPAPER, backgroundColor: '#2A0850', boxShadow: 'inset -18px 0 30px rgba(9,2,20,0.45)' }}
                aria-hidden="true"
              >
                <div className="absolute inset-3 border border-aurora-pink/25" />
                <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                  <p className="font-serif text-[15px] leading-[2] text-paper/80">
                    你心里默念的那个问题，
                    <br />
                    这一页替你记着。
                  </p>
                  <p className="mt-4 font-mono text-[8.5px] uppercase tracking-[0.34em] text-aurora-pink/60">Realheart</p>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* 桌子：粉边橙穗，和塔罗房间同一块桌布 */}
      <div className="relative z-[1] mt-12 bg-[#22063F]">
        <div className="rh-table-hem" />
        <div className="relative mx-auto max-w-3xl">
          <div className="hidden sm:block"><Candle /></div>
        </div>
        <div className="mx-auto flex min-h-[5.5rem] max-w-3xl flex-col items-center px-7 pt-7 text-center">
          {phase === 'open' ? (
            <button
              onClick={() => { setPhase('closed'); setLeaves([]); }}
              className="border border-paper px-7 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper transition-colors hover:bg-paper hover:text-ink"
            >
              合上，再问一个
            </button>
          ) : (
            <>
              <p className="font-serif text-[18px] font-semibold">
                {phase === 'riffling' ? '想着它' : '心里默念一个问题'}
              </p>
              <p className={`mt-2 text-[13px] ${hint ? 'text-aurora-pink' : 'text-paper/60'}`}>
                {phase === 'riffling' ? '想好了就松手，书停在哪一页，就是哪一页'
                  : hint ? '再多想一会儿，按住别松手' : '按住这本书，想好了再松手'}
              </p>
            </>
          )}
        </div>

        {/* 和「先数，再抽牌」划清界限：这一页是随手翻的 */}
        <p className="mx-auto mt-8 max-w-3xl border-t border-paper/15 px-7 pb-12 pt-4 text-center text-[12px] leading-[1.9] text-paper/45">
          这本书是随手翻的，只图一个念头，不看你的聊天记录，也不碰任何数字。
          <br />
          想知道你们之间真实发生了什么，去做一份恋爱分析。
        </p>
      </div>
    </div>
  );
}
