// src/domains/calls/use-cases/InitiateCallUseCase.js
// Use-case: Handles the business flow (like "initiate call" steps).
// Validates input, calls Twilio via infrastructure, returns result.
// (Similar to a service method, but focused on one flow; no direct DB here yet).

import { TwilioCaller } from '../../../infrastructure/twilio/TwilioCaller';
import { InitiateCallSchema } from '../dtos/InitiateCallDTO';

export class InitiateCallUseCase {
    async execute(dto) {
        // Validate DTO
        const validated = InitiateCallSchema.safeParse(dto);
        if (!validated.success) {
            throw new Error(validated.error.errors[0].message);
        }

        const twilioCaller = new TwilioCaller();
        const publicUrl = process.env.PUBLIC_URL;
        const twimlUrl = `${publicUrl}/api/twiml`; // No query param needed

        const call = await twilioCaller.initiateCall({
            from: process.env.TWILIO_PHONE_NUMBER,
            to: dto.toPhone,
            url: twimlUrl, // HTTP URL that returns TwiML
        });

        return { message: `Call initiated to ${dto.toPhone}. SID: ${call.sid}` };
    }
}
