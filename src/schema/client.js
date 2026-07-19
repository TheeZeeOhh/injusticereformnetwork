import { z } from 'zod';

// Client record schema (Vault A). This is the plaintext shape validated at the
// vault boundary — it does NOT change encryption, only the object that gets
// encrypted/decrypted.
//
// Design for safe evolution:
//   - .default() on every field so a legacy record missing a field (e.g. one
//     saved before `pronouns` existed) is NORMALIZED, never rejected.
//   - .passthrough() so any unknown key is preserved — we never silently drop
//     client data we don't yet model.
export const ClientSchema = z.object({
  legalName: z.string().default(''),
  alias: z.string().default(''),
  phone: z.string().default(''),
  emergency: z.string().default(''),
  smsConsent: z.boolean().default(false),
  photo: z.string().default(''),                 // data: URL or ''
  pronouns: z.array(z.string()).default([]),
  pronounsSelfDescribe: z.string().default(''),
}).passthrough();
