import qrcode from 'qrcode-generator'
import { useMemo } from 'react'
import { useT } from '../i18n'

interface QrCodeProps {
  value: string
  /** How big one module is drawn. Four is comfortable to scan off a monitor at arm's length. */
  scale?: number
}

/**
 * A QR code, drawn as squares rather than as an image.
 *
 * Vector rather than a raster because this is scanned off a screen at whatever zoom the IDE happens to
 * be at, and a blurred code is a code that does not scan. It also means no canvas and no data URL - the
 * address inside never becomes a string anything else could pick up.
 *
 * The encoder is a dependency rather than something written here. The plugin's rule about dependencies
 * is about the JVM side, where an extra library risks a class clash with the IDE itself; this one is a
 * dozen kilobytes in the interface's own bundle and clashes with nothing. Writing a Reed-Solomon
 * encoder by hand instead would be three hundred lines of arithmetic to avoid that.
 */
export const QrCode = ({ value, scale = 4 }: QrCodeProps) => {
  const t = useT()
  const { path, size } = useMemo(() => {
    // Zero picks the smallest version the content fits into; 'M' recovers from a fair amount of glare
    // and camera noise without making the code much denser.
    const code = qrcode(0, 'M')
    code.addData(value)
    code.make()

    const count = code.getModuleCount()
    const parts: string[] = []

    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (code.isDark(row, column)) parts.push(`M${column} ${row}h1v1h-1z`)
      }
    }

    return { path: parts.join(''), size: count }
  }, [value])

  return (
    <svg
      width={size * scale}
      height={size * scale}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={t.remote.codeLabel}
      shapeRendering="crispEdges"
    >
      {/* The quiet zone matters as much as the squares: a code drawn flush against a dark panel is one
          most cameras will not find at all. */}
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
