import { toBase } from './units.js'

// "tomatoes" → "tomato", "onions" → "onion". Strips "es" only after o, s, x, z, ch or sh, so "pickles"
// stays "pickle" rather than "pickl" (see docs/compass/traps.md).
const singular = (name) => {
  const n = name.toLowerCase().trim()
  if (/(o|s|x|z|ch|sh)es$/.test(n)) return n.slice(0, -2)
  return n.replace(/s$/, '')
}

/** Merges list items that share a name and a base unit (ADR 0002). */
export function merge(items) {
  const out = new Map()
  for (const item of items) {
    const base = toBase(item.quantity, item.unit)
    const key = `${singular(item.name)}|${base.unit}`
    const seen = out.get(key)
    if (seen) seen.quantity += base.quantity
    else out.set(key, { name: item.name, ...base })
  }
  return [...out.values()]
}
