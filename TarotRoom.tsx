import React, { useId, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { TarotCardBack } from './TarotCard';

/**
 * 塔罗的「房间」：进门的一道帘子，和坐在桌子对面的那个人。
 *
 * 为什么塔罗师是女祭司（m02），而不是另画一个：
 *   - 她本来就是塔罗里「帘子后面看不见的东西」那张牌：戴面纱、坐着、正对你，
 *     身后挂着一道石榴帘。进门掀开一道帘子，看见的是坐在另一道帘子前的她 ——
 *     两道帘子说的是同一件事。
 *   - 她没有脸，和整副牌「人一律没有脸」是同一个语法。
 *   - 图是 Dream Lab 的出图，和其他 77 张一个质量；另画一个只会是第 79 种画法。
 *   - 牌的底色就是房间的深紫，边缘融掉，看起来就是坐在对面。
 *
 * ⚠️ 人设和这个产品的立场有张力：一个「会看」的人，天然让人觉得她知道你没说出口的事。
 *    所以她说的话只来自两处：牌面，和你带来的那几个数字。她是解读的声音，不是来源。
 *
 * ⚠️ 性能：牌堆卡过一次（51 个动画组件 + 51 个 blur）。这里会动的东西
 *    只动 transform 和 opacity，一个 filter 都不用：
 *    帘子两片 + 帘头一条、烛火一簇、星尘七粒，一共十一个合成层。
 *
 * 场景里的颜色按 theme.css 第三类规矩走：帘子、烛火、星尘、桌布是**插画**，
 * 照牌面的画法画（四色油墨、平涂、无脸）；输入框、按钮这些界面构件仍然只用纸色。
 */

/**
 * 帘子拉开的时长。Tarot 用它算什么时候把帘子卸掉 ——
 * 不等 transitionend：后台标签页和预览窗格里 transition 可能永远不结束，
 * 入口不能被一段动画卡死（App.tsx 顶层导航不用 mode="wait" 是同一个理由）。
 */
export const CURTAIN_MS = 900;

/**
 * 帘子上的褶。[起点 x, 宽度, 亮度]，单位是 viewBox 的 0–100。
 *
 * ⚠️ 宽窄必须不一。牌缘那次踩过：等距的亮线读出来是条码，不是布。
 * ⚠️ 相邻的褶要互相压一点，中间不留平涂的紫。第一版留了缝、每道褶又是平涂色块，
 *    截出来是一面竖条纹墙纸。布之所以是布，靠的是每道褶的**圆度** ——
 *    褶脊亮，往两边暗下去。所以每道褶填的是一条横向渐变（见 CurtainPanel 里的 <linearGradient>）。
 */
const FOLDS: [number, number, number][] = [
  [-2, 8, 0.4], [5, 10, 0.5], [14, 6, 0.34], [18, 11, 0.54], [28, 7, 0.38],
  [33, 12, 0.56], [44, 6, 0.34], [48, 10, 0.5], [57, 7, 0.4], [62, 12, 0.56],
  [73, 6, 0.32], [77, 10, 0.5], [86, 7, 0.4], [91, 10, 0.52],
];

/**
 * 一道褶：两条微微摆动的边围成的带子，下摆比上沿宽一点（布往下垂会张开）。
 * viewBox 0 0 100 300，拉伸铺满半屏。
 */
const foldPath = (x: number, w: number, d = 2.2) => {
  const f = w * 0.18;
  return `M${x} 0 C${x + d} 100 ${x - d} 200 ${x - f} 300 L${x + w + f} 300 C${x + w - d} 200 ${x + w + d} 100 ${x + w} 0 Z`;
};

function CurtainPanel({ side }: { side: 'left' | 'right' }) {
  // 两片帘子各有一份 <defs>，id 必须不同，不然第二片引用的是第一片的渐变
  const grad = `fold-${useId().replace(/:/g, '')}`;
  return (
    <div className={`curtain-panel ${side} bg-sunset-purple`}>
      <svg
        viewBox="0 0 100 300"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        /* 右片镜像：两片褶子对称，才像同一道帘子从中间分开 */
        style={side === 'right' ? { transform: 'scaleX(-1)' } : undefined}
      >
        <defs>
          {/* 按每道褶自己的包围盒横向铺：边缘透明 → 褶脊（偏左 38%，光从左上来）最亮 → 透明 */}
          <linearGradient id={grad} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--color-aurora-pink)" stopOpacity="0" />
            <stop offset="0.38" stopColor="var(--color-aurora-pink)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--color-aurora-pink)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {FOLDS.map(([x, w, a]) => (
          <g key={x}>
            <path d={foldPath(x, w)} fill={`url(#${grad})`} opacity={a} />
            {/* 褶脊上一道细亮线：non-scaling-stroke，拉伸之后线宽不变 */}
            <path
              d={`M${x + w * 0.38} 0 C${x + w * 0.38 + 2.2} 100 ${x + w * 0.38 - 2.2} 200 ${x + w * 0.38 - w * 0.07} 300`}
              fill="none"
              stroke="var(--color-aurora-pink)"
              strokeWidth="0.8"
              opacity={a * 0.7}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>
      {/* 中缝的暗影：两片合上的地方要有一道深，不然看起来是一整块布 */}
      <div className={`curtain-seam ${side}`} />
      {/* 帘脚：一条橙边加一排穗子 */}
      <div className="curtain-hem" />
    </div>
  );
}

