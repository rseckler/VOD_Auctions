import * as fs from "fs"
import * as path from "path"

/**
 * Cwd-independent project path resolution.
 *
 * Background: Medusa 2.x production runs from `backend/.medusa/server/` (the
 * build output), while `medusa develop` runs from `backend/`. Code that used
 * `path.resolve(process.cwd(), "..", "data", ...)` or
 * `path.resolve(__dirname, "../../../../../../scripts/...")` was silently
 * depending on one of those two layouts and broke when the cwd changed.
 *
 * Fix: walk up from `process.cwd()` until we find a directory containing
 * `backend/`, `scripts/`, and `storefront/` as siblings. That marker triple
 * uniquely identifies the VOD_Auctions repo root. The result is cached after
 * the first call — the project root does not change at runtime.
 *
 * Usage:
 *   import { getScriptsDir, getDataDir } from "../../../lib/paths"
 *   const PROGRESS_FILE = path.join(getDataDir(), "discogs_daily_progress.json")
 *
 * Never construct project-relative paths via `process.cwd()` or `__dirname`
 * directly — always go through this module.
 */

let cachedProjectRoot: string | null = null

export function getProjectRoot(): string {
  if (cachedProjectRoot) return cachedProjectRoot

  let current = process.cwd()
  for (let i = 0; i < 15; i++) {
    if (
      fs.existsSync(path.join(current, "backend")) &&
      fs.existsSync(path.join(current, "scripts")) &&
      fs.existsSync(path.join(current, "storefront"))
    ) {
      cachedProjectRoot = current
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  throw new Error(
    `Could not locate VOD_Auctions project root. Walked up from ${process.cwd()} ` +
      `looking for a directory containing backend/, scripts/, and storefront/ as siblings.`
  )
}

export function getScriptsDir(): string {
  return path.join(getProjectRoot(), "scripts")
}

export function getDataDir(): string {
  return path.join(getProjectRoot(), "data")
}

export function getBackendDir(): string {
  return path.join(getProjectRoot(), "backend")
}

export function getStorefrontPublicDir(): string {
  return path.join(getProjectRoot(), "storefront", "public")
}

export function getTestsDir(): string {
  return path.join(getProjectRoot(), "tests")
}
