import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // Generated typed client — auto-produced by the mcporter codegen script.
        'src/generated/**',
        // Server entry points and the thin tool-definition layer are pure
        // wiring (each tool def is `server.registerTool(...)` calling a main/
        // function); their behaviour is exercised by the registration test and
        // the smoke test in CI. The real logic lives in src/main/ and is fully
        // covered there.
        'src/mcp-server/index.ts',
        'src/auth-server/**',
        'src/tools/**',
        // Pure-data annotation presets — no executable branches.
        'src/utils/annotations.ts'
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100
      }
    }
  }
})
