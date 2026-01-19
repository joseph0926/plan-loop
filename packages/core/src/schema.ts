/**
 * Plan Loop MCP - Zod Schemas for validation
 * Used to validate session data loaded from disk
 */

import { z } from 'zod';

/**
 * Session status enum schema
 */
export const SessionStatusSchema = z.enum([
  'drafting',
  'pending_review',
  'pending_revision',
  'approved',
  'exhausted',
]);

/**
 * Feedback rating enum schema
 */
export const RatingSchema = z.enum(['🔴', '🟡', '🟢']);

/**
 * Plan entry schema
 */
export const PlanSchema = z.object({
  version: z.number().int().nonnegative(),
  content: z.string(),
  submittedAt: z.string(),
});

/**
 * Feedback entry schema
 */
export const FeedbackSchema = z.object({
  planVersion: z.number().int().nonnegative(),
  rating: RatingSchema,
  content: z.string(),
  submittedAt: z.string(),
});

/**
 * Session schema for validation
 */
export const SessionSchema = z.object({
  id: z.string().uuid(),
  goal: z.string().min(1),
  status: SessionStatusSchema,
  version: z.number().int().nonnegative(),
  iteration: z.number().int().nonnegative(),
  maxIterations: z.number().int().positive(),
  plans: z.array(PlanSchema),
  feedbacks: z.array(FeedbackSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Validated session type (inferred from schema)
 */
export type ValidatedSession = z.infer<typeof SessionSchema>;
