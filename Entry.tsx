import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, ArrowRight, Check, Sparkles, Trash2 } from 'lucide-react';
import { parseChat, type ParseResult } from './parseChat';
import { computeRelationshipMetrics } from './metrics';
import TarotCard from './TarotCard';
import { ILLUSTRATED } from './illustrated';
import { TAROT_CARDS } from './cards';
import type { ChatMessage } from './types';

/**
 * 首页。
 *
 * 两个入口并列：恋爱分析、真心塔罗。它们读的是同一批聊天记录 ——
 * 报告把数字摆出来，塔罗把同一批数字换个说法，谁先谁后由用户挑。
 *
 * 但两个入口都要先有数据。没有导入之前这东西只能演示不能用，
 * 所以点任一入口若还没有记录，就先走导入。
 *
 * 一条硬规矩贯穿全程：**读不懂就说读不懂**。
 * 解析不出的行原样列出来，样本不够就直说不够，绝不猜一个时间戳硬凑 ——
 * 凑进去的那一条会污染 metrics.ts 算出的每一个数字，而这个产品唯一的
 * 立身之本就是那些数字是真的。
 */

export type Destination = 'analysis' | 'tarot';

interface EntryProps {
  /** 已经有聊天记录了：点图标直接进，不用再导入 */
  hasData: boolean;
  onOpen: (dest: Destination) => void;
  /** 丢掉已导入的记录，重新粘一份 */
  onReset: () => void;
  onStart: (
    messages: ChatMessage[], myUid: string, otherName: string,
    dest: Destination,
    /** 用户勾了才把聊天记录写进这台设备 */
    remember: boolean,
    /** 这份记录有没有逐条时间戳 */
    hasTimestamps: boolean,
  ) => void;
  /** 这台设备上存着的记录（用户上次选择保留），没有就是 null */
  saved: { otherName: string; savedAt: number } | null;
  onForget: () => void;
  onDemo: (dest: Destination) => void;
}

/*
 * 首屏摊开的三张。
 *
 * 这不是装饰：整个首屏原来一张牌都不露，产品最强的资产（51 张 Riso 插画）
 * 全押在第二屏之后，而首屏下半截是空的 —— 一个塔罗产品的第一印象里没有牌。
 * 点它走的就是 02 那条入口，下面那行是牌堆的真实张数，不是一句广告。
 *
 * 选这三张是为了把这个产品的情绪范围说全：结合、不安、希望。
 * 只挑好牌会变成「一切都会好」——那不是这个产品答应过的事。
 */
const ENTRY_CARDS = ['恋人', '月亮', '星星'] as const;

const SAMPLE = `2026-08-01 09:12 我
在忙吗？今天路过我们上次那家店，居然关门了
2026-08-01 09:24 TA
哦是吗`;

/** 首页的两个入口 */
const DOORS: {
  key: Destination; name: string; line: string;
  Icon: typeof Activity;
}[] = [
  {
    key: 'analysis', name: '恋爱分析', Icon: Activity,
    line: '谁先开口、谁回得慢、谁在提问。全部数出来，不猜。',
  },
  {
    key: 'tarot', name: '真心塔罗', Icon: Sparkles,
    line: '可以直接抽。有分析结果时，牌会绑着那些数字说话。',
  },
];

/**
 * 「记录怎么弄出来」。
 *
 * 这一屏是整条路径上唯一会把真实用户挡死的地方 —— 后面报告、塔罗都建好了，
 * 但人得先把聊天记录弄进来。所以这里的规矩和产品其余部分一样：**不许吹**。
 * 微信在手机上就是导不出来，那就直说导不出来，并告诉他退而求其次的那条路
 * 会少掉哪几项指标，而不是让他粘完才发现报告是半残的。
 */
const HOWTO: { key: string; name: string; best: boolean; steps: string[]; note?: string }[] = [
  {
    key: 'whatsapp', name: 'WhatsApp', best: true,
    steps: [
      '打开和对方的对话',
      '点最上面的联系人名字 → 拉到底「导出聊天」',
      '选「不含媒体文件」，拿到一个 .txt',
      '把这个 .txt 直接拖到下面的框里，不用打开复制',
    ],
    note: '这条路能拿到逐条时间，六项指标全都算得出来。',
  },
  {
    key: 'wechat', name: '微信', best: false,
    steps: [
      '手机上没有导出功能，这是微信的限制，不是这里做不到',
      '电脑版微信里可以框选一段对话直接复制，粘进来试试',
      '或者照着截图敲：每行写「我：」或「TA：」加上内容',
    ],
    note: '手敲的没有逐条时间，「谁先开口」「回复速度」「让你等多久」这三项会标成算不出来。',
  },
  {
    key: 'other', name: '短信 / 其他', best: false,
    steps: [
      '大多没有导出，照着截图敲就行',
      '每行「我：内容」或「对方名字：内容」，一句一行',
    ],
    note: '同上，没有时间的那三项不会出现在报告里。',
  },
];

