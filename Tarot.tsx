import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, RotateCw } from 'lucide-react';
import TarotCard, { TarotCardBack, type CardSize } from './TarotCard';
import { Curtain, ReaderScene, TableWheel, CURTAIN_MS } from './TarotRoom';
import { ANSWER_LEAD, parseReading } from './parseReading';
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
  /**
   * 第几列，可以是半格（1.5 = 落在第 1、2 列正中间）。
   * 原图里常有「两张牌夹在三张牌中间」的排法（X 牌阵、感情修复），
   * 只认整数列就只能把列数加倍、牌缩成一半 —— 手机上那就是 57px 的牌。
   */
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
  /**
   * 宽屏（两栏）时每列的上限，不写就和 colWidth 一样。
   * 感情牌阵的 colWidth 是照手机定的 100，电脑上照这个摆，两边空一大片。
   */
  lgColWidth?: number;
  positions: SpreadPos[];
}

/** 半格靠这个实现：网格是 2×cols 个子列，每张牌跨两个，col 1.5 就从第 2 个子列起。整数列的牌宽和以前完全一样 */
const colSpan = (col: number) => `${col * 2 - 1} / span 2`;

/**
 * 牌阵的**形状**，直接从 positions 的 col/row 画出来。
 *
 * 选牌阵那一屏原来是四个纯文字框 —— 而牌阵的本质就是形状：
 * 三张横排、菱形、十字。用一行字描述一个形状，等于把这屏唯一的信息扔了。
 * 量过：那一屏地色只有纸一种、真实插画 0 张、最大字号 23px。
 *
 * ⚠️ 坐标只有一份。图从 SPREADS 自己生成，不另写一套 —— 改了牌阵，
 *    图自己跟着变，不可能对不上。
 */
