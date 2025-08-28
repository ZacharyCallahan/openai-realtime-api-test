// app/api/twiml/route.js
// New: HTTP endpoint that Twilio hits to get TwiML instructions.
// Returns XML to connect the call to your WebSocket stream for Media Streams.
// Uses app router (Next.js 15) for simplicity; dynamic with query params.

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');
    const host = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).host : request.headers.get('host');

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/api/stream?callId=${callId || 'temp'}" />
  </Connect>
</Response>`;

    return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' },
    });
}

// app/api/twiml/route.js
// Updated: Now handles POST (Twilio's default method for TwiML requests).
// Still generates XML to connect the call to your WebSocket stream.
// Uses app router; accesses query params from URL.

// app/api/twiml/route.js
// Updated: Added logging for TwiML requests (check if Twilio hits this).
// This generates XML telling Twilio to connect to your WS stream.

export async function POST(request) {
    console.log('TwiML request received', { url: request.url });

    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');
    const host = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).host : request.headers.get('host');

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/api/stream?callId=${callId || 'temp'}" />
  </Connect>
</Response>`;

    return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' },
    });
}