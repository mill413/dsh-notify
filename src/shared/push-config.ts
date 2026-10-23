/** Defaults shared by the host schema and the browser settings draft. */
export const PUSH_METHODS = ['POST', 'PUT', 'PATCH', 'GET'] as const
export type PushMethod = (typeof PUSH_METHODS)[number]
export const DEFAULT_BODY_TEMPLATE =
  '{"title":"{{title}}","body":"{{body}}","level":"{{level}}","group":"{{group}}","icon":"{{icon}}"}'
