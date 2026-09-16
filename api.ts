/**
 * 两条解读接口的**唯一**实现。
 *
 * dev（vite.config.ts 的插件）和生产（server.ts）都调这里，不许各写一份 ——
 * 错误怎么变人话、没 key 时怎么退回示例文案、流到一半断了怎么收尾，
 * 这些规矩抄成两份，迟早只改对一边，而用户看到的就是另一边。
 *
 * 唯一的差别是模块怎么加载：dev 走 ssrLoadModule（要 HMR 和 TS），
 * 生产走静态 import。所以 load 由调用方传进来。
 */

/**
 * 把模型 SDK 抛出来的错误变成一句人话。
 * 它抛的是一整坨 JSON 字符串，直接显示会在解读框里出现
 * `{"error":{"code":429,...}}` 这种东西。
 */
export function humanError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/RESOURCE_EXHAUSTED|\b429\b|quota/i.test(raw)) {
    const wait = raw.match(/retry in ([\d.]+)s/i)?.[1];
    return `免费额度用完了${wait ? `，约 ${Math.ceil(Number(wait))} 秒后可再试` : '，稍后再试'}。`;
  }
  if (/API key|API_KEY_INVALID|PERMISSION_DENIED/i.test(raw)) return 'API key 无效或没有权限。';
  if (/NOT_FOUND|is not found|not supported/i.test(raw)) return '这个模型当前不可用，需要换一个型号。';
  // 503 / UNAVAILABLE：模型侧排队排满了。和 429 是两回事 ——
  // 429 是「你的额度用完了」，503 是「大家都在挤」，等一会儿就好，不必让用户以为是自己的问题。
  if (/UNAVAILABLE|\b503\b|high demand|overloaded/i.test(raw)) {
    return '模型现在挤满了，等十几秒再试一次。这不是你的额度问题。';
  }
  if (/DEADLINE_EXCEEDED|\b504\b|timeout/i.test(raw)) return '模型这次没在时限内返回，再试一次。';
  if (/缺少 GEMINI_API_KEY/.test(raw)) return raw;
  // 兜底：只取第一句，别把整坨 JSON 甩到界面上
  return raw.replace(/\s+/g, ' ').slice(0, 120) || '解读失败';
}

export interface ApiRoute {
  path: string;
  /** 真解读所在的模块。dev 用它调 ssrLoadModule，生产用它查静态表 */
  module: string;
  stream(m: any, body: any): AsyncIterable<string>;
  /** 没配 key 时的示例文案。走 mock.ts，文字自带「未接入模型」标记 */
  mock(m: any, body: any): string;
  /** body 缺字段时返回一句人话；返回 null 表示放行 */
  check?(body: any): string | null;
}

export const ROUTES: ApiRoute[] = [
  {
    path: '/api/tarot/reading',
    module: '/reading.ts',
    stream: (m, b) => m.streamTarotReading(b.question ?? '', b.cards ?? [], b.facts ?? [], b.verdict ?? null),
    mock: (m, b) => m.mockTarotReading(b.question ?? '', b.cards ?? [], b.facts ?? [], b.verdict ?? null),
  },
  {
    path: '/api/relationship/analysis',
    module: '/analysis.ts',
    stream: (m, b) => m.streamRelationshipAnalysis(b.metrics, b.imbalance, b.otherName ?? '对方'),
    mock: (m, b) => m.mockRelationshipAnalysis(b.metrics, b.imbalance, b.otherName ?? '对方'),
    check: b => (b?.metrics?.me && b?.imbalance ? null : '缺少已算好的指标'),
  },
];

/** node:http 和 connect 的 res 都满足这个形状，所以两边能共用 */
export interface MinimalRes {
  statusCode: number;
  setHeader(k: string, v: string): void;
  write(chunk: string): unknown;
  end(chunk?: string): unknown;
}

/**
 * 跑完一次请求。
 *
 * @param raw  请求体原文；解析失败算调用方的错
 * @param load 按模块名取模块：dev 传 ssrLoadModule，生产传静态表的查询
 */
export async function respond(
  route: ApiRoute,
  raw: string,
  res: MinimalRes,
  load: (spec: string) => Promise<any>,
): Promise<void> {
  const json = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    // 请求本身就是坏的：400，而且不要把解析器的英文报错甩到用户界面上
    return json(400, { error: '请求格式错误' });
  }

  // 缺字段是调用方的错，别让它变成一句内部报错甩到界面上
  const bad = route.check?.(body) ?? null;
  if (bad) return json(400, { error: bad });

  try {
    /*
      没配 key 就走示例文案，让整条流程能走完看界面。
      这不是模型输出，mock.ts 会在文字开头打上「未接入模型」的标记 —— 不要去掉那个标记。
      示例文案也走同一条纯文本通道，前端不必分两种解析。
    */
    if (!process.env.GEMINI_API_KEY) {
      const text = route.mock(await load('/mock.ts'), body);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(text);
      return;
    }

    const m = await load(route.module);
    /*
      流式：逐段吐给前端，第一个字一两秒就到，而不是干等十几秒。

      错误分两种，处理方式不同：
      - 还没吐出第一个字就失败 → 头还没发，照常返回 JSON 500 + 人话
      - 已经吐了一半才断 → 状态码改不了了，只能在正文末尾补一行说明，
        前端把它当解读的一部分显示。含糊地停在半句比说清楚更糟。
    */
    const it = route.stream(m, body)[Symbol.asyncIterator]();
    const first = await it.next();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (!first.done && first.value) res.write(first.value);
    try {
      for (let n = await it.next(); !n.done; n = await it.next()) {
        if (n.value) res.write(n.value);
      }
      res.end();
    } catch (e) {
      res.write(`\n\n（解读中断了：${humanError(e)}）`);
      res.end();
    }
  } catch (e) {
    json(500, { error: humanError(e) });
  }
}
