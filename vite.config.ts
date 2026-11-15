import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Agent worktrees under .claude/ hold copies of the repo; never test them.
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
})
