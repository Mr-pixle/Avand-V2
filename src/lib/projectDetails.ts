import type { Project, Team, User } from './types'

export const PROJECT_TYPES: readonly string[] = [
  'Commercial', 'Complex', 'Hospitality', 'Renovation', 'Residential', 'Public',
  'Urban Design', 'Industrial', 'Villa', 'Office', 'Interior Design',
]

export const PROJECT_TEXT_FIELDS = {
  location: 'Project Location',
  clientName: 'Client Name',
  structuralConsultant: 'Structural Consultant',
  mechanicalConsultant: 'Mechanical Consultant',
  electricalConsultant: 'Electrical Consultant',
  constructionBy: 'Construction By',
  photographer: 'Photographer',
} as const

export const PROJECT_TEXT_KEYS = Object.keys(PROJECT_TEXT_FIELDS) as (keyof typeof PROJECT_TEXT_FIELDS)[]
export const PROJECT_TEXT_LIMIT = 500
export const PROJECT_DETAIL_KEYS = [...PROJECT_TEXT_KEYS, 'areaM2', 'supervisorId', 'interiorDesignByPargar'] as const

export function projectSupervisors(users: User[], teams: Team[]) {
  const supervisionTeams = new Set(teams.filter(t => t.kind === 'supervision' && !t.archived).map(t => t.id))
  return users.filter(u => u.status === 'active' && (u.role === 'inspector' || supervisionTeams.has(u.teamId)))
}

export function projectDetailProblem(patch: Partial<Project>, previous: Project | undefined, users: User[], teams: Team[]) {
  if ((!previous || ('type' in patch && patch.type !== previous.type)) && !PROJECT_TYPES.includes(patch.type ?? '')) {
    return 'Select a valid project type.'
  }
  if (patch.areaM2 != null && (!Number.isFinite(patch.areaM2) || patch.areaM2 < 0)) return 'Enter a non-negative area in square metres.'
  for (const key of PROJECT_TEXT_KEYS) {
    const value = patch[key]
    if (value != null && (typeof value !== 'string' || value.length > PROJECT_TEXT_LIMIT)) {
      return `${PROJECT_TEXT_FIELDS[key]} must be text of at most ${PROJECT_TEXT_LIMIT} characters.`
    }
  }
  if (patch.supervisorId != null && patch.supervisorId !== previous?.supervisorId &&
    !projectSupervisors(users, teams).some(u => u.id === patch.supervisorId)) return 'Select an active supervisor.'
  if (patch.interiorDesignByPargar != null && typeof patch.interiorDesignByPargar !== 'boolean') {
    return 'Select Yes or No for Interior Design By Pargar.'
  }
  return null
}
