// The only file of this name in the project: a bare "format.js" must open it, whatever folder it is in.
export const formatDelay = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)