/**
 * 进门的帘子。
 *
 * 盖住整个塔罗页（absolute，不是 fixed —— App.tsx 在外面包了一层带 transform 的
 * motion.div，祖先有 transform 时 fixed 会退化成相对那个祖先定位）。
 * 帘子在的时候 Tarot 会把滚动锁住，所以 absolute 盖住的就是整个可视区。
 */
export function Curtain({
  opening, onOpen, onBack,
}: { opening: boolean; onOpen: () => void; onBack?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  /** 按下时的位置。active：真的开始拖了（移动超过 6px），在那之前它只是一次可能的点击 */
  const drag = useRef<{ x0: number; p0: number; active: boolean } | null>(null);
  /** 鼠标只是经过时帘子分开了多少 —— 按下去开始拖的时候从这里接着走，不往回跳 */
  const hoverP = useRef(0);
  const reduced = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

  /**
   * 把两片帘子摆到「拉开 p」（0 合上，1 全开）的位置。
   *
   * 直接写行内 style，不经过 React —— 和牌堆的滑动是同一个理由：
   * 拖的时候每一帧都在变，走 state 就是每一帧整页重渲染。
   * transition 由调用方给：拖的时候是 none（跟手），经过、回弹、放手打开时是一段短过渡。
   */
  const setPart = (p: number, transition: string) => {
    const root = rootRef.current;
    if (!root) return;
    const panels = [
      [root.querySelector<HTMLElement>('.curtain-panel.left'), -1],
      [root.querySelector<HTMLElement>('.curtain-panel.right'), 1],
    ] as const;
    for (const [el, sign] of panels) {
      if (!el) continue;
      el.style.transition = transition;
      el.style.transform = p === 0 ? '' : `translateX(${sign * p * 102}%)`;
    }
    // 字和按钮跟着拉开的程度淡掉：拉开三成就看不见了，不和后面的房间叠在一起
    root.querySelectorAll<HTMLElement>('.curtain-copy').forEach(c => {
      c.style.transition = transition === 'none' ? 'none' : '';
      c.style.opacity = p === 0 ? '' : String(Math.max(0, 1 - p * 3));
    });
  };

  const open = (fromDrag: boolean) => {
    if (reduced()) {
      // 减少动态：清掉行内位置，交给 CSS 里那段淡出
      setPart(0, '');
    } else {
      // 拖到一半放手：从当前位置很快拉完。点按钮：保持原来那段较慢的拉开
      setPart(1, fromDrag
        ? `transform 520ms ${EASE}`
        : `transform ${CURTAIN_MS}ms cubic-bezier(0.7, 0, 0.2, 1)`);
    }
    onOpen();
  };

  return (
    <div
      ref={rootRef}
      className={`absolute inset-0 z-50 cursor-grab overflow-hidden ${opening ? 'curtain-open pointer-events-none' : ''}`}
      style={{ '--curtain-ms': `${CURTAIN_MS}ms`, touchAction: 'none' } as React.CSSProperties}
      /*
        按住往两边拖，帘子跟着手分开；放手时拉开超过三成就整个拉开，不到就弹回去。
        鼠标只是经过时，离中缝越近帘子分得越开（最多 6%），告诉人它是能拉的。
        「掀开帘子」按钮留着：键盘用户、不知道能拖的人都靠它。

        ⚠️ 移动超过 6px 才 setPointerCapture。一按下就抓指针的话，
           松手的 click 会被派给帘子而不是按钮，按钮就点不动了。
      */
      onPointerDown={e => {
        if (opening) return;
        drag.current = { x0: e.clientX, p0: hoverP.current, active: false };
      }}
      onPointerMove={e => {
        const root = rootRef.current;
        if (!root || opening) return;
        const W = root.clientWidth;
        const d = drag.current;
        if (d) {
          const dx = e.clientX - d.x0;
          if (!d.active && Math.abs(dx) > 6) {
            d.active = true;
            // 指针已经失效（比如触摸被系统打断）时这里会抛错；抓不到也照样能拖，只是出了帘子就收不到
            try { root.setPointerCapture?.(e.pointerId); } catch { /* 见上 */ }
            root.style.cursor = 'grabbing';
          }
          if (d.active) setPart(Math.min(1, d.p0 + Math.abs(dx) / (W / 2)), 'none');
          return;
        }
        if (e.pointerType !== 'mouse' || reduced()) return;
        const cx = root.getBoundingClientRect().left + W / 2;
        const near = Math.max(0, 1 - Math.abs(e.clientX - cx) / (W * 0.22));
        hoverP.current = near * 0.06;
        setPart(hoverP.current, `transform 420ms ${EASE}`);
      }}
      onPointerUp={e => {
        const d = drag.current;
        drag.current = null;
        const root = rootRef.current;
        if (root) root.style.cursor = '';
        // 没拖动过：这是一次普通的点击，交给按钮自己处理
        if (!d?.active || !root) return;
        const p = d.p0 + Math.abs(e.clientX - d.x0) / (root.clientWidth / 2);
        if (p > 0.3) open(true);
        else { hoverP.current = 0; setPart(0, `transform 380ms ${EASE}`); }
      }}
      onPointerCancel={() => {
        drag.current = null;
        hoverP.current = 0;
        setPart(0, `transform 380ms ${EASE}`);
      }}
      onPointerLeave={() => {
        if (drag.current) return;
        hoverP.current = 0;
        setPart(0, `transform 420ms ${EASE}`);
      }}
    >
      <CurtainPanel side="left" />
      <CurtainPanel side="right" />
      <div className="curtain-valance" aria-hidden="true" />

      {onBack && (
        <button
          onClick={onBack}
          aria-label="返回"
          className="curtain-copy absolute left-5 top-6 z-10 cursor-pointer rounded p-1 text-paper/60 transition-colors hover:text-paper"
        >
          <ArrowLeft size={18} />
        </button>
      )}

      <div className="curtain-copy absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-8 text-center">
        {/* 字压在褶子上要读得出来：背后垫一团同色的暗，不是加一块板 */}
        <div className="curtain-copy-scrim" aria-hidden="true" />
        <p className="relative font-mono text-[9px] uppercase tracking-[0.34em] text-paper/65">
          Realheart Tarot
        </p>
        <p className="relative mt-5 font-serif text-[26px] font-semibold leading-[1.45] text-paper sm:text-[34px]">
          帘子后面，
          <br />
          有人在等你
        </p>
        <button
          onClick={() => open(false)}
          autoFocus
          className="relative mt-9 cursor-pointer border border-paper bg-paper px-8 py-3.5 font-mono text-[10px] uppercase tracking-[0.34em] text-ink transition-colors hover:bg-paper-raised"
        >
          掀开帘子
        </button>
        {/* 不说的话，没人会想到帘子本身能拖 */}
        <p className="relative mt-4 text-[11px] text-paper/55">或者，直接把帘子往两边拉开</p>
      </div>
    </div>
  );
}

/** 她周围的星尘：和牌面上一样，荧光绿只做点 */
const STARS: { x: number; y: number; s: number; d: number }[] = [
  { x: 9, y: 20, s: 9, d: 0 },
  { x: 17, y: 64, s: 7, d: 1.3 },
  { x: 28, y: 7, s: 8, d: 2.1 },
  { x: 73, y: 12, s: 10, d: 0.6 },
  { x: 85, y: 55, s: 7, d: 1.8 },
  { x: 92, y: 26, s: 8, d: 2.7 },
  { x: 63, y: 3, s: 6, d: 1 },
];

/**
 * 桌上那叠牌。四张牌背叠着、平躺在桌布上。
 * 平躺用 rotateX 做透视，静态的，只在第一次绘制时付一次代价。
 */
function DeckOnTable() {
  return (
    <div
      className="absolute left-[4%] top-0 w-[64px] sm:w-[82px]"
      style={{ transform: 'translateY(-46%) perspective(640px) rotateX(56deg) rotateZ(-9deg)', transformOrigin: '50% 100%' }}
      aria-hidden="true"
    >
      {[3, 2, 1, 0].map(i => (
        <div
          key={i}
          className={i === 3 ? 'relative' : 'absolute inset-0'}
          style={{ transform: `translate(${i * 1.5}px, ${-i * 2}px)` }}
        >
          <TarotCardBack size="sm" fluid />
        </div>
      ))}
    </div>
  );
}

/** 桌角的一支蜡烛。器物用橙、人物用粉是牌面的规矩，烛身在这里算「柱子」那一类，用粉 */
function Candle() {
  return (
    <div
      className="absolute right-[8%] top-0 flex flex-col items-center"
      style={{ transform: 'translateY(-82%)' }}
      aria-hidden="true"
    >
      <span className="candle-glow" />
      <span className="candle-flame" />
      <span className="candle-wick" />
      <span className="candle-body" />
      <span className="candle-dish" />
    </div>
  );
}

/**
 * 整间屋子：上半是她，下半是桌子。children 摆在桌面上。
 *
 * 桌子用负的上边距压住她的下半身 —— 她是坐在桌子后面，不是站在桌子上。
 */
export function ReaderScene({
  children, compact = false, showDeck = true, aside = false,
}: {
  children: React.ReactNode;
  /** 第二段用：她缩小，把桌面让给摊开的牌 */
  compact?: boolean;
  /** 牌摊开之后，桌角那叠就不该还在 */
  showDeck?: boolean;
  /**
   * 宽屏（≥900px）上桌面分左右两栏（左边摊牌、右边牌位，宽 360 + 间距 40）。
   * 她和蜡烛跟着左栏居中 —— 牌要摊在她正前方，不是摊在她斜前方。
   */
  aside?: boolean;
}) {
  return (
    /*
      ⚠️ 不能用 rh-ink：它自带 overflow:hidden。flex 子项一有 overflow:hidden，
         最小高度就从「内容高度」退成 0 —— 第一版于是被压成正好一屏，
         预设问题、牌阵、纸条和「开始抽牌」全被裁在外面，页面还滚不动（scrollHeight = 视口高）。
         这里只需要横向不溢出（手机上烛光会越过右边），所以用 overflow-x:clip：
         clip 不会把元素变成滚动容器，最小高度仍然按内容算。
    */
    <section className="relative z-[1] flex flex-1 flex-col overflow-x-clip bg-sunset-purple text-paper">
      <div className={`relative ${aside ? 'min-[900px]:pr-[400px]' : ''}`}>
        {STARS.map((st, i) => (
          <span
            key={i}
            className="rh-star"
            style={{
              left: `${st.x}%`, top: `${st.y}%`,
              '--s': `${st.s}px`, animationDelay: `${st.d}s`,
            } as React.CSSProperties}
            aria-hidden="true"
          />
        ))}
        <div className={`reader-stage relative mx-auto ${compact ? 'reader-stage-compact' : ''}`}>
          <div className="reader-halo" aria-hidden="true" />
          <img
            src="/tarot/m02.jpg"
            alt="女祭司坐在桌子对面，戴着面纱，身后挂着一道石榴帘"
            className="reader-figure relative h-full w-full object-cover"
          />
        </div>
      </div>

      <div
        className="rh-table relative z-10 flex-1 bg-ink/40"
        /* 桌沿压住她下面约 1/6：牌的底部是云，本来也不该露出来 */
        style={{ marginTop: 'calc(-1 * clamp(40px, 7vh, 78px))' }}
      >
        <div className="rh-table-hem" aria-hidden="true" />
        {/* 蜡烛和牌叠对齐的是她，不是屏幕两边：宽屏上放在屏幕两端就离她太远了 */}
        <div className={`pointer-events-none absolute inset-x-0 top-0 mx-auto max-w-[560px] ${aside ? 'min-[900px]:right-[400px]' : ''}`}>
          {showDeck && <DeckOnTable />}
          <Candle />
        </div>
        {children}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   第二段：她把牌摊开。

   镜头还在你这边，还看得到对面的她 —— 用的是同一间屋子（ReaderScene compact）。
   78 张在你们之间摊成一个 U：弧底朝你，两头开口朝她。
   参考图里那把牌是朝塔罗师弯的（摊给她自己看），这里反过来，摊给你看。
   ═══════════════════════════════════════════════════════════════════ */

/**
 * 桌布上的一圈星盘。U 形牌堆的圆心就是它的圆心：78 张牌沿着它的下半圈排开，
 * 上半圈伸到她那一侧，被桌沿切掉。
 *
 * 线全是 non-scaling-stroke —— 盘在手机上直径 350、桌面上 740，线宽都是 1px。
 */
export function TableWheel({ r, cy }: { r: number; cy: number }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  const houses = Array.from({ length: 12 }, (_, i) => i * 30);
  const line = { fill: 'none', stroke: 'var(--color-aurora-pink)', vectorEffect: 'non-scaling-stroke' } as const;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2"
      style={{ top: cy, width: r * 2, height: r * 2, transform: 'translate(-50%, -50%)' }}
    >
      <svg viewBox="-100 -100 200 200" className="h-full w-full">
        <g {...line} strokeWidth="1" opacity="0.34">
          <circle r="98" />
          <circle r="88" />
          <circle r="47" />
          <circle r="41" />
        </g>
        {/* 外圈刻度：每 10° 一根，每 30° 一根长的 —— 长短不一，才不是一圈梳齿 */}
        <g {...line} strokeWidth="1" opacity="0.28">
          {ticks.map(d => (
            <line key={d} x1="0" y1={d % 30 === 0 ? -88 : -93} x2="0" y2="-98" transform={`rotate(${d})`} />
          ))}
        </g>
        {/* 十二宫的分隔线，从内圈走到外圈 */}
        <g {...line} strokeWidth="1" opacity="0.16">
          {houses.map(d => (
            <line key={d} x1="0" y1="-47" x2="0" y2="-88" transform={`rotate(${d})`} />
          ))}
        </g>
        {/* 每一宫中间一颗小点，交替大小 */}
        <g fill="var(--color-aurora-pink)" opacity="0.4">
          {houses.map((d, i) => (
            <circle key={d} cx="0" cy="-67" r={i % 2 ? 1.1 : 2} transform={`rotate(${d + 15})`} />
          ))}
        </g>
        {/* 盘心：牌背上那个徽记，放大了印在桌布正中 */}
        <g {...line} strokeWidth="1" opacity="0.3">
          <circle r="22" />
          <path d="M0 -22 L14 0 L0 22 L-14 0 Z" />
          <path d="M-22 0 H22 M0 -22 V22" />
        </g>
        {/* 荧光绿只做点：四粒 */}
        <g fill="var(--color-neon-green)" opacity="0.85">
          {[[-72, -30], [64, -52], [-40, 76], [82, 40]].map(([x, y]) => (
            <path key={`${x}${y}`} transform={`translate(${x} ${y}) scale(0.9)`}
              d="M0 -3 L0.7 -0.7 L3 0 L0.7 0.7 L0 3 L-0.7 0.7 L-3 0 L-0.7 -0.7 Z" />
          ))}
        </g>
      </svg>
    </div>
  );
}
