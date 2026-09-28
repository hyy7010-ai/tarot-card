import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ANSWERS } from './answers';

/**
 * 答案之书。
 *
 * 整个产品里唯一不数的地方：心里默念一个问题，按住书，松手翻开一页。
 * 它不读聊天记录、不碰任何算好的数字、不调模型 —— 所以页面上要明说它只是好玩的，
 * 不能让人把随手一翻读成「证据说」。想看事实的路在底下那行字里。
 *
 * 按住才翻：真实的答案之书是「想着问题，拇指压着书口让书页哗哗翻过去，想好了一松手」。
 * 所以按住时书页一直翻，松手之后慢下来、停在一页上 —— 停在哪一页是松手那一刻决定的。
 * 这一下停顿就是仪式本身，点一下就出答案会让它变成抽奖机。
 * 键盘用户按 Enter / 空格直接翻几页停下，不要求他们按住。
 */
const HOLD_MS = 700;
/** 按住时每隔多久翻过一页 */
const RIFFLE_EVERY = 110;
const RIFFLE_MS = 260;
/** 松手之后慢下来的那几页：[距松手多久开始, 这一页翻多久]。最后一页就是答案 */
const SETTLE: [number, number][] = [[120, 320], [300, 400], [540, 480], [860, 640]];
/** 一直按着不松也得停：别让它无限翻下去 */
const MAX_HOLD_MS = 6000;

type Phase = 'closed' | 'riffling' | 'settling' | 'open';
type Leaf = { id: number; text: string; page: number; ms: number };

/** 翻开的一页。不和上一页重复 —— 连着两次同一句，会被读成「它坏了」 */
function pickPage(prev: number | null) {
  let i = Math.floor(Math.random() * ANSWERS.length);
  if (i === prev) i = (i + 1) % ANSWERS.length;
  return i;
}

