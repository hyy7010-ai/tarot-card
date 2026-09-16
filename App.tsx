import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import Entry, { type Destination } from './Entry';
import RelationshipAnalysis from './RelationshipAnalysis';
import Tarot from './Tarot';
import TarotCard from './TarotCard';
import { ILLUSTRATED } from './illustrated';
import { computeRelationshipMetrics, computeImbalance } from './metrics';
import { coverageOf, maskForCoverage } from './coverage';
import { DEMO_MESSAGES, MY_UID, OTHER_NAME } from './demo-messages';
import { clearSession, loadSession, saveSession } from './storage';
import type { ChatMessage } from './types';

/**
 * 一份证据，两种看法。
 *
 * 两条路，不是一条：
 *   恋爱分析   必须先导入聊天记录 —— 没有记录它连一个数字都算不出来
 *   真心塔罗   可以直接抽。有分析结果就绑着那些数字说，没有就只给牌意，
 *              并且如实说明「没有事实支撑」
 *
 * 塔罗独立可用，这一点决定了路由的形状：它不能被拦在导入表单后面。
 * 但两条路一旦都有数据，说的必须是同一件事 —— 所以指标只在这里算一次，
 * 两屏共用。各算各的即使结果相同，也会让「同一件事」变成一句空话。
 */
/*
 * 入场动画**不许从 opacity 0 开始**。
 *
 * motion 的 initial 会在挂载时立刻写进行内样式，而动画本身要等 rAF ——
 * rAF 不跑的场合（后台标签、无头浏览器、低端机被节流），元素就永远停在全透明，
 * 用户打开看到的是一张空白纸。这不是假设：用 `--dump-dom` 在无头 Chrome 里
 * 抓到过 5 个元素卡在 opacity:0。
 *
 * 所以正文只动 transform：动画跑不起来时最多是位置差 8px，字还在。
 */

type View = 'entry' | 'analysis' | 'tarot';

interface Session {
  messages: ChatMessage[];
  myUid: string;
  otherName: string;
  /** 用示例数据进来的，界面要如实标明 */
  isDemo: boolean;
  /** 这份记录有没有逐条时间戳。没有就有一半指标算不出来 */
  hasTimestamps: boolean;
}

/*
 * 报告底部的塔罗入口。文案跟着样本走：没有证据时不能说「同一批数字」。
 *
 * 这里是**整条主线上唯一能放插画的地方**。
 * 报告页本身图像数为 0，而这个产品最强的资产是那 51 张 Riso 插画 ——
 * 主线上一张都不露，等于把最好的东西藏在第二屏之后。
 *
 * 但报告是「只摆事实」的地方，直接塞塔罗牌会把事实和占卜的界限搅浑。
 * 这一格不一样：它是**一扇门**，不是一句关于这段关系的断言。
 * 门后面长什么样，本来就该让人看见。下面那行真实张数把它钉成「这副牌」，
 * 而不是「你的牌」。
 */
const DOOR_CARDS = ['星星', '月亮', '高塔'] as const;

function TarotEntry({ sufficient, onClick }: { sufficient: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group block w-full border-t-2 border-ink pt-4 text-left"
    >
      <div className="flex items-baseline gap-2.5">
      <span className="min-w-0">
        <span className="block font-serif text-[17px] font-semibold">换个方式听同一件事</span>
        <span className="mt-1.5 block text-[13px] leading-[1.85] text-ink-mid">
          {sufficient
            ? '抽三张牌。牌意只会绑定上面这些数字，不额外推测。'
            : '抽三张牌。但现在没有可用的事实，牌就只有牌意。'}
        </span>
      </span>
      <ArrowRight
        size={15}
        className="ml-auto shrink-0 translate-y-0.5 text-ink-faint transition-transform group-hover:translate-x-1 group-hover:text-ink"
      />
      </div>

      <div className="mt-6 flex items-end justify-center">
        {DOOR_CARDS.map((name, i) => (
          <span
            key={name}
            className="-mx-3 block origin-bottom transition-transform duration-500 group-hover:-translate-y-1"
            // 叠序从左往右递增：序号在左下角，左压右才不会吃掉它
            style={{
              transform: `rotate(${(i - 1) * 7}deg) translateY(${Math.abs(i - 1) * 10}px)`,
              zIndex: i,
            }}
          >
            <TarotCard name={name} size="md" />
          </span>
        ))}
      </div>
      <p className="mt-6 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint transition-colors group-hover:text-vermilion">
        <span className="tabular-nums">牌堆 {ILLUSTRATED.length} 张</span>
      </p>
    </button>
  );
}

