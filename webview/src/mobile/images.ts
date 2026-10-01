/**
 * A photo from the phone, made small enough to travel.
 *
 * The panel at the desk pastes an image and sends the bytes as they are: the browser and the agent are
 * on the same machine and nothing is between them. From a phone the bytes go through the relay, and a
 * modern phone's photo is four megabytes before base64 - more than anybody wants to push up a mobile
 * line for a picture the model reads at a fraction of that.
 *
 * So the picture is redrawn and re-encoded until it fits the budget it was given. How big that budget is
 * depends on the IDE at the other end (see [PhotoRoad]): one that takes a message in parts gets photos at
 * the size the model actually reads them, one that predates parts gets what fits one 256 KB frame.
 *
 * The budget used to be the second kind everywhere, and it did not survive an ordinary photo. Safari
 * encodes JPEG about two and a half times heavier than other engines - measured on a 12-megapixel shot
 * full of detail, its smallest step here (660 pixels at 45%) came out at 88 thousand characters against a
 * 75 thousand budget, so a single photo was refused with "try one photo at a time" (2026-10-01).
 */

/** One picked photo, as the composer holds it before it is sent. */
export interface PickedImage {
  id: string
  /** What to call it in the chip - the file's own name, shortened. */
  name: string
  /** A data: URL, which is the shape an image chip carries its bytes in (see feed/tokens). */
  dataUrl: string
  /** The length of the base64 alone - what is spent out of the budget below. */
  weight: number
}

/** How much base64 the photos of one message may take: all of them together, and any one of them. */
export interface PhotoRoad {
  total: number
  each: number
  /** Whether the message may go in parts - false is an IDE that has to be updated for full-size photos. */
  parts: boolean
}

/**
 * An IDE that takes a message in parts (see CAP_PARTS and RemoteParts in the plugin).
 *
 * A million characters is a photo at the largest side kept below, at a quality nobody would call
 * compressed - the 12-megapixel shot above comes out at 1568 pixels and 75% as 960 thousand, where one
 * frame's budget ([NARROW]) takes it down to 882 pixels at 45%. Three of them per message is
 * well inside what the IDE will put together (RemoteParts.MAX_CHARS) and what a device may send in a
 * minute, retry included (RemoteLimits.MAX_BYTES_PER_MINUTE).
 */
export const ROOMY: PhotoRoad = { total: 3_000_000, each: 1_000_000, parts: true }

/**
 * An IDE that predates parts: everything has to fit one frame.
 *
 * Two hundred thousand leaves the frame (FRAME_BODY_BYTES in link.ts) room for the text and the JSON
 * around it. A frame over the cap is not merely lost - the relay closes the phone's connection over it -
 * so the link refuses to send one at all, and this is what keeps an ordinary message from getting there.
 * One photo may take all of it: a second one is then refused with "send these first", which is better
 * than every photo being squeezed against the chance of another.
 */
export const NARROW: PhotoRoad = { total: 200_000, each: 200_000, parts: false }

/** Below this there is not enough room left for a picture anybody could read - better to say so. */
export const IMAGE_MINIMUM = 20_000

/** The largest side we ever keep. Beyond this the model gains nothing and the frame pays for it. */
const MAX_SIDE = 1568

/** The smallest we are willing to shrink to before giving up - past this a screenshot is unreadable. */
const MIN_SIDE = 640

/**
 * Tried in turn at each size before the size steps down. A sharper picture at full size reads better than
 * a smaller one at the same weight: the model reads a screenshot's text by its pixels, and 45% still keeps
 * letters apart where 660 pixels across a phone's screen does not.
 */
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45]

const dataUrlWeight = (dataUrl: string): number => dataUrl.slice(dataUrl.indexOf(',') + 1).length

/** Why a picked file did not become a photo - each is said to the person in its own words. */
export type PhotoRefusal = 'unreadable' | 'tooBig'

/**
 * Redraw a picked file small enough to fit `budget` base64 characters.
 *
 * `unreadable` when the file is not an image this browser can decode - an iPhone hands Safari a JPEG from
 * the photo library, but a file chosen out of a cloud folder may be anything at all. `tooBig` when even
 * the smallest step does not fit. The two used to be one answer, and so one sentence - about a message
 * being too big - for a file that was simply not a picture.
 */
export const encodeImage = async (file: File, budget: number): Promise<PickedImage | PhotoRefusal> => {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return 'unreadable'

  // One canvas for every attempt, emptied at the end. Safari counts the memory of canvases it has not yet
  // collected against a ceiling of its own, and past it `getContext` answers null - a dozen full-size
  // attempts per photo, each on a canvas of its own, is how a phone gets there.
  const canvas = document.createElement('canvas')

  try {
    let side = MAX_SIDE

    while (side >= MIN_SIDE) {
      for (const quality of QUALITY_STEPS) {
        const dataUrl = draw(canvas, bitmap, side, quality)
        if (dataUrl === null) return 'unreadable'
        if (dataUrlWeight(dataUrl) <= budget) {
          return { id: `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: shortName(file.name), dataUrl, weight: dataUrlWeight(dataUrl) }
        }
      }

      side = Math.round(side * 0.75)
    }

    // Even at the floor it does not fit. Handing back the smallest we made would be worse than saying so:
    // the message would not go, and the person would never learn why.
    return 'tooBig'
  } finally {
    bitmap.close()
    canvas.width = 0
    canvas.height = 0
  }
}

/** The picture at this longest side, as JPEG at this quality. */
const draw = (canvas: HTMLCanvasElement, bitmap: ImageBitmap, side: number, quality: number): string | null => {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  // Set only when the size changes: setting it clears the canvas, and the picture is drawn over it anyway.
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return null

  // A screenshot with transparency would otherwise come out on black, and JPEG has no alpha to keep.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', quality)
}

/** Long enough to tell two screenshots apart, short enough for a chip on a phone. */
const shortName = (name: string): string => {
  const trimmed = name.replace(/\.[^.]+$/, '')
  return trimmed.length > 18 ? `${trimmed.slice(0, 17)}…` : trimmed || 'photo'
}
