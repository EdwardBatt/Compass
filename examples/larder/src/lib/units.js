// Every quantity is stored in a base unit: g, ml or count.
const TO_BASE = {
  g: ['g', 1], kg: ['g', 1000], oz: ['g', 28.3495], lb: ['g', 453.592],
  ml: ['ml', 1], l: ['ml', 1000], tsp: ['ml', 4.92892], tbsp: ['ml', 14.7868], cup: ['ml', 236.588],
  count: ['count', 1],
}

export function toBase(quantity, unit) {
  const entry = TO_BASE[unit.toLowerCase()]
  if (!entry) throw new Error(`unknown unit: ${unit}`)
  return { quantity: quantity * entry[1], unit: entry[0] }
}
