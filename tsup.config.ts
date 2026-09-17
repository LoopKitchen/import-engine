import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  injectStyle: true,
  external: ['react', 'react-dom', '@mui/material', '@mui/icons-material'],
})
