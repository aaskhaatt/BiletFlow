import { z } from 'zod/mini'

const emailSchema = z.email({ pattern: z.regexes.unicodeEmail })

export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success
}
