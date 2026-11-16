import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'
import { defineConfig, loadEnv } from 'vite'
import { localCurriculum } from './server/curriculum/localDev.ts'

export default defineConfig(({ command, mode }) => {
  const walkthrough = mode === 'walkthrough'
  const env = command === 'serve' && mode !== 'test' ? loadEnv(mode, process.cwd(), '') : {}
  const enabled = env.CIC_LOCAL_CURRICULUM === '1'
    && !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY)
  const key = enabled ? env.OPENROUTER_CURRICULUM_API_KEY : undefined
  if (enabled && !key) throw new Error('Set OPENROUTER_CURRICULUM_API_KEY to enable local curriculum generation.')
  return {
    plugins: [react(), tailwindcss(), ...(key ? [localCurriculum(key)] : [])],
    ...(walkthrough ? {
      base: './',
      publicDir: false,
      build: { outDir: 'dist-walkthrough', rollupOptions: { input: 'demo.html' } },
    } : {}),
    define: {
      'import.meta.env.VITE_LOCAL_CURRICULUM_ENABLED': JSON.stringify(!walkthrough && !!key),
      ...(walkthrough ? { 'import.meta.env.VITE_SUPABASE_URL': 'undefined', 'import.meta.env.VITE_SUPABASE_ANON_KEY': 'undefined' } : {}),
    },
    // Agent worktrees under .claude/ hold copies of the repo; never test them.
    test: { exclude: [...configDefaults.exclude, '.claude/**'] },
  }
})
