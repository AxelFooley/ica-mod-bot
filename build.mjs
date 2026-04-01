import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/server/main.js',
  external: ['node:*', 'http', 'https', 'fs', 'path', 'os', 'crypto', 'stream', 'util', 'events', 'buffer', 'url', 'net', 'tls', 'zlib', 'async_hooks', 'child_process', 'cluster', 'dgram', 'dns', 'domain', 'punycode', 'querystring', 'readline', 'repl', 'string_decoder', 'timers', 'tty', 'v8', 'vm', 'worker_threads'],
});

console.log('Build complete: dist/server/main.js');
