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
 * 按住才翻：真实的答案之书是「想着问题，手指停在书口上」。
 * 这一下停顿就是仪式本身，点一下就出答案会让它变成抽奖机。
 * 键盘用户按 Enter / 空格直接翻，不要求他们按住。
 */
const HOLD_MS = 700;

type Phase = 'closed' | 'holding' | 'open';

/** 翻开的一页。不和上一页重复 —— 连着两次同一句，会被读成「它坏了」 */
function pickPage(prev: number | null) {
  let i = Math.floor(Math.random() * ANSWERS.length);
  if (i === prev) i = (i + 1) % ANSWERS.length;
  return i;
}

export default function AnswerBook({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>('closed');
  const [page, setPage] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const downAt = useRef(0);

  const open = () => {
    setPage(p => pickPage(p));
    setPhase('open');
    setHint(false);
  };

  // 按住满时长就自己翻开，不必等松手：手指一直停着的人不该被晾着
  useEffect(() => {
    if (phase !== 'holding') return;
    const t = setTimeout(open, HOLD_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const onDown = () => {
    if (phase !== 'closed') return;
    downAt.current = Date.now();
    setPhase('holding');
  };
  const onUp = () => {
    if (phase !== 'holding') return;
    // 没按够就松手：回到合上，告诉他多想一会儿，而不是悄悄给一个答案
    if (Date.now() - downAt.current < HOLD_MS) {
      setPhase('closed');
      setHint(true);
    }
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
              if ((e.key === 'Enter' || e.key === ' ') && phase !== 'open') { e.preventDefault(); open(); }
            }}
            onContextMenu={e => e.preventDefault()}
            disabled={phase === 'open'}
            aria-label={phase === 'open' ? `翻开的这一页写着：${answer}` : '按住这本书，想好了再松手'}
            className="relative aspect-[3/4] w-[min(72vw,300px)] select-none outline-none [perspective:1400px] [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-paper/70"
            style={{ touchAction: 'none' }}
          >
            {/* 那一页：纸，衬线大字 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-r-lg rounded-l-sm bg-paper px-7 text-ink shadow-[0_24px_60px_rgba(9,2,20,0.55)]">
              {page !== null && (
                <>
                  <p className="text-center font-serif text-[26px] font-semibold leading-[1.45] [text-wrap:balance]">{answer}</p>
                  <p className="absolute bottom-5 font-mono text-[10px] tracking-[0.2em] text-ink-faint tabular-nums">
                    第 {page + 1} 页
                  </p>
                </>
              )}
            </div>

            {/* 封面：绕左边的书脊转开 */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-r-lg rounded-l-sm border border-sunset-orange/60 bg-[#3A0E66] transition-transform duration-[900ms] ease-[cubic-bezier(0.7,0,0.2,1)] [backface-visibility:hidden]"
              style={{
                transformOrigin: 'left center',
                transform:
                  phase === 'open' ? 'rotateY(-165deg)'
                  : phase === 'holding' ? 'rotateY(-10deg) scale(1.02)'
                  : 'rotateY(0deg)',
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
                onClick={() => { setPhase('closed'); }}
                className="border border-paper px-7 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper transition-colors hover:bg-paper hover:text-ink"
              >
                合上，再问一个
              </button>
            ) : (
              <>
                <p className="font-serif text-[18px] font-semibold">心里默念一个问题</p>
                <p className={`mt-2 text-[13px] ${hint ? 'text-aurora-pink' : 'text-paper/60'}`}>
                  {hint ? '再多想一会儿，按住别松手' : '按住这本书，想好了再松手'}
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
