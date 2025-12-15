import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['force-graph', 'd3'],
  outExtension({ format }: { format: 'cjs' | 'esm' | 'iife' }) {
    return {
      js: format === 'esm' ? '.esm.js' : '.js',
    };
  },
  banner: {
    js: '// @falkordb/canvas - Force-directed graph visualization component',
  },
});