function HowTo() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="border-y border-ink/15">
      <p className="pb-1 pt-4 text-[11px] text-ink-mid">记录怎么弄出来</p>
      <div className="flex flex-wrap gap-2 pb-3.5 pt-2">
        {HOWTO.map(h => (
          <button
            key={h.key}
            onClick={() => setOpen(v => (v === h.key ? null : h.key))}
            className={`border px-3.5 py-1.5 text-[11px] transition-colors ${
              open === h.key
                ? 'border-ink bg-ink text-paper'
                : 'border-ink/25 text-ink-mid hover:border-ink hover:text-ink'
            }`}
          >
            {h.name}
            {h.best && (
              <span className={`ml-1.5 ${open === h.key ? 'text-paper/70' : 'text-vermilion'}`}>最完整</span>
            )}
          </button>
        ))}
      </div>
      {open && (
        <motion.div
          initial={{ y: -4 }} animate={{ y: 0 }}
          className="border-t border-ink/15 py-4"
        >
          <ol className="space-y-1.5">
            {HOWTO.find(h => h.key === open)!.steps.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-[1.85] text-ink-mid">
                <span className="mt-px font-mono text-[10px] text-ink-faint">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] leading-[1.8] text-ink-faint">
            {HOWTO.find(h => h.key === open)!.note}
          </p>
        </motion.div>
      )}
    </div>
  );
}

