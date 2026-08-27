/**
 * The statistics screen as a picture to share.
 *
 * The screen is not redrawn for the occasion: the very node the person is looking at is cloned, laid out
 * off screen at a width a picture wants, and painted into a canvas through an SVG foreignObject. That way
 * the picture is the screen - a poster built out of the same figures by hand would drift away from it with
 * every change to the tab.
 *
 * Two things make the clone rather than the original the thing that is painted: the screen scrolls, and a
 * picture must show all of it, and the panel can be narrower than anything readable, so the clone is laid
 * out at least PICTURE_MIN wide. The share button itself is cut out of the clone - see [SKIP].
 *
 * The stylesheet travels with it. Inside the foreignObject nothing of the page applies: the rules are
 * collected from the document and put in a <style> of their own, and the custom properties - which are
 * declared on :root and would find no :root in there - are written onto the wrapper as plain declarations.
 */

/** Marks what must not appear in the picture: the button that asks for the picture, first of all. */
export const SKIP = 'data-poster-skip'

/** Wide enough for the tiles to stand four across, the way the tab is meant to be seen. */
const PICTURE_MIN = 900
const PICTURE_MAX = 1400
const PADDING = 18
/** Two device pixels per CSS pixel - a screenshot of a dark panel is read on bright screens. */
const SCALE = 2
/** Past this many pixels a side, a canvas quietly refuses to be drawn - so the scale drops instead. */
const CANVAS_LIMIT = 12_000

export interface PosterOptions {
  /** "WebStorm", "IntelliJ IDEA" - the IDE the figures were counted in. */
  ide: string
  /** The plugin's own version, as the IDE reported it at startup. */
  version: string
  /** Today by the IDE's calendar, for the line under the mark. */
  date: string
}

/** "amazing-claude-code-statistics-2026-08-26.png" - what the file is called once it is saved. */
export const posterName = (screen: string, date: string): string => `amazing-claude-code-${screen}-${date}.png`

/**
 * Every rule the page is painted with, as one stylesheet.
 *
 * A sheet the browser refuses to read - one served from another origin - is fetched instead. In the panel
 * everything is our own and the first path is taken; the second is what keeps a dev server with its styles
 * on another port from producing a picture with no paint on it.
 */
const stylesheet = async (): Promise<string> => {
  const parts: string[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      parts.push(Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n'))
      continue
    } catch {
      // Falls through to fetching it below.
    }

    const href = sheet.href
    if (!href) continue
    try {
      const response = await fetch(href)
      parts.push(await response.text())
    } catch {
      // A sheet that can be neither read nor fetched is left out: better a picture missing one rule than
      // no picture at all.
    }
  }

  return parts.join('\n')
}

/** The custom properties as they stand on the document's root - the whole palette, resolved. */
const variables = (): string => {
  const computed = getComputedStyle(document.documentElement)
  const declarations: string[] = []

  for (const name of Array.from(computed)) {
    if (name.startsWith('--')) declarations.push(`${name}:${computed.getPropertyValue(name)}`)
  }

  return declarations.join(';')
}

/**
 * The clone is walked beside its original: what scrolls in the panel is unfolded, so the picture holds the
 * whole of it rather than the part that happened to be in view.
 */
const unfold = (original: Element, clone: Element): void => {
  const computed = getComputedStyle(original)
  if (computed.overflowY === 'auto' || computed.overflowY === 'scroll') {
    const style = (clone as HTMLElement).style
    style.overflow = 'visible'
    style.height = 'auto'
    style.maxHeight = 'none'
  }

  const originals = original.children
  const clones = clone.children
  for (let index = 0; index < originals.length && index < clones.length; index++) {
    unfold(originals[index]!, clones[index]!)
  }
}

/**
 * The plugin's own logo, the way it stands in the marketplace: the coral plate with the ACC monogram on
 * it. Kept in step with src/main/resources/META-INF/pluginIcon.svg by hand - a picture to share carries
 * the mark people recognise from the plugin's page, not the monochrome one off the tool window's button.
 */
