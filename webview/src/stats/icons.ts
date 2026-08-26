/**
 * One icon per achievement, in the panel's own 16x16 stroke grid (the same one the menu's icons are drawn
 * in - see ICONS in SideMenu.tsx): a single path each, no fills, currentColor - so the tier's colour paints
 * the glyph for free.
 *
 * Keyed by the achievement's id, as everything about an achievement is (see catalogue.ts).
 */
export const ACHIEVEMENT_ICONS: Record<string, string> = {
  'steady-hand': 'M2.6 3.6h10.8v9.8H2.6z M2.6 6.4h10.8 M5.4 2.4v2 M10.6 2.4v2 M5.6 10l1.6 1.6 3.2-3.2',
  'month-straight': 'M2.6 3.6h10.8v9.8H2.6z M2.6 6.4h10.8 M6.2 6.4v7 M9.8 6.4v7 M2.6 9.9h10.8',
  quarter: 'M3 12.6V9.2 M8 12.6V6 M13 12.6V3.4',
  'weekend-crew': 'M6.6 8a3 3 0 11-6 0 3 3 0 016 0 M15.4 8a3 3 0 11-6 0 3 3 0 016 0',
  'early-riser': 'M8 4.2V2.2 M3.6 5.6L2.5 4.5 M12.4 5.6l1.1-1.1 M2 11.8h12 M11 11.8a3 3 0 00-6 0',
  'night-shift': 'M10.6 2.8a5.4 5.4 0 102.6 9.9A5.6 5.6 0 0110.6 2.8z M13 3.2v1.6 M12.2 4h1.6',
  'full-week': 'M2.4 6v4 M4.3 6v4 M6.2 6v4 M8.1 6v4 M10 6v4 M11.9 6v4 M13.8 6v4',
  'second-wind': 'M13 8a5 5 0 11-2.6-4.4 M13 2.6v2.8h-2.8',
  'two-hundred': 'M8 2.6l5.4 2.7L8 8 2.6 5.3z M2.6 8.4L8 11.1l5.4-2.7 M2.6 11L8 13.7l5.4-2.7',
  'a-year-in': 'M13.6 8a5.6 5.6 0 11-11.2 0 5.6 5.6 0 0111.2 0 M8 4.6V8l2.6 1.6',
  // A fir tree: three tiers of branches and a stump.
  'home-for-the-holidays': 'M8 2.2l3.2 4.6H9.8l2.6 3.8h-1.6l2 3.2H3.2l2-3.2H3.6l2.6-3.8H4.8z M8 13.8v1.2',
  'first-hour': 'M13.4 8a5.4 5.4 0 11-10.8 0 5.4 5.4 0 0110.8 0 M8 5.2V8l2 1.2',
  'ten-hours': 'M4 2.6h8 M4 13.4h8 M4.4 2.6c0 3 3.6 3.8 3.6 5.4s-3.6 2.4-3.6 5.4 M11.6 2.6c0 3-3.6 3.8-3.6 5.4s3.6 2.4 3.6 5.4',
  'hundred-hours': 'M8 3.4a5 5 0 105 5 M8 3.4V1.8 M6.4 1.8h3.2 M12.2 4.4l1.2-1.2 M8 5.8V8h2.2',
  'five-hundred': 'M5.4 2.4h5.2v11.2H5.4z M5.4 9.4h5.2 M3.4 4.6h1 M3.4 11.4h1',
  'deep-work': 'M2.6 2.6h10.8v10.8H2.6z M5.4 5.4h5.2v5.2H5.4z',
  marathon: 'M4 13.4V2.6 M4 3.2h7.6l-1.6 2.4 1.6 2.4H4',
  'full-day':
    'M11.4 8a3.4 3.4 0 11-6.8 0 3.4 3.4 0 016.8 0 M8 1.6v1.6 M8 12.8v1.6 M1.6 8h1.6 M12.8 8h1.6 M3.6 3.6l1.1 1.1 M11.3 11.3l1.1 1.1 M3.6 12.4l1.1-1.1 M11.3 4.7l1.1-1.1',
  sprint: 'M9.4 2L4.6 9h3.2l-1 5 4.6-7H8.2z',
  'quick-turn': 'M3 4l4 4-4 4 M9 4l4 4-4 4',
  'long-haul': 'M2.4 8h11.2 M10.4 4.8L13.6 8l-3.2 3.2',
  'first-diff': 'M4 2.6h5l3 3v7.8H4z M9 2.6v3h3 M6.4 9.4h3.2 M8 7.8v3.2',
  'thousand-lines': 'M3 4.4h10 M3 8h10 M3 11.6h6',
  'ten-thousand': 'M3 4h8 M3 6.6h8 M3 9.2h8 M3 11.8h5 M13.4 3.4v9',
  'hundred-thousand': 'M2 12.4l4-6 3 3.6 2.4-3.6 2.6 6z',
  'big-diff': 'M2.6 2.6h10.8v10.8H2.6z M8 5.4v5.2 M5.4 8h5.2',
  surgeon: 'M3 13l7.6-7.6 M9.6 4.4l2-2 2 2-2 2z M4.4 11.6l1.2 1.2',
  refactor: 'M3 5.4h8l-2-2 M13 10.6H5l2 2',
  housekeeper: 'M2.6 2.6h10.8v10.8H2.6z M5.4 8h5.2',
  'test-first': 'M13.4 8a5.4 5.4 0 11-10.8 0 5.4 5.4 0 0110.8 0 M5.6 8.2l1.8 1.8 3.4-4',
  rollback: 'M3 8a5 5 0 115 5 M3 5.2V8h2.8',
  reader: 'M8 4.4v8.2 M8 4.4C6.6 3.2 4.6 3 2.6 3.4v8c2-.4 4-.2 5.4 1 1.4-1.2 3.4-1.4 5.4-1v-8c-2-.4-4-.2-5.4 1',
  'grep-hound': 'M11.6 7a4.4 4.4 0 11-8.8 0 4.4 4.4 0 018.8 0 M10.4 10.4l3 3',
  shell: 'M2.6 3.4h10.8v9.2H2.6z M4.8 7l1.6 1.6-1.6 1.6 M8.4 10.2h3',
  writer: 'M3 13l1-3 7-7 2 2-7 7z M10 4l2 2',
  'todo-keeper': 'M3 4.6L4.4 6l2.4-2.6 M3 10.6L4.4 12l2.4-2.6 M8.8 4.8h4.6 M8.8 10.8h4.6',
  planner: 'M4 2.6h5l3 3v7.8H4z M9 2.6v3h3 M6 8.4h4 M6 10.8h4',
  mcp: 'M2.4 3h11.2v4.2H2.4z M2.4 8.8h11.2V13H2.4z',
  'plugin-shelf': 'M2.6 2.6h4.6v4.6H2.6z M8.8 2.6h4.6v4.6H8.8z M2.6 8.8h4.6v4.6H2.6z M8.8 8.8h4.6v4.6H8.8z',
  slash: 'M2.6 2.6h10.8v10.8H2.6z M6 11l4-6',
  attachment: 'M9.8 4.2L5.4 8.6a2.4 2.4 0 003.4 3.4l4.4-4.4a4 4 0 00-5.6-5.6L3.4 6.2',
  forked: 'M5 2.8v3.4c0 2 1.4 2.6 3 2.6s3-.6 3-2.6V2.8 M8 8.8v4.4',
  'fork-master': 'M4.6 3v10 M4.6 7.6h4a2.6 2.6 0 002.6-2.6V3.2 M2.8 13.2h3.6',
  'deep-tree': 'M3.4 2.6v9.2h3.2 M3.4 6.6h3.2 M9.8 5.2h3.4 M9.8 11.8h3.4',
  quoted: 'M5 4.6v3.2c0 1.6-.8 2.6-2 3.6 M11 4.6v3.2c0 1.6-.8 2.6-2 3.6',
  historian: 'M2.6 8a5.4 5.4 0 105.4-5.4 M8 4.8V8l2.6 1.6 M2.6 5.2V8h2.8',
  remote:
    'M9.7 8a1.7 1.7 0 11-3.4 0 1.7 1.7 0 013.4 0 M4.9 11.1a4.4 4.4 0 010-6.2 M11.1 4.9a4.4 4.4 0 010 6.2 M2.6 13.4a7.6 7.6 0 010-10.8 M13.4 2.6a7.6 7.6 0 010 10.8',
  'on-the-road': 'M5.4 2.6h5.2v10.8H5.4z M7.2 11.6h1.6',
  watched: 'M1.8 8s2.4-4 6.2-4 6.2 4 6.2 4-2.4 4-6.2 4S1.8 8 1.8 8z M9.8 8a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0',
  ceiling: 'M2.6 3.4h10.8 M8 13V6 M5.6 8.4L8 6l2.4 2.4',
  thanks: 'M8 12.8S3 9.8 3 6.6a2.6 2.6 0 015-1 2.6 2.6 0 015 1c0 3.2-5 6.2-5 6.2z',
}

/** The statistics tab's own icon - a small chart - for the menu and the tab strip. */
export const STATISTICS_ICON = 'M2.6 13.4h10.8 M4.4 11V7.6 M7.2 11V4.2 M10 11V6 M12.8 11V3'