export default function App() {
  const [view, setView] = useState<View>('entry');
  // 上次用户选择「留在这台设备上」的记录，开局就恢复
  const [saved, setSaved] = useState(() => loadSession());
  const [session, setSession] = useState<Session | null>(() => {
    const s = loadSession();
    return s
      ? { messages: s.messages, myUid: s.myUid, otherName: s.otherName, isDemo: false,
          hasTimestamps: s.hasTimestamps ?? true }
      : null;
  });
  /** 塔罗是从哪儿进来的：返回要回到来的地方，不能一律回报告 */
  const [tarotFrom, setTarotFrom] = useState<'entry' | 'analysis'>('analysis');

  const coverage = useMemo(
    () => coverageOf(session?.hasTimestamps ?? true),
    [session?.hasTimestamps],
  );
  // 先抹掉算不出来的字段再打分：不抹的话，一个由序号伪造的维度会悄悄参与失衡度
  const metrics = useMemo(
    () => (session
      ? maskForCoverage(computeRelationshipMetrics(session.messages, session.myUid), coverage)
      : null),
    [session, coverage],
  );
  const imbalance = useMemo(() => (metrics ? computeImbalance(metrics) : null), [metrics]);

  // 回首页**不清空**已导入的记录：清了的话再点图标又得重新粘一遍。
  // 想换一份记录走 Entry 里的「换一份」，那才是清空的入口。
  const backToEntry = () => setView('entry');

  return (
    <div className="flex h-full flex-col">
      {/*
        只做入场动画，不用 AnimatePresence mode="wait"。
        那个模式要等退场动画播完才挂载新视图 —— 页面在后台标签、rAF 被暂停时
        退场永远播不完，点了入口整个应用就卡在原地。顶层导航不该被一段动画挡住。
      */}
      <motion.div
        key={view}
        initial={{ y: 8 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/*
          塔罗排在最前面判断：它不需要聊天记录。
          没有记录时它自己会说「只有牌意，没有事实支撑」，那是它的正常状态之一，
          不该被路由拦在导入表单后面。恋爱分析才非有记录不可。
        */}
        {view === 'tarot' ? (
          <Tarot
            messages={session?.messages}
            myUid={session?.myUid}
            otherName={session?.otherName}
            metrics={metrics ?? undefined}
            imbalance={imbalance ?? undefined}
            onBack={() => (tarotFrom === 'entry' ? backToEntry() : setView('analysis'))}
          />
        ) : view === 'entry' || !session || !metrics || !imbalance ? (
          <Entry
            hasData={!!session}
            onReset={() => setSession(null)}
            saved={saved ? { otherName: saved.otherName, savedAt: saved.savedAt } : null}
            onForget={() => { clearSession(); setSaved(null); setSession(null); }}
            onOpen={(dest: Destination) => { if (dest === 'tarot') setTarotFrom('entry'); setView(dest); }}
            onStart={(messages, myUid, otherName, dest, remember, hasTimestamps) => {
              setSession({ messages, myUid, otherName, isDemo: false, hasTimestamps });
              // 留不留是用户的选择：没勾就只活在内存里，关掉标签页就没了
              if (remember) {
                saveSession({ messages, myUid, otherName, hasTimestamps });
                setSaved(loadSession());
              }
              if (dest === 'tarot') setTarotFrom('entry');
              setView(dest);
            }}
            onDemo={(dest) => {
              setSession({
                messages: DEMO_MESSAGES, myUid: MY_UID, otherName: OTHER_NAME,
                isDemo: true, hasTimestamps: true,
              });
              setView(dest);
            }}
          />
        ) : (
          <RelationshipAnalysis
            messages={session.messages}
            myUid={session.myUid}
            otherName={session.otherName}
            metrics={metrics}
            imbalance={imbalance}
            coverage={coverage}
            onBack={backToEntry}
            footer={<TarotEntry sufficient={metrics.sufficient}
              onClick={() => { setTarotFrom('analysis'); setView('tarot'); }} />}
          />
        )}
      </motion.div>
    </div>
  );
}
