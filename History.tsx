import React, { useMemo, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import TarotCard from './TarotCard';
import { loadReadings, deleteReading, clearReadings, type StoredReading } from './storage';

/**
 * 解读历史。
 *
 * 这一屏的主角**不是某一次解读，是那条线**。
 *
 * 单次抽牌谁都能做（我查过，AI 塔罗一抓一把，聊天分析器也有七八个）。
 * 但没有一个记得你在这段关系里问过什么 —— ChatGPT 结构上做不到（新会话即失忆），
 * 那些分析器是一次性报告生成器，不是日志。
 *
 * 而对一个恋爱产品来说，问题的变化本身就是答案：
 * 一月问「TA还在意我吗」、三月问「我该退回来吗」，那条线比任何一次解读都硬。
 * 所以列表按时间倒序，把**问题**放在最大的字号上 —— 牌和解读都退到后面。
 */

const fmt = (t: number) => {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 两次之间隔了多久。时间线要看得出疏密，光有日期看不出来 */
function gapLabel(newer: number, older: number): string {
  const days = Math.round((newer - older) / 86400000);
  if (days <= 0) return '同一天';
  if (days === 1) return '隔了 1 天';
  if (days < 30) return `隔了 ${days} 天`;
  return `隔了 ${Math.round(days / 30)} 个月`;
}

function Entry({ r, prev, onDelete }: {
  r: StoredReading;
  /** 比它更早的那一条，用来算间隔 */
  prev?: StoredReading;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className="border-b border-ink/15 py-6">
      <div className="flex items-baseline gap-3">
        <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-faint">
          {fmt(r.at)}
        </span>
        {prev && (
          <span className="shrink-0 font-mono text-[9px] tracking-[0.06em] text-ink-faint">
            {gapLabel(r.at, prev.at)}
          </span>
        )}
        <span className="dot-leader" />
        {/*
          失衡度放在这一行的右端，和日期同一条基线 ——
          时间线上它是会变的那个数，扫一列就能看出走向。
        */}
        {r.imbalance && (
          <span className="shrink-0 font-mono text-[12px] tabular-nums text-vermilion">
            {r.imbalance.score}
          </span>
        )}
      </div>

      {/* 问题是这一屏的主角，给最大的字号 */}
      <h3 className="mt-2 font-serif text-[19px] font-semibold leading-snug">{r.question}</h3>

      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
        {r.spread} · {r.cards.length} 张
        {r.imbalance && <span className="ml-2 normal-case tracking-normal">{r.imbalance.band}</span>}
        {!r.facts.length && <span className="ml-2 normal-case tracking-normal">只有牌意</span>}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {r.cards.map((c, i) => (
          /*
            76px 不是随手给的：54px 时牌名和罗马数字会挤在一行上打架
            （XVII 压住「星星」）。sm 档的牌名是 11px，撑得开它至少要这么宽。
          */
          <span key={i} className="w-[76px]">
            <TarotCard name={c.name} reversed={c.reversed} size="sm" fluid />
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={() => setOpen(v => !v)}
          className="border-b border-ink/25 pb-px font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mid transition-colors hover:border-ink hover:text-ink"
        >
          {open ? '收起' : '看当时怎么说'}
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-vermilion"
        >
          <Trash2 size={11} /> 删掉
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="border-l-2 border-ink bg-paper-raised px-4 py-4">
            <p className="whitespace-pre-wrap text-[13.5px] leading-[1.95]">{r.text}</p>
          </div>
          {r.facts.length > 0 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-vermilion">
                当时的证据
              </p>
              {/* 存证据是为了让「当时」可追溯：三个月后再看，那几个数字才是变化的锚 */}
              <ul className="mt-2 space-y-1">
                {r.facts.map((f, i) => (
                  <li key={i} className="font-mono text-[11.5px] leading-[1.8] tabular-nums text-ink-mid">
                    {String(i + 1).padStart(2, '0')} · {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function History({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<StoredReading[]>(() => loadReadings());

  /** 失衡度的变化。只有两条以上带分数的记录才说得出来 */
  const drift = useMemo(() => {
    const scored = items.filter(r => r.imbalance).slice(0, 2);
    if (scored.length < 2) return null;
    const [now, before] = scored;
    const d = now.imbalance!.score - before.imbalance!.score;
    if (d === 0) return null;
    return { d, dir: d > 0 ? '更失衡了' : '比上次平了一些' };
  }, [items]);

  return (
    <div className="paper-grain scrollbar-hide relative flex flex-1 flex-col overflow-y-auto bg-paper">
      <div className="relative z-[1] mx-auto w-full max-w-3xl flex-1 px-7 pt-8 pb-24 md:px-12">
        <header className="flex items-baseline gap-3 border-b-2 border-ink pb-3">
          <button onClick={onBack} className="shrink-0 text-ink-faint transition-colors hover:text-ink">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-serif text-[22px] font-semibold">你问过的</h1>
          <span className="dot-leader" />
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            {items.length} 次
          </span>
        </header>

        {items.length === 0 ? (
          <div className="mt-16 space-y-3 text-center">
            <p className="font-serif text-[19px] font-semibold">这里还没有东西</p>
            <p className="mx-auto max-w-xs text-[13px] leading-[1.9] text-ink-mid">
              抽过的每一次都会留在这台设备上。
              <br />
              攒起来之后，问题的变化本身就是一条信息。
            </p>
          </div>
        ) : (
          <>
            {drift && (
              /*
                唯一一句「总结」，而且它是数出来的，不经过模型。
                这正是这一屏存在的理由：单次抽牌说不出「和上次比」。
              */
              <p className="mt-6 border-l-2 border-vermilion pl-4 text-[13px] leading-[1.9] text-ink-mid">
                和上一次带数字的记录比，失衡度
                <span className="mx-1 font-mono tabular-nums text-ink">
                  {drift.d > 0 ? `+${drift.d}` : drift.d}
                </span>
                —— {drift.dir}。这是算出来的，不是牌说的。
              </p>
            )}

            <div className="mt-2">
              {items.map((r, i) => (
                <Entry
                  key={r.id}
                  r={r}
                  prev={items[i + 1]}
                  onDelete={() => { deleteReading(r.id); setItems(loadReadings()); }}
                />
              ))}
            </div>

            <button
              onClick={() => { clearReadings(); setItems([]); }}
              className="mt-8 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-vermilion"
            >
              <Trash2 size={12} /> 全部删掉
            </button>
          </>
        )}
      </div>
    </div>
  );
}
