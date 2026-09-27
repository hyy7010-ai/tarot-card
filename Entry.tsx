import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, ArrowRight, Check, Sparkles, Trash2 } from 'lucide-react';
import { parseChat, type ParseResult } from './parseChat';
import { computeRelationshipMetrics } from './metrics';
import TarotCard from './TarotCard';
import { cardCode } from './TarotArt';
import { ILLUSTRATED } from './illustrated';
import { TAROT_CARDS } from './cards';
import { loadReadings } from './storage';
import type { ChatMessage } from './types';

/**
 * 首页。
 *
 * 两个入口并列：恋爱分析、真心塔罗。它们读的是同一批聊天记录 ——
 * 报告把数字摆出来，塔罗把同一批数字换个说法，谁先谁后由用户挑。
 *
 * 但两个入口都要先有数据。没有导入之前这东西只能演示不能用，
 * 所以点任一入口若还没有记录，就先走导入。
 *
 * 一条硬规矩贯穿全程：**读不懂就说读不懂**。
 * 解析不出的行原样列出来，样本不够就直说不够，绝不猜一个时间戳硬凑 ——
 * 凑进去的那一条会污染 metrics.ts 算出的每一个数字，而这个产品唯一的
 * 立身之本就是那些数字是真的。
 */

export type Destination = 'analysis' | 'tarot';

interface EntryProps {
  /** 已经有聊天记录了：点图标直接进，不用再导入 */
  hasData: boolean;
  onOpen: (dest: Destination) => void;
  /** 丢掉已导入的记录，重新粘一份 */
  onReset: () => void;
  onStart: (
    messages: ChatMessage[], myUid: string, otherName: string,
    dest: Destination,
    /** 用户勾了才把聊天记录写进这台设备 */
    remember: boolean,
    /** 这份记录有没有逐条时间戳 */
    hasTimestamps: boolean,
  ) => void;
  /** 这台设备上存着的记录（用户上次选择保留），没有就是 null */
  saved: { otherName: string; savedAt: number } | null;
  onForget: () => void;
  onDemo: (dest: Destination) => void;
  /** 打开解读历史 */
  onHistory: () => void;
}

/*
 * 首屏摊开的三张。
 *
 * 这不是装饰：整个首屏原来一张牌都不露，产品最强的资产（51 张 Riso 插画）
 * 全押在第二屏之后，而首屏下半截是空的 —— 一个塔罗产品的第一印象里没有牌。
 * 点它走的就是 02 那条入口，下面那行是牌堆的真实张数，不是一句广告。
 *
 * 选这三张是为了把这个产品的情绪范围说全：结合、不安、希望。
 * 只挑好牌会变成「一切都会好」——那不是这个产品答应过的事。
 */
const ENTRY_CARDS = ['恋人', '月亮', '星星'] as const;

const SAMPLE = `2026-08-01 09:12 我
在忙吗？今天路过我们上次那家店，居然关门了
2026-08-01 09:24 TA
哦是吗`;

/** 首页的两个入口 */
const DOORS: {
  key: Destination; name: string; line: string;
  Icon: typeof Activity;
}[] = [
  {
    key: 'analysis', name: '恋爱分析', Icon: Activity,
    line: '谁先开口、谁回得慢、谁在提问。全部数出来，不猜。',
  },
  {
    key: 'tarot', name: '真心塔罗', Icon: Sparkles,
    line: '可以直接抽。有分析结果时，牌会绑着那些数字说话。',
  },
];

/**
 * 「记录怎么弄出来」。
 *
 * 这一屏是整条路径上唯一会把真实用户挡死的地方 —— 后面报告、塔罗都建好了，
 * 但人得先把聊天记录弄进来。所以这里的规矩和产品其余部分一样：**不许吹**。
 * 微信在手机上就是导不出来，那就直说导不出来，并告诉他退而求其次的那条路
 * 会少掉哪几项指标，而不是让他粘完才发现报告是半残的。
 */
