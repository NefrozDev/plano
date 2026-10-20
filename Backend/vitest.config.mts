import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests. Vitest compiles TypeScript with esbuild, which drops the
 * decorator metadata Nest's dependency injection reads: SWC emits it, using
 * the decorator settings from tsconfig.json.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    // One throwaway PostgreSQL server for the whole run.
    globalSetup: ['./test/global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.entity.ts',
        'src/auth/auth.types.ts',
        'src/auth/dto/login.dto.ts',
        'src/auth/dto/register.dto.ts',
        'src/groups/dto/*.dto.ts',
        'src/groups/group.types.ts',
        'src/lists/dto/*.dto.ts',
        'src/**/testing/**',
        'src/database/migrations/**',
      ],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
