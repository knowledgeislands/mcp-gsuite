import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertOutputPathWithinDownloadRoot, assertRealPathWithinRoot, resolveWithinRoot } from './paths.js'

describe('paths containment helpers (mcp-gsuite)', () => {
  const tmpRoot = path.join(os.tmpdir(), 'mcp-gsuite-paths-tests', `run-${process.pid}-${Date.now()}`)
  const root = path.join(tmpRoot, 'root')

  beforeEach(async () => {
    await fs.mkdir(root, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  describe('resolveWithinRoot', () => {
    it('resolves a relative path inside the root', () => {
      expect(resolveWithinRoot(root, 'sub/file.txt')).toBe(path.join(root, 'sub', 'file.txt'))
    })

    it('strips leading slashes and backslashes before resolving (still inside root)', () => {
      expect(resolveWithinRoot(root, '/abs/file.txt')).toBe(path.join(root, 'abs', 'file.txt'))
      expect(resolveWithinRoot(root, 'win\\file.txt')).toBe(path.join(root, 'win', 'file.txt'))
    })

    it('returns the root itself when the relative path is empty', () => {
      expect(resolveWithinRoot(root, '')).toBe(root)
    })

    it('throws when a "../" sequence escapes the root', () => {
      expect(() => resolveWithinRoot(root, '../../etc/passwd')).toThrow(/Path escapes root/)
    })

    it('handles a root that already ends with a path separator', () => {
      expect(resolveWithinRoot(`${root}${path.sep}`, 'sub/file.txt')).toBe(path.join(root, 'sub', 'file.txt'))
    })
  })

  describe('assertRealPathWithinRoot', () => {
    it('accepts a not-yet-created path whose ancestor lives in the root', async () => {
      await expect(assertRealPathWithinRoot(root, path.join(root, 'new', 'file.txt'))).resolves.toBeUndefined()
    })

    it('throws when a symlink redirects the target outside the root', async () => {
      const outside = path.join(tmpRoot, 'outside')
      await fs.mkdir(outside, { recursive: true })
      const link = path.join(root, 'escape')
      await fs.symlink(outside, link)
      await expect(assertRealPathWithinRoot(root, path.join(link, 'file.txt'))).rejects.toThrow(/Path escapes root/)
    })
  })

  describe('assertOutputPathWithinDownloadRoot', () => {
    it('returns the resolved path for an in-root relative target', async () => {
      const resolved = await assertOutputPathWithinDownloadRoot(root, 'out.eml')
      expect(resolved).toBe(path.join(root, 'out.eml'))
    })

    it('throws on an absolute target outside the root', async () => {
      await expect(assertOutputPathWithinDownloadRoot(root, path.join(tmpRoot, 'elsewhere.eml'))).rejects.toThrow(/escapes download root/)
    })

    it('handles a download root that already ends with a path separator', async () => {
      const resolved = await assertOutputPathWithinDownloadRoot(`${root}${path.sep}`, 'out.eml')
      expect(resolved).toBe(path.join(root, 'out.eml'))
    })
  })
})
