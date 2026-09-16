import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { ChatMessage } from './types';
import { isUnavailable, type Coverage, type MetricKey } from './coverage';
import {
  computeRelationshipMetrics,
  computeImbalance,
  IMBALANCE_LABEL,
  investmentSharePercent,
  RelationshipMetrics,
  Imbalance,
} from './metrics';

/**
 * 恋爱分析
 *
 * 一份冷静的数据报告：所有数字都由代码算出（metrics.ts），
 * 模型只负责在报告最后做文字解读，不参与任何数值。
 *
 * 这一屏按**印刷品**排，不按 App 排：报头、编号小节、目录式点引线、细线和留白。
 * 圆角玻璃卡片全部拆掉了 —— 那是默认 AI 界面的长相，而且满屏盒子会让
 * 「哪一项是结论、哪一项是证据」全都一样重。
 * 朱红一屏只出现两次：一个结论，一处出处。
 */

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

/** 失衡越重，分数越红；持平和轻微退成墨色 —— 不给一个「好」的颜色去暗示什么 */
const BAND_INK: Record<Imbalance['band'], string> = {
  balanced: 'text-ink',
  mild: 'text-ink',
  clear: 'text-vermilion',
  severe: 'text-vermilion',
};

/**
 * 小节标题。
 *
 * 原来是「01 投入失衡度 ———— IMBALANCE」：左边一个序号，右边一个拉丁小标。
 * 数下来全站有 25 个这种 uppercase 小标签、9 个编号 —— 每一节都戴一顶小帽子，
 * 节奏完全模板化，那正是最典型的机器排版。
 * 小节在页面上的位置已经说明了它是第几节，标题本身已经说明了它是什么。
 * 现在只剩一行字和一条线。
 */
function SectionHead({ title }: { title: string }) {
  return (
    /*
      15px 的小标题和 11.5px 的正文只差 3.5px，扫一眼三节是同一片灰，
      分不出哪儿是一节的开头。层级不靠加编号和拉丁小帽子（那正是上面删掉的东西），
      靠尺度和线重：标题拉到 20px，线从 hairline 换成 1.5px 实墨。
    */
    <h2 className="border-b-[1.5px] border-ink/70 pb-2.5 font-serif text-[20px] font-semibold tracking-[0.01em] sm:text-[23px]">
      {title}
    </h2>
  );
}

/**
 * 账本里的一行：`谁在开启对话 ⋯⋯⋯⋯ 100% · 0%`
 *
 * `unavailable` 有值时这一行**照样占位**，点引线照样画到底，右边写「算不出」。
 * 以前是条件渲染不满足就整行消失 —— 用户看到一份少了两项的报告却不知道少了，
 * 那和撒谎没区别。缺失留在原位，是这一屏唯一不能让步的地方。
 */
function Row({
  label, mine, theirs, mineRaw, theirsRaw, lowerIsMore = false, unavailable, bar = true,
}: {
  label: string; mine?: string; theirs?: string;
  mineRaw?: number; theirsRaw?: number;
  /** 数值越小代表投入越多（回复延迟就是这样） */
  lowerIsMore?: boolean;
  /** 算不出的原因。给了就渲染成缺失行 */
  unavailable?: string;
  /** 这一行有没有「我 vs TA」的占比可画。趋势那种单值行没有 */
  bar?: boolean;
}) {
  if (unavailable) {
    /*
      「算不出」不是这张表的残缺，是这个产品最该理直气壮的一句话 ——
      它敢说不知道，而不是显示一个 0。

      原来这一行标签是 ink-mid、值是 ink-faint、原因是 10px，
      **整行是全表最暗的东西** —— 等于在为自己最值得讲的事道歉。
      现在标签和正常行同墨，点引线转朱红（见 styles.css：线抵达的不是同一种东西），
      原因用正文尺寸写清楚。它该被读到，不是被略过。
    */
    return (
      <div className="border-b border-ink/15">
        <div className="flex items-baseline gap-2.5 pt-4 pb-1.5">
          <span className="shrink-0 text-[14px]">{label}</span>
          <span className="dot-leader dot-leader-open" />
          <span className="shrink-0 font-mono text-[12px] tracking-[0.12em] text-vermilion">
            算不出
          </span>
        </div>
        <p className="pb-4 text-[13px] leading-[1.75] text-ink-mid">{unavailable}</p>
      </div>
    );
  }

  const minePct = investmentSharePercent(mineRaw ?? 0, theirsRaw ?? 0, lowerIsMore);

  return (
    <div className="border-b border-ink/15">
      <div className={`flex items-baseline gap-2.5 pt-4 ${bar ? 'pb-3' : 'pb-4'}`}>
        <span className="shrink-0 text-[14px]">{label}</span>
        <span className="dot-leader" />
        <span className="shrink-0 font-mono text-[15px] tabular-nums">
          {mine}
          {theirs && (
            <>
              <span className="mx-1.5 text-ink-faint">·</span>
              <span className="text-ink-mid">{theirs}</span>
            </>
          )}
        </span>
      </div>
      {/* 占比不画成彩色进度条，只在这一行底下留一道墨色刻度 */}
      {bar && (
        /* 和上面那把尺同理：长度写死，不交给动画。刻度读错比没有刻度更糟 */
        <div className="relative -mt-1.5 mb-2.5 h-px bg-ink/10">
          <div
            style={{ width: `${minePct}%` }}
            className="absolute inset-y-0 left-0 bg-ink/45 transition-[width] duration-500 ease-out"
          />
        </div>
      )}
    </div>
  );
}

