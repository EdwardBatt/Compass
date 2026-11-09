// A deliberately tiny template engine: {{key}}, {{a.b}}, and {{#if key}}…{{else}}…{{/if}} (nestable).
// An unset {{key}} throws, so a template bug fails `compass sync` instead of writing "undefined"
// into every agent's instructions.

const IF = /\{\{#if ([\w.]+)\}\}((?:(?!\{\{#if )[\s\S])*?)\{\{\/if\}\}/

const lookup = (ctx, key) => key.split('.').reduce((v, k) => (v == null ? undefined : v[k]), ctx)
const truthy = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v))

export function render(template, ctx) {
  let out = template
  let m
  // The pattern only matches an {{#if}} with no other {{#if}} inside it, so the innermost goes first.
  while ((m = out.match(IF))) {
    const [whole, key, inner] = m
    const [yes, no = ''] = inner.split('{{else}}')
    out = out.slice(0, m.index) + (truthy(lookup(ctx, key)) ? yes : no) + out.slice(m.index + whole.length)
  }
  out = out.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const v = lookup(ctx, key)
    if (v === undefined || v === null) throw new Error(`template value '${key}' is not set`)
    return String(v)
  })
  // An {{#if}} that removed a whole line leaves a blank one; never more than one blank line in a row.
  return out.replace(/\n{3,}/g, '\n\n')
}
