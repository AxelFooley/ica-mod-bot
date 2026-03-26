import * as esbuild from './node_modules/esbuild/lib/main.js';
import { builtinModules } from 'node:module';

await esbuild.build({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/server/index.cjs',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  // Only external native modules - @devvit/public-api should be available in runtime
  external: [...builtinModules],
  logLevel: 'info',
});
console.log('Build complete');
