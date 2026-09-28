// 把 vercel/handler.ts 按路由打成 api/ 下的独立函数（见 handler.ts 顶部的说明）
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const routes = { 'tarot/reading': '/api/tarot/reading', 'relationship/analysis': '/api/relationship/analysis' };
for (const [file, path] of Object.entries(routes)) {
  const entry = `vercel/.entry-${file.replace('/', '-')}.ts`;
  writeFileSync(entry, `import { handlerFor } from './handler';\nexport default handlerFor(${JSON.stringify(path)});\n`);
  mkdirSync(`api/${file.split('/')[0]}`, { recursive: true });
  await build({
    entryPoints: [entry], outfile: `api/${file}.mjs`, bundle: true,
    platform: 'node', target: 'node20', format: 'esm', logLevel: 'warning',
    // esbuild 打 ESM 时，依赖里的 require() 需要一个真的 require
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
  console.log(`  api/${file}.mjs`);
}