interface Props {
  messages?: ChatMessage[];
  myUid?: string;
  otherName?: string;
  onBack?: () => void;
  /** 报告底部的附加入口（塔罗从这里进）。样本不足时也显示——那时塔罗只有牌意 */
  footer?: React.ReactNode;
  /**
   * 外部已经算好的结果。给了就用这一份 —— 塔罗跟着报告走，
   * 两屏必须引用同一次计算，不能各算各的。不给才自己算（独立使用时）。
   */
  metrics?: RelationshipMetrics;
  imbalance?: Imbalance;
  /** 这份样本能算什么。算不出来的指标要显式说出来，不能悄悄消失 */
  coverage?: Coverage;
}

export default function RelationshipAnalysis({
  messages = [], myUid = '', otherName = '对方', onBack, footer,
  metrics: metricsProp, imbalance: imbalanceProp, coverage,
}: Props) {
  const metrics: RelationshipMetrics = useMemo(
    () => metricsProp ?? computeRelationshipMetrics(messages, myUid), [metricsProp, messages, myUid],
  );
  const imbalance = useMemo(
    () => imbalanceProp ?? computeImbalance(metrics), [imbalanceProp, metrics],
  );

  const [reading, setReading] = useState<string | null>(null);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 深度解读走服务端；数值一律不经过模型
  useEffect(() => {
    if (!metrics.sufficient) return;
    let cancelled = false;
    setLoading(true);
    setReadingError(null);
    fetch('/api/relationship/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics, imbalance, otherName }),
    })
      // 边到边显示：不等整段写完
      .then(r => readStream(r, all => { if (!cancelled) setReading(all); }))
      .catch(e => { if (!cancelled) setReadingError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [metrics.sufficient]);

  const trend = metrics.otherLatencyTrendPct;
  const noSpan = !!coverage?.unavailable.some(u => u.key === 'span');

  /**
   * 某一项算不出的原因，没有就是 null。
   *
   * 「算不出」有两个来源，报告只认结果不认来源：
   *   1. 结构性 —— 这份记录压根没有逐条时间（coverage.ts 管）
   *   2. 样本性 —— 有时间，但样本里凑不出回合（metrics 直接返回 null）
   * 第二种以前谁都没管，那两行就悄悄消失了。
   */
  const reasonFor = (key: MetricKey, value: number | null): string | null => {
    const structural = coverage?.unavailable.find(u => u.key === key);
    if (structural) return structural.reason;
    if (value !== null) return null;
    return key === 'trend'
      ? '回合太少，分不出前后段'
      : '这份样本里没有连得上的一问一答';
  };

  return (
    <div className="paper-grain relative flex flex-1 flex-col overflow-y-auto scrollbar-hide bg-paper">
      <div className="relative z-[1] mx-auto w-full max-w-2xl flex-1 px-7 pt-8 pb-24 md:px-12">

        {/* ---------------- 报头 ---------------- */}
        <header>
          <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-2.5">
            <div className="flex items-center gap-2">
              {/* 报告是首屏时没有 onBack，那就不画一个按不动的按钮 */}
              {onBack && (
                <button
                  onClick={onBack}
                  aria-label="返回"
                  className="-ml-1.5 rounded p-1 text-ink-faint transition-colors hover:text-ink"
                >
                  <ArrowLeft size={17} />
                </button>
              )}
              <h1 className="font-serif text-[21px] font-semibold tracking-[0.02em]">恋爱分析</h1>
            </div>
            <p className="text-right font-mono text-[9px] leading-[1.7] tracking-[0.13em] text-ink-mid">
              RELATIONSHIP REPORT
              <br />
              {otherName}
            </p>
          </div>
          {/* 样本规模：说人话，不用一排大写拉丁词把它装饰成仪表盘 */}
          <p className="pt-2.5 text-[12px] text-ink-faint">
            {metrics.totalMessages} 条消息{!noSpan && `，跨 ${metrics.spanDays} 天`}，全部在这台设备上算完
          </p>
        </header>

        {!metrics.sufficient ? (
          <div className="mt-16 space-y-3 text-center">
            <p className="font-serif text-[19px] font-semibold">
              {metrics.insufficientReason || '还没有可分析的记录'}
            </p>
            <p className="mx-auto max-w-xs text-[13px] leading-[1.9] text-ink-mid">
              样本不足时不出结论。
              <br />
              换一份更长的聊天记录再试。
            </p>
            {footer && <div className="mx-auto max-w-sm pt-8">{footer}</div>}
          </div>
        ) : (
          <>
            {/* ---------------- 01 结论 ---------------- */}
            <section className="mt-9">
              <SectionHead title="投入失衡度" />

              <div className="flex items-start gap-6 pt-6 pb-4">
                <motion.span
                  initial={{ y: 6 }}
                  animate={{ y: 0 }}
                  className={`font-serif text-[92px] font-semibold leading-[0.78] tracking-[-0.02em] tabular-nums ${BAND_INK[imbalance.band]}`}
                >
                  {imbalance.score}
                </motion.span>
                <div className="pt-1.5">
                  <p className="font-serif text-[21px] font-semibold">
                    {IMBALANCE_LABEL[imbalance.band]}
                  </p>
                  {imbalance.leaning && (
                    <p className="mt-2 text-[13px] text-ink-mid">
                      {imbalance.leaning === 'me' ? '你投入得更多' : `${otherName}投入得更多`}
                    </p>
                  )}
                </div>
              </div>

              {/* 一把尺，不是进度条：满格 100，游标落在得分处 */}
              {/*
                ⚠️ 这把尺**不做入场动画**，长度直接写死在 style 里。

                原来是 motion 的 initial width:0 → animate width:score%。
                rAF 不跑的场合（后台标签、被节流的低端机）动画永远不启动，
                尺就停在 0：分数写着 80，尺读 0 —— 这不是"不好看"，是**报了个错的数**。
                一个立身之本是"数字是真的"的产品，不能让一段装饰动画去决定读数。

                CSS transition 留着：分数变化时它照样滑过去，而首帧永远是对的。
              */}
              <div className="relative h-[3px] bg-ink/15">
                <div
                  style={{ width: `${imbalance.score}%` }}
                  className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-out ${
                    imbalance.band === 'clear' || imbalance.band === 'severe' ? 'bg-vermilion' : 'bg-ink'
                  }`}
                />
                <span
                  style={{ left: `${imbalance.score}%` }}
                  className="absolute -top-1 h-[11px] w-px bg-ink transition-[left] duration-700 ease-out"
                />
              </div>

              <p className="mt-4 text-[13px] leading-[1.9] text-ink-mid">
                {/* 无时间戳时 spanDays 是序号步长算出来的，不是真的天数，不能显示 */}
                基于 {metrics.totalMessages} 条消息
                {!noSpan && <>、跨 {metrics.spanDays} 天</>}
                计算。
                {imbalance.topDriver && (
                  <>
                    {' '}最主要的失衡来自
                    <span className="border-b border-ink pb-px">「{imbalance.topDriver.label}」</span>。
                  </>
                )}
              </p>

              {/*
                这个分数看起来比它实际的分量重得多。
                最容易误导人的不是模型写的那段话，是一个「78」带来的权威感 ——
                所以必须在它旁边写清楚它**不能**说明什么。
              */}
              <p className="mt-4 border-t border-ink/15 pt-3.5 text-[13px] leading-[1.9] text-ink-mid">
                它只量了投入的对称性。看不到对方在忙什么、你们线下如何、
                有没有别的联系方式，也不知道回得慢是因为不在意还是因为性格。
              </p>
              {/*
                出处放在结论下面，不放页脚。用户本来就会截图，
                截走的就是这一块 —— 出处不跟着图走，等于没写。
              */}
              {/*
                这行原来也是朱红。一屏上分数、刻度、下划线、出处、报错全红，
                等于没有重点 —— 朱红只留给「结论」和「出错」两件事。
              */}
              {/* 10.5px 是脚注的尺寸。这句是这份报告凭什么可信，不该用脚注的音量说 */}
              <p className="mt-3 text-[12px] tracking-[0.01em] text-ink-mid">
                由聊天记录直接计算，数字不经过模型
              </p>
            </section>

            {/* ---------------- 02 逐项 ---------------- */}
            <section className="mt-10">
              <SectionHead title="逐项对照" />
              {/* 每一行永远都在。算不出的写明原因，不许整行消失 */}
              <div className="mt-1">
                <Row
                  label="谁在开启对话"
                  unavailable={reasonFor('initiation', metrics.myInitiationShare) ?? undefined}
                  mine={`${Math.round((metrics.myInitiationShare ?? 0) * 100)}%`}
                  theirs={`${100 - Math.round((metrics.myInitiationShare ?? 0) * 100)}%`}
                  mineRaw={metrics.me.initiations}
                  theirsRaw={metrics.other.initiations}
                />
                <Row
                  label="回复速度中位数"
                  lowerIsMore
                  unavailable={
                    (reasonFor('latency', metrics.me.medianReplyMinutes)
                      ?? reasonFor('latency', metrics.other.medianReplyMinutes)) ?? undefined
                  }
                  mine={`${metrics.me.medianReplyMinutes} 分`}
                  theirs={`${metrics.other.medianReplyMinutes} 分`}
                  mineRaw={metrics.me.medianReplyMinutes ?? 0}
                  theirsRaw={metrics.other.medianReplyMinutes ?? 0}
                />
                <Row
                  label="平均每条字数"
                  mine={`${metrics.me.avgLength} 字`} theirs={`${metrics.other.avgLength} 字`}
                  mineRaw={metrics.me.avgLength} theirsRaw={metrics.other.avgLength}
                />
                <Row
                  label="提问次数"
                  mine={`${metrics.me.questionCount} 次`} theirs={`${metrics.other.questionCount} 次`}
                  mineRaw={metrics.me.questionCount} theirsRaw={metrics.other.questionCount}
                />
                {/* 0 次是真信息，不是「没内容」，所以这一行也不随条件消失 */}
                <Row
                  label={`让${otherName}等超过 24 小时`}
                  unavailable={
                    coverage && isUnavailable(coverage, 'waiting')
                      ? coverage.unavailable.find(u => u.key === 'waiting')!.reason
                      : undefined
                  }
                  mine={`${metrics.me.leftOtherWaiting} 次`}
                  theirs={`${metrics.other.leftOtherWaiting} 次`}
                  mineRaw={metrics.me.leftOtherWaiting} theirsRaw={metrics.other.leftOtherWaiting}
                />
                {/*
                  趋势是单值，没有「我 vs TA」可比 —— 所以不画刻度，也不给 theirs。
                  对照基准写进标签：别的行那个「·」是「我 · TA」的意思，
                  在这里塞一句「后半段 vs 前半段」会被读成另一个人的数。
                */}
                <Row
                  label={`${otherName}的回复速度（后半段 vs 前半段）`}
                  bar={false}
                  unavailable={reasonFor('trend', trend) ?? undefined}
                  mine={trend === 0 ? '没变化' : `${(trend ?? 0) > 0 ? '慢了' : '快了'} ${Math.abs(trend ?? 0)}%`}
                />
              </div>

              {/*
                每一项算不出的原因已经写在它自己那一行上了，这里不再重复列一遍标签，
                只留两件那些行说不了的事：失衡度没把它们算进去，以及怎么把它们拿回来。
              */}
              {coverage && coverage.unavailable.length > 0 && (
                <p className="mt-5 border-l-2 border-ink pl-4 text-[13px] leading-[1.9] text-ink-mid">
                  上面写着「算不出」的几项，失衡度<span className="text-ink">没有把它们算进去</span>，
                  不是它们等于零。这份记录没有逐条时间，想拿回这几项需要一份带时间的导出记录。
                </p>
              )}
            </section>

            {/* ---------------- 03 解读 ---------------- */}
            <section className="mt-10">
              <SectionHead title="深度解读" />
              <div className="pt-5">
                {loading ? (
                  <div className="flex items-center gap-2.5 text-ink-faint">
                    <motion.span
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="h-1 w-1 rounded-full bg-vermilion"
                    />
                    <span className="text-[13px]">正在基于上面的数据分析…</span>
                  </div>
                ) : readingError ? (
                  <p className="text-[13px] text-vermilion">{readingError}</p>
                ) : reading ? (
                  /*
                    出处改由**材质**表达，不再靠一行浅灰小字。
                    上面所有数字都躺在纸面上；这一段是模型写的，所以它躺在
                    抬起一层的纸上，还带一道墨线 —— 一种材质对应一种来源。
                    这样「哪些是算的、哪些是写的」一眼就分得开，不用每次读脚注。
                  */
                  <div className="border-l-2 border-ink bg-paper-raised px-4 py-4">
                    <p className="whitespace-pre-wrap text-[14px] leading-[2]">{reading}</p>
                  </div>
                ) : (
                  <p className="text-[13px] text-ink-faint">暂无解读。</p>
                )}
              </div>
              <p className="mt-3.5 text-[12px] leading-relaxed text-ink-mid">
                这一段文字由模型写。上面所有数字都不经过它。
              </p>
            </section>

            {footer && <div className="mt-10">{footer}</div>}
          </>
        )}
      </div>
    </div>
  );
}
