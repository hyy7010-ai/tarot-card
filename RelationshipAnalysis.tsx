import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowLeft, Activity, TrendingUp, TrendingDown, AlertCircle, Minus } from 'lucide-react';
import { ChatMessage } from './types';
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
 */

const BAND_COLOR: Record<Imbalance['band'], { text: string; bar: string; ring: string }> = {
  balanced: { text: 'text-neon-green', bar: 'bg-neon-green', ring: 'stroke-neon-green' },
  mild:     { text: 'text-aurora-blue', bar: 'bg-aurora-blue', ring: 'stroke-aurora-blue' },
  clear:    { text: 'text-sunset-orange', bar: 'bg-sunset-orange', ring: 'stroke-sunset-orange' },
  severe:   { text: 'text-aurora-pink', bar: 'bg-aurora-pink', ring: 'stroke-aurora-pink' },
};

/** 一组「我 vs 对方」的对照条 */
function Compare({
  label, mine, theirs, mineRaw, theirsRaw, otherName, lowerIsMore = false,
}: {
  label: string; mine: string; theirs: string;
  mineRaw: number; theirsRaw: number; otherName: string;
  /** 数值越小代表投入越多（回复延迟就是这样） */
  lowerIsMore?: boolean;
}) {
  const minePctClamped = investmentSharePercent(mineRaw, theirsRaw, lowerIsMore);

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/30">{label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-lg font-bold text-white tabular-nums">{mine}</span>
        <span className="text-lg font-bold text-white/45 tabular-nums text-right">{theirs}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${minePctClamped}%` }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-aurora-pink to-sunset-orange rounded-full"
        />
      </div>
      <div className="flex justify-between text-[9px] uppercase tracking-widest text-white/25">
        <span>我</span>
        <span>{otherName}</span>
      </div>
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
}

export default function RelationshipAnalysis({
  messages = [], myUid = '', otherName = '对方', onBack, footer,
}: Props) {
  const metrics: RelationshipMetrics = useMemo(
    () => computeRelationshipMetrics(messages, myUid), [messages, myUid],
  );
  const imbalance = useMemo(() => computeImbalance(metrics), [metrics]);

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
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `请求失败（${r.status}）`);
        return d;
      })
      .then(d => { if (!cancelled) setReading(d.text || ''); })
      .catch(e => { if (!cancelled) setReadingError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [metrics.sufficient]);

  const c = BAND_COLOR[imbalance.band];
  const trend = metrics.otherLatencyTrendPct;

  return (
    <div
      className="relative flex-1 flex flex-col overflow-y-auto scrollbar-hide"
      style={{ backgroundColor: '#120522' }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-neon-green/[0.05] to-transparent" />

      {/* 顶栏 */}
      <div className="relative flex items-center justify-between px-6 md:px-10 pt-6 pb-1 shrink-0">
        {/* 报告是首屏，没有 onBack 时不给死按钮，只留占位保持标题居中 */}
        {onBack ? (
          <button onClick={onBack} aria-label="返回"
            className="p-2 -ml-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors">
            <ArrowLeft size={18} />
          </button>
        ) : <div className="w-9" />}
        <div className="text-center">
          <h1 className="font-serif italic text-lg md:text-xl text-white/90">恋爱分析</h1>
          <p className="text-[9px] uppercase tracking-[0.3em] text-white/25 mt-0.5">RELATIONSHIP REPORT</p>
        </div>
        <div className="w-9" />
      </div>

      <div className="relative flex-1 px-6 md:px-10 pt-6 pb-24 max-w-3xl mx-auto w-full space-y-10">
        {!metrics.sufficient ? (
          <div className="pt-16 text-center space-y-4">
            <AlertCircle className="mx-auto text-white/20" size={30} />
            <p className="text-sm text-white/50">{metrics.insufficientReason || '还没有可分析的记录'}</p>
            <p className="text-[11px] text-white/25 leading-relaxed max-w-xs mx-auto">
              样本不足时不出结论。<br />继续聊，或导入外部聊天记录。
            </p>
            {footer && <div className="pt-6 max-w-sm mx-auto">{footer}</div>}
          </div>
        ) : (
          <>
            {/* 概览 + 失衡度 */}
            <motion.section
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-[2rem] border border-white/10 bg-white/[0.03] px-7 py-8"
            >
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/30">投入失衡度</p>
              <div className="mt-4 flex items-end gap-4">
                <span className={`text-6xl font-bold tabular-nums leading-none ${c.text}`}>{imbalance.score}</span>
                <div className="pb-1.5 space-y-1">
                  <p className={`text-sm font-bold ${c.text}`}>{IMBALANCE_LABEL[imbalance.band]}</p>
                  {imbalance.leaning && (
                    <p className="text-[11px] text-white/40">
                      {imbalance.leaning === 'me' ? '你投入得更多' : `${otherName}投入得更多`}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-5 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${imbalance.score}%` }}
                  transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
                  className={`h-full rounded-full ${c.bar}`}
                />
              </div>
              <p className="mt-5 text-[11px] text-white/35 leading-relaxed">
                基于 {metrics.totalMessages} 条消息、跨 {metrics.spanDays} 天计算。
                {imbalance.topDriver && <> 最主要的失衡来自<span className="text-white/60">「{imbalance.topDriver.label}」</span>。</>}
              </p>
            </motion.section>

            {/* 四组对照 */}
            <section className="space-y-7">
              <div className="flex items-center gap-2">
                <Activity size={13} className="text-neon-green" />
                <h2 className="text-[10px] uppercase tracking-[0.25em] text-neon-green">逐项对照</h2>
              </div>
              <div className="grid gap-7 sm:grid-cols-2">
                {metrics.myInitiationShare !== null && (
                  <Compare
                    label="谁在开启对话" otherName={otherName}
                    mine={`${Math.round(metrics.myInitiationShare * 100)}%`}
                    theirs={`${100 - Math.round(metrics.myInitiationShare * 100)}%`}
                    mineRaw={metrics.me.initiations} theirsRaw={metrics.other.initiations}
                  />
                )}
                {metrics.me.medianReplyMinutes !== null && metrics.other.medianReplyMinutes !== null && (
                  <Compare
                    label="回复速度中位数" otherName={otherName} lowerIsMore
                    mine={`${metrics.me.medianReplyMinutes} 分`}
                    theirs={`${metrics.other.medianReplyMinutes} 分`}
                    mineRaw={metrics.me.medianReplyMinutes} theirsRaw={metrics.other.medianReplyMinutes}
                  />
                )}
                <Compare
                  label="平均每条字数" otherName={otherName}
                  mine={`${metrics.me.avgLength} 字`} theirs={`${metrics.other.avgLength} 字`}
                  mineRaw={metrics.me.avgLength} theirsRaw={metrics.other.avgLength}
                />
                <Compare
                  label="提问次数" otherName={otherName}
                  mine={`${metrics.me.questionCount} 次`} theirs={`${metrics.other.questionCount} 次`}
                  mineRaw={metrics.me.questionCount} theirsRaw={metrics.other.questionCount}
                />
              </div>

              {(metrics.me.leftOtherWaiting > 0 || metrics.other.leftOtherWaiting > 0) && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 flex items-center justify-between">
                  <span className="text-[11px] text-white/45">让对方等待超过 24 小时</span>
                  <span className="text-[12px] text-white/80 tabular-nums">
                    我 {metrics.me.leftOtherWaiting} 次 · {otherName} {metrics.other.leftOtherWaiting} 次
                  </span>
                </div>
              )}
            </section>

            {/* 趋势 */}
            {trend !== null && (
              <section className="space-y-3">
                <h2 className="text-[10px] uppercase tracking-[0.25em] text-white/30">趋势</h2>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-6 flex items-center gap-4">
                  {trend > 0
                    ? <TrendingDown className="text-aurora-pink shrink-0" size={22} />
                    : trend < 0 ? <TrendingUp className="text-neon-green shrink-0" size={22} />
                    : <Minus className="text-white/30 shrink-0" size={22} />}
                  <div>
                    <p className={`text-xl font-bold tabular-nums ${trend > 0 ? 'text-aurora-pink' : 'text-neon-green'}`}>
                      {trend > 0 ? '慢了 ' : '快了 '}{Math.abs(trend)}%
                    </p>
                    <p className="text-[11px] text-white/35 mt-0.5">
                      {otherName}的回复速度，后半段相比前半段
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* 深度解读 */}
            <section className="space-y-3">
              <h2 className="text-[10px] uppercase tracking-[0.25em] text-aurora-pink">深度解读</h2>
              <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent px-6 py-7">
                {loading ? (
                  <div className="flex items-center gap-3 text-white/40">
                    <motion.div
                      animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-3.5 h-3.5 border-2 border-white/15 border-t-aurora-pink rounded-full"
                    />
                    <span className="text-[12px]">正在基于上面的数据分析…</span>
                  </div>
                ) : readingError ? (
                  <p className="text-[12px] text-red-300/80">{readingError}</p>
                ) : reading ? (
                  <p className="text-[13.5px] text-white/85 leading-loose whitespace-pre-wrap font-light">{reading}</p>
                ) : (
                  <p className="text-[12px] text-white/30">暂无解读。</p>
                )}
              </div>
              <p className="text-[10px] text-white/20 leading-relaxed px-1">
                以上所有数值均由聊天记录直接计算，模型只参与最后的文字解读。
              </p>
            </section>
            {footer}
          </>
        )}
      </div>
    </div>
  );
}