function SpreadShape({ spread, on }: { spread: Spread; on: boolean }) {
  const W = 9, H = 13, GAP = 3;
  const height = spread.rows * H + (spread.rows - 1) * GAP;
  return (
    <div
      aria-hidden="true"
      className="relative"
      style={{
        width: spread.cols * W + (spread.cols - 1) * GAP,
        height,
        // 图框固定 58px 高。四行是 61px、五行 77px，不缩就压到下面的牌阵名上
        transform: height > 58 ? `scale(${58 / height})` : undefined,
      }}
    >
      {spread.positions.map((pos, i) => (
        <span
          key={i}
          className={on ? 'bg-ink' : 'bg-paper/45'}
          style={{
            position: 'absolute',
            left: (pos.col - 1) * (W + GAP),
            top: (pos.row - 1) * (H + GAP),
            width: W,
            height: H,
            borderRadius: 1.5,
            /* 凯尔特十字的「阻碍」：横压在「现况」上，这是这个牌阵的签名 */
            transform: pos.cross ? 'rotate(90deg)' : undefined,
          }}
        />
      ))}
    </div>
  );
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
  /*
    以下是感情专题牌阵，形状照原图摆，原图是错位排的地方就近落到格子上。
    label 要短（窄屏一行 14px 只放得下五六个字），也是模型读到的位置名，所以得自己能说明白；
    原图上那句完整的问题放在 hint 里。
    手机上牌和牌堆里的一样大（92px）：列宽 100 = 牌宽 + 列间沟。再大三行就是 690px，手机上翻牌得一路往下滑。
    宽屏另给 lgColWidth 130，牌用 md —— md 在手机上和 sm 一样，到 sm: 以上牌名才放大，配得上放大的牌。
  */
  {
    key: 'revive', name: '复活我的爱人', note: '感情 · 复合 · 分手真因 · 5 张',
    cols: 3, rows: 2, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'feel', label: 'TA的感情', hint: '对方对我的感情', col: 1, row: 1 },
      { key: 'contact', label: '会联系我吗', hint: '对方是否会主动联系我', col: 2, row: 1 },
      { key: 'reunite', label: '想复合吗', hint: 'TA 还想复合吗', col: 3, row: 1 },
      { key: 'reason', label: '分手真因', hint: '对方内心最真实的分手原因', col: 1, row: 2 },
      { key: 'todo', label: '我该怎么做', hint: '我应该怎么做', col: 3, row: 2 },
    ],
  },
  {
    key: 'revive2', name: '复活爱人 2.0', note: '分手想法 · 挽回态度 · 新的人 · 6 张',
    cols: 3, rows: 2, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'breakup', label: '分手的想法', hint: 'TA 怎么看这次分手', col: 1, row: 1 },
      { key: 'feel', label: '现在的感情', hint: 'TA 现在对我的感情', col: 2, row: 1 },
      { key: 'contact', label: '会联系我吗', hint: 'TA 还会主动联系我吗', col: 3, row: 1 },
      { key: 'winback', label: '挽回的态度', hint: '如果我去挽回，TA 会是什么态度', col: 1, row: 2 },
      { key: 'others', label: '接触新人', hint: 'TA 是否在接触新的人', col: 2, row: 2 },
      { key: 'todo', label: '我该怎么做', hint: '我现在应该怎么做', col: 3, row: 2 },
    ],
  },
  {
    key: 'cold-shoulder', name: '热脸贴冷屁股', note: '变心 · 不理我 · 持续多久 · 5 张',
    cols: 3, rows: 2, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'changed', label: '变心了吗', hint: 'TA 是否变心', col: 1, row: 1 },
      { key: 'ignore', label: '为何不理我', hint: 'TA 为什么不理我', col: 2, row: 1 },
      { key: 'howlong', label: '会持续多久', hint: '这种情况会持续多久', col: 3, row: 1 },
      { key: 'continue', label: '还能继续吗', hint: '这段关系还可以继续吗', col: 1, row: 2 },
      { key: 'todo', label: '我该怎么做', hint: '我现在应该怎么做', col: 3, row: 2 },
    ],
  },
  {
    key: 'cold-heart', name: '你的心，好冰冷', note: '为何绝情 · 会不会改变态度 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'why', label: '为何绝情', hint: 'TA 为什么对我这么绝情', col: 2, row: 1 },
      { key: 'thought', label: '真实想法', hint: 'TA 对这段关系真实的想法', col: 1, row: 2 },
      { key: 'feel', label: '现在的情感', hint: 'TA 现在对我的情感', col: 2, row: 2 },
      { key: 'change', label: '会改变吗', hint: 'TA 会改变态度吗', col: 3, row: 2 },
      { key: 'todo', label: '我该怎么做', hint: '我现在应该怎么做', col: 2, row: 3 },
    ],
  },
  {
    key: 'tug', name: '极限拉扯', note: '这段关系是否值得 · 6 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'need', label: '你的需求', hint: '你在这段关系里到底要什么', col: 2, row: 3 },
      { key: 'hesitate', label: 'TA犹豫的原因', hint: '是什么让 TA 迟迟不定', col: 1, row: 2 },
      { key: 'stuck', label: '停滞的根源', hint: '关系卡住不动的根源', col: 3, row: 2 },
      { key: 'third', label: '第三方介入', hint: '是否有第三方介入', col: 1, row: 1 },
      { key: 'turn', label: '转机', hint: '什么时候会有转机', col: 2, row: 1 },
      { key: 'todo', label: '我该如何做', hint: '接下来我该怎么做', col: 3, row: 1 },
    ],
  },
  {
    key: 'pursuit', name: '求爱之路', note: '好感 · 推进 · 能不能在一起 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'interest', label: '好感程度', hint: 'TA 对我有兴趣吗，好感有多少', col: 2, row: 1 },
      { key: 'image', label: '我在TA眼中', hint: '在 TA 眼里我是个什么样的人', col: 1, row: 2 },
      { key: 'push', label: '会主动推进吗', hint: 'TA 会主动推进关系吗', col: 2, row: 2 },
      { key: 'develop', label: '能更进一步吗', hint: '朋友能不能暧昧，暧昧能不能在一起', col: 3, row: 2 },
      { key: 'todo', label: '下一步怎么走', hint: '如果想更进一步，我该怎么做', col: 2, row: 3 },
    ],
  },
  {
    key: 'first-sight', name: '一见钟情', note: '第一眼 · 还会见面吗 · 5 张',
    cols: 2, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'first', label: '第一眼', hint: '第一眼见到我时，TA 心里在想什么', col: 2, row: 1 },
      { key: 'develop', label: '想发展吗', hint: 'TA 是否想和我进一步发展', col: 1, row: 2 },
      { key: 'meet', label: '还会见面吗', hint: '我们还会再见面吗', col: 2, row: 2 },
      { key: 'attitude', label: '相处的态度', hint: 'TA 打算怎么和我相处，对我什么态度', col: 1, row: 3 },
      { key: 'want', label: '想见我吗', hint: 'TA 想见我吗', col: 2, row: 3 },
    ],
  },
  {
    key: 'lovebrain', name: '恋爱脑五连问', note: '理想型 · 喜欢我什么 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'looks', label: '理想型外貌', hint: 'TA 的理想型长什么样、什么身材', col: 2, row: 1 },
      { key: 'type', label: '理想型性格', hint: 'TA 理想中的伴侣是什么性格', col: 1, row: 2 },
      { key: 'me', label: '我的外貌', hint: 'TA 眼中我的外貌，是不是 TA 的理想型', col: 2, row: 2 },
      { key: 'why', label: '喜欢我什么', hint: 'TA 为什么喜欢我', col: 3, row: 2 },
      { key: 'physical', label: '生理吸引', hint: 'TA 对我有没有生理上的喜欢', col: 2, row: 3 },
    ],
  },
  {
    key: 'lovebrain2', name: '恋爱脑 2.0', note: 'TA 和前任 · 放下了吗 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'then', label: '对前任如何', hint: '和前任在一起时，TA 对前任怎么样', col: 2, row: 1 },
      { key: 'why', label: '为何分手', hint: 'TA 和前任为什么分手', col: 1, row: 2 },
      { key: 'mode', label: '相处模式', hint: 'TA 和前任是怎么相处的', col: 3, row: 2 },
      { key: 'over', label: '放下了吗', hint: 'TA 是否已经放下前任', col: 1, row: 3 },
      { key: 'place', label: '前任的地位', hint: '前任在 TA 心里是什么位置', col: 3, row: 3 },
    ],
  },
  /*
    下面九个照第二批原图摆。原图上的「他」「对方」「占卜者」一律改成「TA」「你」，和上面一致。
    原图里两张牌夹在三张中间的地方用半格（col 带 .5）摆，不加列数 —— 列一多手机上牌就缩成一条。
  */
  {
    key: 'venus', name: '维纳斯之爱', note: '双方真心 · 未来心境 · 8 张',
    cols: 3, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'myheart', label: '你的真心', hint: '你对这段感情的真心', col: 1, row: 2 },
      { key: 'theirheart', label: 'TA的真心', hint: 'TA 对这段感情的真心', col: 3, row: 2 },
      { key: 'myinfl', label: '你受的影响', hint: '你在这段感情里受到的影响', col: 2, row: 1 },
      { key: 'theirinfl', label: 'TA受的影响', hint: 'TA 在这段感情里受到的影响', col: 2, row: 2 },
      { key: 'block', label: '问题阻碍', hint: '你们之间的问题和阻碍', col: 2, row: 3 },
      { key: 'result', label: '结果', hint: '这段感情的结果', col: 2, row: 4 },
      { key: 'myfuture', label: '你未来心境', hint: '你以后的心境', col: 1, row: 3 },
      { key: 'theirfuture', label: 'TA未来心境', hint: 'TA 以后的心境', col: 3, row: 3 },
    ],
  },
  {
    /* 原图中间是 7 横压在 8 上，和凯尔特十字同一个画法，所以 7 用 cross —— 它的标签也因此不在格子里显示 */
    key: 'sincere', name: '是否真心', note: '真心 · 隐瞒 · 背叛过吗 · 8 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'sincere', label: '真心吗', hint: 'TA 对你是否真心', col: 1, row: 2 },
      { key: 'real', label: '真实的TA', hint: '真实的 TA 是什么样', col: 1, row: 3 },
      { key: 'thought', label: '真实想法', hint: 'TA 对你的真实想法', col: 3, row: 2 },
      { key: 'status', label: 'TA以为的现状', hint: 'TA 以为你们的感情现在是什么样', col: 3, row: 3 },
      { key: 'circle', label: '身边人看你', hint: 'TA 身边的人怎么看你', col: 2, row: 1 },
      { key: 'hide', label: '有无隐瞒', hint: 'TA 对你有没有隐瞒，隐瞒的是什么', col: 2, row: 3 },
      { key: 'betray', label: '背叛过吗', hint: 'TA 是否背叛过这段感情', col: 2, row: 2, cross: true },
      { key: 'future', label: 'TA未来的样子', hint: 'TA 以后在这段关系里会是什么样子', col: 2, row: 2 },
    ],
  },
  {
    key: 'mirror-rival', name: '破镜重圆 · 有情敌', note: '你 · 前任 · 情敌 · 策略 · 11 张',
    cols: 3, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'mypast', label: '你的过去', hint: '你的过去', col: 1, row: 1 },
      { key: 'mynow', label: '你的现状', hint: '你的现状', col: 2, row: 1 },
      { key: 'result', label: '复合的结果', hint: '复合的结果', col: 3, row: 1 },
      { key: 'expast', label: '前任过去', hint: '前任的过去', col: 1, row: 2 },
      { key: 'exnow', label: '前任现状', hint: '前任的现状', col: 2, row: 2 },
      { key: 'exview', label: '前任的看法', hint: '前任怎么看你，复合有没有可能', col: 3, row: 2 },
      { key: 'rivalpast', label: '情敌过去', hint: '情敌的过去', col: 1, row: 3 },
      { key: 'rivalnow', label: '情敌现状', hint: '情敌的现状', col: 2, row: 3 },
      { key: 'clash', label: '交锋的未来', hint: '情敌与你交锋的未来', col: 3, row: 3 },
      { key: 'edge', label: '情敌优势', hint: '情敌的优势，也就是你的劣势', col: 1.5, row: 4 },
      { key: 'todo', label: '策略建议', hint: '你该用什么策略', col: 2.5, row: 4 },
    ],
  },
  {
    key: 'lover', name: '爱人', note: '关心 · 忠诚 · 结婚 · 金钱 · 10 张',
    cols: 3, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'care', label: '关心你吗', hint: 'TA 关心你吗', col: 2, row: 1 },
      { key: 'stable', label: '稳定吗', hint: '你们稳定吗', col: 3, row: 2 },
      { key: 'seek', label: '共同追求', hint: '你们所追求的', col: 2, row: 2 },
      { key: 'loyal', label: '忠诚可靠吗', hint: 'TA 忠诚、可靠吗', col: 1, row: 2 },
      { key: 'attract', label: '吸引的原因', hint: '你们互相吸引的原因', col: 3, row: 3 },
      { key: 'marry', label: '想过结婚吗', hint: 'TA 有考虑过结婚吗', col: 2, row: 3 },
      { key: 'traits', label: '优点缺点', hint: 'TA 的优点和缺点', col: 1, row: 3 },
      { key: 'money', label: '分享金钱', hint: '彼此能不能互相分享金钱', col: 3, row: 4 },
      { key: 'stay', label: '停留或离开', hint: 'TA 会为你停留还是离开', col: 2, row: 4 },
      { key: 'result', label: '结果', hint: '这段关系的结果', col: 1, row: 4 },
    ],
  },
  {
    /*
      照原图：左边一竖是 TA 的（犹豫 / 阻力 / 留恋），右边一竖是你的，
      中间上下是「影响了 TA / 影响了你」，两张看法夹在正中，底下三张收尾。
      四列加半格：「影响了TA」「是否真诚」落在正中间（2.5），底下三张错开半格。
    */
    key: 'repair', name: '感情修复', note: '双方的犹豫 · 阻力 · 留恋 · 13 张',
    cols: 4, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'theirview', label: 'TA的看法', hint: 'TA 怎么看待这段感情', col: 2, row: 2 },
      { key: 'myview', label: '你的看法', hint: '你怎么看待这段感情', col: 3, row: 2 },
      { key: 'theirinfl', label: '影响了TA', hint: '这段感情影响了 TA 什么', col: 2.5, row: 1 },
      { key: 'myinfl', label: '影响了你', hint: '这段感情影响了你什么', col: 2.5, row: 3 },
      { key: 'myhesitate', label: '你的犹豫', hint: '你对这段感情犹豫在哪里', col: 4, row: 1 },
      { key: 'theirhesitate', label: 'TA的犹豫', hint: 'TA 对这段感情犹豫在哪里', col: 1, row: 1 },
      { key: 'theirstay', label: 'TA的留恋', hint: 'TA 对这段感情留恋什么', col: 1, row: 3 },
      { key: 'mystay', label: '你的留恋', hint: '你对这段感情留恋什么', col: 4, row: 3 },
      { key: 'theirpush', label: 'TA的阻力', hint: '是什么阻力让 TA 想放弃这段感情', col: 1, row: 2 },
      { key: 'mypush', label: '你的阻力', hint: '是什么阻力让你想放弃这段感情', col: 4, row: 2 },
      { key: 'fix', label: '如何修复', hint: '这段感情要怎么修复', col: 1.5, row: 4 },
      { key: 'month', label: '下月趋势', hint: '这段感情未来一个月的趋势', col: 3.5, row: 4 },
      { key: 'honest', label: '是否真诚', hint: '这段感情是否完全真诚', col: 2.5, row: 4 },
    ],
  },
  {
    key: 'mirror', name: '破镜重圆', note: '双方现状 · 态度 · 能否复合 · 7 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'mynow', label: '你的现状', hint: '你现在的状况', col: 1, row: 1 },
      { key: 'block', label: '分开的原因', hint: '你们在一起时的阻碍，或者分开的原因', col: 2, row: 1 },
      { key: 'myattitude', label: '你的态度', hint: '你对这段感情的态度', col: 3, row: 1 },
      { key: 'theirnow', label: 'TA的现状', hint: 'TA 现在的状况', col: 1, row: 2 },
      { key: 'theirattitude', label: 'TA的态度', hint: 'TA 看待这段感情的态度', col: 2, row: 2 },
      { key: 'others', label: '有新感情吗', hint: 'TA 是否已经开始了新的感情', col: 3, row: 2 },
      { key: 'result', label: '能复合吗', hint: '能不能成功复合', col: 2, row: 3 },
    ],
  },
  {
    /* 原图是一个 X：1→4 从左上斜到右下，5→8 从右上斜到左下 */
    key: 'breakup', name: '分手探寻', note: '分手原因 · 双方想法 · 结局 · 8 张',
    cols: 4, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'mynow', label: '你的现状', hint: '你现在的状况', col: 1, row: 1 },
      { key: 'theirnow', label: 'TA的现状', hint: 'TA 现在的状况', col: 2, row: 2 },
      { key: 'base', label: '感情基础', hint: '你们的感情基础', col: 3, row: 3 },
      { key: 'reason', label: '分手原因', hint: '分手的原因', col: 4, row: 4 },
      { key: 'mythought', label: '你的想法', hint: '你的想法', col: 4, row: 1 },
      { key: 'theirthought', label: 'TA的想法', hint: 'TA 的想法', col: 3, row: 2 },
      { key: 'todo', label: '建议', hint: '建议', col: 2, row: 3 },
      { key: 'end', label: '结局', hint: '最后的结局', col: 1, row: 4 },
    ],
  },
  {
    /* 原图是 V 字，四层要七列，手机上牌会小到看不清；收成三列三行的 U，顺序和左右两臂不变 */
    key: 'future-lover', name: '未来恋人', note: '是不是正缘 · 7 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'who', label: 'TA是怎样的人', hint: 'TA 是一个怎样的人', col: 1, row: 1 },
      { key: 'appeared', label: '出现了吗', hint: 'TA 是否已经出现', col: 1, row: 2 },
      { key: 'sign', label: '相遇的提示', hint: '遇到 TA 时会有什么提示或特点', col: 1, row: 3 },
      { key: 'attract', label: '如何吸引TA', hint: '怎么吸引 TA 向你靠近', col: 2, row: 3 },
      { key: 'challenge', label: '会有的挑战', hint: '和 TA 在一起会遇到什么挑战', col: 3, row: 3 },
      { key: 'gain', label: '会收获什么', hint: '和 TA 在一起会收获什么', col: 3, row: 2 },
      { key: 'trend', label: '未来趋势', hint: '未来发展的趋势', col: 3, row: 1 },
    ],
  },
  {
    /* 原图是五列的 X；三列加半格就能摆出同一个 X，手机上牌还是三列的大小 */
    key: 'x-reunite', name: 'X 牌阵 · 复合', note: '复合的阻碍 · 双方想法 · 10 张',
    cols: 3, rows: 5, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'past', label: '你们过去', hint: '你们的过去', col: 1, row: 1 },
      { key: 'mynow', label: '你的现状', hint: '你现在的状况', col: 1.5, row: 2 },
      { key: 'theirnow', label: 'TA的现状', hint: 'TA 现在的状况', col: 2, row: 3 },
      { key: 'mythought', label: '你的想法', hint: '你对复合的想法', col: 2.5, row: 4 },
      { key: 'theirthought', label: 'TA的想法', hint: 'TA 对复合的想法', col: 3, row: 5 },
      { key: 'block', label: '阻碍你的', hint: '阻碍你的是什么', col: 3, row: 1 },
      { key: 'help', label: '帮助你的', hint: '能帮到你的是什么', col: 2.5, row: 2 },
      { key: 'unknown', label: '未知的事', hint: '你还不知道的事', col: 1.5, row: 4 },
      { key: 'result', label: '结果', hint: '复合的结果', col: 1, row: 5 },
      { key: 'guide', label: '指引', hint: '指引牌', col: 2, row: 1 },
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
 * 牌堆的几何：她在你们之间摊开的一个 **U**。
 *
 * 支点在她那一侧（上方），78 张沿着支点下方的一段圆弧排开：
 * 弧底朝你，两头开口朝她。每张牌的长边都指向支点。
 *
 * ⚠️ 这里曾经是圆盘，换圆盘的理由记在这里，别忘了为什么现在又能用弧：
 *    当年那把扇形只有 70°（整圆的 1/5），51 张挤在上面每张只露 2.9px，
 *    又只能靠点 —— 点不准。现在两件事都变了：
 *      1. 弧张到 168°，几乎是半圆。同样的宽度，弧长是当年的 2.4 倍；
 *      2. 选牌是「指尖扫过、底下那张抬起来、松手选中」，不靠点准。
 *    所以 78 张在手机上每张只露 4–5px 也选得准：你看得见抬起来的是哪一张。
 *    用户知道「每张只剩几像素」这件事之后，仍然选了 78 张全摊 —— 这是她定的。
 */
