import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { ROUTES, respond } from './api';

/**
 * dev 的两条解读接口。
 *
 * 放在 dev server 里而不是前端，只有一个原因：GEMINI_API_KEY 不能进 bundle。
 * **逻辑全在 api.ts**，这里只负责把 Vite 的请求喂进去 ——
 * 生产的 server.ts 调的是同一份，两边不会漂。
 */
function readingApis(): Plugin {
  return {
    name: 'realheart-reading-apis',
    configureServer(server) {
      for (const route of ROUTES) {
        server.middlewares.use(route.path, async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.end(JSON.stringify({ error: '只接受 POST' }));
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          // ssrLoadModule：dev 要 TS 和 HMR，不能用静态 import
          await respond(route, Buffer.concat(chunks).toString('utf-8'), res,
            spec => server.ssrLoadModule(spec));
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // reading.ts 走 process.env，Vite 默认不把 .env 灌进去，这里手动补上
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'GEMINI'));
  /*
    端口跟着 PORT 环境变量走。

    Vite 默认只认 server.port（5173），端口被占就自己 +1 试下一个 ——
    于是外面分配的端口和它实际监听的端口对不上，预览就连不上。
    这个项目不需要固定端口：两个接口都是相对路径 /api/...，也没有 OAuth 回调。
  */
  const port = Number(process.env.PORT) || undefined;
  return {
    plugins: [react(), tailwindcss(), readingApis()],
    server: {
      /*
        绑 127.0.0.1，不是默认的 'localhost'。

        'localhost' 在 macOS 上会解析到 ::1，于是 Vite **只监听 IPv6**，
        而浏览器把 localhost 解析成 IPv4 127.0.0.1 —— 那边没人听，
        报出来就是 ERR_CONNECTION_REFUSED，看着像服务没起，其实起了。

        ⚠️ 不要图省事改成 '0.0.0.0'：那会把这个带着 GEMINI key、
           而且首屏写着「聊天原文不会离开这台设备」的服务暴露到整个局域网。
           回环就够了。
      */
      host: '127.0.0.1',
      ...(port ? { port, strictPort: true } : {}),
    },
  };
});
