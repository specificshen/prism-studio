import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: { index: './src/main.tsx' },
  },
  html: {
    template: './src/index.html',
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  server: {
    port: 5188,
  },
});