const HOWTO: { key: string; name: string; best: boolean; steps: string[]; note?: string }[] = [
  {
    key: 'whatsapp', name: 'WhatsApp', best: true,
    steps: [
      '打开和对方的对话',
      '点最上面的联系人名字 → 拉到底「导出聊天」',
      '选「不含媒体文件」，拿到一个 .txt',
      '把这个 .txt 直接拖到下面的框里，不用打开复制',
    ],
    note: '这条路能拿到逐条时间，六项指标全都算得出来。',
  },
  {
    key: 'wechat', name: '微信', best: false,
    steps: [
      '手机上没有导出功能，这是微信的限制，不是这里做不到',
      '电脑版微信里可以框选一段对话直接复制，粘进来试试',
      '或者照着截图敲：每行写「我：」或「TA：」加上内容',
    ],
    note: '手敲的没有逐条时间，「谁先开口」「回复速度」「让你等多久」这三项会标成算不出来。',
  },
  {
    key: 'other', name: '短信 / 其他', best: false,
    steps: [
      '大多没有导出，照着截图敲就行',
      '每行「我：内容」或「对方名字：内容」，一句一行',
    ],
    note: '同上，没有时间的那三项不会出现在报告里。',
  },
];

function HowTo() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="border-y border-ink/15">
      <p className="pb-1 pt-4 text-[11px] text-ink-mid">记录怎么弄出来</p>
      <div className="flex flex-wrap gap-2 pb-3.5 pt-2">
        {HOWTO.map(h => (
          <button
            key={h.key}
            onClick={() => setOpen(v => (v === h.key ? null : h.key))}
            className={`border px-3.5 py-1.5 text-[11px] transition-colors ${
              open === h.key
                ? 'border-ink bg-ink text-paper'
                : 'border-ink/25 text-ink-mid hover:border-ink hover:text-ink'
            }`}
          >
            {h.name}
            {h.best && (
              <span className={`ml-1.5 ${open === h.key ? 'text-paper/70' : 'text-vermilion'}`}>最完整</span>
            )}
          </button>
        ))}
      </div>
      {open && (
        <motion.div
          initial={{ y: -4 }} animate={{ y: 0 }}
          className="border-t border-ink/15 py-4"
        >
          <ol className="space-y-1.5">
            {HOWTO.find(h => h.key === open)!.steps.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-[1.85] text-ink-mid">
                <span className="mt-px font-mono text-[10px] text-ink-faint">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] leading-[1.8] text-ink-faint">
            {HOWTO.find(h => h.key === open)!.note}
          </p>
        </motion.div>
      )}
    </div>
  );
}

/*
 * 首屏第二版块的六行。
 *
 * 这六个名字是从 metrics.ts / coverage.ts 抄过来的**原字**，不是为了排版重写的。
 * 报告里那一行叫什么，这里就叫什么 —— 首页承诺的项和报告里出现的项对不上，
 * 比少说一项更糟。needsTime 那一列同样来自 coverage.ts：
 * 没有逐条时间戳时被抹掉的正好是这四项。
 */
const METRICS: { n: string; label: string; needsTime: boolean }[] = [
  { n: '01', label: '谁在开启对话', needsTime: true },
  { n: '02', label: '回复速度中位数', needsTime: true },
  { n: '03', label: '平均每条字数', needsTime: false },
  { n: '04', label: '提问次数', needsTime: false },
  { n: '05', label: '让 TA 等超过 24 小时', needsTime: true },
  { n: '06', label: '回复速度的变化趋势', needsTime: true },
];

/**
 * 牌墙。
 *
 * 它取代了原来底部那条 104px 高的横带 —— 同样是 51 张，但横带里牌是缩略图，
 * 墙里牌是**地**。这一段的地色是牌背的深紫，牌自己铺满它，
 * 这是整页唯一一处「画比字大」的地方。
 *
 * 图和别处用的是同一批 URL，浏览器缓存复用，不额外多一次网络请求。
 */
const WALL = ILLUSTRATED;

/**
 * 六行指标，点引线在进入视口时从左往右画出来。
 *
 * ⚠️ 只给这一张表，全页没有第二处入场动画。
 *    每一块都 fade-up 会让人在第三屏就学会无视入场 —— 入场是编辑决定，不是默认值。
 *    这里画的正好是「填表」这个动作本身，和这一版块要说的事是同一件事。
 */
