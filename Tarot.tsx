import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, RotateCw } from 'lucide-react';
import TarotCard, { TarotCardBack, type CardSize } from './TarotCard';
import { parseReading } from './parseReading';
import { saveReading } from './storage';
import { ChatMessage } from './types';
import { TAROT_CARDS } from './cards';
import { ILLUSTRATED } from './illustrated';
import { cardCode } from './TarotArt';
import {
  computeRelationshipMetrics, computeImbalance, IMBALANCE_LABEL,
  RelationshipMetrics, Imbalance,
} from './metrics';

/**
 * 真心塔罗
 *
 * 流程刻意分四步，核心约束是：解读必须落在证据上。
 *   1 提问   2 抽牌（仪式）   3 证据（指标层算出的事实）   4 解读
 *
 * 「证据」这一屏在解读之前出现，是整个设计的关键——先让用户看见事实，
 * 再让牌面去说这些事实，牌就成了外壳而不是玄学来源。
 */

type Step = 'ask' | 'draw' | 'reading';

/**
 * 把流式响应逐段读出来，边到边显示。
 *
 * 服务端返回的是纯文本流：第一个字一两秒就到，而不是等模型写完整段（免费档实测十几秒）。
 * 出错时服务端还没发头，所以仍然是 JSON + 人话，这里照旧解析。
 */
async function readStream(r: Response, onChunk: (all: string) => void) {
  if (!r.ok) {
    const d = await r.json().catch(() => ({} as { error?: string }));
    throw new Error(d.error || `请求失败（${r.status}）`);
  }
  if (!r.body) return (await r.text());
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let all = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    all += dec.decode(value, { stream: true });
    onChunk(all);
  }
  return all;
}

/**
 * 牌阵。
 *
 * 每个牌阵**自带它的格子坐标**，不共用一行 flex。
 * 原因是排版：375px 手机减掉边距只剩 327px，三张 92px 的牌加间距刚好卡满
 * （2+1 折行那个 bug 就是这么来的）。五张一行放不下，十张更不可能，
 * 所以位置必须各自声明落在第几列第几行，由 CSS grid 摆。
 *
 * positions 的**顺序是抽牌顺序**，col/row 只管显示 ——
 * 凯尔特十字里这两者本来就不一致（第 10 张画在右上角，但它是最后抽的）。
 *
 * card 是这个牌阵该用多大的牌：列数越多牌越小，否则横着放不下。
 * fluid 的牌宽度交给格子，只保持 2:3，所以任何列数在任何屏宽都不会溢出。
 */
export interface SpreadPos {
  key: string;
  label: string;
  hint: string;
  col: number;
  row: number;
  /** 凯尔特十字的第 2 张：横压在第 1 张上面，这是这个牌阵的签名 */
  cross?: boolean;
}

export interface Spread {
  key: string;
  name: string;
  /** 选牌阵时那一行说明 */
  note: string;
  cols: number;
  rows: number;
  card: CardSize;
  /**
   * 每列的像素预算，决定整个牌阵有多宽、牌有多大。
   * 列数越多这个值越小 —— 否则 10 张牌在桌面上会堆到近 900px 高，得缩放才看得全。
   */
  colWidth: number;
  positions: SpreadPos[];
}

export const SPREADS: Spread[] = [
  {
    key: 'one', name: '一张牌', note: '一个问题，一张牌',
    cols: 1, rows: 1, colWidth: 210, card: 'lg',
    positions: [
      { key: 'now', label: '此刻', hint: '你问的这件事，现在是什么样', col: 1, row: 1 },
    ],
  },
  {
    key: 'three', name: '三张牌', note: '起因 · 现状 · 走向',
    cols: 3, rows: 1, colWidth: 150, card: 'md',
    positions: [
      { key: 'past', label: '起因', hint: '这段关系是怎么走到今天的', col: 1, row: 1 },
      { key: 'present', label: '现状', hint: '此刻真正在发生什么', col: 2, row: 1 },
      { key: 'future', label: '走向', hint: '照这个模式下去会怎样', col: 3, row: 1 },
    ],
  },
  {
    /*
      关系牌阵是这几个里**唯一能和 metrics.ts 对上**的：
      那边算出来的每一项都是「我 vs TA」的一对数（开启占比、回复中位数、每条字数……），
      而这个牌阵正好有「你」和「TA」两个独立位置。通用牌阵没有这个性质。
    */
    key: 'love', name: '关系牌阵', note: '你 · TA · 你们之间 · 挡在中间的 · 走向',
    cols: 3, rows: 3, colWidth: 140, card: 'md',
    positions: [
      { key: 'me', label: '你', hint: '你在这段关系里是什么状态', col: 1, row: 1 },
      { key: 'other', label: 'TA', hint: 'TA 在这段关系里是什么状态', col: 3, row: 1 },
      { key: 'between', label: '你们之间', hint: '你们之间实际在发生什么', col: 2, row: 2 },
      { key: 'block', label: '挡在中间的', hint: '是什么卡住了', col: 1, row: 3 },
      { key: 'trend', label: '走向', hint: '照这个模式下去会怎样', col: 3, row: 3 },
    ],
  },
  {
    /*
      ⚠️ 凯尔特十字是按要求加的，我提过不推荐：10 张在手机上排版极紧，
         而且它是「深度占卜」的形状，和这个产品「证据导向、不玄学」的立场相反。
         保留这段注释是为了让后来的人知道这是个**已经权衡过的决定**，不是顺手加的。
      左边三列是十字，第四列是竖着那根「杖」。
    */
    key: 'celtic', name: '凯尔特十字', note: '10 张 · 完整牌阵，手机上牌会比较小',
    cols: 4, rows: 4, colWidth: 106, card: 'sm',
    positions: [
      { key: 'now', label: '现况', hint: '事情现在的样子', col: 2, row: 2 },
      { key: 'cross', label: '阻碍', hint: '横在前面的是什么', col: 2, row: 2, cross: true },
      { key: 'root', label: '根源', hint: '底下埋着什么', col: 2, row: 3 },
      { key: 'past', label: '过去', hint: '刚过去的那一段', col: 1, row: 2 },
      { key: 'crown', label: '可能', hint: '你心里想的那个结果', col: 2, row: 1 },
      { key: 'future', label: '未来', hint: '接下来会走到哪', col: 3, row: 2 },
      { key: 'self', label: '你自己', hint: '你在这件事里的位置', col: 4, row: 4 },
      { key: 'around', label: '周围', hint: '别人和环境的影响', col: 4, row: 3 },
      { key: 'hope', label: '期待与恐惧', hint: '你最盼的和最怕的', col: 4, row: 2 },
      { key: 'result', label: '结果', hint: '这条线走到头的样子', col: 4, row: 1 },
    ],
  },
];

const PRESET_QUESTIONS = [
  'TA到底还在意我吗',
  '我是不是在自我消耗',
  '这段关系值不值得继续',
  '我该主动还是该退回来',
];

/**
 * 报告指出的主要失衡来源 → 一个直接对着它的问题。
 * 塔罗是跟着恋爱分析来的：报告已经指出问题在哪，选题就不该从零开始问。
 *
 * ⚠️ 措辞必须只说指标真正测到的东西。
 *    `latency` 测的是「回得慢」（中位数差距），不是「越来越慢」——
 *    后者是另一个指标 otherLatencyTrendPct，样本常常不足。
 *    问题里塞进一个数据不支持的前提，模型就会顺着那个前提编下去。
 */
