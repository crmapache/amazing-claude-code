/**
 * The phone's pictures of the listing: three screens to a picture, in the listing's order (they stand
 * right after the remote-access frame, see compose.mjs). Each name is a screenshot in build/listing/phone,
 * taken by phone-shots.mjs.
 */
export const PHONE_SETS = [
  {
    id: 'phone-in-your-pocket',
    caption: 'Your agent in your pocket: what waits on you, every diff, allow or deny from anywhere',
    screens: ['home', 'thread-diff', 'permission'],
  },
  {
    id: 'phone-answer-and-steer',
    caption: 'Answer its questions, switch model and effort, reach every project from the phone',
    screens: ['question', 'model-sheet', 'menu'],
  },
  {
    id: 'phone-scenarios',
    caption: 'Start a scenario from the phone and follow it card by card until it is done',
    screens: ['scenarios', 'run-live', 'run-done'],
  },
]
