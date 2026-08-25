/**
 * A photo from the phone, made small enough to travel.
 *
 * The panel at the desk pastes an image and sends the bytes as they are: the browser and the agent are
 * on the same machine and nothing is between them. From a phone the bytes go through the relay, and
 * one frame there is capped at 256 KB - an oversized frame is not shortened but thrown away whole (see
 * relay/src/config.ts and wire/frame.ts). A modern phone's photo is four megabytes before base64, so
 * sending one untouched would not be slow, it would silently do nothing.
 *
 * So the picture is redrawn smaller and re-encoded until it fits the budget it was given. A screenshot
 * at twelve hundred pixels is still perfectly readable to the model, which is what these are almost
 * always for.
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

/**
 * How much base64 all the attachments of one message may take together.
 *
 * A hundred and fifty kilobytes leaves the sealed frame comfortably inside the relay's cap rather than
 * near it: the text, the JSON around it and the sealing all ride in the same frame, and being a
 * kilobyte over means the message does not arrive at all.
 */
export const IMAGE_BUDGET = 150_000

/** Below this there is not enough room left for a picture anybody could read - better to say so. */
export const IMAGE_MINIMUM = 20_000

/** The largest side we ever keep. Beyond this the model gains nothing and the frame pays for it. */
const MAX_SIDE = 1568

/** The smallest we are willing to shrink to before giving up - past this a screenshot is unreadable. */
const MIN_SIDE = 640

const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.45]

const dataUrlWeight = (dataUrl: string): number => dataUrl.slice(dataUrl.indexOf(',') + 1).length

/**
 * Redraw a picked file small enough to fit `budget` base64 characters.
 *
 * Null when the file is not an image this browser can decode - an iPhone hands Safari a JPEG from the
 * photo library, but a file chosen out of a cloud folder may be anything at all.
 */
export const encodeImage = async (file: File, budget: number): Promise<PickedImage | null> => {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return null

  try {
    let side = MAX_SIDE

    while (side >= MIN_SIDE) {
      for (const quality of QUALITY_STEPS) {
        const dataUrl = draw(bitmap, side, quality)
        if (dataUrl === null) return null
        if (dataUrlWeight(dataUrl) <= budget) {
          return { id: `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: shortName(file.name), dataUrl, weight: dataUrlWeight(dataUrl) }
        }
      }

      side = Math.round(side * 0.75)
    }

    // Even at the floor it does not fit. Handing back the smallest we made would be worse than saying
    // nothing: the message would be refused by the relay and the person would never learn why.
    return null
  } finally {
    bitmap.close()
  }
}

/** The picture at this longest side, as JPEG at this quality. */
const draw = (bitmap: ImageBitmap, side: number, quality: number): string | null => {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))

  const context = canvas.getContext('2d')
  if (!context) return null

  // A screenshot with transparency would otherwise come out on black, and JPEG has no alpha to keep.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/jpeg', quality)
}

/** Long enough to tell two screenshots apart, short enough for a chip on a phone. */
const shortName = (name: string): string => {
  const trimmed = name.replace(/\.[^.]+$/, '')
  return trimmed.length > 18 ? `${trimmed.slice(0, 17)}…` : trimmed || 'photo'
}
