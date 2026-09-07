/**
 * What a selection in the feed puts into the clipboard.
 *
 * An attachment stands in the feed as a chip: a rounded caption saying `App.tsx` or `Image #3`. Copied
 * as it looks, that is what lands in the clipboard - a name with no path, useful to nobody outside the
 * panel. What the person wants there is what the agent itself was given: the path, the quote, the text
 * of the paste.
 *
 * So a chip carries the text of its own beside it (see COPY_ATTRIBUTE, set in UserCard), and a copy
 * swaps the caption for it. Done over the selection's own copy of the nodes rather than over the feed:
 * what is on screen must not so much as flicker.
 */

/** Where a node keeps what it means in the clipboard - the caption is only what it looks like. */
export const COPY_ATTRIBUTE = 'data-acc-copy'

/**
 * The selection's text with every chip spelled out - or nothing, when there is no chip in it and the
 * browser's own copy is already right.
 *
 * The fragment is measured inside the document rather than off to the side: line breaks between blocks
 * exist only where something is laid out, and a message copied out of a detached tree came back as one
 * long line. It is put where nothing can see it and taken away in the same breath.
 */
export const copiedText = (selection: Selection | null, doc: Document): string | null => {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  const fragment = doc.createDocumentFragment()
  let sawEnclosing = false

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index)

    /**
     * A range that lies wholly inside a chip - a formula, most of all, since a formula is large enough to
     * select part of rather than as a whole - has that chip trimmed off by cloneContents below: the clone
     * begins at the range's own common ancestor and never reaches above it, so the attribute never reaches
     * the fragment no matter how far up the tree it is set. The range's common ancestor is asked directly
     * instead: by definition it sits entirely inside anything that contains it, however deep the chip's own
     * markup goes - a formula's rendered tree included.
     */
    const anchor = range.commonAncestorContainer
    const element = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement
    const enclosing = element?.closest(`[${COPY_ATTRIBUTE}]`)

    if (enclosing) {
      fragment.append(doc.createTextNode(enclosing.getAttribute(COPY_ATTRIBUTE) ?? ''))
      sawEnclosing = true
    } else {
      fragment.append(range.cloneContents())
    }
  }

  const chips = fragment.querySelectorAll(`[${COPY_ATTRIBUTE}]`)
  if (!sawEnclosing && chips.length === 0) return null

  chips.forEach((chip) => chip.replaceWith(doc.createTextNode(chip.getAttribute(COPY_ATTRIBUTE) ?? '')))

  const holder = doc.createElement('div')
  // The feed keeps the line breaks a person typed (see .userBody), and so must the measuring copy.
  holder.style.whiteSpace = 'pre-wrap'
  holder.style.position = 'fixed'
  holder.style.top = '-10000px'
  holder.style.left = '0'
  holder.append(fragment)

  doc.body.append(holder)
  const text = holder.innerText
  holder.remove()

  return text
}
