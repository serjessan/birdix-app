import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Los worktrees aislados de subagentes viven bajo .claude/worktrees/ —
    // sin excluirlos, vitest también recorre y cuenta sus copias de los
    // tests (duplicando el recuento de test files) mientras un worktree
    // sigue activo en disco.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/.git/**'],
  },
})