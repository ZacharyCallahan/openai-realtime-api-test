// src/infrastructure/twilio/TwilioCaller.js
// Infrastructure wrapper: Handles external Twilio SDK calls.
// Keeps domains/ clean from tool-specific code.

const twilio = require('twilio');

export class TwilioCaller {
    constructor() {
        this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }

    async initiateCall({ from, to, url }) {
        return this.client.calls.create({
            from,
            to,
            machineDetection: 'Enable', // Optional: Detect if human/voicemail
            url, // Now the HTTP TwiML URL
        });
    }
}
