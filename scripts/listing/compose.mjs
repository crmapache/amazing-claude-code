/**
 * The finished pictures of the listing: a caption band over every frame, the phone's screens three to a
 * picture, all of one size, numbered in the order the listing shows them.
 *
 * It takes what the two cameras left in build/listing - ide/<id>.png from ide-shots.mjs, phone/<id>.png
 * from phone-shots.mjs - and lays each picture out as a page in a headless browser, so the caption is set
 * in the panel's own typeface (Instrument Sans, from webview/public/fonts) the same way on every picture.
 *
 *   PLAYWRIGHT=/tmp/acc-shots/node_modules/playwright/index.mjs node scripts/listing/compose.mjs
 *
 * The result goes to ~/Downloads/amazing-claude-code-listing (override with OUT=...), the folder emptied
 * first so a frame that left the list does not linger in it.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FRAMES } from './frames.mjs'
import { PHONE_SETS } from './phone-sets.mjs'

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')

const BUILD = new URL('../../build/listing/', import.meta.url).pathname
const FONTS = new URL('../../webview/public/fonts/', import.meta.url)
const OUT = process.env.OUT ?? join(homedir(), 'Downloads', 'amazing-claude-code-listing')

/**
 * The page in CSS pixels, photographed at a device pixel ratio of 2: the window of a 14" MacBook
 * (1512x889 points, captured at 2x) under a band of 50. Every picture of the listing has this size - the
 * Marketplace wants one proportion for all of them.
 */
const WIDTH = 1512
const BAND = 50
const BODY = 889
const HEIGHT = BAND + BODY

/** Where the phone sets stand among the IDE frames: after the frame named, in this order. */
const PHONES_AFTER = 'remote-access'

const listing = () => {
  const order = []
  for (const frame of FRAMES) {
    order.push({ kind: 'ide', id: frame.id, caption: frame.caption })
    if (frame.id === PHONES_AFTER) for (const set of PHONE_SETS) order.push({ kind: 'phone', ...set })
  }
  return order
}

const css = `
  @font-face {
    font-family: 'Instrument Sans';
    font-weight: 600;
    src: url('${new URL('instrument-sans-600-latin.woff2', FONTS)}') format('woff2');
  }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; background: #0f1116; overflow: hidden; }
  .band {
    height: ${BAND}px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 40px;
    font: 600 20px/1 'Instrument Sans', sans-serif;
    letter-spacing: -0.1px;
    color: #eceff5;
    white-space: nowrap;
  }
  .body { position: relative; height: ${BODY}px; }
  .window { display: block; width: ${WIDTH}px; height: ${BODY}px; }

  .stage {
    height: ${BODY}px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 76px;
    background:
      radial-gradient(1100px 520px at 50% 108%, rgba(121, 96, 214, 0.28), transparent 70%),
      linear-gradient(180deg, #161925 0%, #1d1f33 55%, #262344 100%);
  }
  .phone {
    --s: calc(366 / 393);
    width: calc(366px + 24px);
    padding: 12px;
    border-radius: 62px;
    background: #07080b;
    box-shadow:
      0 0 0 1.5px #3a3d4a,
      0 0 0 4px #15161c,
      0 40px 80px rgba(0, 0, 0, 0.55);
  }
  .screen {
    position: relative;
    width: 366px;
    border-radius: 50px;
    overflow: hidden;
  }
  .status {
    position: relative;
    height: calc(59px * var(--s));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 30px 0 40px;
    font: 600 15.5px/1 -apple-system, 'SF Pro Text', 'Instrument Sans', sans-serif;
    color: #f4f5f8;
  }
  .island {
    position: absolute;
    left: 50%;
    top: 11px;
    width: 112px;
    height: 32px;
    transform: translateX(-50%);
    border-radius: 20px;
    background: #000;
  }
  .icons { display: flex; gap: 6px; align-items: center; }
  .shot { display: block; width: 366px; }
  .home { position: relative; height: calc(34px * var(--s)); }
  .home::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 9px;
    width: 128px;
    height: 5px;
    transform: translateX(-50%);
    border-radius: 3px;
    background: #f1f2f5;
  }
`

