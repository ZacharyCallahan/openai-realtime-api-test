// src/domains/calls/dtos/InitiateCallDTO.js
// DTO: Data Transfer Object – a simple schema for input validation (using Zod).
// Ensures phone number is valid before processing.

import { z } from 'zod';

export const InitiateCallSchema = z.object({
    toPhone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number (E.164 format, e.g., +1234567890)'),
});
