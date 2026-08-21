import { describe, expect, it } from 'vitest'
import { commandLabel, formatDuration } from './tools'

describe('a call duration', () => {
  it('leaves the fractions of a second on fast calls', () => {
    expect(formatDuration(340)).toBe('0.3s')
    expect(formatDuration(6_200)).toBe('6.2s')
  })

  it('drops the fractions past ten seconds', () => {
    expect(formatDuration(30_000)).toBe('30s')
  })

  it('runs the minutes with seconds, and never a "60s" among them', () => {
    expect(formatDuration(90_000)).toBe('1m 30s')
    expect(formatDuration(59_600 + 60_000)).toBe('2m 00s')
  })

  it('counts in hours past an hour: a "1010m" does not convert to hours by eye', () => {
    expect(formatDuration(3_600_000)).toBe('1h 00m 00s')
    expect(formatDuration(60_608_000)).toBe('16h 50m 08s')
  })

  // The seconds are the one thing that shows time is passing: without them a long turn looks frozen for a
  // whole minute.
  it('does not let the hours eat the seconds', () => {
    expect(formatDuration(3_600_000 + 5_000)).toBe('1h 00m 05s')
    expect(formatDuration(3_600_000 + 70_000)).toBe('1h 01m 10s')
  })
})

describe('a command short caption', () => {
  it('leaves the command itself out of a command with flags', () => {
    expect(commandLabel('pnpm dev --host')).toBe('pnpm dev')
    expect(commandLabel('tail -f build/sandbox.log')).toBe('tail')
  })

  it('folds a script path down to its file name', () => {
    expect(commandLabel('./scripts/sandbox.sh')).toBe('sandbox.sh')
  })

  it('does not treat entering a directory and loading the environment as the work itself', () => {
    expect(commandLabel('cd /Users/max/project && pnpm dev')).toBe('pnpm dev')
    expect(commandLabel('source .env && ./gradlew runIde')).toBe('gradlew runIde')
  })

  it('does not count the variables before a command as part of the business', () => {
    expect(commandLabel('NODE_ENV=production pnpm build')).toBe('pnpm build')
  })

  it('represents a multi-line command by its first line', () => {
    expect(commandLabel('python3 script.py \\\n  --verbose')).toBe('python3 script.py')
  })

  it('gives an empty command an empty caption, so the chip has something to replace it with', () => {
    expect(commandLabel('')).toBe('')
    expect(commandLabel('   ')).toBe('')
  })
})
