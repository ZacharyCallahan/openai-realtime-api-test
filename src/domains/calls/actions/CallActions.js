// src/domains/calls/actions/CallActions.js
// Server actions: Exported functions that run on server (via 'use server').
// Used for mutations like initiating calls (secure, no client-side API keys).

'use server';

import { InitiateCallUseCase } from '../use-cases/InitiateCallUseCase';

export async function initiateCallAction(formData) {
    const dto = { toPhone: formData.get('toPhone') };

    try {
        const useCase = new InitiateCallUseCase();
        return await useCase.execute(dto);
    } catch (error) {
        return { error: error.message };
    }
}