const DRIVER_QUESTION: Record<string, string> = {
  initiation: '为什么每次都是我先开口',
  latency: 'TA为什么总是隔很久才回',
  length: 'TA是不是在敷衍我',
  questions: 'TA到底想不想了解我',
};

/** 只有趋势指标真的成立时，才敢问「越来越慢」 */
const TREND_QUESTION = 'TA是不是在慢慢退出';

/**
 * 牌堆的几何：**一个圆盘**，不是扇形。
 *
 * 为什么不是扇形 —— 这是一路踩过来才看清的：
 * 51 张摊在 70° 的弧上，每张只能露 9.9px；摊在 360° 的整圆上，每张露 51px。
 * 同样的半径，圆盘的周长是扇形弧长的 5 倍。
 * 之前一直在跟「每张只露 2.9px」较劲（先加牌缘、又改竖弧），
 * 而根本原因是那个形状只占整圆的 1/5。
 *
 * 丢掉的东西要如实记一笔：**摊成扇形是塔罗师的手势，圆盘不是**。
 * 换掉它的理由是扇形当时也没真的在表演那个手势 —— 露 9px 看着是一把梳子。
 *
 * 代码也因此简单了一大截：不再需要支点百分比、inset、两套轴，
 * 就是绕容器中心转一圈。r 是牌心到圆心的距离，按各档屏宽给死：
 *   外径 = r + 牌高/2，容器得装得下这个外径的两倍。
 */
/** 圆盘半径的上下限。上限是别让牌稀疏到不像一叠，下限是再小就挤成一坨 */
const RING_R = { min: 56, max: 150 } as const;

/**
 * 由可用宽度反算牌心半径。
 *
 * 固定半径服务不了所有屏宽：375px 手机塞不下桌面那个盘，320px 手机连 94 都塞不下。
 * 外接角在 hypot(R + 牌高/2, 牌宽/2) 处，令它等于可用半宽，反解出 R。
 */
function ringRadius(available: number) {
  const half = available / 2;
  const inner = Math.sqrt(Math.max(0, half * half - (FAN_CARD.w / 2) ** 2)) - FAN_CARD.h / 2;
  return Math.max(RING_R.min, Math.min(RING_R.max, inner));
}

/**
 * 扇形里那张牌的像素尺寸。跟着 TarotCard 的 SIZE.sm 走：w-[92px] + aspect-[2/3]。
 * 写死在这里是因为命中判定要用它算支点位置，而 sm 这一档本来就不是响应式的。
 */
const FAN_CARD = { w: 92, h: 138 } as const;


/**
 * 牌堆只放有插画的牌。
 *
 * 55 张小阿卡纳还没出图，走矢量线稿。线稿再怎么对齐母样式也不是同一套牌，
 * 三张里混进一张就会显得整副牌不齐。宁可只用 23 张真图 ——
 * 大阿卡纳牌阵本身就是正经的塔罗实践。出完图把 code 加进 illustrated.ts 即可。
 */
const DECK = TAROT_CARDS.filter(c => ILLUSTRATED.includes(cardCode(c.name)));

/** 洗牌后抽 n 张不重复的牌，各自随机正逆位 */
function drawCards(n: number) {
  const pool = [...DECK];
  const out: { name: string; reversed: boolean }[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push({ name: pool[idx].name, reversed: Math.random() < 0.4 });
    pool.splice(idx, 1);
  }
  return out;
}

