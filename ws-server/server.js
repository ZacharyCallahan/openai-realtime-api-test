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
            openaiWS = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    "OpenAI-Beta": "realtime=v1",
                },
                timeout: 30000, // 30 second timeout
                handshakeTimeout: 10000, // 10 second handshake timeout
            });

            openaiWS.on('open', () => {
                console.log('✅ Connected to OpenAI Realtime API');
                openaiConnected = true;
                clearTimeout(connectionTimeout);

                // Configure the OpenAI session with correct format
                openaiWS.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        
                        // type: 'realtime',  // Not needed
                        model: 'gpt-4o-realtime-preview-2024-10-01',
                        modalities: ['text', 'audio'],
                        instructions: instructions,
                        voice: 'alloy',
                        input_audio_format: 'g711_ulaw',
                        output_audio_format: 'g711_ulaw',
                        input_audio_transcription: {
                            model: 'whisper-1'
                        },
                        turn_detection: {
                            type: 'server_vad',
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 500
                        },
                        // tools: [],
                        tool_choice: 'auto',
                        temperature: 0.8,
                        // max_response_output_tokens: 4096  // Use 'max_output_tokens' if needed in response
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
                            // Remove invalid response object
                        }));
                        console.log('🚀 Requested response from OpenAI');
                    }, 500);
                }, 1500); // Wait for session to be configured
            });

            openaiWS.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());

                    switch (data.type) {
                        case 'session.created':
                            console.log('✅ Session created:', data.session.id);
                            break;
                        case 'response.audio.delta':
                            // Existing handling
                            if (twilioWS.readyState === WebSocket.OPEN) {
                                twilioWS.send(JSON.stringify({
                                    event: 'media',
                                    streamSid,
                                    media: { payload: data.delta }
                                }));
                                console.log('🎵 Sending OpenAI audio to Twilio');
                            }
                            break;
                        case 'response.text.delta':
                            transcript += data.delta;
                            console.log('🤖 OpenAI text:', data.delta);
                            break;
                        case 'response.audio_transcript.delta':
                            console.log('👤 User transcript delta:', data.delta);
                            break;
                        case 'response.done':
                            console.log('✅ Response completed');
                            break;
                        case 'conversation.item.created':
                            console.log('📝 Conversation item created:', data.item.id);
                            break;
                        case 'input_audio_buffer.committed':
                            console.log('🎤 Audio buffer committed');
                            break;
                        case 'error':
                            console.error('❌ OpenAI error:', data.error);
                            break;
                        default:
                            console.log('📨 Unhandled OpenAI event:', data.type, JSON.stringify(data).substring(0, 200));
                    }
                } catch (error) {
                    console.error('❌ Error processing OpenAI message:', error);
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
                // Forward audio to OpenAI only if connected
                if (openaiWS && openaiWS.readyState === WebSocket.OPEN && openaiConnected) {
                    // Convert Twilio's base64 audio to the format OpenAI expects
                    try {
                        openaiWS.send(JSON.stringify({
                            type: 'input_audio_buffer.append',
                            audio: data.media.payload // Twilio sends base64, OpenAI expects base64
                        }));
                        // Log every 10th media event to avoid spam
                        if (Math.random() < 0.1) {
                            console.log('📡 Forwarding audio data to OpenAI');
                        }
                    } catch (error) {
                        console.error('❌ Error sending audio to OpenAI:', error);
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