const icons = `
  <svg width="18" height="12" viewBox="0 0 18 12" fill="#f4f5f8" aria-hidden="true">
    <rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/>
    <rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/>
  </svg>
  <svg width="16" height="12" viewBox="0 0 16 12" fill="#f4f5f8" aria-hidden="true">
    <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 0 0 8 .4 10.3 10.3 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4Z"/>
    <path d="M8 5.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7.1 7.1 0 0 0 8 3.8c-1.9 0-3.6.7-4.9 1.9L4.3 7A5.3 5.3 0 0 1 8 5.6Z"/>
    <path d="M8 9.1c.6 0 1.1.2 1.5.6L8 11.4 6.5 9.7c.4-.4.9-.6 1.5-.6Z"/>
  </svg>
  <svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden="true">
    <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="#f4f5f8" stroke-opacity="0.45"/>
    <rect x="2" y="2" width="20" height="9" rx="2.2" fill="#f4f5f8"/>
    <path d="M25 4.3v4.4c.9-.3 1.5-1.2 1.5-2.2s-.6-1.9-1.5-2.2Z" fill="#f4f5f8" fill-opacity="0.45"/>
  </svg>
`

const phone = (shot) => `
  <div class="phone">
    <div class="screen" style="background:${shot.top}">
      <div class="status"><span>9:41</span><span class="island"></span><span class="icons">${icons}</span></div>
      <img class="shot" src="${pathToFileURL(shot.path)}">
      <div class="home" style="background:${shot.bottom}"></div>
    </div>
  </div>
`

const page_ = (entry) => {
  const body =
    entry.kind === 'ide'
      ? `<img class="window" src="${pathToFileURL(join(BUILD, 'ide', `${entry.id}.png`))}">`
      : `<div class="stage">${entry.shots.map(phone).join('')}</div>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
    <body><div class="band">${entry.caption}</div><div class="body">${body}</div></body></html>`
}

/**
 * The colour of the app at the top and the bottom of a phone's screenshot - what the status bar and the
 * home strip above and below it are painted, so the screen reads as one surface.
 */
const edgesOf = (path) => {
  const script = [
    'import sys',
    'from PIL import Image',
    'im = Image.open(sys.argv[1]).convert("RGB")',
    'top = im.getpixel((4, 2))',
    'bottom = im.getpixel((4, im.height - 3))',
    'print("rgb(%d, %d, %d)|rgb(%d, %d, %d)" % (top + bottom))',
  ].join('\n')
  const [top, bottom] = execFileSync('python3', ['-c', script, path], { encoding: 'utf8' }).trim().split('|')
  return { top, bottom }
}

const main = async () => {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const work = join(BUILD, 'compose')
  mkdirSync(work, { recursive: true })

  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] })
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 })

  let number = 0
  for (const entry of listing()) {
    if (entry.kind === 'ide' && !existsSync(join(BUILD, 'ide', `${entry.id}.png`))) {
      console.log('missing', entry.id)
      continue
    }
    if (entry.kind === 'phone') {
      const shots = []
      for (const name of entry.screens) {
        const path = join(BUILD, 'phone', `${name}.png`)
        if (!existsSync(path)) throw new Error(`no phone screen ${name}`)
        shots.push({ path, ...edgesOf(path) })
      }
      entry.shots = shots
    }

    const html = join(work, `${entry.id}.html`)
    writeFileSync(html, page_(entry))
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    number += 1
    const name = `${String(number).padStart(2, '0')}-${entry.id}.png`
    await page.screenshot({ path: join(OUT, name) })
    console.log('composed', name)
  }

  await browser.close()
  console.log(`${readdirSync(OUT).length} pictures in ${OUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
