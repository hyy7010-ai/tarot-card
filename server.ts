/**
 * 生产服务器：发 dist/ 的静态文件 + 两条解读接口。
 *
 * 为什么需要它：接口本来只活在 Vite 的 dev 插件里，`vite build` 出来的产物
 * 只有前端，部署上去点「深度解读」会 404。
 *
 * ⚠️ 接口逻辑**不在这里**，在 api.ts —— dev 和生产调同一份。
 *    这里只做两件事：把请求体读出来交给它，以及发静态文件。
 *
 * 隐私：前端发过来的只有**算好的数字**（metrics / facts），聊天原文从不离开浏览器。
 * 首屏那句承诺靠的是这一点，改接口时别把原文捎上。
 */
import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, respond } from './api';
import * as reading from './reading';
import * as analysis from './analysis';
import * as mock from './mock';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, 'dist');

/** 生产用静态表代替 dev 的 ssrLoadModule；键要和 ROUTES 里的 module 对得上 */
const MODULES: Record<string, unknown> = {
  '/reading.ts': reading,
  '/analysis.ts': analysis,
  '/mock.ts': mock,
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * 把 URL 路径解成 dist 里的一个真实文件路径，**解不安全就返回 null**。
 *
 * ⚠️ 这是这个文件里唯一有安全后果的函数。
 *    `/../../../.env` 这种请求必须挡住 —— 这台机器上就有一个装着 GEMINI_API_KEY 的 .env。
 *    只信 path.resolve 之后的结果落在 ROOT 里面，不要靠「字符串里有没有 ..」去判断
 *    （%2e%2e、多重编码、反斜杠都能绕过那种写法）。
 */
export function safePath(urlPath: string, root = ROOT): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;                                   // 编码本身就是坏的
  }
  if (decoded.includes('\0')) return null;
  const resolved = path.resolve(root, `.${decoded}`);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

async function sendFile(res: import('node:http').ServerResponse, file: string, cache: string) {
  const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  await new Promise<void>((ok, fail) => {
    createReadStream(file).on('error', fail).on('end', ok).pipe(res);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = ROUTES.find(r => r.path === url.pathname);

  if (route) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: '只接受 POST' }));
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return respond(route, Buffer.concat(chunks).toString('utf-8'), res,
      async spec => MODULES[spec]);
  }

  const file = safePath(url.pathname);
  if (!file) {
    res.statusCode = 400;
    return res.end('bad path');
  }

  try {
    const stat = await fs.stat(file);
    if (stat.isFile()) {
      /*
        带内容哈希的资源可以永久缓存，其余（index.html、public 下的插画）不行 ——
        index.html 缓存住会让用户一直拿到旧版本的 JS。
      */
      const hashed = /\/assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(url.pathname);
      return await sendFile(res, file, hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
  } catch {
    // 不存在就往下走，交给 index.html
  }

  // 没有服务端路由，任何别的路径都回首页（应用的状态全在前端）
  try {
    await sendFile(res, path.join(ROOT, 'index.html'), 'no-cache');
  } catch {
    res.statusCode = 500;
    res.end('dist/ 不存在 —— 先跑 npm run build');
  }
});

/*
  ⚠️ 只有被**直接运行**时才监听。
     server.test.ts 要 import safePath 来测路径穿越，一 import 就 listen 的话
     测试进程永远不退出（node --test 会一直等着这个句柄）。
*/
const runDirectly = !!process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Render 之类的平台按 PORT 注入端口，并且要求监听 0.0.0.0（只听回环会被判成没起来）
const port = Number(process.env.PORT) || 3000;
if (runDirectly) server.listen(port, '0.0.0.0', () => {
  console.log(`realheart 已启动：http://0.0.0.0:${port}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ 没有 GEMINI_API_KEY，解读会返回带「未接入模型」标记的示例文案。');
  }
});
