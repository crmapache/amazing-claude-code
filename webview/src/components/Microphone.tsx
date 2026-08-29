/**
 * The microphone, drawn once for the whole plugin.
 *
 * The one shape everybody already reads as "speak": a capsule, the arc under it and a stem. Stroked
 * rather than filled, like the paperclip beside it - at this size a solid capsule reads as a pill.
 *
 * One drawing rather than three, and not only out of tidiness: it stands in the composer's button, in
 * the side menu's row and on the phone, and those three have to recognise each other without being
 * read. Copied about, it had already started to drift - the phone's copy came over wearing the
 * paperclip's class and was drawn leaning 45 degrees.
 */
export const Microphone = ({ className, size }: { className?: string; size?: number }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    aria-hidden="true"
    {...(size ? { width: size, height: size } : {})}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5v4" />
  </svg>
)