export default function AnswerBook({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>('closed');
  const [page, setPage] = useState<number | null>(null);
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [hint, setHint] = useState(false);
  const downAt = useRef(0);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);
  const riffle = useRef<number | null>(null);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    if (riffle.current) clearInterval(riffle.current);
  }, []);

  /** 翻过一页：它自己播完动画，时长一到就从 DOM 里拿掉（见 styles.css 的 book-leaf） */
  const turn = (ms: number) => {
    const leaf = { id: nextId.current++, text: ANSWERS[Math.floor(Math.random() * ANSWERS.length)], page: 1 + Math.floor(Math.random() * ANSWERS.length), ms };
    setLeaves(ls => [...ls.slice(-5), leaf]);
    later(() => setLeaves(ls => ls.filter(l => l.id !== leaf.id)), ms + 40);
  };
  const stopRiffle = () => {
    if (riffle.current) clearInterval(riffle.current);
    riffle.current = null;
  };

  /** 慢下来，停在答案那一页：最后一页翻开的同时，底下那页换成答案 */
  const settle = () => {
    stopRiffle();
    setPhase('settling');
    setHint(false);
    SETTLE.forEach(([at, ms], k) => later(() => {
      if (k === SETTLE.length - 1) setPage(p => pickPage(p));
      turn(ms);
      if (k === SETTLE.length - 1) later(() => setPhase('open'), ms);
    }, at));
  };

  const onDown = () => {
    if (phase !== 'closed') return;
    downAt.current = Date.now();
    setPage(null);
    setPhase('riffling');
    // 封面打开之后才开始翻页
    later(() => {
      turn(RIFFLE_MS);
      riffle.current = window.setInterval(() => turn(RIFFLE_MS), RIFFLE_EVERY);
    }, 260);
    later(() => { if (riffle.current) settle(); }, MAX_HOLD_MS);
  };
  const onUp = () => {
    if (phase !== 'riffling') return;
    // 没按够就松手：合上，告诉他多想一会儿，而不是悄悄给一个答案
    if (Date.now() - downAt.current < HOLD_MS) {
      stopRiffle();
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setPhase('closed');
      setHint(true);
      return;
    }
    settle();
  };
  const onKey = () => {
    if (phase !== 'closed') return;
    setPage(null);
    setPhase('riffling');
    later(settle, 260);
  };

  const answer = page === null ? '' : ANSWERS[page];

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto bg-sunset-purple text-paper">
      <div className="relative z-[1] mx-auto flex w-full max-w-3xl flex-1 flex-col px-7 pt-8 pb-16 md:px-12">
        <header className="flex items-baseline gap-3 border-b-2 border-paper/60 pb-3">
          <button onClick={onBack} aria-label="返回" className="shrink-0 text-paper/60 transition-colors hover:text-paper">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-serif text-[22px] font-semibold">答案之书</h1>
          <span className="flex-1" />
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50">
            The book of answers
          </span>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center py-12">
          {/*
            一本书：合上时是封面，翻开时封面绕书脊转开，露出那一页。
            只动 transform —— 动画跑不起来的场合（后台标签、rAF 被节流）也直接落在终态，
            不会出现「翻开了但页面是空的」。
          */}
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
            disabled={phase === 'open' || phase === 'settling'}
            aria-label={phase === 'open' ? `翻开的这一页写着：${answer}` : '按住这本书，想好了再松手'}
            className="relative aspect-[3/4] w-[min(72vw,300px)] select-none outline-none [perspective:1400px] [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-paper/70"
            style={{ touchAction: 'none' }}
          >
            {/* 底下那一页：翻的过程中是空白纸，最后一页翻开时换成答案 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-r-lg rounded-l-sm bg-paper px-7 text-ink shadow-[0_24px_60px_rgba(9,2,20,0.55)]">
              {/* 书口：右边一叠纸的厚度 */}
              <span className="absolute inset-y-1 -right-1.5 w-1.5 rounded-r-sm bg-[repeating-linear-gradient(to_bottom,#e6e0d2_0_1px,#f7f3ea_1px_3px)]" aria-hidden="true" />
              {page !== null && (
                <>
                  <p className="text-center font-serif text-[26px] font-semibold leading-[1.45] [text-wrap:balance]">{answer}</p>
                  <p className="absolute bottom-5 font-mono text-[10px] tracking-[0.2em] text-ink-faint tabular-nums">
                    第 {page + 1} 页
                  </p>
                </>
              )}
            </div>

            {/* 正在翻过去的书页：每页都是真的书页，能瞥见一句别的答案 */}
            {leaves.map(l => (
              <div
                key={l.id}
                className="book-leaf absolute inset-0 flex flex-col items-center justify-center rounded-r-lg rounded-l-sm bg-paper px-7 text-ink"
                style={{ '--leaf-ms': `${l.ms}ms` } as React.CSSProperties}
                aria-hidden="true"
              >
                <p className="text-center font-serif text-[20px] leading-[1.45] text-ink/35 [text-wrap:balance]">{l.text}</p>
                <p className="absolute bottom-5 font-mono text-[10px] tracking-[0.2em] text-ink-faint/60 tabular-nums">第 {l.page} 页</p>
                <span className="book-leaf-shade absolute inset-0 rounded-r-lg bg-gradient-to-l from-black/40 to-transparent" style={{ '--leaf-ms': `${l.ms}ms` } as React.CSSProperties} />
              </div>
            ))}

            {/* 封面：绕左边的书脊转开 */}
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-r-lg rounded-l-sm border border-sunset-orange/60 bg-[#3A0E66] transition-transform duration-[500ms] ease-[cubic-bezier(0.7,0,0.2,1)] [backface-visibility:hidden]"
              style={{
                transformOrigin: 'left center',
                transform: phase === 'closed' ? 'rotateY(0deg)' : 'rotateY(-165deg)',
              }}
            >
              <span className="absolute inset-y-0 left-0 w-3 rounded-l-sm bg-black/25" aria-hidden="true" />
              {/* 同一弯月：这副牌 78 张里 77 张的天上都挂着它，书也挂一弯 */}
              <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true">
                <path d="M34 6a22 22 0 1 0 14 38A18 18 0 1 1 34 6z" fill="#FFB6C1" />
              </svg>
              <p className="mt-6 font-serif text-[22px] font-semibold tracking-[0.2em] text-paper">答案之书</p>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.3em] text-paper/55">Realheart</p>
              <span className="absolute bottom-6 h-1.5 w-1.5 rotate-45 bg-neon-green" aria-hidden="true" />
            </div>
          </button>

          <div className="mt-10 min-h-[4.5rem] text-center">
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
                  {phase === 'closed' ? '心里默念一个问题' : '想着它'}
                </p>
                <p className={`mt-2 text-[13px] ${hint ? 'text-aurora-pink' : 'text-paper/60'}`}>
                  {phase === 'riffling' ? '想好了就松手，书会停在那一页'
                    : phase === 'settling' ? '……'
                    : hint ? '再多想一会儿，按住别松手' : '按住这本书，想好了再松手'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* 和「先数，再抽牌」划清界限：这一页是随手翻的 */}
        <p className="border-t border-paper/20 pt-4 text-center text-[12px] leading-[1.9] text-paper/50">
          这本书是随手翻的，只图一个念头，不看你的聊天记录，也不碰任何数字。
          <br />
          想知道你们之间真实发生了什么，去做一份恋爱分析。
        </p>
      </div>
    </div>
  );
}
