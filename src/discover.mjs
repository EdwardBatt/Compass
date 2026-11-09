// Suggests where a project keeps its plan, roadmap, decision records and schema.
//
// These are HINTS, never behaviour: Compass acts only on what compass.config.json says. `init` uses
// them to pre-fill the config, and the lint and `doctor` mention them while a path is unset, so a
// project that grows a plan or a decision folder is told to wire it in. Setting a path to `false`
// says "this project has none" and silences the hint.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const CANDIDATES = {
  plan: ['PLAN.md', 'docs/PLAN.md', 'docs/planning/PLAN.md', 'DEVPLAN.md', 'docs/DEVPLAN.md', 'TODO.md'],
  roadmap: ['ROADMAP.md', 'docs/ROADMAP.md', 'docs/planning/ROADMAP.md'],
  adr: ['docs/adr/', 'docs/adrs/', 'docs/decisions/', 'docs/architecture/decisions/', 'doc/adr/', 'adr/', 'adrs/', 'decisions/'],
  schema: ['supabase/migrations/', 'prisma/schema.prisma', 'db/migrations/', 'migrations/', 'db/schema.rb', 'drizzle/', 'alembic/versions/'],
}

export const LABELS = { plan: 'plan', roadmap: 'roadmap', adr: 'decision records', schema: 'schema' }

/** The path as it is actually spelled on disk, matching each segment case-insensitively; or null. */
export function actualPath(root, rel) {
  const dir = rel.endsWith('/')
  let current = root
  const out = []
  for (const segment of rel.split('/').filter(Boolean)) {
    let entries
    try {
      entries = readdirSync(current)
    } catch {
      return null
    }
    const hit = entries.find((e) => e === segment) ?? entries.find((e) => e.toLowerCase() === segment.toLowerCase())
    if (!hit) return null
    out.push(hit)
    current = join(current, hit)
  }
  if (!existsSync(current) || statSync(current).isDirectory() !== dir) return null
  return out.join('/') + (dir ? '/' : '')
}

/** { plan?: 'PLAN.md', adr?: 'docs/adr/', … } — the first candidate found for each kind. */
export function discover(root) {
  const found = {}
  for (const [key, list] of Object.entries(CANDIDATES)) {
    for (const candidate of list) {
      const hit = actualPath(root, candidate)
      if (hit) {
        found[key] = hit
        break
      }
    }
  }
  return found
}

/** Hints for paths the config leaves unset ('') that discovery can fill. `false` means "none here". */
export function hints(root, config) {
  const found = discover(root)
  return Object.entries(found)
    .filter(([key]) => config.paths[key] === '')
    .map(([key, path]) => ({ key, path, label: LABELS[key] }))
}
