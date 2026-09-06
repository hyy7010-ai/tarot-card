import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * 解读接口。
 *
 * 放在 dev server 里而不是前端，只有一个原因：GEMINI_API_KEY 不能进 bundle。
 * 生产环境请用同样的逻辑自己起一个 /api/tarot/reading —— 见 README。
 */
/**
 * 两条解读接口。
 *
 * 放在 dev server 里而不是前端，只有一个原因：GEMINI_API_KEY 不能进 bundle。
 * 生产环境请用同样的逻辑自己起这两个路由 —— 见 README。
 */
function readingApis(): Plugin {
  /** 两条路由的公共部分：读 body、按需加载服务端模块、统一错误形状 */
  const route = (
    server: import('vite').ViteDevServer,
    path: string,
    mod: string,
    call: (m: any, body: any) => Promise<string | undefined>,
    /** body 缺字段时返回一句人话；返回 null 表示放行 */
    check: (body: any) => string | null = () => null,
  ) => {
    server.middlewares.use(path, async (req, res) => {
      const json = (status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'POST') return json(405, { error: '只接受 POST' });
      let body: any;
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      } catch {
        // 请求本身就是坏的：400，而且不要把解析器的英文报错甩到用户界面上
        return json(400, { error: '请求格式错误' });
      }
      const bad = check(body);
      // 缺字段是调用方的错，别让它变成一句内部报错甩到界面上
      if (bad) return json(400, { error: bad });
      try {
        // 按需加载：没配 key 的人也能跑到解读之前的每一屏
        const text = await call(await server.ssrLoadModule(mod), body);
        json(200, { text });
      } catch (e) {
        json(500, { error: e instanceof Error ? e.message : '解读失败' });
      }
    });
  };

  return {
    name: 'realheart-reading-apis',
    configureServer(server) {
      route(server, '/api/tarot/reading', '/reading.ts', (m, b) =>
        m.generateTarotReading(b.question ?? '', b.cards ?? [], b.facts ?? []));
      route(server, '/api/relationship/analysis', '/analysis.ts', (m, b) =>
        m.generateRelationshipAnalysis(b.metrics, b.imbalance, b.otherName ?? '对方'),
        b => (b?.metrics?.me && b?.imbalance ? null : '缺少已算好的指标'));
    },
  };
}

export default defineConfig(({ mode }) => {
  // reading.ts 走 process.env，Vite 默认不把 .env 灌进去，这里手动补上
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'GEMINI'));
  return { plugins: [react(), tailwindcss(), readingApis()] };
});