function MetricTable() {
  const ref = useRef<HTMLDivElement>(null);
  /*
    ⚠️ 默认是**画好的**，不是空的。
       第一版默认 false，于是这张表在观察器触发之前是六条看不见的线 ——
       观察器因为任何原因不派发（JS 挂了、IO 不存在、渲染管线被挂起），
       内容就永远不出现。和 styles.css 里 fan-card-deal 那条是同一条规矩：
       动画跑不起来的场合，看到的必须是终态而不是空白。
       所以「收起来」这个动作由 JS 主动做，做完了才有资格再放出来。
  */
  const [drawn, setDrawn] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // 已经在视口里的不做入场 —— 对着一个已经看得见的东西播入场，等于第一帧就播完了
    if (el.getBoundingClientRect().top < innerHeight * 0.9) return;

    setDrawn(false);
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setDrawn(true); io.disconnect(); } },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="rh-table" data-drawn={drawn ? '1' : '0'}>
      {METRICS.map((m, i) => (
        <div
          key={m.n}
          className="flex items-baseline gap-4 border-b border-ink/15 py-5 md:gap-6"
          style={{ ['--row' as string]: i }}
        >
          <span className="shrink-0 font-mono text-[11px] tabular-nums tracking-[0.1em] text-vermilion">
            {m.n}
          </span>
          <span className="shrink-0 font-serif text-[16px] font-semibold md:text-[19px]">
            {m.label}
          </span>
          <span className="rh-leader" />
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {m.needsTime ? '需要逐条时间' : '总能算'}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 首屏那三张摊开的牌，跟着指针做纵深视差。
 *
 * ⚠️ 不做 hover 抬升。每张卡都 translateY(-4px) 是「加在所有东西上所以什么都没说」
 *    的那一类动效；这里三张的 gain 不同（0.35 / 1 / 0.55），近的跟得多、远的跟得少，
 *    动的是纵深 —— 那是一副真摊在桌上的牌本来就有的东西。
 *
 * ⚠️ 每帧只写容器上的两个自定义属性，不是三次 style.transform。
 *    行内 transform 会盖掉样式表里的所有规则（:hover 也一样），所以状态走 custom
 *    property 让 CSS 自己读 —— 这是牌堆那次性能事故留下的同一条教训。
 */
function Deck({ onOpen }: { onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const raf = useRef(0);
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const write = () => {
      raf.current = 0;
      el.style.setProperty('--px', target.current.x.toFixed(2));
      el.style.setProperty('--py', target.current.y.toFixed(2));
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      // 归一到 [-1,1] 再乘一个很小的位移上限：视差是暗示纵深，不是把牌甩出去
      const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      target.current = { x: Math.max(-1, Math.min(1, nx)) * 14, y: Math.max(-1, Math.min(1, ny)) * 9 };
      el.dataset.live = '1';
      if (!raf.current) raf.current = requestAnimationFrame(write);
    };
    const onLeave = () => {
      target.current = { x: 0, y: 0 };
      // 松开才让 CSS 过渡接管回弹；跟手时带过渡会变成拖影
      delete el.dataset.live;
      if (!raf.current) raf.current = requestAnimationFrame(write);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <button
      ref={ref}
      onClick={onOpen}
      aria-label="打开真心塔罗"
      className="rh-deck group block w-full"
    >
      <div className="flex items-end justify-center">
        {ENTRY_CARDS.map((name, i) => (
          <span
            key={name}
            className="rh-deck-card -mx-4 sm:-mx-5"
            style={{
              // 中间那张最近：抬得最高、跟手最多
              ['--rot' as string]: (i - 1) * 7,
              ['--drop' as string]: Math.abs(i - 1) * 14,
              ['--gain' as string]: [0.35, 1, 0.55][i],
              /*
                叠序从左往右递增（真实摊牌就是这么压的）。
                让中间那张压最上面会同时盖住右边那张的左下角 —— 罗马数字正好在那儿，
                XVII 会被裁成 II。序号在左下、逆位标记在右下，左压右才不吃掉序号。
              */
              zIndex: i,
            }}
          >
            <TarotCard name={name} size="md" />
          </span>
        ))}
      </div>
      <p className="mt-9 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint transition-colors group-hover:text-vermilion">
        <span className="tabular-nums">牌堆 {ILLUSTRATED.length} 张</span>
        <span className="mx-2">·</span>
        <span>直接抽一张</span>
      </p>
    </button>
  );
}

export default function Entry({
  hasData, onOpen, onReset, onStart, onDemo, saved, onForget, onHistory,
}: EntryProps) {
  const [step, setStep] = useState<'home' | 'paste'>('home');
  const [dest, setDest] = useState<Destination>('analysis');
  const [raw, setRaw] = useState('');
  const [me, setMe] = useState<string | null>(null);
  // 默认不留：保留聊天原文这件事必须是用户主动选的
  const [remember, setRemember] = useState(false);

  const parsed: ParseResult | null = useMemo(
    () => (raw.trim() ? parseChat(raw) : null),
    [raw],
  );
  // 选定「我是谁」之后才能算：算出来只为在进报告之前如实说明样本够不够
  const preview = useMemo(
    () => (parsed && me ? computeRelationshipMetrics(parsed.messages, me) : null),
    [parsed, me],
  );
  const other = parsed?.speakers.find(s => s !== me) ?? '对方';

  /*
    读 .txt。
    WhatsApp 导出的本来就是一个 .txt，现在却要用户打开它、全选、复制、粘贴 ——
    而这一屏已经是整条路径上唯一会把人挡死的地方，没必要再加三步。

    ⚠️ 全程用 File.text() 在本地读，文件不发去任何地方。
       首屏那句「聊天原文不会离开这台设备」是靠这一点成立的，别改成上传。
  */
  /** 存下来的解读条数。只在挂载时读一次 —— 首页不会在原地新增记录 */
  const [pastCount] = useState(() => loadReadings().length);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const readFile = async (file: File) => {
    // 宁可说不认，不要读出一堆乱码再让 parseChat 去猜
    const looksText = /\.(txt|log|csv)$/i.test(file.name) || file.type.startsWith('text/');
    if (!looksText) {
      setFileNote(`${file.name} 不是文本文件。WhatsApp 导出时要选「不含媒体文件」，拿到的才是 .txt`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileNote(`${file.name} 有 ${(file.size / 1024 / 1024).toFixed(1)}MB，太大了。先截一段最近的出来。`);
      return;
    }
    setRaw(await file.text());
    setFileNote(`已读取 ${file.name}`);
  };

  const pick = (d: Destination) => {
    setDest(d);
    // 塔罗不需要聊天记录 —— 没有记录就只有牌意，这是它本来就支持的状态，
    // 而不是一个残缺状态。只有恋爱分析非有记录不可：没有记录它连一个数字都算不出来。
    if (hasData || d === 'tarot') onOpen(d);
    else setStep('paste');
  };

  /*
   * 首屏。
   *
   * 改版前量过：最大字号 36px、最常见正文 9px，display÷body = 4.0 ——
   * 正好踩在「没有尺度对比」的下限上（当前获奖站中位数 8×），
   * 而且 672px 的内容宽挤在 1440 视口正中，两边各死掉 384px。
   * 一个 <section> 都没有，于是也谈不上版块形状的变化。
   *
   * 这一版改的是**尺度和结构**，色值一个都没动 —— 纸、墨、朱红全是 theme.css
   * 的 token，屏幕上唯一的彩色物件仍然只有牌。
   */
  /*
    ⚠️ home 的外层**不给** max-width 和左右 padding。
       宽度由每个版块自己的 rh-wrap 负责 —— 只有这样深紫那两段才能整块出血。
       上一版所有版块共用一个 max-w-6xl 容器，于是五条边线全在 200px，
       页面没有任何东西越得过那条线，这正是「普通」的结构成因。
  */
  return (
    <div className="paper-grain scrollbar-hide relative flex flex-1 flex-col overflow-y-auto bg-paper">
      <div
        className={
          step === 'home'
            ? 'relative z-[1] w-full flex-1'
            : 'relative z-[1] mx-auto w-full max-w-2xl flex-1 px-7 py-12 md:px-14'
        }
      >
        {step === 'home' ? (
          <>
            {/* ───────── 01 · 问句与牌（非对称：字在左，牌压右下） ───────── */}
            <section className="mx-auto w-full max-w-6xl px-7 md:px-14 grid items-end gap-10 pt-12 md:grid-cols-12 md:gap-6">
              <div className="md:col-span-7">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.3em] text-ink-faint">
                  Realheart · 恋爱分析与塔罗
                </p>
                {/*
                  CJK 没有可控的自动断行，所以标题短到能把断点写死。
                  「聊天记录已经回答过了」从标题降级成答句：问句在喊，答句在说，
                  两级之间那道落差就是这一屏的设计。
                */}
                <h1 className="rh-display mt-6">
                  TA到底
                  <br />
                  在不在意你
                </h1>
                <p className="rh-answer mt-7 border-l-[3px] border-vermilion pl-5">
                  聊天记录已经回答过了。
                  <br />
                  只是从来没有人把它数一遍。
                </p>
              </div>

              <div className="md:col-span-5">
                <Deck onOpen={() => pick('tarot')} />
              </div>
            </section>

            {/* ───────── 02 · 牌墙（深紫满幅出血，整页唯一画比字大的地方） ───────── */}
            <section className="rh-ink mt-20 md:mt-32">
              {/* aria-hidden：这一墙是地，不是内容。读屏器念 51 个 alt 是噪音 */}
              <div className="rh-wall" aria-hidden="true">
                {WALL.map(code => (
                  <img key={code} src={`/tarot/${code}.jpg`} alt="" loading="lazy" decoding="async" />
                ))}
              </div>
              <div className="rh-scrim" />
              <div className={`relative mx-auto w-full max-w-6xl px-7 md:px-14 py-24 md:py-32`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-neon-green">
                  {ILLUSTRATED.length} / {TAROT_CARDS.length}
                </p>
                <h2 className="rh-ink-display mt-6 max-w-3xl">
                  这一墙牌，
                  <br />
                  是一张一张画出来的
                </h2>
                <p className="mt-8 max-w-md text-[13.5px] leading-[2] text-paper/70">
                  四种油墨、无脸剪影、丝网印。51 张里有 50 张的天上挂着同一弯月，
                  唯一没有的是太阳那张 —— 它的天顶已经被占了。
                </p>
              </div>
            </section>

            {/* ───────── 03 · 它数哪六项（索引表，不是三栏卡片） ───────── */}
            <section className={`mx-auto w-full max-w-6xl px-7 md:px-14 mt-20 md:mt-32`}>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 border-b-2 border-ink pb-4">
                <h2 className="rh-section-title">它只数这六项</h2>
                <span className="dot-leader" />
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                  逐项可追问
                </span>
              </div>
              <MetricTable />
            </section>

            {/* ───────── 03 · 算不出（满版单句，这是唯一的差异点） ───────── */}
            <section className="mx-auto w-full max-w-6xl px-7 md:px-14 mt-16 border-y-2 border-ink py-10 md:mt-32 md:py-20">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-vermilion">
                它不会做的事
              </p>
              {/*
                这一段是产品唯一真正独有的东西，所以它独占一个版块、独占一种形状。
                数字是查过的：coverage.ts 里没有逐条时间戳时被抹掉的正好是四项。
              */}
              <p className="mt-6 max-w-4xl font-serif text-[clamp(26px,4.2vw,60px)] font-semibold leading-[1.22]">
                六项里有四项，没有逐条时间就<span className="text-vermilion">算不出来</span>。
                它会写「算不出」，不会写 0。
              </p>
              <p className="mt-7 max-w-xl text-[13px] leading-[2] text-ink-mid">
                微信截图和手敲的记录没有时间戳。市面上的分析器照样会给你一个看着很真的分数
                —— 那个分数是拿缺失当 0 算出来的。这里不这么干：算不出的项直接从报告里消失，
                并且告诉你缺的是什么。
              </p>
            </section>

            {/* ───────── 05 · 一张巨大的牌（从账本转进牌的那一步） ───────── */}
            <section className="rh-ink mt-16 md:mt-32">
              <div className={`relative mx-auto w-full max-w-6xl px-7 md:px-14 grid items-center gap-12 py-20 md:grid-cols-12 md:py-28`}>
                <div className="md:col-span-7">
                  <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-neon-green">
                    然后才轮到牌说话
                  </p>
                  {/*
                    ⚠️ 断点写死。第一版交给浏览器自动换行，「剩下的它不知道」
                       在 6 栏（552px）里放不下 76px×7 个字，「道」被甩到第三行。
                       中文没有可控的自动断行，标题一律自己断。
                  */}
                  <h2 className="rh-ink-display mt-6">
                    数字能说的
                    <br />
                    已经说完了
                  </h2>
                  <p className="mt-8 max-w-md text-[13.5px] leading-[2] text-paper/70">
                    牌拿到的只有那几个算好的数字，不是你的聊天原文。
                    它不会替数字下结论，它只是换一个说法把同一批证据讲一遍。
                  </p>
                </div>
                {/* 高塔：全副唯一让荧光绿变成一大块的一张，也是唯一打破居中的 */}
                <div className="md:col-span-5 md:justify-self-end">
                  <img
                    src="/tarot/m16.jpg"
                    alt="高塔"
                    loading="lazy"
                    className="w-full max-w-[420px] rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
                  />
                </div>
              </div>
            </section>

            {/* ───────── 06 · 两个入口（目录式两条） ───────── */}
            <section className={`mx-auto w-full max-w-6xl px-7 md:px-14 mt-16 md:mt-32`}>
              <div className="border-t-2 border-ink">
                {DOORS.map(({ key, name, line, Icon }, i) => (
                  <button
                    key={key}
                    onClick={() => pick(key)}
                    className="group flex w-full items-start gap-5 border-b border-ink/15 py-8 text-left md:gap-8"
                  >
                    <span className="mt-2 font-mono text-[11px] tracking-[0.1em] text-vermilion">
                      0{i + 1}
                    </span>
                    <Icon size={22} className="mt-1.5 shrink-0 text-ink" strokeWidth={1.3} />
                    <span className="min-w-0 flex-1">
                      <span className="rh-section-title block">{name}</span>
                      <span className="mt-3 block max-w-lg text-[13.5px] leading-[1.9] text-ink-mid">
                        {line}
                      </span>
                    </span>
                    <span className="mt-2 inline-flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint transition-colors group-hover:text-vermilion">
                      {key === 'tarot'
                        ? hasData ? '打开' : '直接抽牌'
                        : hasData ? '打开' : '导入记录'}
                      <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                ))}
              </div>

              {saved && (
                <div className="flex items-center gap-3 border-b border-ink/15 py-4">
                  <Check size={14} className="shrink-0 text-ink-faint" />
                  <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-mid">
                    这台设备上存着一份和<span className="text-ink">{saved.otherName}</span>的记录
                    （{new Date(saved.savedAt).toLocaleDateString()} 导入）。
                  </p>
                  <button
                    onClick={onForget}
                    className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-vermilion"
                  >
                    <Trash2 size={12} /> 删掉
                  </button>
                </div>
              )}

              {/* 有历史才显示。空着的入口是噪音 */}
              {pastCount > 0 && (
                <button
                  onClick={onHistory}
                  className="group flex w-full items-baseline gap-3 border-b border-ink/15 py-5 text-left"
                >
                  <span className="font-serif text-[17px] font-semibold">你问过的</span>
                  <span className="dot-leader" />
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint transition-colors group-hover:text-vermilion">
                    {pastCount} 次
                  </span>
                </button>
              )}

              <button
                onClick={() => {
                  if (!hasData) return onDemo('analysis');
                  onReset(); setRaw(''); setMe(null); setStep('paste');
                }}
                className="w-full py-5 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-vermilion"
              >
                {hasData ? '换一份聊天记录' : '还没有记录？先看一份示例'}
              </button>
            </section>

            <footer className="mx-auto w-full max-w-6xl px-7 md:px-14 mt-16 border-t border-ink/15 pt-6 pb-16 md:mt-32">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-faint">
                聊天原文不会离开这台设备
              </p>
            </footer>
          </>
        ) : (
          <>
            {/* 导入流程里的页眉：紧凑版，让位给表单 */}
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-ink-faint">
              Realheart · 恋爱分析与塔罗
            </p>
            <h1 className="mt-3 font-serif text-[26px] font-semibold leading-[1.3]">
              TA到底在不在意你
            </h1>
            <p className="mt-4 max-w-md border-l-2 border-vermilion pl-4 text-[13.5px] leading-[1.95] text-ink-mid">
              聊天记录只在你的浏览器里解析，数字也在本地算完；只有最后那段文字解读，
              会把<span className="text-ink">算好的数字</span>发给模型 —— 聊天原文不会离开这台设备。
            </p>
          </>
        )}

        {/* ---------------- 导入 ---------------- */}
        {step === 'paste' && (
          <motion.div initial={{ y: 12 }} animate={{ y: 0 }} className="mt-10 space-y-4">
            <div className="flex items-baseline gap-2.5 border-b-2 border-ink pb-2">
              <span className="font-mono text-[10px] tracking-[0.1em] text-vermilion">01</span>
              <h2 className="font-serif text-[13px] font-semibold">
                导入后进入 · {DOORS.find(d => d.key === dest)?.name}
              </h2>
            </div>

            <HowTo />

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-ink-mid">
              <button
                onClick={() => fileRef.current?.click()}
                className="border-b border-ink/40 pb-px text-ink transition-colors hover:border-vermilion hover:text-vermilion"
              >
                选一个 .txt 文件
              </button>
              <span className="text-ink-faint">或直接拖进下面的框 · 文件只在本地读，不会上传</span>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.log,.csv,text/plain"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) readFile(f);
                  // 清掉，否则再选同一个文件不会触发 change
                  e.target.value = '';
                }}
              />
            </div>

            {fileNote && (
              <p className="border-l-2 border-ink pl-3.5 font-mono text-[11px] tracking-[0.04em] text-ink-mid">
                {fileNote}
              </p>
            )}

            <div
              className="relative"
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) readFile(f);
              }}
            >
              <textarea
                value={raw}
                onChange={e => setRaw(e.target.value)}
                rows={12}
                spellCheck={false}
                placeholder={`把聊天记录粘贴到这里，例如：\n\n${SAMPLE}`}
                className={`w-full resize-none border bg-paper-raised px-4 py-3.5 font-mono text-[12px] leading-[1.9] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-ink ${
                  dragging ? 'border-vermilion' : 'border-ink/20'
                }`}
              />
              {dragging && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-paper/85">
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-vermilion">
                    松手读取
                  </span>
                </div>
              )}
            </div>

            {parsed && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 border-l-2 border-ink pl-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] tracking-[0.06em]">
                      读出 {parsed.messages.length} 条，{parsed.speakers.length} 个人
                    </p>
                    {parsed.unparsed.length > 0 && (
                      <p className="mt-1 text-[11px] leading-[1.8] text-ink-mid">
                        另有 {parsed.unparsed.length} 行没读懂，已跳过（不会算进任何数字）。
                        第一行是「{parsed.unparsed[0].slice(0, 24)}」
                      </p>
                    )}
                  </div>
                </div>

                {parsed.messages.length > 0 && !parsed.hasTimestamps && (
                  <div className="flex items-start gap-3 border-l-2 border-vermilion/40 pl-3.5">
                    <p className="text-[11px] leading-[1.85] text-ink-mid">
                      这份记录里<span className="text-ink">没有逐条时间</span>，
                      所以「谁在开启对话」「回复速度」「让你等超过 24 小时」这三项算不出来 ——
                      报告里会标成不可计算，不会拿 0 冒充。
                      想要这几项，需要带时间的导出记录。
                    </p>
                  </div>
                )}

                {parsed.speakers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-ink-mid">哪个是你</p>
                    <div className="flex flex-wrap gap-2">
                      {parsed.speakers.map(s => (
                        <button
                          key={s}
                          onClick={() => setMe(s)}
                          className={`border px-4 py-2 text-xs transition-colors ${
                            me === s
                              ? 'border-ink bg-ink text-paper'
                              : 'border-ink/25 text-ink-mid hover:border-ink hover:text-ink'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 样本够不够，在进报告之前就说清楚 */}
            {preview && !preview.sufficient && (
              <div className="flex items-start gap-3 border-l-2 border-ink/25 pl-3.5">
                <p className="text-[11px] leading-[1.85] text-ink-mid">
                  {preview.insufficientReason}。样本不足时不出结论，
                  你仍然可以继续，但报告里会是空的。
                </p>
              </div>
            )}

            {parsed && parsed.messages.length > 0 && (
              <button
                onClick={() => setRemember(v => !v)}
                className="flex w-full items-start gap-3 border-y border-ink/15 py-4 text-left"
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border transition-colors ${
                  remember ? 'border-ink bg-ink' : 'border-ink/35'
                }`}>
                  {remember && <Check size={11} className="text-paper" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px]">把这份记录留在这台设备上</span>
                  <span className="mt-1 block text-[11px] leading-[1.8] text-ink-faint">
                    {remember
                      ? '下次打开不用重新粘。聊天原文会存进这个浏览器，首页随时可以删掉。'
                      : '不留。关掉标签页就没了，下次要重新粘一遍。'}
                  </span>
                </span>
              </button>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setStep('home')}
                className="border border-ink/25 px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mid transition-colors hover:border-ink hover:text-ink"
              >
                返回
              </button>
              <button
                disabled={!parsed?.messages.length || !me}
                onClick={() => me && parsed && onStart(parsed.messages, me, other, dest, remember, parsed.hasTimestamps)}
                className="flex flex-1 items-center justify-center gap-2 bg-ink py-3.5 font-mono text-[10px] uppercase tracking-[0.3em] text-paper transition-opacity disabled:opacity-25"
              >
                进入 <ArrowRight size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
