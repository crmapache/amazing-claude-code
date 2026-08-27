import { scenariosCards } from './cards'
import { scenariosCombined } from './combined'
import { scenariosGrouping } from './grouping'
import { scenariosShowcase } from './showcase'
import { scenariosStatistics } from './statistics'
import { scenariosSystem } from './system'
import type { Scenario } from '../types'

export const scenarios: Scenario[] = [
  ...scenariosGrouping,
  ...scenariosCards,
  ...scenariosSystem,
  ...scenariosStatistics,
  ...scenariosCombined,
  ...scenariosShowcase,
]
