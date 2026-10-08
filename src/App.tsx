import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import type { Group } from 'three'
import { defaults, routes, simulate } from './simulation'
import './App.css'

function Bus({ z, color, running, headway }: { z: number; color: string; running: boolean; headway: number }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => { if (running && ref.current) ref.current.position.x = ((ref.current.position.x + 10 + dt * 30 / headway) % 20) - 10 })
  return <group ref={ref} position={[-9, .45, z]}><mesh><boxGeometry args={[1.1, .55, .48]} /><meshStandardMaterial color={color} /></mesh><mesh position={[0, .2, 0]}><boxGeometry args={[.8, .22, .5]} /><meshStandardMaterial color="#d7efff" /></mesh></group>
}
function City({ results, running, headway }: { results: ReturnType<typeof simulate>; running: boolean; headway: number }) {
  return <><color attach="background" args={['#c5dde5']} /><ambientLight intensity={1.4} /><directionalLight position={[8, 15, 5]} intensity={2.5} />
    <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[25, 17]} /><meshStandardMaterial color="#8ead93" /></mesh>
    {Array.from({ length: 72 }, (_, i) => { const x = (i % 12) * 1.8 - 10, z = Math.floor(i / 12) * 2.6 - 6.5, h = .5 + ((i * 13) % 9) / 5; return <mesh key={i} position={[x, h / 2, z]}><boxGeometry args={[1.1, h, 1.2]} /><meshStandardMaterial color={['#d9dfda', '#c1cbd2', '#dfd1bc'][i % 3]} /></mesh> })}
    {routes.map((r, i) => { const color = results.lines[i].profit >= 0 ? '#2689ff' : '#f36565'; return <group key={r.name}><mesh position={[0, .025, r.z]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[23, .85]} /><meshStandardMaterial color="#455965" /></mesh><Line points={[[-11, .06, r.z], [11, .06, r.z]]} color={color} lineWidth={3} />{[-9, -5, -1, 3, 7].map(x => <mesh key={x} position={[x, .22, r.z + .65]}><cylinderGeometry args={[.12, .12, .4, 8]} /><meshStandardMaterial color={color} /></mesh>)}<Bus z={r.z} color={color} running={running} headway={headway} /></group> })}
    <OrbitControls makeDefault minDistance={10} maxDistance={40} maxPolarAngle={Math.PI / 2.2} />
  </>
}
const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')} 円`
function App() {
  const [settings, setSettings] = useState(defaults), [running, setRunning] = useState(true)
  const result = useMemo(() => simulate(settings), [settings])
  const base = useMemo(() => simulate(defaults), [])
  const [saved, setSaved] = useState<ReturnType<typeof simulate> | null>(null)
  const controls = [ ['fare', 'バス運賃', 100, 500, 10, '円'], ['headway', '運行間隔', 5, 60, 5, '分'], ['congestion', '渋滞倍率', 1, 2.5, .1, '倍'], ['population', '移動する住民', 200, 5000, 100, '人'] ] as const
  return <main><header><div><p className="eyebrow">URBAN MOBILITY LAB / PROTOTYPE 01</p><h1>街の移動を、デザインする。</h1><p className="description">公共交通の便利さと持続可能性を、ひとつの都市で比較。</p></div><span className="badge">架空都市・仮定値モデル</span></header>
    <div className="dashboard"><aside><p className="eyebrow">SCENARIO SETTINGS</p><h2>運行計画</h2><p className="muted">設定を変えると、1日分の移動需要を再計算します。</p>{controls.map(([key, label, min, max, step, unit]) => <label key={key}><span>{label}<b>{settings[key].toLocaleString('ja-JP')}{unit}</b></span><input type="range" min={min} max={max} step={step} value={settings[key]} onChange={e => setSettings(s => ({ ...s, [key]: Number(e.target.value) }))} /></label>)}<button onClick={() => setSaved(result)}>現在の結果を比較用に保存</button><button className="secondary" onClick={() => setSettings({ ...defaults })}>初期設定に戻す</button><div className="note">社会人60%・学生20%・高齢者20%。学生20%、高齢者50%の運賃割引。実調査に基づく校正は未実施。</div></aside>
    <section className="map-panel"><div className="map-heading"><div><p className="eyebrow">LIVE CITY VIEW</p><h2>青葉市 / デモエリア</h2></div><button className="secondary" onClick={() => setRunning(!running)}>{running ? '車両表示を一時停止' : '車両表示を再開'}</button></div><div className="simulation-canvas"><Canvas camera={{ position: [16, 15, 18], fov: 42 }}><City results={result} running={running} headway={settings.headway} /></Canvas><div className="map-legend"><span className="blue">● 黒字路線</span><span className="red">● 赤字路線</span><span>ドラッグで回転 · スクロールで拡大</span></div></div></section></div>
    <section className="metrics" aria-live="polite"><article><span>住民の平均移動時間</span><strong>{result.minutes.toFixed(1)}<small> 分</small></strong><p>公共交通なしから {result.saved.toFixed(1)} 分短縮</p></article><article><span>バス事業の純利益 / 日</span><strong className={result.profit < 0 ? 'red' : 'blue'}>{yen(result.profit)}</strong><p>比較との差 {yen(result.profit - (saved ?? base).profit)}</p></article><article><span>公共交通利用率</span><strong>{((result.modes.bus + result.modes.rail) / result.total * 100).toFixed(1)}<small> %</small></strong><p>バス＋鉄道 / 全移動</p></article><article><span>推定CO₂削減量 / 日</span><strong>{result.co2.toFixed(0)}<small> kg</small></strong><p>公共交通なしの選択モデルと比較</p></article></section>
    <section className="details"><div><p className="eyebrow">ROUTE ECONOMICS</p><h2>路線別の収益性</h2><div className="table-wrap"><table><thead><tr><th>路線</th><th>利用者 / 日</th><th>運賃収入</th><th>運行費用</th><th>純利益</th></tr></thead><tbody>{result.lines.map(r => <tr key={r.name}><td>{r.name}</td><td>{r.riders.toFixed(0)} 人</td><td>{yen(r.revenue)}</td><td>{yen(r.cost)}</td><td className={r.profit < 0 ? 'red' : 'blue'}>{yen(r.profit)}</td></tr>)}</tbody></table></div></div><div><p className="eyebrow">MODE CHOICE</p><h2>住民の移動手段</h2>{Object.entries(result.modes).map(([mode, n]) => <div className="mode" key={mode}><span>{{ walk: '徒歩', car: '自家用車', bus: 'バス', rail: '鉄道' }[mode]}</span><progress max={result.total} value={n} /><b>{(n / result.total * 100).toFixed(1)}%</b></div>)}</div></section>
    <footer>ロジット確率による期待人数。車両アニメーションは模式表示。1人1移動/日、満員・乗換・道路網は未反映。費用：人件費2,400円/時、燃料45円/km、固定費9,200円/路線・日。</footer>
  </main>
}
export default App
