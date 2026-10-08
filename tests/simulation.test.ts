import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aStar, defaults, logit, simulate } from '../src/simulation.ts'

test('logit is normalized and stable for extreme utilities', () => {
  const p = logit([10000, 10000, 9999])
  assert.ok(p.every(Number.isFinite))
  assert.ok(Math.abs(p.reduce((a, b) => a + b) - 1) < 1e-12)
  assert.equal(p[0], p[1])
})
test('path search finds cheaper indirect path and handles disconnected nodes', () => {
  const graph = { a: [{ to: 'b', cost: 10 }, { to: 'c', cost: 2 }], c: [{ to: 'b', cost: 3 }], b: [] }
  assert.deepEqual(aStar(graph, 'a', 'b'), { path: ['a', 'c', 'b'], cost: 5 })
  assert.equal(aStar(graph, 'b', 'a'), null)
})
test('citizen demand conserved; fares affect bus demand; accounts reconcile', () => {
  const low = simulate({ ...defaults, fare: 100 }), high = simulate({ ...defaults, fare: 500 })
  assert.ok(Math.abs(low.total - defaults.population) < 1e-8)
  assert.ok(low.modes.bus > high.modes.bus)
  for (const route of low.lines) assert.equal(route.profit, route.revenue - route.cost)
  assert.equal(low.profit, low.lines.reduce((s, r) => s + r.profit, 0))
  assert.deepEqual(simulate(defaults), simulate(defaults))
})
test('more frequent buses raise operating costs', () => {
  const frequent = simulate({ ...defaults, headway: 5 }), sparse = simulate({ ...defaults, headway: 60 })
  assert.ok(frequent.lines.every((r, i) => r.cost > sparse.lines[i].cost))
  assert.ok(frequent.modes.bus > sparse.modes.bus)
})
