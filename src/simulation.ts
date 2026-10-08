export type Mode = 'walk' | 'car' | 'bus' | 'rail'
export type Settings = { fare: number; headway: number; congestion: number; population: number }
export const defaults: Settings = { fare: 220, headway: 15, congestion: 1.3, population: 1200 }
export const routes = [
  { name: '01 中央幹線', z: -3, km: 6, demand: .5 },
  { name: '02 学園線', z: 0, km: 4, demand: .3 },
  { name: '03 丘陵住宅線', z: 3, km: 8, demand: .2 },
]
// Stable softmax: unavailable alternatives must be omitted before calling.
export function logit(utilities: number[]) {
  const max = Math.max(...utilities)
  const weights = utilities.map(u => Math.exp(u - max))
  const total = weights.reduce((a, b) => a + b, 0)
  return weights.map(w => w / total)
}
// A* on a nonnegative weighted graph. A zero heuristic gives Dijkstra.
export function aStar(graph: Record<string, { to: string; cost: number }[]>, start: string, goal: string, heuristic = (_node: string) => 0) {
  const open = new Set([start]), costs: Record<string, number> = { [start]: 0 }, previous: Record<string, string> = {}
  while (open.size) {
    const node = [...open].reduce((a, b) => costs[a] + heuristic(a) < costs[b] + heuristic(b) ? a : b)
    if (node === goal) {
      const path = [goal]
      while (path[0] !== start) path.unshift(previous[path[0]])
      return { path, cost: costs[goal] }
    }
    open.delete(node)
    for (const edge of graph[node] ?? []) {
      if (edge.cost < 0) throw new Error('Negative edge cost')
      const next = costs[node] + edge.cost
      if (next < (costs[edge.to] ?? Infinity)) { costs[edge.to] = next; previous[edge.to] = node; open.add(edge.to) }
    }
  }
  return null
}
export function simulate(s: Settings) {
  const modes: Record<Mode, number> = { walk: 0, car: 0, bus: 0, rail: 0 }
  let minutes = 0, baselineMinutes = 0, co2 = 0, baselineCo2 = 0
  const lines = routes.map((route, r) => {
    let riders = 0, revenue = 0
    const count = Math.round(s.population * route.demand)
    for (let i = 0; i < count; i++) {
      // Deterministic synthetic citizens: age group, OD distance and departure hour.
      const group = i % 10 < 6 ? 0 : i % 10 < 8 ? 1 : 2
      const distance = 1 + ((i * 17 + r * 31) % 60) / 10
      const hour = group === 2 ? 10 + i % 6 : 7 + i % 3
      const traffic = hour < 10 ? s.congestion : 1
      const discount = [1, .8, .5][group]
      const timeValue = [25, 12, 15][group]
      const busTime = distance / 22 * 60 * traffic + s.headway / 2 + 8
      const railTime = distance / 38 * 60 + 16
      const times = [distance / 4.5 * 60, distance / 30 * 60 * traffic + 5, busTime, railTime]
      const prices = [0, distance * 35 + 250, s.fare * discount, 280 * discount]
      const utility = times.map((t, m) => -.08 * (t + prices[m] / timeValue + (m === 0 && group === 2 ? 12 : 0)))
      const p = logit(utility), base = logit(utility.slice(0, 2))
      const names: Mode[] = ['walk', 'car', 'bus', 'rail']
      names.forEach((m, j) => { modes[m] += p[j]; minutes += p[j] * times[j] })
      baselineMinutes += base[0] * times[0] + base[1] * times[1]
      co2 += distance * (p[1] * .17 + p[2] * .06 + p[3] * .025)
      baselineCo2 += distance * base[1] * .17
      riders += p[2]; revenue += p[2] * prices[2]
    }
    const departures = Math.ceil(16 * 60 / s.headway) * 2
    const km = departures * route.km
    const hours = km / 22 * s.congestion
    const cost = hours * 2400 + km * 45 + 8000 + 6 * 200
    return { ...route, riders, revenue, cost, profit: revenue - cost, km }
  })
  const total = Object.values(modes).reduce((a, b) => a + b, 0)
  return { modes, lines, total, minutes: minutes / total, saved: (baselineMinutes - minutes) / total, co2: baselineCo2 - co2, profit: lines.reduce((a, r) => a + r.profit, 0) }
}