/** 分钟 → 人话。事实要一眼读懂，「1540 分钟」不是给人看的 */
function humanMinutes(min: number): string {
  if (min < 60) return `${min} 分钟`;
  if (min < 60 * 24) {
    const h = min / 60;
    return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} 小时`;
  }
  const d = min / 1440;
  return `${d < 10 ? d.toFixed(1).replace(/\.0$/, '') : Math.round(d)} 天`;
}

/** 变化幅度：超过一倍就用倍数说，「慢了 2120%」没人能瞬间换算 */
function humanChange(pct: number): string {
  const abs = Math.abs(pct);
  return abs >= 100 ? `${(abs / 100 + 1).toFixed(1).replace(/\.0$/, '')} 倍` : `${abs}%`;
}

/** 把指标翻译成一行一句的事实陈述——不解读，只陈述 */
function factsFrom(m: RelationshipMetrics, otherName: string): string[] {
  if (!m.sufficient) return [];
  const f: string[] = [];
  if (m.myInitiationShare !== null) {
    f.push(`${Math.round(m.myInitiationShare * 100)}% 的对话是你开启的`);
  }
  if (m.me.medianReplyMinutes !== null && m.other.medianReplyMinutes !== null) {
    // metrics.ts 把「隔夜才接话」算作重新发起、不计进延迟，所以这个中位数只覆盖同一段对话内的回复。
    // 不加这句限定，它会和下面「让你等了超过 24 小时」看起来自相矛盾。
    f.push(`同一段对话里，你的回复中位数 ${humanMinutes(m.me.medianReplyMinutes)}，${otherName}是 ${humanMinutes(m.other.medianReplyMinutes)}`);
  }
  if (m.lengthRatio !== null && m.lengthRatio > 1.5) {
    f.push(`你平均每条 ${m.me.avgLength} 字，对方 ${m.other.avgLength} 字`);
  }
  if (m.me.questionCount > 0 && m.other.questionCount * 2 < m.me.questionCount) {
    f.push(`你提问 ${m.me.questionCount} 次，对方 ${m.other.questionCount} 次`);
  }
  if (m.other.leftOtherWaiting > 0) {
    f.push(`对方有 ${m.other.leftOtherWaiting} 次让你等了超过 24 小时`);
  }
  if (m.otherLatencyTrendPct !== null && Math.abs(m.otherLatencyTrendPct) > 20) {
    const dir = m.otherLatencyTrendPct > 0 ? '慢' : '快';
    f.push(`对方回复速度比前半段${dir}了 ${humanChange(m.otherLatencyTrendPct)}`);
  }
  return f;
}

interface TarotProps {
  /** 要解读的会话消息；没有就只能抽牌，不出证据 */
  messages?: ChatMessage[];
  myUid?: string;
  otherName?: string;
  /**
   * 恋爱分析已经算好的结果。塔罗跟着报告走 ——
   * 传进来就用报告那一份，保证两屏说的是同一件事；不传才自己算（独立使用时）。
   */
  metrics?: RelationshipMetrics;
  imbalance?: Imbalance;
  onBack?: () => void;
}

/**
 * 解读的正文 —— **「一份证据，两种看法」第一次同屏**。
 *
 * 左边是牌的说法，右边紧挨着它挂的那条数字。同一件事，两种讲法，并排摆着。
 * 在这之前两种看法是两个先后访问的页面，你永远看不到它们对照 ——
 * 那个想法只活在 README 的一句话里。
 *
 * 窄屏放不下两栏就退成上下，证据在下面用一道朱红竖线带住，关系不丢。
 */
function ReadingBody({
  text, positions, facts,
}: { text: string; positions: readonly string[]; facts: string[] }) {
  const parsed = useMemo(() => parseReading(text, positions), [text, positions]);

  // 认不出结构就原样显示。硬切错位比不切难看得多，也更容易骗到人（见 parseReading.ts）
  if (!parsed) {
    return <p className="whitespace-pre-wrap text-[14px] leading-[2]">{text}</p>;
  }

  return (
    <div className="space-y-7">
      {parsed.intro && (
        <p className="whitespace-pre-wrap text-[13px] leading-[1.9] text-ink-mid">{parsed.intro}</p>
      )}

      {parsed.blocks.map((b, i) => {
        // 模型偶尔会引一条不存在的编号，越界的直接丢掉，不显示空行
        const cited = b.facts
          .map(n => ({ n, text: facts[n - 1] }))
          .filter(f => !!f.text);
        return (
          <article key={i} className="border-t border-ink/15 pt-6 first:border-t-0 first:pt-0">
            <div className="sm:grid sm:grid-cols-[1fr_15rem] sm:gap-8">
              <div>
                <p className="font-serif text-[16px] font-semibold leading-snug">{b.heading}</p>
                <p className="mt-3 whitespace-pre-wrap text-[14px] leading-[2]">{b.body}</p>
              </div>

              {cited.length > 0 && (
                /*
                  证据这一侧全部走等宽 —— 它是「算出来的」那一种声音，
                  和左边模型写的那段在材质上就分得开，不用贴标签说明。
                */
                <aside className="mt-5 space-y-3 border-l-2 border-vermilion pl-4 sm:mt-1 sm:border-l sm:border-ink/25">
                  {cited.map(f => (
                    <div key={f.n}>
                      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-vermilion">
                        证据 {String(f.n).padStart(2, '0')}
                      </p>
                      <p className="mt-2 font-mono text-[12px] leading-[1.85] tabular-nums text-ink">
                        {f.text}
                      </p>
                    </div>
                  ))}
                </aside>
              )}
            </div>
          </article>
        );
      })}

      {parsed.outro && (
        <p className="whitespace-pre-wrap border-t border-ink/15 pt-6 text-[14px] leading-[2]">
          {parsed.outro}
        </p>
      )}
    </div>
  );
}

export default function Tarot({
  messages = [], myUid = '', otherName = '对方',
  metrics: metricsProp, imbalance: imbalanceProp, onBack,
}: TarotProps) {
  const [step, setStep] = useState<Step>('ask');
  const [question, setQuestion] = useState('');
  /** 选中的牌阵。默认三张 —— 它是这个产品原本绑定的形状，也是报头写着的那个 */
  const [spreadKey, setSpreadKey] = useState('three');
  // 牌堆摊在桌上，由用户自己点；drawn 是他挑走的那三张，不再由系统发
  const [fan, setFan] = useState<{ name: string; reversed: boolean }[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [shuffling, setShuffling] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [loadingReading, setLoadingReading] = useState(false);
  // 重试的触发器。不能靠 setStep('reading') —— 值没变，effect 不会重跑
  const [attempt, setAttempt] = useState(0);

  const metrics = useMemo(
    () => metricsProp ?? computeRelationshipMetrics(messages, myUid),
    [metricsProp, messages, myUid],
  );
  const imbalance = useMemo(
    () => imbalanceProp ?? computeImbalance(metrics),
    [imbalanceProp, metrics],
  );
  /** 报告的一句话结论。证据屏和解读都挂在它上面 */
  const verdict = useMemo(() => {
    if (!metrics.sufficient) return null;
    const lean = imbalance.leaning === 'me' ? '你投入得更多'
      : imbalance.leaning === 'other' ? `${otherName}投入得更多` : '大致持平';
    return {
      score: imbalance.score,
      band: IMBALANCE_LABEL[imbalance.band],
      lean,
      driver: imbalance.topDriver?.label ?? null,
    };
  }, [metrics.sufficient, imbalance, otherName]);
  /** 报告指出问题在哪，选题就从那里开始 */
  const presets = useMemo(() => {
    const seeded: string[] = [];
    const byDriver = imbalance.topDriver && DRIVER_QUESTION[imbalance.topDriver.key];
    if (byDriver) seeded.push(byDriver);
    // 「他是不是在退出」只在趋势指标真的算得出、且确实变慢时才问
    if ((metrics.otherLatencyTrendPct ?? 0) > 20) seeded.push(TREND_QUESTION);
    return seeded.length
      ? [...seeded, ...PRESET_QUESTIONS.filter(q => !seeded.includes(q))].slice(0, 4)
      : PRESET_QUESTIONS;
  }, [imbalance.topDriver, metrics.otherLatencyTrendPct]);
  const facts = useMemo(() => factsFrom(metrics, otherName), [metrics, otherName]);
  const drawn = useMemo(() => picked.map(i => fan[i]).filter(Boolean), [picked, fan]);

  // 扇形的弧宽得跟着屏幕走：手机上照桌面的角度扇会直接溢出屏幕
  /*
    媒体查询的 wide / side 两个 state 删掉了：
    半径改成由实测宽度反算之后，JS 侧不再需要知道「现在是哪一档屏幕」——
    两栏布局是纯 CSS（lg:flex），圆盘大小跟着容器走。少两个订阅、少两次重渲染。
  */
  /*
    圆盘按**实测可用宽度**定半径，不写死。
    ResizeObserver 盯着外层那个满宽的壳子（不是盘本身 —— 盘的尺寸由 R 决定，
    盯它自己会绕成循环）。
  */
  const ringWrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = ringWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWrapW(e.contentRect.width));
    ro.observe(el);
    setWrapW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [step, shuffling]);
  /** 牌心到圆心的距离 */
  const R = ringRadius(wrapW || 320);

  /*
    牌阵和它的张数。以前这两样写死成 POSITIONS 和字面量 3，
    散落在 8 个地方（抽满的判断、翻完的判断、三处文案、两处布局）。
    现在只有这一个来源 —— 加牌阵不用再去找那 8 处。
  */
  const spread = useMemo(
    () => SPREADS.find(s => s.key === spreadKey) ?? SPREADS[1],
    [spreadKey],
  );
  const need = spread.positions.length;
  /** 解析解读用的位置名。身份要稳定，否则 ReadingBody 里的 useMemo 每次都白做 */
  const positionLabels = useMemo(() => spread.positions.map(p => p.label), [spread]);

  /**
   * 滑动选牌。
   *
   * 手机上每张牌只露 2.9px（51 张铺在 374px 的弧上，几何上限，材质救不了）。
   * 靠点是选不准的，所以改成**指尖扫过**：手指划到哪张，哪张就升到最上面并抬起来，
   * 整张牌背露出来，松手就是选它。
   *
   * ⚠️ 命中判定**不能用 document.elementFromPoint**。
   *    被选中的牌会抬起 30px —— 一抬起来就从手指底下挪开了，
   *    命中目标随之改变、牌落回去、又被命中……来回抖。
   *    改成纯几何：牌全都绕同一个支点转，那么「手指相对支点的角度」直接就是牌的角度，
   *    反解出序号即可。这个算法不读任何牌的位置，所以抬起来也不会反馈回来。
   */
  const fanBoxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  /** 51 张牌的 DOM。滑动时直接改它们的 style，不经过 React */
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /*
    手指底下是第几张 —— **故意不是 state**。

    上一版它是 state，于是每次移动都要重渲染 51 个 motion 组件，
    再由 51 个 JS 弹簧逐帧写 transform。牌堆是这个界面里唯一会同时动几十个元素的
    地方，motion 那点编排能力在这里换不回代价。

    现在：序号存 ref，变化时只动受影响的那几张的行内 style，
    React 在整个滑动过程中一次都不重渲染。
  */
  const focusRef = useRef<number | null>(null);
  /** 发牌散开播完没有。播的时候 CSS 动画压着 transform，这时候改行内值会在动画结束时跳一下 */
  const dealtRef = useRef(false);

  /** 拨开的窗口：窗口外的牌 part 恒为 0，一个字节都不用碰 */
  const PART_WINDOW = 3;
  const LIFT = 30;

  const angleOf = (i: number) =>
    fan.length > 1 ? (360 * i) / fan.length : 0;

  /**
   * 第 i 张牌在「focus 是第 f 张」时该摆成什么样。
   * 首次渲染的行内 transform 和滑动时写进去的，必须出自这同一个函数 ——
   * 两份公式迟早会差一点，差出来就是滑动开始时的一次跳动。
   */
  const cardTransform = (i: number, f: number | null) => {
    const on = f === i;
    /*
      手指底下那张之外，左右邻居往两边让一点，做出「拨开」的手感。

      ⚠️ 幅度必须拿「每张牌占多少度」来量。51 张铺 40°，一张只占 0.8°。
         第一版给了 4°，等于把最近的邻居推开 5 张的距离，扇形被撕出一个口子。
         1.2° 约等于一张半，才是「让开」。
    */
    const part = f === null || on
      ? 0
      : Math.sign(i - f) * 1.2 * Math.max(0, 1 - Math.abs(i - f) / PART_WINDOW);
    /*
      径向排布：先把牌摆到容器正中，绕自身中心转到该去的方向，再沿着**转过之后的
      「上」**推出 R —— 于是牌自然朝外，抬起也只是把 R 加大一点，方向自动是往外的。

      顺序不能换：translateY 必须在 rotate 之后，才是「在牌自己的坐标系里往外」。
      写在 rotate 前面就变成屏幕坐标系的正上方，下半圈的牌会往圆心里缩。
    */
    return `translate(-50%, -50%) rotate(${(angleOf(i) + part).toFixed(3)}deg) translateY(${-(R + (on ? LIFT : 0))}px)`;
  };

  /**
   * 换一张 focus。**只碰新旧焦点各自窗口内的那几张**，最多 14 个元素，
   * 其余 37 张一个字节都不动。
   */
  const applyFocus = (next: number | null) => {
    const prev = focusRef.current;
    if (prev === next || !dealtRef.current) return;
    focusRef.current = next;
    const touched = new Set<number>();
    for (const c of [prev, next]) {
      if (c === null) continue;
      for (let d = -PART_WINDOW; d <= PART_WINDOW; d++) {
        const j = c + d;
        if (j >= 0 && j < fan.length) touched.add(j);
      }
    }
    for (const j of touched) {
      const el = cardRefs.current[j];
      if (!el) continue;
      el.style.transform = cardTransform(j, next);
      /*
        「露出整张牌」只能靠 z-index —— 靠把邻居转开需要约 24° 才让得出一张牌的宽度，
        那等于把整个扇形拆了。
      */
      el.style.zIndex = String(j === next ? fan.length + 1 : j);
    }
  };

  const indexAt = (clientX: number, clientY: number): number | null => {
    const box = fanBoxRef.current;
    if (!box || fan.length < 2) return null;
    const r = box.getBoundingClientRect();
    /*
      圆心就是容器正中，所以「手指相对圆心的方向」直接就是牌的角度，反解出序号。
      这个算法不读任何牌的位置，所以牌被推出来也不会反馈回来把命中目标带跑。

      0° 是正上方，顺时针为正 —— 和 cardTransform 里 rotate 的方向必须一致。
    */
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    // 圆心附近方向是没意义的（半径越小角度抖得越厉害），太靠里就不认
    if (dist < R * 0.35) return null;
    let deg = Math.atan2(clientX - cx, cy - clientY) * (180 / Math.PI);
    if (deg < 0) deg += 360;                         // 归一到 [0,360)
    const step = 360 / fan.length;
    const raw = Math.round(deg / step) % fan.length;
    // 已经抽走的牌在圈上留了空档，就近找一张还在的。环形要绕回去，不是夹在两端
    for (let d = 0; d < fan.length; d++) {
      for (const j of [(raw - d + fan.length) % fan.length, (raw + d) % fan.length]) {
        if (!picked.includes(j)) return j;
      }
    }
    return null;
  };

  /*
    不再需要 rAF 节流：applyFocus 现在只是几次行内赋值，
    而 transform / z-index 都不会让布局失效，所以 getBoundingClientRect 读的是缓存值。
    顺带一个好处 —— 这条路径彻底不依赖 rAF，在动画被节流的环境里照样能选牌。
  */
  const trackPointer = (e: React.PointerEvent) => applyFocus(indexAt(e.clientX, e.clientY));

  const startDraw = () => {
    setShuffling(true);
    setFan([]);
    setPicked([]);
    setRevealed([]);
    dealtRef.current = false;
    focusRef.current = null;
    setStep('draw');
    // 洗牌的 900ms 是刻意留的：仪式感来自等待
    setTimeout(() => {
      // 整副都摊上去，一次铺完 —— 十几张看着不像一副牌
      setFan(drawCards(DECK.length));
      setShuffling(false);
      // CSS 发牌动画 560ms + 最大 0.55s 延迟。播完之前不许改行内 transform，
      // 否则动画结束时会从关键帧的终点跳到新值
      setTimeout(() => { dealtRef.current = true; }, 1200);
    }, 900);
  };

  /** 从牌堆里挑一张，落到下一个空位。已挑过的、或已经抽满这个牌阵的，都不再响应 */
  const pick = (i: number) => {
    // 先把邻居归位：被抽走那张的左右还停在「让开」的角度上，不复位就留下一道歪缝
    applyFocus(null);
    setPicked(prev => (prev.includes(i) || prev.length >= need ? prev : [...prev, i]));
  };

  // 必须用函数式更新：连点两张牌时，第二次点击拿到的 revealed 还是旧值，
  // 直接 [...revealed, i] 会丢掉前一张，流程就永远凑不满三张。
  const reveal = (i: number) =>
    setRevealed(prev => (prev.includes(i) ? prev : [...prev, i]));

  // 三张都翻开后再进解读，留 900ms 让最后一张翻完
  useEffect(() => {
    if (revealed.length < need) return;
    const t = setTimeout(() => setStep('reading'), 900);
    return () => clearTimeout(t);
  }, [revealed.length, need]);

  // 解读只在服务端生成：客户端不持有 GEMINI_API_KEY
  useEffect(() => {
    if (step !== 'reading' || reading || loadingReading) return;
    let cancelled = false;
    setLoadingReading(true);
    setReadingError(null);
    fetch('/api/tarot/reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        cards: drawn.map((c, i) => ({ ...c, position: spread.positions[i].label })),
        facts,
        // 报告的结论一并带上：牌可以换个说法，但不能和恋爱分析打架
        verdict,
      }),
    })
      // 边到边显示：不等整段写完
      .then(r => readStream(r, all => { if (!cancelled) setReading(all); }))
      .then(all => {
        /*
          写完才存，不存流到一半的半句话。

          存下来是这个产品最初那个挫败的解药：拿聊天记录去问 ChatGPT，
          问题不是它答得不好，是新开一个会话就全忘了 —— 而这个应用之前
          一模一样（reset() 里一句 setReading(null) 就没了）。
          连当时的失衡度和证据一起存，因为三个月后再看，变化才是那条最硬的信息。
        */
        if (cancelled || !all?.trim()) return;
        saveReading({
          question,
          spread: spread.name,
          cards: drawn.map((c, i) => ({ ...c, position: spread.positions[i].label })),
          text: all,
          facts,
          imbalance: metrics.sufficient
            ? { score: imbalance.score, band: IMBALANCE_LABEL[imbalance.band] }
            : null,
        });
      })
      .catch(e => { if (!cancelled) setReadingError(e.message); })
      .finally(() => { if (!cancelled) setLoadingReading(false); });
    return () => { cancelled = true; };
  }, [step, attempt]);

  const reset = () => {
    setStep('ask');
    setQuestion('');
    dealtRef.current = false;
    focusRef.current = null;
    setFan([]);
    setPicked([]);
    setRevealed([]);
    setReading(null);
    setReadingError(null);
  };

  return (
    <div className="paper-grain relative flex flex-1 flex-col overflow-y-auto scrollbar-hide bg-paper">
      {/*
        抽牌这一步在宽屏是两栏（牌阵 + 圆盘牌堆），3xl 装不下：
        768 − 内边距 96 − 牌堆 440 − 间距 40 = 192，凯尔特十字本该 424，被压掉一半。
        只有这一步放宽，提问和解读仍然是适合阅读的 3xl 单栏宽度。
      */}
      <div className={`relative z-[1] mx-auto w-full flex-1 px-7 pt-8 pb-24 md:px-12 ${
        step === 'draw' ? 'max-w-3xl lg:max-w-5xl' : 'max-w-3xl'
      }`}>
        {/* 报头和恋爱分析同一套：这是同一份印刷品的两页 */}
        <header className="mb-8">
          <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-2.5">
            <div className="flex items-center gap-2">
              {/* 首屏独立运行时没有可返回的地方，就不画一个按不动的按钮 */}
              {!(step === 'ask' && !onBack) && (
                <button
                  onClick={step === 'ask' ? onBack : reset}
                  aria-label={step === 'ask' ? '返回' : '重新开始'}
                  className="-ml-1.5 rounded p-1 text-ink-faint transition-colors hover:text-ink"
                >
                  <ArrowLeft size={17} />
                </button>
              )}
              <h1 className="font-serif text-[21px] font-semibold tracking-[0.02em]">真心塔罗</h1>
            </div>
            <p className="text-right font-mono text-[9px] leading-[1.7] tracking-[0.13em] text-ink-mid">
              REALHEART TAROT
              <br />
              {/*
                只写名字和张数。位置列表放不进报头 ——
                「关系牌阵 · 你 · TA · 你们之间 · 挡在中间的 · 走向」会把「真心塔罗」挤成两行。
                完整的位置说明在选牌阵那一格里，那里有地方。
              */}
              {spread.name} · {need} 张
            </p>
          </div>
          {/* 步骤：走到哪一步就点亮到哪一步 */}
          <div className="flex items-center gap-2 pt-2.5">
            {(['ask', 'draw', 'reading'] as Step[]).map((st, i) => {
              const done = (['ask', 'draw', 'reading'] as Step[]).indexOf(step) >= i;
              return (
                <React.Fragment key={st}>
                  {i > 0 && <div className={`h-px w-6 ${done ? 'bg-vermilion/60' : 'bg-ink/20'}`} />}
                  <span className={`font-mono text-[8.5px] uppercase tracking-[0.2em] ${done ? 'text-vermilion' : 'text-ink-faint'}`}>
                    {['question', 'draw', 'reading'][i]}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </header>

        <div className="relative flex-1">
          {/* ---------------- 1 提问 ---------------- */}
          {step === 'ask' && (
            <motion.div
              key="ask"
              initial={{ y: 12 }} animate={{ y: 0 }}
              className="space-y-8"
            >
              {/*
                选牌阵。放在提问之前：先定形状，再定问题 ——
                一张牌和十张牌该问的问题不是一回事。
                用和预设问题同一套细线网格，不新引入一种控件形状。
              */}
              <div>
                <p className="pb-2 text-[12.5px] text-ink-mid">用哪个牌阵</p>
                <div className="grid grid-cols-2 gap-px border border-ink/15 bg-ink/15">
                  {SPREADS.map(sp => (
                    <button
                      key={sp.key}
                      onClick={() => setSpreadKey(sp.key)}
                      className={`px-3 py-3 text-left transition-colors ${
                        sp.key === spreadKey
                          ? 'bg-ink text-paper'
                          : 'bg-paper hover:bg-paper-raised'
                      }`}
                    >
                      <span className="block font-serif text-[15px] font-semibold">{sp.name}</span>
                      <span className={`mt-1 block text-[11px] leading-snug ${
                        sp.key === spreadKey ? 'text-paper/70' : 'text-ink-faint'
                      }`}>{sp.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="border-b-[1.5px] border-ink/70 pb-2.5 font-serif text-[20px] font-semibold tracking-[0.01em] sm:text-[23px]">
                  你想弄清楚什么
                </h2>
                <p className="mt-4 text-[13.5px] leading-[1.9] text-ink-mid">
                  牌只负责把话说出来。真正的答案来自你们之间已经发生的事。
                </p>
              </div>

              <div className="relative">
                {/*
                  不再是一个带边框的浅色方盒 —— 那是通用表单控件的形状，
                  一出现就把整页攒的编辑感抵消掉。这里只留一道书写线：
                  和章节标题下那根线、报告里的点引线是同一套东西。
                  16px 不只是为了层级，也是 iOS 上聚焦不触发自动放大的下限。
                */}
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  rows={2}
                  placeholder="把问题写清楚一点，越具体越准"
                  className="w-full resize-none border-x-0 border-t-0 border-b-[1.5px] border-ink/30 bg-transparent px-0 py-2 text-[16px] leading-[1.9] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-vermilion"
                />
              </div>

              <div className="space-y-2">
                <p className="text-[11px] text-ink-mid">或者从这些开始</p>
                {/*
                  原来是 flex-wrap，四条问题长短不一 → 两列右边缘参差、行高不齐，
                  看着像没排完。presets 恒为 4 条（见 PRESET_QUESTIONS / slice(0,4)），
                  所以直接用 2×2 细线网格：等宽、对齐，和报告页的表格是同一套语言。
                  gap-px + 底色 = 网格线，不用给每个格子画边框。
                */}
                <div className="grid grid-cols-2 gap-px border border-ink/15 bg-ink/15">
                  {presets.map(q => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className={`px-3 py-3.5 text-center text-xs leading-snug transition-colors ${
                        question === q
                          ? 'bg-ink text-paper'
                          : 'bg-paper text-ink-mid hover:bg-paper-raised hover:text-ink'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* 证据可用性——诚实地先说清楚 */}
              <div className={`border-l-2 pl-3.5 ${metrics.sufficient ? 'border-ink' : 'border-vermilion/40'}`}>
                <div className="flex-1 min-w-0">
                  {/*
                    一条记录都没接的人和记录太短的人，要分开说。
                    对前者写「消息仅 0 条，不足 20 条」是在报一个他没犯的错 ——
                    他压根没打算导入，独立抽牌本来就是塔罗支持的用法。
                  */}
                  <p className="font-mono text-[11px] tracking-[0.06em]">
                    {metrics.sufficient
                      ? `已读取 ${metrics.totalMessages} 条记录，跨 ${metrics.spanDays} 天`
                      : metrics.totalMessages === 0 ? '这次只有牌意' : '证据不足'}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-[1.9] text-ink-mid">
                    {verdict
                      ? `恋爱分析的结论是「${verdict.band}·${verdict.lean}」${verdict.driver ? `，主要来自「${verdict.driver}」` : ''}。牌只会换个说法说这件事。`
                      : metrics.totalMessages === 0
                      ? '还没有接入聊天记录，牌就只有牌意，说不出你们之间的任何事实。想让它绑着你的数字说话，先做一份恋爱分析。'
                      : `${metrics.insufficientReason}。仍然可以抽牌，但只有牌意，没有事实支撑。`}
                  </p>
                </div>
              </div>

              <button
                onClick={startDraw}
                disabled={!question.trim()}
                /*
                  禁用态原来是 disabled:opacity-25 —— 一整块黑填充降到 25%，
                  在纸底上就是一块大灰板，而它是屏幕上最大的元素。
                  改成描边态：没填问题时只有一道细线，填了才落成实心墨块。
                */
                className="flex w-full items-center justify-center gap-2 border border-ink bg-ink py-4 font-mono text-[10px] uppercase tracking-[0.34em] text-paper transition-colors disabled:border-ink/20 disabled:bg-transparent disabled:text-ink-faint"
              >
                开始抽牌
              </button>
            </motion.div>
          )}

          {/* ---------------- 2 抽牌 ---------------- */}
          {step === 'draw' && (
            <motion.div
              key="draw"
              initial={{ y: 12 }} animate={{ y: 0 }}
              className="space-y-6"
            >
              <div>
                <h2 className="border-b-[1.5px] border-ink/70 pb-2.5 font-serif text-[20px] font-semibold tracking-[0.01em] sm:text-[23px]">
                  {shuffling ? '洗牌'
                    : picked.length < need ? `从牌堆里选 ${need} 张`
                    : revealed.length < need ? `依次翻开这 ${need} 张` : ''}
                </h2>
                <p className="mt-3.5 text-[13.5px] text-ink-mid">{question}</p>
              </div>

              {shuffling ? (
                <div className="flex items-center justify-center h-[300px]">
                  {/* 洗牌：一叠牌在原地抖，底下两张露边，看得出是「一叠」而不是一张 */}
                  <div className="relative scale-[1.7] sm:scale-100">
                    {[8, 4].map((d, k) => (
                      <div key={k} className="absolute inset-0 opacity-40"
                        style={{ transform: `translate(${d}px, ${d}px) rotate(${d / 2}deg)` }}>
                        <TarotCardBack size="lg" />
                      </div>
                    ))}
                    <motion.div
                      animate={{ rotate: [0, -6, 6, 0], y: [0, -8, 0] }}
                      transition={{ duration: 0.45, repeat: Infinity }}
                      className="relative"
                    >
                      <TarotCardBack size="lg" />
                    </motion.div>
                  </div>
                </div>
              ) : (
                /*
                  宽屏分两栏：牌阵在左，牌堆在右。
                  竖排时牌阵一高（十字 837px）牌堆就掉出屏幕，
                  得滚下去选、再滚上来看落在哪 —— 两栏之后两者始终在同一屏里。
                  items-start 很重要：两栏各自顶对齐，不让矮的牌阵被拉长。
                */
                <div className="space-y-5 lg:flex lg:items-start lg:gap-10 lg:space-y-0">
                  {/*
                    各个位置：先空着摆出来，让人看见牌会落到哪。

                    用 grid 不用 flex：每个位置自己声明第几列第几行，
                    十字、菱形这些形状 flex 排不出来。列宽用 minmax(0,1fr)，
                    牌再配 fluid —— 于是 1/3/5/10 张在任何屏宽都自动缩到放得下。
                  */}
                  <div className="lg:min-w-0 lg:flex-1">
                  <div
                    className="mx-auto grid justify-center gap-x-2 gap-y-4 sm:gap-x-4 sm:gap-y-5"
                    style={{
                      gridTemplateColumns: `repeat(${spread.cols}, minmax(0, 1fr))`,
                      maxWidth: spread.cols * spread.colWidth,
                    }}
                  >
                    {spread.positions.map((pos, i) => {
                      const card = drawn[i];
                      const isNext = picked.length === i;
                      return (
                        <div
                          key={pos.key}
                          className={pos.cross ? '' : 'space-y-2'}
                          style={{
                            gridColumn: pos.col,
                            gridRow: pos.row,
                            /*
                              「阻碍」和「现况」占同一格，横压在上面 —— 这是凯尔特十字的签名。

                              ⚠️ 旋转只能加在**牌**上，不能加在整格上。
                                 加在整格上，标签和「点一下翻开」会跟着竖过来，
                                 而且会和现况的标签叠在一起。
                              这一格也因此不渲染标签和说明：同一格里两份文字必然打架，
                              横着的那张本身就说明了它是哪一个。
                            */
                            ...(pos.cross ? { zIndex: 2, alignSelf: 'center', justifySelf: 'center', width: '100%' } : null),
                          }}
                        >
                          {!pos.cross && (
                          <div className="text-center">
                            {/* 原来这里还有一行 ORIGIN / PRESENT / TREND，是中文标签的拉丁复读，纯装饰 */}
                            <p className={`font-serif text-[14px] font-semibold transition-colors ${
                              card || isNext ? 'text-ink' : 'text-ink-faint'
                            }`}>{pos.label}</p>
                          </div>
                          )}
                          {/*
                            ⚠️ 横压那张必须缩。牌是 2:3，转 90° 之后宽度变成原来的 1.5 倍，
                               原样放会撑出格子、盖住左右两张。
                               0.78 之后宽度约 1.17 格，多出来的那点正好落进列间沟里 ——
                               压过去一点是对的（实体牌就是这样），盖住邻居不是。
                          */}
                          <div style={pos.cross ? { transform: 'rotate(90deg) scale(0.78)' } : undefined}>

                          {card ? (
                            /* 落位：从牌堆方向弹上来，再交给翻牌 */
                            <motion.div
                              // 同上：不从 opacity 0 起，否则抽到的三张牌在被节流的环境里是隐形的
                              initial={{ y: 120, scale: 0.75 }}
                              animate={{ y: 0, scale: 1 }}
                              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                              onClick={() => reveal(i)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(i); }
                              }}
                              // 扇形里的牌是带 aria-label 的 button，翻牌却是个裸 div：
                              // 同一个流程里两套标准，键盘用户走到这一步就卡死了
                              role="button"
                              tabIndex={revealed.includes(i) ? -1 : 0}
                              aria-label={revealed.includes(i) ? `${pos.label}：${card.name}` : `翻开${pos.label}这张牌`}
                              className="relative cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-vermilion/70 sm:rounded-[1.75rem]"
                              style={{ perspective: 1000 }}
                            >
                              {/* 翻牌：用 3D rotateY，牌背与牌面各占一半 */}
                              <motion.div
                                animate={{ rotateY: revealed.includes(i) ? 180 : 0 }}
                                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                                style={{ transformStyle: 'preserve-3d' }}
                                className="relative"
                              >
                                <div className="backface-hidden">
                                  <TarotCardBack size={spread.card} fluid />
                                </div>
                                <div className="absolute inset-0 backface-hidden"
                                  style={{ transform: 'rotateY(180deg)' }}>
                                  <TarotCard name={card.name} reversed={card.reversed} size={spread.card} fluid />
                                </div>
                              </motion.div>
                            </motion.div>
                          ) : (
                            /*
                              空位用细线，不用虚线大框：虚线空框是「表单没填完」的语言。
                              尺寸跟着 md 走（和落位后的牌一致）—— 这一屏的主角是牌堆，
                              三个空框占满首屏会把唯一能操作的东西挤到屏幕外。
                            */
                            <div className={`relative flex aspect-[2/3] w-full items-center justify-center border bg-paper-raised transition-colors ${
                              isNext ? 'border-vermilion' : 'border-ink/20'
                            }`}>
                              {/*
                                原来内层是一圈 border-dotted —— 虚线空框是「表单没填完」的语言，
                                和一副牌没有任何关系。换成牌背那个同心徽记的极淡拓印：
                                空位于是变成「这里要落一张牌」，而不是「这里有个字段没填」。
                              */}
                              <svg viewBox="0 0 100 150" aria-hidden="true"
                                className="pointer-events-none absolute inset-0 h-full w-full text-ink opacity-[0.11]">
                                <g fill="none" stroke="currentColor" strokeWidth="0.7">
                                  <circle cx="50" cy="75" r="26" />
                                  <circle cx="50" cy="75" r="17" />
                                  <path d="M50 49l16 26-16 26-16-26z" />
                                  <path d="M24 75h52M50 49v52" />
                                </g>
                              </svg>
                              {isNext && (
                                <motion.span
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{ duration: 1.8, repeat: Infinity }}
                                  /* 徽记拓印的十字线正好穿过正中，标签要垫一块纸把线扣掉才读得出 */
                                  className="relative bg-paper-raised px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-vermilion"
                                >下一张</motion.span>
                              )}
                            </div>
                          )}

                          </div>
                          {/* min-h 锁两行：各位置的 hint 长短不一，不锁高同一行的底边会参差 */}
                          {!pos.cross && (
                            <p className={`text-center text-[10px] leading-relaxed text-ink-faint ${
                              spread.cols <= 3 ? 'min-h-[2.9em]' : ''
                            }`}>
                              {card && !revealed.includes(i) ? '点一下翻开' : card ? '' : pos.hint}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  </div>

                  {/* 牌堆：摊成扇形，自己点。宽屏它是右栏，窄屏它在牌阵下面 */}
                  <AnimatePresence>
                    {picked.length < need && (
                      <motion.div
                        key="fan"
                        exit={{ opacity: 0, y: 40, transition: { duration: 0.35 } }}
                        /* 右栏宽度必须装得下整个圆盘：直径 = (R + 牌高/2) × 2 = hypot(140+69, 46)×2 ≈ 428 */
                        className="space-y-4 lg:w-[440px] lg:shrink-0 lg:space-y-3"
                      >
                        {/*
                          高度按「牌高 + 两端抬起的高度」给：
                          手机 138 + 18 = 156，桌面 138 + 74 = 212。
                          原来手机写的是 136px，比需要的短 19px，牌会顶出框外。
                        */}
                        {/* 满宽壳子：只为被 ResizeObserver 量出可用宽度，盘的半径由它反算 */}
                        <div ref={ringWrapRef} className="w-full">
                        <div
                          ref={fanBoxRef}
                          /*
                            高度 = 抬起 30px + 牌高 138 + 下探量（桌面 108、手机 45）。
                            下探量：牌绕下方远处的支点转，转到两端时下角会比底边更低，
                            而容器是 overflow-hidden —— 不留这段，底边就被切成一条平口。
                            顶部不用留：支点在下方，旋转只会让牌更低，不会更高。
                          */
                          /*
                            竖弧的框：窄而高。
                            高度给足弧长（支点在右边 5 倍牌宽处，70° 弧约 500px）
                            加上两端牌的外接高度；宽度只要装下牌加上弧的矢高。
                          */
                          /* 正方形，边长 = 外接角 ×2。外面那层满宽壳子负责被实测 */
                          className="relative mx-auto"
                          // 用 style 给尺寸：R 是跟着屏宽变的数字，不是 Tailwind 类名能表达的

                          /*
                            指针统一在容器上收，不在每张牌上收：
                            51 张牌只露 3px，逐张挂 pointerenter 在手机上根本进不去。
                            pan-y 而不是 none —— none 会让整页在牌堆上方滑不动，
                            用户想往下滚就被困住了。横向归我们，纵向还给页面。
                          */
                          style={{
                            /*
                              边长按**外接角**算，不是按半牌高。
                              牌指向圆心外侧，外边缘在 R + h/2 处，但那条边的两个角
                              还各偏出 w/2 —— 真正的外接半径是 hypot(R + h/2, w/2)。
                              按 R + h/2 给会少 5px，牌角就探出容器。
                            */
                            width: Math.hypot(R + FAN_CARD.h / 2, FAN_CARD.w / 2) * 2,
                            height: Math.hypot(R + FAN_CARD.h / 2, FAN_CARD.w / 2) * 2,

                            /*
                              圆盘是绕着转的，横竖都归我们 —— 但 none 会让整页在牌堆上
                              滑不动，用户想往下滚就被困住。留 pan-y 把纵向还给页面，
                              绕圈的手势主要是横向分量，够用。
                            */
                            touchAction: 'pan-y',
                          }}
                          onPointerDown={e => {
                            draggingRef.current = true;
                            e.currentTarget.setPointerCapture?.(e.pointerId);
                            trackPointer(e);
                          }}
                          onPointerMove={trackPointer}
                          onPointerUp={e => {
                            const hit = indexAt(e.clientX, e.clientY);
                            draggingRef.current = false;
                            if (hit !== null) pick(hit);
                            else applyFocus(null);
                          }}
                          onPointerCancel={() => { draggingRef.current = false; applyFocus(null); }}
                          onPointerLeave={() => { if (!draggingRef.current) applyFocus(null); }}
                        >
                          {fan.map((c, i) => {
                            if (picked.includes(i)) return null;
                            // 发牌从中间往两边散开，不是从最左边排队进来
                            const deal = Math.min(0.55, Math.abs(angleOf(i)) * 0.006);
                            return (
                              <button
                                key={i}
                                ref={el => { cardRefs.current[i] = el; }}
                                type="button"
                                aria-label={`抽第 ${picked.length + 1} 张`}
                                // 键盘走 onKeyDown：指针的选牌在容器的 onPointerUp 上，
                                // 两边都挂 onClick 会让一次触摸选两张
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); }
                                }}
                                onFocus={() => applyFocus(i)}
                                className={`fan-card absolute rounded-xl focus-visible:outline-none
                                  focus-visible:ring-2 focus-visible:ring-vermilion/70 ${
                                    'fan-card-deal'
                                  }`}
                                style={{
                                  // 圆盘不用 transform-origin 做支点：先摆到正中，再由 rotate+translateY 推出去
                                  left: '50%',
                                  top: '50%',
                                  /*
                                    初始位置和 applyFocus 写进去的必须出自同一个 cardTransform，
                                    两份公式差一点，滑动开始时就会跳一下。
                                  */
                                  transform: cardTransform(i, null),
                                  animationDelay: `${deal}s`,
                                  zIndex: i,
                                }}
                              >
                                {/* 圆盘上后一张压住前一张的右半，露的仍是左缘 */}
                                <TarotCardBack size="sm" edge />
                              </button>
                            );
                          })}
                        </div>
                        </div>
                        <div className="space-y-1.5 text-center">
                          <p className="text-[12.5px] text-ink-mid">
                            滑过牌堆挑一张，它会落到
                            {/* 抽满那一刻 picked.length === need，越界一下就是白屏。退场动画期间这段仍可能被读到 */}
                            <span className="font-serif font-semibold text-ink">{spread.positions[picked.length]?.label ?? ''}</span>
                            <span className="mx-2 text-ink-faint">·</span>
                            <span className="font-mono tabular-nums text-ink-faint">{picked.length} / {need}</span>
                          </p>
                          {/*
                            牌堆全在弧上，只是屏幕装不下。这件事不说，用户不会想到去拖。

                            ⚠️ 这里以前写「整副 51 张」——「整副」是"完整的一副"，
                            而完整的塔罗是 78 张。宝剑只有 1 张、星币 0 张，
                            懂塔罗的人抽几轮就会发现这两个花色几乎不出现。
                            差多少就写多少，不拿一个词把缺口糊过去。
                          */}
                          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                            <span className="tabular-nums">牌堆 {fan.length} 张</span>
                            {fan.length < TAROT_CARDS.length && (
                              <span className="tabular-nums">
                                <span className="mx-1.5">·</span>
                                满副 {TAROT_CARDS.length}，插画还在补
                              </span>
                            )}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {/* ---------------- 3 证据 + 解读 ---------------- */}
          {step === 'reading' && (
            <motion.div
              key="reading"
              initial={{ y: 12 }} animate={{ y: 0 }}
              className="space-y-8"
            >
              {/*
                抽牌屏的主角是牌堆，**这一屏的主角是抽到的牌** —— 它们是整个仪式的回报。
                和抽牌屏用同一套格子坐标：同一个牌阵在两屏上是同一个形状，
                翻完之后牌还在原地，不会跳成另一种排法。
              */}
              <div
                className="mx-auto grid justify-center gap-x-2 gap-y-4 sm:gap-x-4 sm:gap-y-5"
                style={{
                  gridTemplateColumns: `repeat(${spread.cols}, minmax(0, 1fr))`,
                  // 翻开屏是回报，给大一档
                  maxWidth: spread.cols * spread.colWidth * 1.25,
                }}
              >
                {drawn.map((c, i) => {
                  const pos = spread.positions[i];
                  return (
                    <div
                      key={i}
                      className="space-y-2.5"
                      style={{
                        gridColumn: pos.col,
                        gridRow: pos.row,
                        // 同抽牌屏：只转牌，不转字
                        ...(pos.cross ? { zIndex: 2, alignSelf: 'center', justifySelf: 'center', width: '100%' } : null),
                      }}
                    >
                      {!pos.cross && (
                        <p className="text-center font-serif text-[14px] font-semibold">{pos.label}</p>
                      )}
                      <div style={pos.cross ? { transform: 'rotate(90deg) scale(0.78)' } : undefined}>
                        <TarotCard name={c.name} reversed={c.reversed} size={spread.card} fluid />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 证据先行 */}
              <section className="space-y-3">
                {/* 没有分析结果时不能挂出处，那是在给牌意找一个不存在的来源 */}
                <h3 className="border-b-[1.5px] border-ink/70 pb-2.5 font-serif text-[20px] font-semibold tracking-[0.01em] sm:text-[23px]">
                  证据
                  {verdict && <span className="ml-2 text-[11px] font-normal text-ink-faint">来自恋爱分析</span>}
                </h3>

                {/* 报告的结论原样搬过来。牌只负责换个说法，不能另起一套结论 */}
                {verdict && (
                  <div className="border-l-2 border-vermilion/40 pl-3.5">
                    <div className="flex items-baseline gap-3">
                      <span className="font-serif text-[30px] font-semibold leading-none tabular-nums text-vermilion">
                        {verdict.score}
                      </span>
                      <span className="font-serif text-[13px] font-semibold">{verdict.band}</span>
                      <span className="text-[11px] text-ink-mid">{verdict.lean}</span>
                    </div>
                    {verdict.driver && (
                      <p className="mt-2 text-[11px] leading-[1.85] text-ink-mid">
                        最主要的失衡来自<span className="text-ink">「{verdict.driver}」</span>。
                      </p>
                    )}
                    {/* 报告里那条限定要跟过来：同一个分数，不能在这里失去它的边界 */}
                    <p className="mt-2 text-[10.5px] leading-[1.85] text-ink-faint">
                      它只量了投入的对称性，看不到对方的处境和动机。
                    </p>
                  </div>
                )}
                {facts.length > 0 ? (
                  <ul className="space-y-2">
                    {facts.map((f, i) => (
                      <motion.li
                        key={i}
                        initial={{ x: -8 }} animate={{ x: 0 }}
                        transition={{ delay: 0.1 + i * 0.07 }}
                        className="flex items-start gap-3 border-b border-ink/15 py-3"
                      >
                        <span className="mt-0.5 shrink-0 font-mono text-[10px] text-vermilion">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[13px] leading-[1.85]">{f}</span>
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <div className="border-l-2 border-ink/25 pl-3.5">
                    <p className="font-mono text-[12px]">
                      {metrics.totalMessages === 0 ? '没有接入聊天记录' : metrics.insufficientReason}
                    </p>
                    <p className="mt-2 text-[11px] leading-[1.85] text-ink-mid">
                      {metrics.totalMessages === 0
                        ? <>这次的解读只有牌意，不含你们之间的任何事实。<br />想让牌绑着你的数字说话，先做一份恋爱分析。</>
                        : <>样本不足时不出结论。<br />想让牌绑着你的数字说话，先做一份恋爱分析。</>}
                    </p>
                  </div>
                )}
                {/*
                  一条证据都没有时这句话本身就是假的，所以零证据时不写出处。
                  也不在这里重复「只有牌意」—— 上面那个朱红块已经说过一遍了。
                */}
                {facts.length > 0 && (
                  <p className="text-[10px] leading-relaxed text-ink-faint">
                    以上全部由聊天记录直接计算得出，未经任何推测。
                  </p>
                )}
              </section>

              {/* 解读位 —— 走服务端，客户端不持有密钥 */}
              <section className="space-y-3">
                <h3 className="border-b-[1.5px] border-ink/70 pb-2.5 font-serif text-[20px] font-semibold tracking-[0.01em] sm:text-[23px]">
                  解读
                </h3>
                <div className="pt-4">
                  {loadingReading ? (
                    <div className="flex items-center gap-2.5 text-ink-faint">
                      <motion.span
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                        className="h-1 w-1 rounded-full bg-vermilion"
                      />
                      {/* 没有记录时没有证据可对，说「对证据」是在描述一件不会发生的事 */}
                      <span className="text-[13px]">
                        {facts.length ? '正在把证据和牌面对上…' : `正在读这 ${need} 张牌…`}
                      </span>
                    </div>
                  ) : readingError ? (
                    <div className="space-y-3">
                      <p className="text-[13px] text-vermilion">{readingError}</p>
                      <button
                        onClick={() => { setReading(null); setReadingError(null); setAttempt(a => a + 1); }}
                        className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink"
                      >
                        重试
                      </button>
                    </div>
                  ) : reading ? (
                    <ReadingBody text={reading} positions={positionLabels} facts={facts} />
                  ) : (
                    <p className="text-[12px] text-ink-faint">暂无解读。</p>
                  )}
                </div>
              </section>

              {/*
                次要动作，不给通栏按钮 —— 通栏的尺寸很重、幽灵描边的对比很轻，
                两个信号互相打架。收成一条自己宽度的文字按钮，靠左跟着正文的轴线。
                上面留一道细线：它不属于解读那一节，紧贴着会被读成解读的一部分。
              */}
              {/*
                默认就存，所以必须说 —— 聊天原文是用户主动选才留的，
                解读是默认留的，两条策略不同就得让人知道差别在哪。
              */}
              {reading && !loadingReading && !readingError && (
                <p className="border-t border-ink/15 pt-5 text-[12px] leading-[1.85] text-ink-mid">
                  这次解读已经存在这台设备上了，在首页的「你问过的」里能翻回来，也能删掉。
                </p>
              )}

              <div className="border-t border-ink/15 pt-6" />
              <button
                onClick={reset}
                className="group inline-flex items-center gap-2 border-b border-ink/25 pb-1 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-mid transition-colors hover:border-ink hover:text-ink"
              >
                <RotateCw size={12} className="transition-transform group-hover:-rotate-90" /> 再抽一次
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
