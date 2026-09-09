import { describe, expect, it } from 'vitest'
import { repositoryOfOption, shelfOptionId, shelfOptions, type RepositoryChoice } from './scenarios'

/**
 * The shelves as rows of a pick sheet.
 *
 * Held by a test because the rule breaks silently and in the one direction nobody watches: this client
 * is served by the relay and reaches a phone the day it is deployed, while the plugin on the machine is
 * whatever version somebody has installed. A row offered against a machine that cannot answer it comes
 * back refused with a sentence written for another cause - "that project is no longer on this IDE's
 * list", about a project plainly on it.
 */

const WORDS = { shared: 'Every project', opensProject: 'opens it there', closed: 'Not open right now', noProject: 'No folder' }

const repository = (over: Partial<RepositoryChoice> = {}): RepositoryChoice => ({
  agentId: 'a1',
  projectKey: 'p1',
  name: 'nimbus-checkout',
  canShare: true,
  closed: false,
  canOpen: true,
  ...over,
})

describe('shelfOptions', () => {
  it('puts the shared shelf first', () => {
    const rows = shelfOptions([repository()], WORDS)

    expect(rows[0]).toEqual({ id: 'user', label: 'Every project' })
    expect(rows[1]?.label).toBe('nimbus-checkout')
  })

  it('offers a closed repository when the machine can open one', () => {
    const [, row] = shelfOptions([repository({ closed: true })], WORDS)

    expect(row?.disabled).toBe(false)
    expect(row?.hint).toBe('opens it there')
  })

  it('greys a closed repository when the machine is too old to open one', () => {
    const [, row] = shelfOptions([repository({ closed: true, canOpen: false })], WORDS)

    expect(row?.disabled).toBe(true)
    expect(row?.hint).toBe('Not open right now')
  })

  it('greys an open project with no repository to write into', () => {
    const [, row] = shelfOptions([repository({ canShare: false })], WORDS)

    expect(row?.disabled).toBe(true)
    expect(row?.hint).toBe('No folder')
  })

  it('names the row a shelf is, and reads it back', () => {
    const repositories = [repository(), repository({ projectKey: 'p2', name: 'roas-radar' })]

    expect(shelfOptionId({ scope: 'user' }, repositories)).toBe('user')
    expect(shelfOptionId({ scope: 'project', agentId: 'a1', projectKey: 'p2' }, repositories)).toBe('repo:1')
    expect(repositoryOfOption('repo:1', repositories)?.name).toBe('roas-radar')
    expect(repositoryOfOption('user', repositories)).toBeNull()
  })
})
