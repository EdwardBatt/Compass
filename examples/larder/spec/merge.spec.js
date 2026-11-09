import { test } from 'node:test'
import assert from 'node:assert/strict'
import { merge } from '../src/lib/merge.js'

test('onions and onion merge; grams and cups stay apart', () => {
  const out = merge([
    { name: 'Onions', quantity: 2, unit: 'count' },
    { name: 'onion', quantity: 1, unit: 'count' },
    { name: 'flour', quantity: 200, unit: 'g' },
    { name: 'flour', quantity: 1, unit: 'cup' },
  ])
  assert.equal(out.length, 3)
  assert.equal(out[0].quantity, 3)
})

test('pickles merge with pickle, not into "pickl"', () => {
  const out = merge([{ name: 'pickles', quantity: 2, unit: 'count' }, { name: 'pickle', quantity: 1, unit: 'count' }])
  assert.equal(out.length, 1)
})
