// ws-server/server.js
// Standalone WebSocket server for Twilio Media Streams to OpenAI Realtime.
// Handles audio piping between Twilio and OpenAI Realtime API.

require('dotenv').config({ path: './.env' });
const WebSocket = require('ws');
const { parse } = require('url');

// Configuration
const WS_PORT = process.env.WS_PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('🔧 Configuration loaded:');
console.log(`   WS_PORT: ${WS_PORT}`);
console.log(`   OPENAI_API_KEY: ${OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);

if (!OPENAI_API_KEY) {
    console.error('❌ ERROR: OPENAI_API_KEY is not set! Please check your .env file.');
    process.exit(1);
}

// Create WebSocket server
const wss = new WebSocket.Server({
    port: WS_PORT,
    perMessageDeflate: false,
});

console.log(`🚀 WebSocket server running on port ${WS_PORT}`);

// Audio conversion functions
function mulawToLinear(u_val) {
    u_val = ~u_val & 0xff;
    let t = ((u_val & 0x0f) << 3) + 0x84;
    t <<= (u_val & 0x70) >> 4;
    let val = ((u_val & 0x80) ? (0x84 - t) : (t - 0x84));
    return (val << 2); // Scale to approximate 16-bit range (-32124 to 32124)
}

function linearToMulaw(pcmSample) {
    // Scale down from 16-bit range to match mulaw encoding
    pcmSample = Math.floor(pcmSample / 4);

    let sign = (pcmSample < 0) ? 0x80 : 0;
    pcmSample = Math.abs(pcmSample);
    if (pcmSample > 8159) pcmSample = 8159;
    pcmSample += 33;

    let exponent = 7;
    for (let expMask = 0x1000; (pcmSample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1);

    const mantissa = (pcmSample >> (exponent + 3)) & 0x0F;
    return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

function decodeMulaw(mulawBytes) {
    const pcm = new Int16Array(mulawBytes.length);
    for (let i = 0; i < mulawBytes.length; i++) {
        pcm[i] = mulawToLinear(mulawBytes[i]);
    }
    return pcm;
}

function encodeMulaw(pcm) {
    const mulaw = new Uint8Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
        mulaw[i] = linearToMulaw(pcm[i]);
    }
    return mulaw;
}

function clip(value) {
    return Math.max(-32768, Math.min(32767, value));
}

function upsample3x(pcm8khz) {
    if (pcm8khz.length === 0) return new Int16Array(0);
    const len = (pcm8khz.length - 1) * 3 + 1;
    const pcm24khz = new Int16Array(len);
    for (let i = 0; i < pcm8khz.length - 1; i++) {
        const s0 = pcm8khz[i];
        const s1 = pcm8khz[i + 1];
        pcm24khz[i * 3] = clip(s0);
        pcm24khz[i * 3 + 1] = clip(Math.round((2 * s0 + s1) / 3));
        pcm24khz[i * 3 + 2] = clip(Math.round((s0 + 2 * s1) / 3));
    }
    pcm24khz[len - 1] = clip(pcm8khz[pcm8khz.length - 1]);
    return pcm24khz;
}

function downsample3x(pcm24khz) {
    const len = Math.floor(pcm24khz.length / 3);
    const pcm8khz = new Int16Array(len);
    for (let i = 0; i < len; i++) {
        const sum = pcm24khz[i * 3] + pcm24khz[i * 3 + 1] + pcm24khz[i * 3 + 2];
        pcm8khz[i] = Math.floor(sum / 3);
    }
    return pcm8khz;
}

wss.on('connection', (twilioWS, request) => {
    console.log('📞 New WebSocket connection established');

    const { query } = parse(request.url, true);
    const callId = query.callId || 'unknown';

    let streamSid;
    let openaiWS;
    let transcript = '';
    let openaiConnected = false;

    // Hardcoded instructions for test (pull from settings in full app)
    const instructions = 'You are a helpful AI agent. Greet the user and have a conversation.';

    // Function to connect to OpenAI (called only when Twilio starts streaming)
    const connectToOpenAI = () => {
        if (openaiConnected) return; // Already connected

        try {
            console.log('🤖 Connecting to OpenAI Realtime API...');
            openaiWS = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime', {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    "OpenAI-Beta": "realtime=v1"
                },
                timeout: 30000, // 30 second timeout
                handshakeTimeout: 10000, // 10 second handshake timeout
            });

            openaiWS.on('open', () => {
                console.log('✅ Connected to OpenAI Realtime API');
                openaiConnected = true;
                clearTimeout(connectionTimeout);

                // Configure the OpenAI session to output mu-law directly
                openaiWS.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        type: 'realtime',
                        model: 'gpt-realtime',
                        output_modalities: ["text", "audio"],
                        audio: {
                            input: {
                                format: "pcm16",
                                turn_detection: { type: "semantic_vad", create_response: true }
                            },
                            output: {
                                format: "pcm16",
                                voice: "echo",
                                speed: 1.0
                            }
                        },
                        instructions: instructions,
                    }
                }));

                // Start the conversation immediately with a simple text message
                setTimeout(() => {
                    console.log('🚀 Sending initial text message to OpenAI...');

                    // Create a simple text conversation item
                    openaiWS.send(JSON.stringify({
                        type: 'conversation.item.create',
                        item: {
                            type: 'message',
                            role: 'user',
                            content: [{
                                type: 'input_text',
                                text: 'Hello! Please introduce yourself as an AI assistant.'
                            }]
                        }
                    }));

                    // Create response after a short delay
                    setTimeout(() => {
                        openaiWS.send(JSON.stringify({
                            type: 'response.create'
                        }));
                        console.log('🚀 Requested response from OpenAI');
                    }, 500);
                }, 1500); // Wait for session to be configured
            });

            openaiWS.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());

                    if (data.type === 'response.audio.delta') {
                        // Convert OpenAI pcm16 24kHz to mu-law 8kHz for Twilio
                        const pcmBase64 = data.delta;
                        const pcmBytes = Buffer.from(pcmBase64, 'base64');
                        const pcm24khz = new Int16Array(pcmBytes.length / 2);
                        for (let i = 0; i < pcm24khz.length; i++) {
                            pcm24khz[i] = pcmBytes.readInt16LE(i * 2);
                        }
                        const pcm8khz = downsample3x(pcm24khz);
                        const mulawBytes = encodeMulaw(pcm8khz);
                        const mulawBase64 = Buffer.from(mulawBytes).toString('base64');
                        if (twilioWS.readyState === WebSocket.OPEN && mulawBase64) {
                            twilioWS.send(JSON.stringify({
                                event: 'media',
                                streamSid,
                                media: { payload: mulawBase64 }
                            }));
                            console.log('🎵 Sending converted mu-law audio to Twilio');
                        }
                    } else if (data.type === 'response.text.delta') {
                        // Accumulate assistant text for logging
                        transcript += data.delta;
                        console.log('🤖 OpenAI says:', data.delta);
                    } else if (data.type === 'input_audio_buffer.speech_started') {
                        console.log('🎤 User started speaking');
                    } else if (data.type === 'input_audio_buffer.speech_stopped') {
                        console.log('🔇 User stopped speaking');
                    } else if (data.type === 'response.audio_transcript.delta') {
                        // This contains the user's transcribed speech
                        console.log('👤 User said:', data.delta);
                    } else if (data.type === 'conversation.item.input_audio_transcription.completed') {
                        console.log('📝 User transcription completed:', data.transcript);
                    } else if (data.type === 'conversation.item.created') {
                        console.log('📝 Conversation item created:', data.item.id);
                    } else if (data.type === 'response.done') {
                        console.log('✅ Response completed');
                    } else if (data.type === 'conversation.item.added') { // For backward compatibility if needed
                        console.log('📝 Conversation item added:', data.item.id);
                    } else if (data.type === 'conversation.item.done') {
                        console.log('✅ Item completed');
                    } else {
                        // Log unknown event types for debugging
                        console.log('📨 Unknown OpenAI event:', data.type, JSON.stringify(data).substring(0, 200));
                    }
                } catch (error) {
                    console.error('❌ Error processing OpenAI message:', error);
                    console.error('❌ Raw message:', message.toString());
                }
            });

            // Add connection timeout
            const connectionTimeout = setTimeout(() => {
                if (!openaiConnected) {
                    console.error('⏰ OpenAI connection timeout - closing connection');
                    openaiWS.close();
                    if (twilioWS.readyState === WebSocket.OPEN) {
                        twilioWS.close();
                    }
                }
            }, 25000); // 25 second timeout

            openaiWS.on('error', (error) => {
                console.error('❌ OpenAI WebSocket error:', error.message || error);
                openaiConnected = false;
                clearTimeout(connectionTimeout);
            });

            openaiWS.on('close', () => {
                console.log('🔚 OpenAI connection closed');
                openaiConnected = false;
                clearTimeout(connectionTimeout);
                if (twilioWS.readyState === WebSocket.OPEN) {
                    twilioWS.close();
                }
            });

            // Note: The 'open' event handler is already defined above

        } catch (error) {
            console.error('❌ Failed to connect to OpenAI:', error);
            openaiConnected = false;
            twilioWS.close();
        }
    };

    // Handle messages from Twilio
    twilioWS.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.event === 'start') {
                streamSid = data.start.streamSid;
                console.log(`🎯 Twilio Media Stream started: ${streamSid} (Call ID: ${callId})`);

                // OpenAI should already be connected from WebSocket open event
                if (!openaiConnected) {
                    console.log('🔄 OpenAI not connected yet, connecting now...');
                    connectToOpenAI();
                } else {
                    console.log('✅ OpenAI already connected, ready for audio');
                }

            } else if (data.event === 'media') {
                // Convert Twilio mu-law 8kHz to pcm16 24kHz for OpenAI
                if (openaiWS && openaiWS.readyState === WebSocket.OPEN && openaiConnected) {
                    try {
                        const mulawBase64 = data.media.payload;
                        const mulawBytes = Buffer.from(mulawBase64, 'base64');
                        const pcm8khz = decodeMulaw(mulawBytes);
                        const pcm24khz = upsample3x(pcm8khz);
                        const audioBuffer = Buffer.alloc(pcm24khz.length * 2);
                        for (let i = 0; i < pcm24khz.length; i++) {
                            audioBuffer.writeInt16LE(clip(pcm24khz[i]), i * 2);
                        }
                        const pcmBase64 = audioBuffer.toString('base64');
                        openaiWS.send(JSON.stringify({
                            type: 'input_audio_buffer.append',
                            audio: pcmBase64
                        }));
                        if (Math.random() < 0.1) {
                            console.log('📡 Forwarding converted pcm16 audio to OpenAI');
                        }
                    } catch (error) {
                        console.error('❌ Error converting/sending audio to OpenAI:', error);
                    }
                } else if (!openaiConnected) {
                    console.log('⚠️ Received media but OpenAI not connected yet');
                }
            } else if (data.event === 'stop') {
                console.log(`⏹️ Call ended. Transcript: ${transcript}`);
                if (openaiWS) {
                    openaiWS.close();
                }
            } else {
                console.log('📨 Received unknown event:', data.event);
            }
        } catch (error) {
            console.error('❌ Error processing Twilio message:', error);
        }
    });

    twilioWS.on('error', (error) => {
        console.error('❌ Twilio WebSocket error:', error);
    });

    twilioWS.on('close', () => {
        console.log('📞 Twilio connection closed');
        if (openaiWS) {
            openaiWS.close();
        }
    });

    // For direct connections (like wscat), connect to OpenAI immediately
    // This handles the case where someone connects directly to test
    if (!request.headers || !request.headers['user-agent'] || !request.headers['user-agent'].includes('Twilio')) {
        console.log('🔌 Direct connection detected - connecting to OpenAI immediately');
        setTimeout(() => connectToOpenAI(), 100); // Small delay to ensure connection is stable
    }
});

// Handle server errors
wss.on('error', (error) => {
    console.error('❌ WebSocket server error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down WebSocket server...');
    wss.clients.forEach(client => client.close());
    wss.close(() => {
        console.log('✅ WebSocket server shut down');
        process.exit(0);
    });
});

console.log(`🔧 Server ready! Connect Twilio streams to: ws://localhost:${WS_PORT}`);
