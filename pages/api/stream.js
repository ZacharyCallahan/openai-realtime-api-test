// pages/api/stream.js
// Updated: Added logging for connection attempts/errors (console for test).
// This helps debug handshake: Look for 'WebSocket connection attempt' in terminal.
// Still handles Twilio <-> OpenAI audio piping.
// New: Added setInterval ping every 30s to keep Twilio WS alive (prevents hangs in tunnels like lt).

import WebSocket, { WebSocketServer } from 'ws';
import { parse } from 'url';

export default async function handler(req, res) {
    console.log('Stream handler called', { method: req.method, url: req.url }); // Log incoming

    if (req.headers.upgrade !== 'websocket') {
        console.error('Not a WebSocket upgrade request');
        res.status(400).end('Expected WebSocket upgrade');
        return;
    }

    const wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (twilioWS) => {
        console.log('WebSocket upgrade successful');
        wss.emit('connection', twilioWS, req);
    });

    wss.on('connection', (twilioWS, req) => {
        console.log('WebSocket connection established from Twilio');
        const { query } = parse(req.url, true);
        const callId = query.callId; // For logging

        // Add ping to keep connection alive (sends every 30 seconds)
        const pingInterval = setInterval(() => {
            if (twilioWS.readyState === WebSocket.OPEN) {
                twilioWS.send(JSON.stringify({ event: 'ping' }));
                console.log('Sent ping to Twilio WS');
            }
        }, 30000);

        let streamSid;
        let openaiWS;
        let transcript = ''; // Accumulate here, log at end

        // Hardcoded instructions for test (pull from settings in full app)
        const instructions = 'You are a helpful AI agent. Greet the user and have a conversation.';

        openaiWS = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
        });

        openaiWS.on('open', () => {
            console.log('Connected to OpenAI Realtime');
            openaiWS.send(JSON.stringify({
                type: 'session.update',
                session: {
                    model: 'gpt-4o-realtime-preview',
                    instructions,
                    output_modalities: ['audio'],
                    audio: {
                        input: { format: 'g711_ulaw', turn_detection: { type: 'semantic_vad', create_response: true } },
                        output: { format: 'g711_ulaw', voice: 'alloy', speed: 1.0 },
                    },
                },
            }));

            openaiWS.send(JSON.stringify({
                type: 'response.create',
                response: { instructions: 'Start the conversation with a greeting.' },
            }));
        });

        openaiWS.on('message', (message) => {
            const data = JSON.parse(message.toString());
            if (data.type === 'response.audio.delta') {
                twilioWS.send(JSON.stringify({ event: 'media', streamSid, media: { payload: data.delta } }));
            } else if (data.type === 'response.text.delta') {
                transcript += data.delta; // Accumulate assistant text
            }
            // Add more event handlers as needed
        });

        openaiWS.on('error', (err) => console.error('OpenAI WS error:', err));
        openaiWS.on('close', () => {
            console.log('OpenAI WS closed');
            twilioWS.close();
        });

        twilioWS.on('message', (message) => {
            const data = JSON.parse(message.toString());
            if (data.event === 'start') {
                streamSid = data.start.streamSid;
                console.log('Twilio stream started', { streamSid });
            } else if (data.event === 'media') {
                if (openaiWS.readyState === WebSocket.OPEN) {
                    openaiWS.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: data.media.payload }));
                }
            } else if (data.event === 'stop') {
                console.log('Twilio stream stopped. Transcript:', transcript);
                openaiWS.close();
            }
        });

        twilioWS.on('error', (err) => console.error('Twilio WS error:', err));
        twilioWS.on('close', () => {
            console.log('Twilio WS closed');
            clearInterval(pingInterval); // Stop pings when closed
            if (openaiWS) openaiWS.close();
        });
    });

    res.end();
}

export const config = { api: { bodyParser: false } };