const LOGO = `
<svg width="22" height="22" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="accPosterBg" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FE9678"/>
      <stop offset="1" stop-color="#F5764F"/>
    </linearGradient>
    <linearGradient id="accPosterMark" gradientUnits="userSpaceOnUse" x1="0" y1="2.0" x2="0" y2="17.5">
      <stop offset="0" stop-color="#FFF5EA"/>
      <stop offset="1" stop-color="#FFD1AA"/>
    </linearGradient>
  </defs>
  <g transform="translate(1.975,1.95) scale(0.05)">
    <g transform="translate(0,722) scale(0.1,-0.1)" fill="#FDE0CE"><path d="M906 7199 c-386 -57 -714 -342 -826 -719 -52 -174 -50 -66 -50 -2872 0 -2836 -2 -2738 55 -2912 104 -319 363 -563 692 -654 l98 -27 2680 -3 c1957 -2 2702 0 2760 8 417 60 746 375 843 810 16 69 17 281 17 2790 l0 2715 -22 81 c-103 389 -370 658 -758 767 l-80 22 -2675 1 c-1473 1 -2702 -2 -2734 -7z"/></g>
    <g transform="translate(0,722) scale(0.1,-0.1)" fill="url(#accPosterBg)"><path d="M1193 6865 c-429 -78 -758 -436 -813 -885 -14 -115 -14 -4600 0 -4760 13 -145 39 -241 95 -349 117 -225 359 -416 615 -483 l85 -23 2425 0 2425 0 110 29 c172 44 335 117 335 150 0 6 18 25 40 42 95 73 225 263 273 400 49 137 48 82 45 2649 l-3 2420 -26 96 c-93 332 -346 591 -684 696 l-90 28 -2380 2 c-1922 1 -2394 -1 -2452 -12z"/></g>
  </g>
  <g transform="translate(7.092,6.959) scale(1.3376)" fill="none" stroke="url(#accPosterMark)" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.6">
      <path d="M1.8 9.6 5.2 2.0 8.6 9.6"/>
      <path d="M3.1 7.0H7.3"/>
      <path d="M13.0 7.8A3.4 3.4 0 1 0 13.0 12.6"/>
      <path d="M17.2 12.0A3.4 3.4 0 1 0 17.2 16.8"/>
    </g>
    <g stroke-width="0.95">
      <path d="M11.71 5.30 12.53 3.05"/>
      <path d="M13.68 6.32 15.80 4.20"/>
      <path d="M14.70 8.29 16.95 7.47"/>
      <path d="M8.29 14.70 7.47 16.95"/>
      <path d="M6.32 13.68 4.20 15.80"/>
      <path d="M5.30 11.71 3.05 12.53"/>
    </g>
  </g>
</svg>`

/** The line under the picture: the mark, the name, and the IDE the hours were spent in. */
const signature = (options: PosterOptions): HTMLElement => {
  const mark = document.createElement('div')
  mark.setAttribute(
    'style',
    'display:flex;align-items:center;gap:9px;margin-top:14px;padding-top:12px;' +
      'border-top:1px solid var(--acc-line);color:var(--acc-fg-soft);font:11px var(--acc-mono)',
  )
  mark.innerHTML =
    `<span style="display:flex">${LOGO}</span>` +
    '<span style="color:var(--acc-fg);font-weight:600;letter-spacing:0.02em">Amazing Claude Code</span>' +
    (options.version ? `<span style="color:var(--acc-fg-faint)">${options.version}</span>` : '') +
    `<span style="color:var(--acc-fg-ghost)">plugin for ${options.ide || 'JetBrains IDEs'}</span>` +
    '<span style="flex:1"></span>' +
    `<span style="color:var(--acc-fg-ghost)">${options.date}</span>`

  return mark
}

/**
 * Draw the given screen as a PNG and hand it back as base64, without the data-URL prefix - which is what
 * travels to the shell (see the saveImage message).
 */
export const drawPoster = async (screen: HTMLElement, options: PosterOptions): Promise<string> => {
  const width = Math.round(Math.min(PICTURE_MAX, Math.max(PICTURE_MIN, screen.clientWidth)))

  // Two boxes: the outer one parks the clone off screen, the inner one is what ends up in the picture and
  // therefore carries nothing but the picture's own layout.
  const holder = document.createElement('div')
  holder.setAttribute('style', `position:fixed;left:-30000px;top:0;width:${width}px;pointer-events:none;opacity:0`)

  const stage = document.createElement('div')
  const background = getComputedStyle(document.documentElement).getPropertyValue('--acc-bg').trim() || '#14171d'
  stage.setAttribute('style', `width:${width}px;padding:${PADDING}px;box-sizing:border-box;background:${background}`)

  const clone = screen.cloneNode(true) as HTMLElement
  clone.style.height = 'auto'
  for (const skipped of Array.from(clone.querySelectorAll(`[${SKIP}]`))) skipped.remove()
  unfold(screen, clone)

  stage.append(clone, signature(options))
  holder.append(stage)
  document.body.append(holder)

  try {
    const height = Math.ceil(stage.getBoundingClientRect().height)
    const css = await stylesheet()
    const body = new XMLSerializer().serializeToString(stage)

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="${variables()}">` +
      `<style><![CDATA[${css}]]></style>${body}` +
      '</div></foreignObject></svg>'

    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve())
      image.addEventListener('error', () => reject(new Error('the picture could not be drawn')))
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })

    const scale = Math.max(width, height) * SCALE > CANVAS_LIMIT ? 1 : SCALE
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)

    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas to draw on')
    context.scale(scale, scale)
    // The panel's own backing first: a canvas starts transparent, and rounding the height up leaves a
    // hairline of nothing along the bottom edge - which shows up white wherever the picture is opened.
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
  } finally {
    holder.remove()
  }
}
