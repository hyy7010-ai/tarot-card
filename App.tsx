import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import RelationshipAnalysis from './RelationshipAnalysis';
import Tarot from './Tarot';
import { ChatMessage } from './types';

/**
 * 一份证据，两种看法。
 *
 * 恋爱分析是主线：数字全部由 metrics.ts 算出，模型只写最后那段文字。
 * 塔罗接在报告后面 —— 用的是同一批数字，牌只负责换个说法，
 * 说不出报告里没有的东西。所以是「报告 → 塔罗」一条路径，不是并列的两个入口。
 *
 * 两屏共用同一份 messages / myUid / otherName，各自算各自的指标（纯函数，可重入）。
 */
interface AppProps {
  messages?: ChatMessage[];
  myUid?: string;
  otherName?: string;
}

type View = 'analysis' | 'tarot';

export default function App({ messages = [], myUid = '', otherName = '对方' }: AppProps) {
  const [view, setView] = useState<View>('analysis');
  const shared = { messages, myUid, otherName };

  return (
    <div className="flex h-full flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {view === 'analysis' ? (
            <RelationshipAnalysis {...shared} onOpenTarot={() => setView('tarot')} />
          ) : (
            <Tarot {...shared} onBack={() => setView('analysis')} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
