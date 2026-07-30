import { scenariosCards } from './cards'
import { scenariosGrouping } from './grouping'
import type { Scenario } from '../types'

export const scenarios: Scenario[] = [...scenariosGrouping, ...scenariosCards]
