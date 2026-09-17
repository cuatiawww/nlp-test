import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

test('header stays above maps and receives pointer events', () => {
  const header = read('components/layout/DashboardHeader.tsx')
  assert.match(header, /sticky top-0 z-50/)
  assert.match(header, /pointer-events-auto/)
  assert.match(header, /pointer-events-none absolute inset-0 bg-cover/)
})

test('closed sidebar does not eat clicks; backdrop is gated', () => {
  const sidebar = read('components/layout/DashboardSidebar.tsx')
  assert.match(sidebar, /pointer-events-none/)
  assert.match(sidebar, /pointer-events-auto/)
  assert.match(sidebar, /aria-hidden=\{\!open\}/)

  const shell = read('components/layout/AppShell.tsx')
  assert.match(shell, /sidebarOpen && \(/)
  assert.match(shell, /fixed inset-0 z-40/)
  assert.match(shell, /relative z-50 print:hidden pointer-events-auto/)
})

test('OpenLayers map is isolated so canvases cannot cover chrome', () => {
  const map = read('components/AseanMap.tsx')
  assert.match(map, /relative isolate z-0/)
  assert.doesNotMatch(map, /min-h-screen/)
  assert.match(map, /absolute inset-0 h-full w-full/)
  assert.match(map, /interactive\?: boolean/)
  assert.match(map, /interaction\.setActive\(interactive\)/)
  assert.match(map, /visible: false,\s*zIndex: 22/)

  const css = read('app/globals.css')
  assert.match(css, /\.ol-viewport/)
  assert.match(css, /overflow: hidden !important/)
  assert.match(css, /pointer-events: none !important/)
})

test('map settings backdrop is gated and Esc closes it', () => {
  const spatial = read('components/SpatialOutbreakMap.tsx')
  assert.match(spatial, /settings && \(/)
  assert.match(spatial, /absolute inset-0 z-40 bg-black\/10/)
  assert.match(spatial, /e\.key === ["']Escape["']/)
  assert.match(spatial, /z-50 flex items-center gap-2 pointer-events-auto/)
  assert.match(spatial, /interactive=\{\!settings\}/)
  assert.match(spatial, /settings \? "pointer-events-none h-full w-full"/)
  assert.match(spatial, /backdrop-blur-md pointer-events-auto/)
})

test('TV map is isolated; layer drawer has backdrop and Esc', () => {
  const tv = read('app/tv/page.tsx')
  assert.match(tv, /absolute inset-0 z-0 isolate overflow-hidden/)
  assert.match(tv, /pointer-events-none fixed left-2 right-2 top-2 z-50/)
  assert.match(tv, /drawer && \(/)
  assert.match(tv, /fixed inset-0 z-40 bg-slate-900\/25/)
  assert.match(tv, /if \(e\.key === ['"]Escape['"]\) setDrawer\(false\)/)
  assert.match(tv, /interactive=\{\!drawer\}/)
})