export default function Entry({ hasData, onOpen, onReset, onStart, onDemo, saved, onForget }: EntryProps) {
  const [step, setStep] = useState<'home' | 'paste'>('home');
  const [dest, setDest] = useState<Destination>('analysis');
  const [raw, setRaw] = useState('');
  const [me, setMe] = useState<string | null>(null);
  // 默认不留：保留聊天原文这件事必须是用户主动选的
  const [remember, setRemember] = useState(false);

  const parsed: ParseResult | null = useMemo(
    () => (raw.trim() ? parseChat(raw) : null),
    [raw],
  );
  // 选定「我是谁」之后才能算：算出来只为在进报告之前如实说明样本够不够
  const preview = useMemo(
    () => (parsed && me ? computeRelationshipMetrics(parsed.messages, me) : null),
    [parsed, me],
  );
  const other = parsed?.speakers.find(s => s !== me) ?? '对方';

  /*
    读 .txt。
    WhatsApp 导出的本来就是一个 .txt，现在却要用户打开它、全选、复制、粘贴 ——
    而这一屏已经是整条路径上唯一会把人挡死的地方，没必要再加三步。

    ⚠️ 全程用 File.text() 在本地读，文件不发去任何地方。
       首屏那句「聊天原文不会离开这台设备」是靠这一点成立的，别改成上传。
  */
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const readFile = async (file: File) => {
    // 宁可说不认，不要读出一堆乱码再让 parseChat 去猜
    const looksText = /\.(txt|log|csv)$/i.test(file.name) || file.type.startsWith('text/');
    if (!looksText) {
      setFileNote(`${file.name} 不是文本文件。WhatsApp 导出时要选「不含媒体文件」，拿到的才是 .txt`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileNote(`${file.name} 有 ${(file.size / 1024 / 1024).toFixed(1)}MB，太大了。先截一段最近的出来。`);
      return;
    }
    setRaw(await file.text());
    setFileNote(`已读取 ${file.name}`);
  };

  const pick = (d: Destination) => {
    setDest(d);
    // 塔罗不需要聊天记录 —— 没有记录就只有牌意，这是它本来就支持的状态，
    // 而不是一个残缺状态。只有恋爱分析非有记录不可：没有记录它连一个数字都算不出来。
    if (hasData || d === 'tarot') onOpen(d);
    else setStep('paste');
  };

  return (
    <div className="paper-grain scrollbar-hide relative flex flex-1 flex-col overflow-y-auto bg-paper">
      <div className="relative z-[1] mx-auto w-full max-w-2xl flex-1 px-7 py-12 md:px-12">
        <motion.div initial={{ y: 10 }} animate={{ y: 0 }}>
          <p className="font-mono text-[8.5px] uppercase tracking-[0.3em] text-ink-faint">
            Realheart · 恋爱分析与塔罗
          </p>
          <h1 className="mt-4 font-serif text-[30px] font-semibold leading-[1.32] md:text-[36px]">
            TA到底在不在意你
            <br />
            聊天记录已经回答过了
          </h1>
          <p className="mt-5 max-w-md border-l-2 border-vermilion pl-4 text-[14px] leading-[1.95] text-ink-mid">
            两种看法，同一批证据。聊天记录只在你的浏览器里解析，
            数字也在本地算完；只有最后那段文字解读，会把<span className="text-ink">算好的数字</span>
            发给模型 —— 聊天原文不会离开这台设备。
          </p>
        </motion.div>

        {/* ---------------- 首页：两个入口 ---------------- */}
        {step === 'home' && (
          <motion.div
            initial={{ y: 12 }} animate={{ y: 0 }}
            transition={{ delay: 0.06 }}
            className="mt-10 space-y-3"
          >
            {/* 两个入口是目录里的两条，不是两张卡片 */}
            <div className="border-t-2 border-ink">
              {DOORS.map(({ key, name, line, Icon }, i) => (
                <motion.button
                  key={key}
                  onClick={() => pick(key)}
                  initial={{ y: 8 }} animate={{ y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06 }}
                  className="group flex w-full items-start gap-4 border-b border-ink/15 py-5 text-left"
                >
                  <span className="mt-1 font-mono text-[10px] tracking-[0.1em] text-vermilion">
                    0{i + 1}
                  </span>
                  <Icon size={17} className="mt-0.5 shrink-0 text-ink" strokeWidth={1.4} />
                  <span className="min-w-0 flex-1">
                    {/* 原来这里跟着一个 REPORT / TAROT，是中文名的拉丁复读，纯装饰 */}
                    <span className="font-serif text-[19px] font-semibold">{name}</span>
                    <span className="mt-2 block text-[13px] leading-[1.85] text-ink-mid">{line}</span>
                  </span>
                  <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint transition-colors group-hover:text-vermilion">
                    {key === 'tarot' ? (hasData ? '打开' : '直接抽牌') : hasData ? '打开' : '导入记录'}
                    <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </motion.button>
              ))}
            </div>

            {saved && (
              <div className="flex items-center gap-3 border-b border-ink/15 py-3.5">
                <Check size={13} className="shrink-0 text-ink-faint" />
                <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-mid">
                  这台设备上存着一份和<span className="text-ink">{saved.otherName}</span>的记录
                  （{new Date(saved.savedAt).toLocaleDateString()} 导入）。
                </p>
                <button
                  onClick={onForget}
                  className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-vermilion"
                >
                  <Trash2 size={11} /> 删掉
                </button>
              </div>
            )}

            <button
              onClick={() => {
                if (!hasData) return onDemo('analysis');
                onReset(); setRaw(''); setMe(null); setStep('paste');
              }}
              className="w-full py-3.5 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-vermilion"
            >
              {hasData ? '换一份聊天记录' : '还没有记录？先看一份示例'}
            </button>

            <button
              onClick={() => pick('tarot')}
              aria-label="打开真心塔罗"
              className="group block w-full pt-8"
            >
              <div className="flex items-end justify-center">
                {ENTRY_CARDS.map((name, i) => (
                  <span
                    key={name}
                    className="-mx-3 block origin-bottom transition-transform duration-500 sm:-mx-4"
                    style={{
                      // 中间那张抬高一点，三张才像摊在桌上而不是排队贴着
                      transform: `rotate(${(i - 1) * 7}deg) translateY(${Math.abs(i - 1) * 10}px)`,
                      /*
                        叠序必须从左往右递增（真实摊牌就是这么压的）。
                        原来让中间那张压最上面，它就同时盖住了右边那张的左下角 ——
                        罗马数字正好在那儿，XVII 被裁成了 II。
                        序号在左下、逆位标记在右下，左压右才不会吃掉序号。
                      */
                      zIndex: i,
                    }}
                  >
                    <TarotCard name={name} size="md" />
                  </span>
                ))}
              </div>
              <p className="mt-7 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint transition-colors group-hover:text-vermilion">
                <span className="tabular-nums">牌堆 {ILLUSTRATED.length} 张</span>
                <span className="mx-1.5">·</span>
                <span className="tabular-nums">满副 {TAROT_CARDS.length}，插画还在补</span>
              </p>
            </button>
          </motion.div>
        )}

        {/* ---------------- 导入 ---------------- */}
        {step === 'paste' && (
          <motion.div initial={{ y: 12 }} animate={{ y: 0 }} className="mt-10 space-y-4">
            <div className="flex items-baseline gap-2.5 border-b-2 border-ink pb-2">
              <span className="font-mono text-[10px] tracking-[0.1em] text-vermilion">01</span>
              <h2 className="font-serif text-[13px] font-semibold">
                导入后进入 · {DOORS.find(d => d.key === dest)?.name}
              </h2>
            </div>

            <HowTo />

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-ink-mid">
              <button
                onClick={() => fileRef.current?.click()}
                className="border-b border-ink/40 pb-px text-ink transition-colors hover:border-vermilion hover:text-vermilion"
              >
                选一个 .txt 文件
              </button>
              <span className="text-ink-faint">或直接拖进下面的框 · 文件只在本地读，不会上传</span>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.log,.csv,text/plain"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) readFile(f);
                  // 清掉，否则再选同一个文件不会触发 change
                  e.target.value = '';
                }}
              />
            </div>

            {fileNote && (
              <p className="border-l-2 border-ink pl-3.5 font-mono text-[11px] tracking-[0.04em] text-ink-mid">
                {fileNote}
              </p>
            )}

            <div
              className="relative"
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) readFile(f);
              }}
            >
              <textarea
                value={raw}
                onChange={e => setRaw(e.target.value)}
                rows={12}
                spellCheck={false}
                placeholder={`把聊天记录粘贴到这里，例如：\n\n${SAMPLE}`}
                className={`w-full resize-none border bg-paper-raised px-4 py-3.5 font-mono text-[12px] leading-[1.9] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-ink ${
                  dragging ? 'border-vermilion' : 'border-ink/20'
                }`}
              />
              {dragging && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-paper/85">
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-vermilion">
                    松手读取
                  </span>
                </div>
              )}
            </div>

            {parsed && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 border-l-2 border-ink pl-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] tracking-[0.06em]">
                      读出 {parsed.messages.length} 条，{parsed.speakers.length} 个人
                    </p>
                    {parsed.unparsed.length > 0 && (
                      <p className="mt-1 text-[11px] leading-[1.8] text-ink-mid">
                        另有 {parsed.unparsed.length} 行没读懂，已跳过（不会算进任何数字）。
                        第一行是「{parsed.unparsed[0].slice(0, 24)}」
                      </p>
                    )}
                  </div>
                </div>

                {parsed.messages.length > 0 && !parsed.hasTimestamps && (
                  <div className="flex items-start gap-3 border-l-2 border-vermilion/40 pl-3.5">
                    <p className="text-[11px] leading-[1.85] text-ink-mid">
                      这份记录里<span className="text-ink">没有逐条时间</span>，
                      所以「谁在开启对话」「回复速度」「让你等超过 24 小时」这三项算不出来 ——
                      报告里会标成不可计算，不会拿 0 冒充。
                      想要这几项，需要带时间的导出记录。
                    </p>
                  </div>
                )}

                {parsed.speakers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-ink-mid">哪个是你</p>
                    <div className="flex flex-wrap gap-2">
                      {parsed.speakers.map(s => (
                        <button
                          key={s}
                          onClick={() => setMe(s)}
                          className={`border px-4 py-2 text-xs transition-colors ${
                            me === s
                              ? 'border-ink bg-ink text-paper'
                              : 'border-ink/25 text-ink-mid hover:border-ink hover:text-ink'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 样本够不够，在进报告之前就说清楚 */}
            {preview && !preview.sufficient && (
              <div className="flex items-start gap-3 border-l-2 border-ink/25 pl-3.5">
                <p className="text-[11px] leading-[1.85] text-ink-mid">
                  {preview.insufficientReason}。样本不足时不出结论，
                  你仍然可以继续，但报告里会是空的。
                </p>
              </div>
            )}

            {parsed && parsed.messages.length > 0 && (
              <button
                onClick={() => setRemember(v => !v)}
                className="flex w-full items-start gap-3 border-y border-ink/15 py-4 text-left"
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border transition-colors ${
                  remember ? 'border-ink bg-ink' : 'border-ink/35'
                }`}>
                  {remember && <Check size={11} className="text-paper" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px]">把这份记录留在这台设备上</span>
                  <span className="mt-1 block text-[11px] leading-[1.8] text-ink-faint">
                    {remember
                      ? '下次打开不用重新粘。聊天原文会存进这个浏览器，首页随时可以删掉。'
                      : '不留。关掉标签页就没了，下次要重新粘一遍。'}
                  </span>
                </span>
              </button>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setStep('home')}
                className="border border-ink/25 px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mid transition-colors hover:border-ink hover:text-ink"
              >
                返回
              </button>
              <button
                disabled={!parsed?.messages.length || !me}
                onClick={() => me && parsed && onStart(parsed.messages, me, other, dest, remember, parsed.hasTimestamps)}
                className="flex flex-1 items-center justify-center gap-2 bg-ink py-3.5 font-mono text-[10px] uppercase tracking-[0.3em] text-paper transition-opacity disabled:opacity-25"
              >
                进入 <ArrowRight size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