const ARC_DEG = 168;

/**
 * 由可用宽度反算 U 的尺寸。
 *
 * 手机和桌面用不同的牌尺寸（scale 缩 sm 那张牌，不另造一个尺寸 ——
 * 圆角、牌缘、徽记跟着等比缩，看起来是同一张牌小了一号）。
 * 半径让弧两端「抬起来的那张」最外的角刚好贴着容器边：
 *   (R + lift + h/2)·sin a + (w/2)·cos a = 可用半宽 − 边距
 */
function arcGeometry(available: number, vh: number) {
  const narrow = available < 640;
  const s = narrow ? 0.63 : 0.84;
  const w = FAN_CARD.w * s;
  const h = FAN_CARD.h * s;
  const lift = narrow ? 22 : 30;
  const a = ((ARC_DEG / 2) * Math.PI) / 180;
  const fitW = ((available / 2 - 6) - (w / 2) * Math.cos(a)) / Math.sin(a) - h / 2 - lift;
  /*
    高度也要限制。第一版只按宽度算，桌面上 R 顶到 240：在 1000×525 的窗口里
    一把牌加星盘占满整屏，问题只露出一行，牌位全在屏幕外 —— 挑的牌落到哪看不见。
    现在让整个牌堆盒子装进「报头 + 她 + 桌沿」之后剩下的高度：
      她（compact）= clamp(150, 24vh, 250)，报头约 110，桌沿压住她约 clamp(40, 7vh, 78)，
      桌面上沿留 12 + 穗子 11 + 底下余量 16；
      盒子高 = 1.55R + 半张牌 + 抬起 + 8（见下面 boxH）。
  */
  const figure = Math.min(250, Math.max(150, vh * 0.24));
  const overlap = Math.min(78, Math.max(40, vh * 0.07));
  const budget = vh - 110 - figure + overlap - 39;
  const fitH = (budget - h / 2 - lift - 8) / 1.55;
  /*
    上限 200：再大星盘就比对面的她还抢眼（第一版 240 时盘直径约 420，她只有 90 高）。
    下限 90：再小 78 张挤成一坨。
  */
  const R = Math.max(90, Math.min(200, fitW, fitH));
  /*
    支点压在 0.55R：U 的两头离桌沿不远，像是从她手边摊出来的；
    支点上方那段空间正好露出桌布上星盘的上半圈。
  */
  const pivotY = Math.round(R * 0.55);
  return {
    s, w, h, lift, R, pivotY,
    /** 盒子高度：支点 + 半径 + 半张牌 + 抬起的量 */
    boxH: Math.ceil(pivotY + R + h / 2 + lift + 8),
    /** 星盘外圈刚好套住牌尾 */
    wheelR: R + h / 2 + 12,
  };
}

