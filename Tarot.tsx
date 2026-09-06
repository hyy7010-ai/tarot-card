import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowLeft, RotateCw, Activity, ChevronRight, AlertCircle } from 'lucide-react';
import TarotCard, { TarotCardBack } from './TarotCard';
import { ChatMessage } from './types';
import { TAROT_CARDS } from './cards';
import { ILLUSTRATED } from './illustrated';
import { cardCode } from './TarotArt';
import { computeRelationshipMetrics, RelationshipMetrics } from './metrics';

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

/** 三张牌阵的位置语义 */
const POSITIONS = [
  { key: 'past', label: '起因', latin: 'ORIGIN', hint: '这段关系是怎么走到今天的' },
  { key: 'present', label: '现状', latin: 'PRESENT', hint: '此刻真正在发生什么' },
  { key: 'future', label: '走向', latin: 'TREND', hint: '照这个模式下去会怎样' },
] as const;

const PRESET_QUESTIONS = [
  '他到底还在意我吗',
  '我是不是在自我消耗',
  '这段关系值不值得继续',
  '我该主动还是该退回来',
];

/** 摊开在桌上的牌数。奇数，扇形才有中轴 */
const FAN_SIZE = 13;

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
  onBack?: () => void;
}

export default function Tarot({ messages = [], myUid = '', otherName = '对方', onBack }: TarotProps) {
  const [step, setStep] = useState<Step>('ask');
  const [question, setQuestion] = useState('');
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
    () => computeRelationshipMetrics(messages, myUid),
    [messages, myUid],
  );
  const facts = useMemo(() => factsFrom(metrics, otherName), [metrics, otherName]);
  const drawn = useMemo(() => picked.map(i => fan[i]).filter(Boolean), [picked, fan]);

  // 扇形的弧宽得跟着屏幕走：手机上照桌面的角度扇会直接溢出屏幕
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setWide(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const startDraw = () => {
    setShuffling(true);
    setFan([]);
    setPicked([]);
    setRevealed([]);
    setStep('draw');
    // 洗牌的 900ms 是刻意留的：仪式感来自等待
    setTimeout(() => {
      setFan(drawCards(FAN_SIZE));
      setShuffling(false);
    }, 900);
  };

  /** 从牌堆里挑一张，落到下一个空位。已挑过的、或已经满三张的，都不再响应 */
  const pick = (i: number) =>
    setPicked(prev => (prev.includes(i) || prev.length >= 3 ? prev : [...prev, i]));

  // 必须用函数式更新：连点两张牌时，第二次点击拿到的 revealed 还是旧值，
  // 直接 [...revealed, i] 会丢掉前一张，流程就永远凑不满三张。
  const reveal = (i: number) =>
    setRevealed(prev => (prev.includes(i) ? prev : [...prev, i]));

  // 三张都翻开后再进解读，留 900ms 让最后一张翻完
  useEffect(() => {
    if (revealed.length < 3) return;
    const t = setTimeout(() => setStep('reading'), 900);
    return () => clearTimeout(t);
  }, [revealed.length]);

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
        cards: drawn.map((c, i) => ({ ...c, position: POSITIONS[i].label })),
        facts,
      }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `请求失败（${r.status}）`);
        return data;
      })
      .then(d => { if (!cancelled) setReading(d.text || ''); })
      .catch(e => { if (!cancelled) setReadingError(e.message); })
      .finally(() => { if (!cancelled) setLoadingReading(false); });
    return () => { cancelled = true; };
  }, [step, attempt]);

  const reset = () => {
    setStep('ask');
    setQuestion('');
    setFan([]);
    setPicked([]);
    setRevealed([]);
    setReading(null);
    setReadingError(null);
  };

  return (
    /* 自带深色底：文字对比度不能依赖外层背景（body 渐变最亮处是橙色） */
    <div className="relative flex-1 flex flex-col overflow-y-auto scrollbar-hide" style={{ backgroundColor: '#120522' }}>
      {/* 极淡的顶部辉光，避免大片纯色显得死板 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-aurora-pink/[0.07] to-transparent" />
      {/* 顶栏 */}
      <div className="relative flex items-center justify-between px-6 md:px-10 pt-6 pb-2 shrink-0">
        {/* 首屏没有 onBack 时（独立运行）就没有可返回的地方，不给死按钮，只留占位保持标题居中 */}
        {step === 'ask' && !onBack ? (
          <div className="w-9" />
        ) : (
          <button
            onClick={step === 'ask' ? onBack : reset}
            aria-label={step === 'ask' ? '返回' : '重新开始'}
            className="p-2 -ml-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="text-center">
          <h1 className="font-serif italic text-lg md:text-xl text-white/90">真心塔罗</h1>
          <p className="text-[9px] uppercase tracking-[0.3em] text-white/25 mt-0.5">REALHEART TAROT</p>
        </div>
        <div className="w-9" />
      </div>

      {/* 步骤指示 */}
      <div className="flex items-center justify-center gap-2 pb-6 shrink-0">
        {(['ask', 'draw', 'reading'] as Step[]).map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <div className={`h-px w-6 transition-colors ${['ask','draw','reading'].indexOf(step) >= i ? 'bg-aurora-pink/50' : 'bg-white/10'}`} />}
            <div className={`h-1.5 w-1.5 rounded-full transition-colors ${['ask','draw','reading'].indexOf(step) >= i ? 'bg-aurora-pink' : 'bg-white/15'}`} />
          </React.Fragment>
        ))}
      </div>

      <div className="relative flex-1 px-6 md:px-10 pb-24 max-w-5xl mx-auto w-full">
          {/* ---------------- 1 提问 ---------------- */}
          {step === 'ask' && (
            <motion.div
              key="ask"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="text-center space-y-3 pt-4">
                <h2 className="font-serif italic text-2xl md:text-3xl leading-snug">你想弄清楚什么</h2>
                <p className="text-xs text-white/40 leading-relaxed max-w-sm mx-auto">
                  牌只负责把话说出来。<br />真正的答案来自你们之间已经发生的事。
                </p>
              </div>

              <div className="relative">
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  rows={3}
                  placeholder="把问题写清楚一点，越具体越准"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-3xl px-6 py-5 text-sm text-white placeholder-white/25 outline-none focus:border-white/30 transition-colors resize-none leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-white/25 px-1">或者从这些开始</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_QUESTIONS.map(q => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className={`px-4 py-2.5 rounded-full text-xs border transition-all ${
                        question === q
                          ? 'bg-aurora-pink/15 border-aurora-pink/40 text-aurora-pink'
                          : 'bg-white/[0.03] border-white/10 text-white/50 hover:text-white hover:bg-white/[0.07]'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* 证据可用性——诚实地先说清楚 */}
              <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${
                metrics.sufficient ? 'bg-neon-green/[0.06] border-neon-green/20' : 'bg-white/[0.03] border-white/10'
              }`}>
                {metrics.sufficient
                  ? <Activity size={14} className="text-neon-green shrink-0 mt-0.5" />
                  : <AlertCircle size={14} className="text-white/30 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-bold tracking-wide ${metrics.sufficient ? 'text-neon-green' : 'text-white/50'}`}>
                    {metrics.sufficient ? `已读取 ${metrics.totalMessages} 条记录，跨 ${metrics.spanDays} 天` : '证据不足'}
                  </p>
                  <p className="text-[11px] text-white/35 leading-relaxed mt-1">
                    {metrics.sufficient
                      ? '解读会绑定这些真实数据，不会凭空推测。'
                      : `${metrics.insufficientReason || '还没有可分析的记录'}。仍然可以抽牌，但只有牌意，没有事实支撑。`}
                  </p>
                </div>
              </div>

              <button
                onClick={startDraw}
                disabled={!question.trim()}
                className="w-full py-5 rounded-3xl bg-gradient-to-r from-aurora-pink to-sunset-orange text-white font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-aurora-pink/20 disabled:opacity-25 disabled:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <Sparkles size={14} /> 开始抽牌
              </button>
            </motion.div>
          )}

          {/* ---------------- 2 抽牌 ---------------- */}
          {step === 'draw' && (
            <motion.div
              key="draw"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="space-y-10"
            >
              <div className="text-center space-y-2">
                <h2 className="font-serif italic text-xl md:text-2xl">
                  {shuffling ? '洗牌'
                    : picked.length < 3 ? '从牌堆里选三张'
                    : revealed.length < 3 ? '依次翻开三张' : ''}
                </h2>
                <p className="text-[11px] text-white/35">{question}</p>
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
                <div className="space-y-8">
                  {/* 三个位置：先空着摆出来，让人看见牌会落到哪 */}
                  <div className="flex flex-wrap justify-center gap-2.5 sm:gap-4 md:gap-8">
                    {POSITIONS.map((pos, i) => {
                      const card = drawn[i];
                      const isNext = picked.length === i;
                      return (
                        <div key={pos.key} className="space-y-3">
                          <div className="text-center">
                            <p className={`text-[10px] uppercase tracking-[0.25em] transition-colors ${
                              card ? 'text-white/30' : isNext ? 'text-aurora-pink/70' : 'text-white/15'
                            }`}>{pos.latin}</p>
                            <p className={`font-serif text-sm mt-0.5 transition-colors ${
                              card ? 'text-white/80' : isNext ? 'text-white/70' : 'text-white/25'
                            }`}>{pos.label}</p>
                          </div>

                          {card ? (
                            /* 落位：从牌堆方向弹上来，再交给翻牌 */
                            <motion.div
                              initial={{ opacity: 0, y: 120, scale: 0.75 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                              onClick={() => reveal(i)}
                              className="relative cursor-pointer"
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
                                  <TarotCardBack size="lg" />
                                </div>
                                <div className="absolute inset-0 backface-hidden"
                                  style={{ transform: 'rotateY(180deg)' }}>
                                  <TarotCard name={card.name} reversed={card.reversed} size="lg" />
                                </div>
                              </motion.div>
                            </motion.div>
                          ) : (
                            <div className={`w-[100px] sm:w-[188px] aspect-[2/3] rounded-xl sm:rounded-[1.75rem]
                              border border-dashed flex items-center justify-center transition-colors
                              ${isNext ? 'border-aurora-pink/40 bg-aurora-pink/[0.04]' : 'border-white/10'}`}>
                              {isNext && (
                                <motion.span
                                  animate={{ opacity: [0.25, 0.7, 0.25] }}
                                  transition={{ duration: 1.8, repeat: Infinity }}
                                  className="font-mono text-[9px] tracking-[0.2em] uppercase text-aurora-pink"
                                >下一张</motion.span>
                              )}
                            </div>
                          )}

                          <p className="text-[10px] text-white/25 text-center leading-relaxed max-w-[100px] sm:max-w-[188px]">
                            {card && !revealed.includes(i) ? '点一下翻开' : card ? '' : pos.hint}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* 牌堆：摊成扇形，自己点 */}
                  <AnimatePresence>
                    {picked.length < 3 && (
                      <motion.div
                        key="fan"
                        exit={{ opacity: 0, y: 40, transition: { duration: 0.35 } }}
                        className="space-y-4"
                      >
                        <div className="relative mx-auto h-[136px] sm:h-[168px] w-full max-w-[560px]">
                          <AnimatePresence>
                            {fan.map((c, i) => {
                              if (picked.includes(i)) return null;
                              // 支点推到牌下方很远处 → 弧变平、铺得开；角度只管张多少
                              const spread = wide ? 54 : 40;
                              const angle = -spread / 2 + (spread * i) / (FAN_SIZE - 1);
                              return (
                                <motion.button
                                  key={i}
                                  type="button"
                                  aria-label={`抽第 ${picked.length + 1} 张`}
                                  onClick={() => pick(i)}
                                  className="absolute bottom-0 left-1/2 rounded-xl focus-visible:outline-none
                                    focus-visible:ring-2 focus-visible:ring-aurora-pink/70"
                                  style={{ transformOrigin: wide ? '50% 330%' : '50% 250%', zIndex: i }}
                                  initial={{ x: '-50%', y: 90, rotate: 0, opacity: 0 }}
                                  animate={{ x: '-50%', y: 0, rotate: angle, opacity: 1 }}
                                  exit={{ y: -190, opacity: 0, scale: 0.7, transition: { duration: 0.4 } }}
                                  transition={{ delay: i * 0.035, type: 'spring', stiffness: 170, damping: 20 }}
                                  whileHover={{ y: -20 }}
                                  whileTap={{ y: -8, scale: 0.97 }}
                                >
                                  <TarotCardBack size="sm" />
                                </motion.button>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                        <p className="text-center text-[11px] text-white/30">
                          点一张，它会落到
                          <span className="text-aurora-pink/80">{POSITIONS[picked.length].label}</span>
                          <span className="mx-2 text-white/15">·</span>
                          <span className="font-mono tabular-nums text-white/40">{picked.length} / 3</span>
                        </p>
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
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-10"
            >
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3 md:gap-5">
                {drawn.map((c, i) => (
                  <div key={i} className="space-y-2">
                    <p className="text-[9px] uppercase tracking-[0.25em] text-white/25 text-center">{POSITIONS[i].label}</p>
                    <TarotCard name={c.name} reversed={c.reversed} size="md" />
                  </div>
                ))}
              </div>

              {/* 证据先行 */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Activity size={13} className="text-neon-green" />
                  <h3 className="text-[10px] uppercase tracking-[0.25em] text-neon-green">证据</h3>
                </div>
                {facts.length > 0 ? (
                  <ul className="space-y-2">
                    {facts.map((f, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.07 }}
                        className="flex items-start gap-3 bg-white/[0.04] border border-white/10 rounded-2xl px-5 py-3.5"
                      >
                        <span className="text-neon-green/60 text-[10px] font-mono mt-0.5 shrink-0">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[13px] text-white/80 leading-relaxed">{f}</span>
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <div className="bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-6 text-center">
                    <p className="text-[12px] text-white/40">{metrics.insufficientReason || '没有足够的记录可以计算'}</p>
                    <p className="text-[11px] text-white/25 mt-2 leading-relaxed">
                      样本不足时不出结论。<br />继续聊，或导入外部聊天记录。
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-white/20 leading-relaxed px-1">
                  以上全部由聊天记录直接计算得出，未经任何推测。
                </p>
              </section>

              {/* 解读位 —— 走服务端，客户端不持有密钥 */}
              <section className="space-y-3">
                <h3 className="text-[10px] uppercase tracking-[0.25em] text-aurora-pink">解读</h3>
                <div className="bg-gradient-to-b from-white/[0.05] to-transparent border border-white/10 rounded-3xl px-6 py-8">
                  {loadingReading ? (
                    <div className="flex items-center gap-3 text-white/40">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-3.5 h-3.5 border-2 border-white/15 border-t-aurora-pink rounded-full"
                      />
                      <span className="text-[12px]">正在把证据和牌面对上…</span>
                    </div>
                  ) : readingError ? (
                    <div className="space-y-3">
                      <p className="text-[12px] text-red-300/80">{readingError}</p>
                      <button
                        onClick={() => { setReading(null); setReadingError(null); setAttempt(a => a + 1); }}
                        className="text-[11px] uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                      >
                        重试
                      </button>
                    </div>
                  ) : reading ? (
                    <p className="text-[13.5px] text-white/85 leading-loose whitespace-pre-wrap font-light">{reading}</p>
                  ) : (
                    <p className="text-[12px] text-white/30">暂无解读。</p>
                  )}
                </div>
              </section>

              <button
                onClick={reset}
                className="w-full py-4 rounded-3xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-xs font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
              >
                <RotateCw size={13} /> 再抽一次
              </button>
            </motion.div>
          )}
      </div>
    </div>
  );
}
