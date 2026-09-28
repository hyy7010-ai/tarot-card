/**
 * Vercel 函数入口。
 *
 * ⚠️ 接口逻辑不在这里，在 api.ts —— dev（vite.config.ts）、自建服务器（server.ts）
 *    和这里调的是同一份。这里只做 server.ts 做的那件事：把请求体交给 respond()。
 *
 * scripts/build-vercel-api.mjs 把它按每条路由打成一个独立文件放进 api/。
 * 打包而不是直接放源码，是因为 Vercel 不打包 api/ 里的 TS，
 * 而这个项目 "type": "module" 下的无扩展名相对 import 在运行时会找不到模块。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ROUTES, respond } from '../api';
import * as reading from '../reading';
import * as analysis from '../analysis';
import * as mock from '../mock';

const MODULES: Record<string, unknown> = {
  '/reading.ts': reading,
  '/analysis.ts': analysis,
  '/mock.ts': mock,
};

export function handlerFor(path: string) {
  const route = ROUTES.find(r => r.path === path)!;
  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: '只接受 POST' }));
    }
    // Vercel 可能已经把 JSON 解析好放在 req.body 上；没有就自己读原文
    let raw: string;
    if (typeof req.body === 'string') raw = req.body;
    else if (req.body !== undefined) raw = JSON.stringify(req.body);
    else {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      raw = Buffer.concat(chunks).toString('utf-8');
    }
    await respond(route, raw, res, async spec => MODULES[spec]);
  };
}