/**
 * 扇形里那张牌的像素尺寸。跟着 TarotCard 的 SIZE.sm 走：w-[92px] + aspect-[2/3]。
 * 写死在这里是因为命中判定要用它算支点位置，而 sm 这一档本来就不是响应式的。
 */
const FAN_CARD = { w: 92, h: 138 } as const;


/**
 * 牌堆：完整的 78 张。
 *
 * ⚠️ 以前这里只放有插画的牌，理由是「线稿和插画不是同一套牌，三张里混进一张就不齐」。
 *    现在改成 78 张全摊，是用户明确要的：摊在桌上的必须是一副完整的牌。
 *    当时的代价是：还没出图的 27 张（宝剑 13、星币 14）抽到时翻开是矢量线稿。
 *    2026-09-27 这 27 张已经补齐，LINE_ART 变成 0，抽牌屏底下那行说明也就自己没了。
 */
const DECK = TAROT_CARDS;
/** 还没出图、抽到会翻出线稿的张数。插画补齐之后它是 0，那行说明自己就消失 */
const LINE_ART = TAROT_CARDS.filter(c => !ILLUSTRATED.includes(cardCode(c.name))).length;

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
  text, positions, facts, question,
}: { text: string; positions: readonly string[]; facts: string[]; question: string }) {
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
            {/* 只有挂了证据才分两栏。没接聊天记录时没有证据，右栏留空，正文会被挤在左边一半多 */}
            <div className={cited.length > 0 ? 'sm:grid sm:grid-cols-[1fr_15rem] sm:gap-8' : undefined}>
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
          {/* prompt 要求回答段以「你问的是」起头，模型偶尔不照做：由这里补上，不靠它守规矩 */}
          {!parsed.outro.startsWith(ANSWER_LEAD) && question.trim() && `${ANSWER_LEAD}「${question.trim()}」。`}
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
  /**
   * 进门的帘子。closed → opening（正在拉开，已经不挡点击）→ gone（卸掉）。
   * 只在进塔罗的那一次出现；「再抽一次」不会再拉一遍帘子 —— 人已经在屋里了。
   */
  const [curtain, setCurtain] = useState<'closed' | 'opening' | 'gone'>('closed');
  const openCurtain = () => {
    if (curtain !== 'closed') return;
    setCurtain('opening');
    // 定时卸掉，不等 transitionend（见 CURTAIN_MS 的注释）
    window.setTimeout(() => setCurtain('gone'), CURTAIN_MS + 80);
  };
  /*
    帘子合着的时候，后面的输入框、按钮不许被 Tab 到 —— 看不见的东西不该能被聚焦。
    React 18 的类型里没有 inert，所以用 ref 直接设属性。
  */
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stageRef.current?.toggleAttribute('inert', curtain === 'closed');
  }, [curtain]);
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
    U 的大小跟着容器实测宽度走（arcGeometry）。少两个订阅、少两次重渲染。
  */
  /*
    U 的半径按**实测可用宽度**反算，不写死。
    ResizeObserver 盯着外层那个满宽的壳子（不是牌堆本身 —— 牌堆的尺寸由 R 决定，
    盯它自己会绕成循环）。
  */
  const fanWrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = fanWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWrapW(e.contentRect.width));
    ro.observe(el);
    setWrapW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [step, shuffling]);
  /** 视口尺寸：U 的半径、右栏牌位的大小都受它限制 */
  const [vp, setVp] = useState(() =>
    typeof window === 'undefined' ? { w: 1024, h: 800 } : { w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const vh = vp.h;
  /** 和 JSX 里的 min-[900px]: 同一个门槛：宽屏时桌面分两栏 */
  const sideBySide = vp.w >= 900;
  /** U 的全部尺寸：半径、支点、牌的缩放、盒子高度、星盘半径 */
  const g = arcGeometry(wrapW || 360, vh);

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
  /**
   * 牌位每一列多宽。
   *
   * 竖排（手机）时就是牌阵自己定的 colWidth。
   * 两栏时右栏要把整组牌位装进一屏，否则挑的牌落到哪还是看不见 ——
   * 第一版在 1000×525 的窗口里，关系牌阵每张牌位约 110×165，三行只露出第一行。
   * 按右栏剩下的高度反算：一行 ≈ 牌高（1.5 × 列宽）+ 标签 20 + 间距 8 + 行距 20 = 48px。
   * 两栏时牌位底下不放说明：说明在 33px 宽的牌位下面会被挤成五行，每行都被它撑高，
   * 所以改成右栏顶上只写下一张的说明。（按 36 估的时候，关系牌阵在 800 高的屏幕里
   * 底边落在 799，只差 1px。）
   * 下限 80。原来是 44，可感情牌阵有四五行，在 600 高上下的窗口里一路缩到 44–60px，
   * 翻开之后只看得到一团字，看不到画（实测用户反馈「都看不到卡牌」）。
   * 宁可往下滚一点，也要翻开那一下看得见是哪张牌。
   * 代价：900 高的屏幕上三行以上的牌阵要滚一点，525 高时连三张牌阵也要滚三十来 px。
   */
  const slotColW = useMemo(() => {
    /*
      竖排（手机）时翻牌区在帘子和她下面，本来就要滚下去才看得到，
      所以这里只保证**整组牌位不高于一屏**：滚下去之后能一眼看全，不用翻一张滚一下。
      一行 ≈ 牌高 + 标签和说明约 77px（390×844 实测）。三行以内这个上限比屏宽还宽，等于不起作用；
      感情牌阵四五行才会收。下限 68：再窄「圣杯皇后」在牌面上就折行了。
      返回的是一列的预算，含 8px 的列间沟。
    */
    if (!sideBySide) {
      const card = Math.max(68, ((vh - 40) / spread.rows - 77) / 1.5);
      return Math.min(spread.colWidth, card + 8);
    }
    const figure = Math.min(250, Math.max(150, vh * 0.24));
    const overlap = Math.min(78, Math.max(40, vh * 0.07));
    // 报头 110 + 她 − 桌沿压住的 + 穗子 11 + 上边距 12 + 右栏顶上的说明约 124
    // （问题、落到哪、下一张的说明、线稿那一行，四行；按三行估的时候差了 1px 掉出屏幕）
    const top = 110 + figure - overlap + 11 + 12 + 124;
    const perRow = (vh - top - 24) / spread.rows;
    return Math.max(80, Math.min(spread.lgColWidth ?? spread.colWidth, (perRow - 48) / 1.5));
  }, [sideBySide, vh, spread]);

  /**
   * 宽屏翻牌区每一格的宽度。牌按 slotColW 缩，格子不跟着缩到比牌位名还窄：
   * 四五行的牌阵在 900 高的屏幕上牌只有 45px 左右，而牌位名是 14px 的四五个字（约 70px），
   * 格子跟着牌一起窄，相邻两格的名字就叠成「你的真心TA受的影响TA的真心」。
   */
  const slotGridW = sideBySide ? Math.max(slotColW, 84) : slotColW;

  /**
   * 翻开屏每一列的预算（含列间沟）。
   *
   * 原来是 colWidth × 1.25，不看高度。宽屏照旧：电脑上滚一下很自然，翻开屏是回报，牌就该大一档。
   * 手机上不行 —— 四五行的感情牌阵底边到了 1047px（390×844），一眼看不全这一屏就白给了。
   * 所以手机按行数反算：一行 ≈ 牌高 + 标签和行距约 42px，牌阵上面的报头和问题约 240px，再留 25px 给牌的投影和屏幕底边。
   * 三行以内这个上限比屏宽还宽，等于不起作用。下限 68：再窄「圣杯皇后」在牌面上就折行了。
   */
  const readColW = useMemo(() => {
    const base = (sideBySide ? (spread.lgColWidth ?? spread.colWidth) : spread.colWidth) * 1.25;
    if (sideBySide) return base;
    const card = Math.max(68, ((vh - 265) / spread.rows - 42) / 1.5);
    return Math.min(base, card + 8);
  }, [sideBySide, vh, spread]);
  /** 解析解读用的位置名。身份要稳定，否则 ReadingBody 里的 useMemo 每次都白做 */
  const positionLabels = useMemo(() => spread.positions.map(p => p.label), [spread]);

  /**
   * 滑动选牌。
   *
   * 手机上每张牌只露 4–5px（78 张铺在一段约 350px 的弧上，几何上限，材质救不了）。
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
  /** 78 张牌的 DOM。滑动时直接改它们的 style，不经过 React */
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

  /** 相邻两张之间的角度 */
  const stepDeg = ARC_DEG / Math.max(1, fan.length - 1);
  /**
   * 第 i 张的角度。0° 是正下方（弧底，离你最近）；正值往左。
   * 第 0 张在最左、最后一张在最右 —— 和 indexAt 反解的方向必须一致。
   */
  const angleOf = (i: number) =>
    fan.length > 1 ? ARC_DEG / 2 - stepDeg * i : 0;
  /**
   * 牌的层级：从两头往中间递增，弧底正中那张压在最上面。
   *
   * ⚠️ 第一版是 zIndex = i（后一张压前一张）。结果左端露出一排整齐的牌边，
   *    右端最后一张却整张躺在最上面，像是从牌堆里滑出来了。
   *    两头都露牌边，U 才是对称的；右半边的牌再左右镜像（见牌背外面那层），
   *    亮边才会落在露出来的那一侧。
   */
  const mid = (fan.length - 1) / 2;
  const baseZ = (i: number) => (i <= mid ? i : fan.length - 1 - i);

  /**
   * 第 i 张牌在「focus 是第 f 张」时该摆成什么样。
   * 首次渲染的行内 transform 和滑动时写进去的，必须出自这同一个函数 ——
   * 两份公式迟早会差一点，差出来就是滑动开始时的一次跳动。
   */
  const cardTransform = (i: number, f: number | null) => {
    const on = f === i;
    /*
      手指底下那张之外，左右邻居往两边让一点，做出「拨开」的手感。

      ⚠️ 幅度必须拿「每张牌占多少度」来量（stepDeg，78 张铺 168° 约 2.2°）。
         扇形那一版给过一次 4°，等于把邻居推开好几张的距离，牌堆被撕出一个口子。
         0.9 张的距离才是「让开」。
      角度随序号递减，所以序号更大的那一侧要往更小的角度推：前面是负号。
    */
    const part = f === null || on
      ? 0
      : -Math.sign(i - f) * stepDeg * 0.9 * Math.max(0, 1 - Math.abs(i - f) / PART_WINDOW);
    /*
      径向排布：先把牌摆到支点上，绕自身中心转到该去的方向，再沿着**转过之后的
      「下」**推出 R —— 于是牌的长边自然指向支点，抬起也只是把 R 加大一点，
      方向自动是朝你这边的（像从一把牌里抽出来）。

      顺序不能换：translateY 必须在 rotate 之后，才是「在牌自己的坐标系里往外」。
      scale 放在最后：牌的布局盒子仍是 sm 那一档（92×138），缩放围绕中心，
      translate(-50%,-50%) 的居中不受影响。
    */
    return `translate(-50%, -50%) rotate(${(angleOf(i) + part).toFixed(3)}deg) translateY(${g.R + (on ? g.lift : 0)}px) scale(${g.s})`;
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
      el.style.zIndex = String(j === next ? fan.length + 1 : baseZ(j));
    }
  };

  const indexAt = (clientX: number, clientY: number): number | null => {
    const box = fanBoxRef.current;
    if (!box || fan.length < 2) return null;
    const r = box.getBoundingClientRect();
    /*
      支点在盒子的水平正中、往下 pivotY 处。「手指相对支点的方向」直接就是牌的角度，
      反解出序号。这个算法不读任何牌的位置，所以牌抬起来也不会反馈回来把命中目标带跑。

      牌 i 落在 支点 + R·(−sin θ, cos θ)，所以 θ = atan2(−dx, dy)：
      0° 是正下方，往左为正 —— 和 angleOf / rotate 的方向一致。
    */
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + g.pivotY);
    // 支点附近方向是没意义的（半径越小角度抖得越厉害），太靠里就不认
    if (Math.hypot(dx, dy) < g.R * 0.45) return null;
    const deg = Math.atan2(-dx, dy) * (180 / Math.PI);
    // 弧外（包括支点上方、她那一侧）不认
    if (Math.abs(deg) > ARC_DEG / 2 + stepDeg) return null;
    const raw = Math.min(fan.length - 1, Math.max(0, Math.round((ARC_DEG / 2 - deg) / stepDeg)));
    // 已经抽走的牌在弧上留了空档，就近找一张还在的。弧是两头断开的，不绕回去
    for (let d = 0; d < fan.length; d++) {
      for (const j of [raw - d, raw + d]) {
        if (j >= 0 && j < fan.length && !picked.includes(j)) return j;
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
  /**
   * 选中那一刻，这张牌在 U 上的位置、角度和大小。落位时从这里飞过去。
   *
   * ⚠️ 原来是「U 上那张直接消失，牌位上另冒出一张、从上方 120px 弹下来」——
   *    两张牌之间没有任何连接，看起来是一张没了、另一张凭空出现。
   *    现在记下它离开 U 时的样子，落位的那张从这个样子动画到牌位（FLIP），
   *    眼睛里是同一张牌从一把牌里被抽出来、放到桌上。
   */
  const flyFrom = useRef<({ cx: number; cy: number; w: number; angle: number } | undefined)[]>([]);
  /** 每个牌位最外层那个 div（凯尔特十字的「阻碍」在这一层上横过来） */
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const pick = (i: number) => {
    const el = cardRefs.current[i];
    if (el && !picked.includes(i) && picked.length < need) {
      // 包围盒的中心就是牌心（旋转不改变中心）；宽度用没转过的那个：sm 那档乘缩放
      const r = el.getBoundingClientRect();
      flyFrom.current[picked.length] = {
        cx: r.left + r.width / 2, cy: r.top + r.height / 2,
        w: FAN_CARD.w * g.s, angle: angleOf(i),
      };
    }
    // 先把邻居归位：被抽走那张的左右还停在「让开」的角度上，不复位就留下一道歪缝
    applyFocus(null);
    setPicked(prev => (prev.includes(i) || prev.length >= need ? prev : [...prev, i]));
  };

  /*
    落位动画。useLayoutEffect：牌位里那张牌刚挂上、还没画到屏幕上时就把它摆回 U 上的样子，
    不然会先在牌位上闪一帧再飞走。

    用 Web Animations 而不是 motion：只动 transform，交给合成器跑；
    也不经过 React，飞的过程中一次重渲染都没有。
  */
  useLayoutEffect(() => {
    const k = picked.length - 1;
    const from = flyFrom.current[k];
    const el = slotRefs.current[k];
    if (k < 0 || !from || !el) return;
    flyFrom.current[k] = undefined;
    const r = el.getBoundingClientRect();
    // 十字的「阻碍」最终是横着压在上面的，飞的终点要是那个样子，不是正着
    const end = spread.positions[k]?.cross ? 'rotate(90deg) scale(0.78)' : 'none';
    const dx = from.cx - (r.left + r.width / 2);
    const dy = from.cy - (r.top + r.height / 2);
    // offsetWidth 是没被 transform 影响的布局宽度
    const sc = from.w / Math.max(1, el.offsetWidth);
    // 飞的时候要压在牌堆上面（牌堆的牌有 z-index），落地后还原
    el.style.position = 'relative';
    el.style.zIndex = '200';
    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(${from.angle}deg) scale(${sc})` },
        { transform: end },
      ],
      { duration: 620, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
    anim.onfinish = anim.oncancel = () => { el.style.zIndex = ''; el.style.position = ''; };
  }, [picked.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className={`paper-grain relative flex flex-1 flex-col scrollbar-hide bg-paper ${
      // 帘子是 absolute 盖在可视区上的。不锁滚动的话往下一滑，帘子就被滚走了
      curtain === 'gone' ? 'overflow-y-auto' : 'overflow-hidden'
    }`}>
      {curtain !== 'gone' && (
        <Curtain opening={curtain === 'opening'} onOpen={openCurtain} onBack={onBack} />
      )}
      {/* display:contents —— 只是给 inert 一个挂的地方，不参与布局 */}
      <div ref={stageRef} className="contents">
      {/*
        报头整块出血，地色换成牌背的深紫。

        量过选牌阵那一屏：地色只有纸一种、真实插画 0 张、最大字号 23px ——
        和首屏改之前是同一个病。报头是三步共用的，把它变成深紫，
        提问 / 抽牌 / 解读三屏就都有了第二种地色，而且它们看起来才像一副牌的三个阶段。

        ⚠️ 深紫地上的前景**只用纸色**，不用四色油墨里的任何一支。
           theme.css 那条规矩的原话是「整块地 = 可以；任何前景元素 = 不行」。
      */}
      {/*
        ⚠️ shrink-0 不能省。外层是 flex flex-col，下面的正文带 flex-1 会去抢空间，
           而 rh-ink 自带 overflow:hidden —— flex 子项在有 overflow 时可以被压到
           内容高度以下。第一版漏了它，报头被压成 height:0：底色算出来是对的
           （rgb(46,8,84)），宽度也满幅，但整条带子看不见。
      */}
      <div className="rh-ink relative z-[1] shrink-0">
        <div className="mx-auto w-full max-w-3xl px-7 pb-4 pt-7 md:px-12">
        <header>
          <div className="flex items-end justify-between gap-4 border-b-2 border-paper/70 pb-2.5">
            <div className="flex items-center gap-2">
              {/* 首屏独立运行时没有可返回的地方，就不画一个按不动的按钮 */}
              {!(step === 'ask' && !onBack) && (
                <button
                  onClick={step === 'ask' ? onBack : reset}
                  aria-label={step === 'ask' ? '返回' : '重新开始'}
                  className="-ml-1.5 rounded p-1 text-paper/50 transition-colors hover:text-paper"
                >
                  <ArrowLeft size={17} />
                </button>
              )}
              <h1 className="font-serif text-[21px] font-semibold tracking-[0.02em] text-paper">真心塔罗</h1>
            </div>
            <p className="text-right font-mono text-[9px] leading-[1.7] tracking-[0.13em] text-paper/65">
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
                  {i > 0 && <div className={`h-px w-6 ${done ? 'bg-paper/55' : 'bg-paper/20'}`} />}
                  {/*
                    原来走到的步骤用朱红。朱红 #9E2B1F 压在深紫 #2E0854 上两个都是深色，
                    对比度不够，8.5px 的字直接糊掉。换成纸色的明暗两档：
                    走过的 100%，没走到的 55%（约 5.0:1，8.5px 正文过 AA 的 4.5:1）。
                  */}
                  <span className={`font-mono text-[8.5px] uppercase tracking-[0.2em] ${done ? 'text-paper' : 'text-paper/55'}`}>
                    {['question', 'draw', 'reading'][i]}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </header>
        </div>
      </div>

      {/* ---------------- 1 提问：在房间里，她坐在对面 ---------------- */}
      {step === 'ask' ? (
        <ReaderScene>
          <div className="mx-auto w-full max-w-2xl px-7 pb-24 pt-12 md:px-12">
            {/* 她开口 */}
            <div className="text-center">
              <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-paper/55">
                The High Priestess · II
              </p>
              {/*
                原来是 20/23px 的「你想弄清楚什么」，和这屏其他标题一样大。
                现在它是她问你的一句话，这一屏唯一要人回答的事，给它真正的尺度。
              */}
              <h2 className="mt-4 font-serif text-[30px] font-semibold leading-[1.25] tracking-[0.01em] text-paper sm:text-[40px]">
                你想问什么？
              </h2>
              {/* 她说的是两句话，断在两句之间。交给浏览器断，手机上会把「发生」劈成「发 / 生的事」 */}
              <p className="mx-auto mt-4 max-w-md text-[13.5px] leading-[1.9] text-paper/65">
                牌只负责把话说出来。
                <br />
                真正的答案来自你们之间已经发生的事。
              </p>
            </div>

            {/*
              你回答她。只留一道书写线，不用带边框的方盒 ——
              16px 也是 iOS 上聚焦不触发自动放大的下限。
              聚焦色原来是朱红，朱红压在深色桌布上看不见，换成纸色。
            */}
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={2}
              placeholder="把问题写清楚一点，越具体越准"
              className="mt-10 w-full resize-none border-x-0 border-t-0 border-b-[1.5px] border-paper/30 bg-transparent px-0 py-2 text-[16px] leading-[1.9] text-paper outline-none transition-colors placeholder:text-paper/40 focus:border-paper"
            />

            <div className="mt-6 space-y-2">
              <p className="text-[11px] text-paper/55">或者从这些开始</p>
              {/* presets 恒为 4 条（PRESET_QUESTIONS / slice(0,4)），2×2 等宽对齐 */}
              <div className="grid grid-cols-2 gap-2">
                {presets.map(q => (
                  <button
                    key={q}
                    onClick={() => setQuestion(q)}
                    className={`border px-3 py-3.5 text-center text-xs leading-snug transition-colors ${
                      question === q
                        ? 'border-paper bg-paper text-ink'
                        : 'border-paper/20 text-paper/75 hover:border-paper/50 hover:text-paper'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/*
              她的第二句：要看几张。

              原来牌阵排在问题**前面**，注释写的是「先定形状，再定问题」。
              现在反过来了，因为这一屏变成了一场对话：真实的看牌也是先听你想问什么，
              再决定摊几张 —— 问题决定牌阵，不是牌阵决定你能问什么。
            */}
            <div className="mt-14">
              <h3 className="text-center font-serif text-[20px] font-semibold text-paper sm:text-[24px]">
                要看几张？
              </h3>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {SPREADS.map(sp => {
                  const on = sp.key === spreadKey;
                  return (
                    <button
                      key={sp.key}
                      onClick={() => setSpreadKey(sp.key)}
                      className={`border px-3 py-3 text-left transition-colors ${
                        on ? 'border-paper bg-paper text-ink' : 'border-paper/20 text-paper hover:border-paper/50'
                      }`}
                    >
                      {/* 固定 58px 的图框：不固定的话十字那张比一张牌高 4 倍，四个按钮参差 */}
                      <span className="mb-2.5 flex h-[58px] items-center">
                        <SpreadShape spread={sp} on={on} />
                      </span>
                      <span className="block font-serif text-[15px] font-semibold">{sp.name}</span>
                      <span className={`mt-1 block text-[11px] leading-snug ${on ? 'text-ink-mid' : 'text-paper/55'}`}>
                        {sp.note}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/*
              你带来的纸条。

              首屏那套「纸管数数、牌管牌」在这里变成一个具体的画面：
              纸是你带来的，牌是她的，两样东西摆在同一张桌上。
              内容和原来一字不改 —— 一条记录都没接的人和记录太短的人仍然分开说，
              对前者写「消息仅 0 条，不足 20 条」是在报一个他没犯的错。
            */}
            <div className="mt-12 rotate-[-0.5deg] bg-paper px-5 py-4 text-ink shadow-[0_12px_30px_rgba(9,2,20,0.5)]">
              <div className={`border-l-2 pl-3.5 ${metrics.sufficient ? 'border-ink' : 'border-vermilion/40'}`}>
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

            {/* 没填问题时只有一道细线，填了才落成实心纸块 */}
            <button
              onClick={startDraw}
              disabled={!question.trim()}
              className="mt-10 flex w-full items-center justify-center gap-2 border border-paper bg-paper py-4 font-mono text-[10px] uppercase tracking-[0.34em] text-ink transition-colors disabled:border-paper/25 disabled:bg-transparent disabled:text-paper/40"
            >
              开始抽牌
            </button>
          </div>
        </ReaderScene>
      ) : step === 'draw' ? (
        /* ---------------- 2 抽牌：还在那间屋子里，她把牌摊开了 ---------------- */
        <ReaderScene compact showDeck={false} aside>
          {/*
            宽屏（≥900px）两栏：左边桌上摊着 U，右边是问题、「落到哪 · 几张」和牌位。
            ⚠️ 门槛不是 lg（1024）：Mac 上没全屏的 Chrome 常常就是 1000 宽，第一版卡在
               lg 上，1000 宽照样竖排，牌位全掉在屏幕外。900 时左栏 420px，U 的半径约 113，放得下。
            挑一张，眼睛不用离开这一屏就能看见它落进哪个位置。
            这是原来「牌阵 + 圆盘」两栏布局要解决的同一个问题（竖排时牌位掉出屏幕，
            得滚下去看落在哪、再滚回来选），第二段改成竖排时把它带回来过一次。
            手机上仍然竖排：U 在上，说明和牌位在下，量过一屏装得下。

            items-start：左栏必须贴着桌沿开始，星盘才能一直画到穗子；
            右栏自己 self-center，比左栏矮时和牌堆居中对齐。
          */}
          <div className="pb-20 pt-3 min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:items-start min-[900px]:gap-10 min-[900px]:px-10">
            {/* 满宽壳子：只为被 ResizeObserver 量出可用宽度，U 的半径由它反算 */}
            <div ref={fanWrapRef} className="w-full">
              <div
                ref={fanBoxRef}
                className="relative w-full"
                /*
                  指针统一在容器上收，不在每张牌上收：
                  78 张牌只露几像素，逐张挂 pointerenter 在手机上根本进不去。
                  pan-y 而不是 none —— none 会让整页在牌堆上方滑不动。
                  沿着 U 扫的手势主要是横向分量，够用。
                */
                style={{ height: g.boxH, touchAction: 'pan-y' }}
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
                {/*
                  桌布上的星盘，圆心就是 U 的支点。它是桌面的一部分，所以一直都在：
                  洗牌时在、牌摊开时在、牌抽完淡出之后也在 —— 右边的牌位不会因为
                  牌堆消失而跳位置。

                  单独包一层 overflow-clip，只裁它不裁牌。top 往上多给 12px（外层的 pt-3），
                  星盘的上半圈才会一直画到桌沿的穗子；第一版在这 12px 处被切出一道看不见的线。
                */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 -top-3 overflow-clip">
                  <div className="absolute inset-x-0" style={{ top: 12 }}>
                    <TableWheel r={g.wheelR} cy={g.pivotY} />
                  </div>
                </div>

                {shuffling ? (
                  /* 洗牌：一叠牌在盘心抖，底下两张露边，看得出是「一叠」而不是一张 */
                  <div
                    className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ top: g.pivotY + g.R * 0.45 }}
                  >
                    {[8, 4].map((d, k) => (
                      <div key={k} className="absolute inset-0 opacity-40"
                        style={{ transform: `translate(${d}px, ${d}px) rotate(${d / 2}deg)` }}>
                        <TarotCardBack size="sm" />
                      </div>
                    ))}
                    <motion.div
                      animate={{ rotate: [0, -6, 6, 0], y: [0, -8, 0] }}
                      transition={{ duration: 0.45, repeat: Infinity }}
                      className="relative"
                    >
                      <TarotCardBack size="sm" />
                    </motion.div>
                  </div>
                ) : (
                  <AnimatePresence>
                    {picked.length < need && (
                      /* 牌抽完只淡出，不带位移：星盘和盒子高度都留着，旁边的东西一格都不动 */
                      <motion.div key="fan" className="absolute inset-0" exit={{ opacity: 0, transition: { duration: 0.35 } }}>
                        {fan.map((c, i) => {
                          if (picked.includes(i)) return null;
                          // 发牌从弧底往两头散开，不是从最左边排队进来
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
                              className="fan-card fan-card-deal absolute rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/70"
                              style={{
                                // 先摆到支点上，再由 rotate + translateY 推出去（见 cardTransform）
                                left: '50%',
                                top: g.pivotY,
                                // 初始位置和 applyFocus 写进去的必须出自同一个 cardTransform
                                transform: cardTransform(i, null),
                                animationDelay: `${deal}s`,
                                zIndex: baseZ(i),
                              }}
                            >
                              {/*
                                露出来的是每张牌的一条边 —— 牌缘让一叠牌读得出是纸。
                                左半边露左缘；右半边的牌被左边那张压住左侧、露出右缘，
                                所以整张镜像一下，亮边跟着换到右边。牌背图案是对称的，镜像看不出来。
                                镜像加在里层，不进 cardTransform：发牌动画的起点没有它，
                                写进去会让右半边每张在发牌途中翻一下面。
                              */}
                              <div style={i > mid ? { transform: 'scaleX(-1)' } : undefined}>
                                <TarotCardBack size="sm" edge />
                              </div>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </div>

            {/* 右栏（手机上在 U 下面）：问题、现在该做什么、牌位 */}
            <div className="px-7 min-[900px]:self-center min-[900px]:px-0">
              <div className="space-y-1.5 text-center">
                <p className="mx-auto max-w-md font-serif text-[15px] leading-[1.6] text-paper/90">{question}</p>
                {shuffling ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper/60">洗牌</p>
                ) : picked.length < need ? (
                  <>
                    <p className="text-[12.5px] text-paper/70">
                      滑过牌堆挑一张，它会落到
                      {/* 抽满那一刻 picked.length === need，越界一下就是白屏 */}
                      <span className="font-serif font-semibold text-paper">{spread.positions[picked.length]?.label ?? ''}</span>
                      <span className="mx-2 text-paper/40">·</span>
                      <span className="font-mono tabular-nums text-paper/55">{picked.length} / {need}</span>
                    </p>
                    {/* 两栏时牌位底下不放说明，只在这里写下一张的 */}
                    {sideBySide && spread.positions[picked.length] && (
                      <p className="text-[11.5px] text-paper/55">{spread.positions[picked.length].hint}</p>
                    )}
                    {/*
                      差多少就写多少，不拿一个词把缺口糊过去：
                      78 张都摊在桌上，但其中 LINE_ART 张还没出图，抽到时翻开是线稿。
                      60% 不是随手给的：纸色 45% 压在深紫上是 3.72:1，9px 正文 AA 要 4.5:1。
                    */}
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/60">
                      <span className="tabular-nums">牌堆 {fan.length - picked.length} 张</span>
                      {LINE_ART > 0 && (
                        <span className="tabular-nums">
                          <span className="mx-1.5">·</span>
                          其中 {LINE_ART} 张插画还在补，抽到时先是线稿
                        </span>
                      )}
                    </p>
                  </>
                ) : revealed.length < need ? (
                  <h2 className="font-serif text-[20px] font-semibold text-paper sm:text-[23px]">依次翻开这 {need} 张</h2>
                ) : null}
              </div>

              {/*
                各个位置：先空着摆出来，让人看见牌会落到哪。

                用 grid 不用 flex：每个位置自己声明第几列第几行，
                十字、菱形这些形状 flex 排不出来。列宽用 minmax(0,1fr)，
                牌再配 fluid —— 于是 1/3/5/10 张在任何屏宽都自动缩到放得下。
              */}
              <div className="mt-7 w-full">
            <div
              className="mx-auto grid justify-center gap-x-2 gap-y-4 sm:gap-x-4 sm:gap-y-5"
              style={{
                gridTemplateColumns: `repeat(${spread.cols * 2}, minmax(0, 1fr))`,
                maxWidth: sideBySide ? spread.cols * slotGridW + (spread.cols - 1) * 16 : spread.cols * slotColW,
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
                      gridColumn: colSpan(pos.col),
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
                      <p className={`whitespace-nowrap font-serif text-[14px] font-semibold transition-colors ${
                        card || isNext ? 'text-paper' : 'text-paper/45'
                      }`}>{pos.label}</p>
                    </div>
                    )}
                    {/*
                      ⚠️ 横压那张必须缩。牌是 2:3，转 90° 之后宽度变成原来的 1.5 倍，
                         原样放会撑出格子、盖住左右两张。
                         0.78 之后宽度约 1.17 格，多出来的那点正好落进列间沟里 ——
                         压过去一点是对的（实体牌就是这样），盖住邻居不是。
                    */}
                    <div ref={el => { slotRefs.current[i] = el; }} style={{
                      // 宽屏格子比牌宽（见 slotGridW），牌按 slotColW 居中
                      ...(slotGridW > slotColW ? { width: slotColW, marginInline: 'auto' } : null),
                      ...(pos.cross ? { transform: 'rotate(90deg) scale(0.78)' } : null),
                    }}>

                    {card ? (
                      /* 落位：从 U 上飞过来的动画在外层 div 上（见 flyFrom），这里只管翻牌 */
                      <motion.div
                        onClick={() => reveal(i)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(i); }
                        }}
                        // 扇形里的牌是带 aria-label 的 button，翻牌却是个裸 div：
                        // 同一个流程里两套标准，键盘用户走到这一步就卡死了
                        role="button"
                        tabIndex={revealed.includes(i) ? -1 : 0}
                        aria-label={revealed.includes(i) ? `${pos.label}：${card.name}` : `翻开${pos.label}这张牌`}
                        className="relative cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-paper/70 sm:rounded-[1.75rem]"
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
                      <div className={`relative flex aspect-[2/3] w-full items-center justify-center border bg-paper/[0.04] transition-colors ${
                        isNext ? 'border-paper/80' : 'border-paper/20'
                      }`}>
                        {/*
                          原来内层是一圈 border-dotted —— 虚线空框是「表单没填完」的语言，
                          和一副牌没有任何关系。换成牌背那个同心徽记的极淡拓印：
                          空位于是变成「这里要落一张牌」，而不是「这里有个字段没填」。
                        */}
                        <svg viewBox="0 0 100 150" aria-hidden="true"
                          className="pointer-events-none absolute inset-0 h-full w-full text-paper opacity-[0.16]">
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
                            className="relative whitespace-nowrap rounded-sm bg-paper px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink"
                          >下一张</motion.span>
                        )}
                      </div>
                    )}

                    </div>
                    {/* min-h 锁两行：各位置的 hint 长短不一，不锁高同一行的底边会参差 */}
                    {!pos.cross && !sideBySide && (
                      <p className={`text-center text-[10px] leading-relaxed text-paper/50 ${
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
            </div>
          </div>
        </ReaderScene>
      ) : (
      <div className="relative z-[1] mx-auto w-full max-w-3xl flex-1 px-7 pb-24 pt-10 md:px-12">
        <div className="relative flex-1">
          {/* ---------------- 3 证据 + 解读 ---------------- */}
          {step === 'reading' && (
            <motion.div
              key="reading"
              initial={{ y: 12 }} animate={{ y: 0 }}
              className="space-y-8"
            >
              {/*
                你问的是什么。解读的最后一段会先正面回答这句话，
                所以它必须写在这一屏最上面 —— 第一版这一屏没有它，
                读到结尾「这几张牌给的回答是」时，得往回翻才想得起问的是什么。
              */}
              <div className="text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-faint">你问的是</p>
                <h2 className="mx-auto mt-2 max-w-xl font-serif text-[24px] font-semibold leading-[1.4] text-ink sm:text-[28px]">
                  {question}
                </h2>
              </div>

              {/*
                抽牌屏的主角是牌堆，**这一屏的主角是抽到的牌** —— 它们是整个仪式的回报。
                和抽牌屏用同一套格子坐标：同一个牌阵在两屏上是同一个形状，
                翻完之后牌还在原地，不会跳成另一种排法。
              */}
              <div
                className="mx-auto grid justify-center gap-x-2 gap-y-4 sm:gap-x-4 sm:gap-y-5"
                style={{
                  gridTemplateColumns: `repeat(${spread.cols * 2}, minmax(0, 1fr))`,
                  // 翻开屏是回报，给大一档 —— 但要一屏看得全，见 readColW
                  maxWidth: spread.cols * readColW,
                }}
              >
                {drawn.map((c, i) => {
                  const pos = spread.positions[i];
                  return (
                    <div
                      key={i}
                      className="space-y-2.5"
                      style={{
                        gridColumn: colSpan(pos.col),
                        gridRow: pos.row,
                        // 同抽牌屏：只转牌，不转字
                        ...(pos.cross ? { zIndex: 2, alignSelf: 'center', justifySelf: 'center', width: '100%' } : null),
                      }}
                    >
                      {!pos.cross && (
                        <p className="whitespace-nowrap text-center font-serif text-[14px] font-semibold">{pos.label}</p>
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
                    <ReadingBody text={reading} positions={positionLabels} facts={facts} question={question} />
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
      )}
      </div>
    </div>
  );
}
