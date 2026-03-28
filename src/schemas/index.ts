import { z } from 'zod';

export const NodeIdSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+:[a-zA-Z0-9._-]+$/,
    'nodeId must be in namespace:name format (only alphanumeric, dash, dot, underscore)'
  );

export const HopsSchema = z.coerce.number().int().min(1).max(20);

export const IngestInputSchema = z.object({
  source:  z.enum(['mock', 'live']).default('mock'),
  skipCve: z.boolean().default(false),
  wipe:    z.boolean().default(false),
});

export const PathsQuerySchema = z.object({
  maxHops: HopsSchema.default(10),
  limit:   z.coerce.number().int().min(1).max(200).default(50),
});

export const BlastQuerySchema = z.object({
  nodeId:  NodeIdSchema,
  maxHops: HopsSchema.default(8),
});

export const CyclesQuerySchema = z.object({
  maxDepth: HopsSchema.default(8),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

export const CriticalQuerySchema = z.object({
  topN: z.coerce.number().int().min(1).max(50).default(10),
});

export const SimulateInputSchema = z.object({
  nodeId:  NodeIdSchema,
  maxHops: HopsSchema.default(10),
});

export type IngestInput    = z.infer<typeof IngestInputSchema>;
export type PathsQuery     = z.infer<typeof PathsQuerySchema>;
export type BlastQuery     = z.infer<typeof BlastQuerySchema>;
export type CyclesQuery    = z.infer<typeof CyclesQuerySchema>;
export type CriticalQuery  = z.infer<typeof CriticalQuerySchema>;
export type SimulateInput  = z.infer<typeof SimulateInputSchema>;
