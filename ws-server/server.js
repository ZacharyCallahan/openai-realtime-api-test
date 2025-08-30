import dotenv from "dotenv";
import WebSocket, { WebSocketServer } from "ws";

dotenv.config();

// WebSocket server to handle Twilio connections
const PORT = process.env.WS_PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server started on port ${PORT}`);

// Track active connections
const activeConnections = new Map();

wss.on('connection', function connection(twilioWs, req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const callId = url.searchParams.get('callId') || 'unknown';

    console.log(`Twilio connection established for call: ${callId}`);

    // Create OpenAI connection for this call
    const openaiUrl = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
    const openaiWs = new WebSocket(openaiUrl, {
        headers: {
            Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        },
    });

    // Store the connection pair
    activeConnections.set(callId, { twilioWs, openaiWs });

    // Configure OpenAI session when connected
    openaiWs.on("open", function open() {
        console.log(`OpenAI connection established for call: ${callId}`);

        const sessionConfig = {
            type: "session.update",
            session: {
                type: "realtime",
                instructions: "You are a helpful AI assistant. Respond naturally and conversationally to phone calls. Be concise but friendly. Respond in english",
                output_modalities: ["audio"],
                audio: {
                    input: {
                        format: {
                            type: "audio/pcm",
                            rate: 24000,
                        },
                        turn_detection: {
                            type: "semantic_vad",
                            create_response: true
                        }
                    },
                    output: {
                        format: {
                            type: "audio/pcmu",
                        },
                        voice: "alloy",
                        speed: 1.0
                    }
                }
            },
        };

        openaiWs.send(JSON.stringify(sessionConfig));
    });

    // Handle messages from OpenAI
    openaiWs.on("message", function incoming(message) {
        try {
            const event = JSON.parse(message.toString());
            console.log(`OpenAI event for call ${callId}:`, event.type);

            // Handle errors from OpenAI
            if (event.type === "error") {
                console.error(`OpenAI error for call ${callId}:`, JSON.stringify(event, null, 2));
                return;
            }

            // Handle audio output from OpenAI
            if (event.type === "response.output_audio.delta" && event.delta && twilioWs.streamSid) {
                // Send audio back to Twilio
                const mediaMessage = {
                    event: "media",
                    streamSid: twilioWs.streamSid,
                    media: {
                        payload: event.delta
                    }
                };

                if (twilioWs.readyState === WebSocket.OPEN) {
                    twilioWs.send(JSON.stringify(mediaMessage));
                }
            }

            // Log other important events
            if (event.type === "session.created" ||
                event.type === "session.updated" ||
                event.type === "response.created" ||
                event.type === "response.done") {
                console.log(`OpenAI ${event.type} for call ${callId}`);

                // Make OpenAI talk first after session is updated
                if (event.type === "session.updated") {
                    console.log(`Triggering initial OpenAI response for call: ${callId}`);

                    // Create initial assistant message
                    const initialAssistantMessage = {
                        type: 'conversation.item.create',
                        item: {
                            type: 'message',
                            role: 'assistant',
                            content: [
                                {
                                    type: 'output_text',
                                    text: 'Hello! I\'m your AI assistant. How can I help you today?'
                                }
                            ]
                        }
                    };
                    openaiWs.send(JSON.stringify(initialAssistantMessage));

                    // Generate the assistant's response
                    const responseCreate = {
                        type: 'response.create',
                    };
                    openaiWs.send(JSON.stringify(responseCreate));
                }
            }

        } catch (error) {
            console.error(`Error processing OpenAI message for call ${callId}:`, error);
        }
    });

    // Handle messages from Twilio
    twilioWs.on("message", function incoming(message) {
        try {
            const data = JSON.parse(message);

            switch (data.event) {
                case "connected":
                    console.log(`Twilio connected for call: ${callId}`);
                    break;

                case "start":
                    console.log(`Twilio stream started for call: ${callId}`);
                    twilioWs.streamSid = data.start.streamSid;
                    break;

                case "media":
                    // Convert Twilio's mu-law audio to PCM16 for OpenAI
                    if (data.media && data.media.payload && openaiWs.readyState === WebSocket.OPEN) {
                        // Twilio sends mu-law encoded audio, need to convert to PCM16
                        const audioData = convertMuLawToPCM16(data.media.payload);

                        if (audioData) {
                            const audioEvent = {
                                type: "input_audio_buffer.append",
                                audio: audioData
                            };

                            openaiWs.send(JSON.stringify(audioEvent));
                        }
                    }
                    break;

                case "stop":
                    console.log(`Twilio stream stopped for call: ${callId}`);
                    break;

                default:
                    console.log(`Unknown Twilio event for call ${callId}:`, data.event);
            }

        } catch (error) {
            console.error(`Error processing Twilio message for call ${callId}:`, error);
        }
    });

    // Handle connection cleanup
    twilioWs.on("close", function close() {
        console.log(`Twilio connection closed for call: ${callId}`);
        if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.close();
        }
        activeConnections.delete(callId);
    });

    openaiWs.on("close", function close() {
        console.log(`OpenAI connection closed for call: ${callId}`);
    });

    openaiWs.on("error", function error(err) {
        console.error(`OpenAI WebSocket error for call ${callId}:`, err);
    });

    twilioWs.on("error", function error(err) {
        console.error(`Twilio WebSocket error for call ${callId}:`, err);
    });
});

// Audio conversion functions
function convertMuLawToPCM16(muLawBase64) {
    try {
        // Decode base64 mu-law audio from Twilio
        const muLawBuffer = Buffer.from(muLawBase64, 'base64');

        // Convert mu-law to linear PCM
        const pcmBuffer = Buffer.alloc(muLawBuffer.length * 2);

        for (let i = 0; i < muLawBuffer.length; i++) {
            const muLawByte = muLawBuffer[i];
            const linearValue = muLawToLinear(muLawByte);
            pcmBuffer.writeInt16LE(linearValue, i * 2);
        }

        // Convert to base64 for OpenAI
        return pcmBuffer.toString('base64');

    } catch (error) {
        console.error('Error converting mu-law to PCM16:', error);
        return null;
    }
}

// Mu-law to linear conversion (simplified)
function muLawToLinear(muLawByte) {
    const BIAS = 0x84;
    const CLIP = 32635;

    muLawByte = ~muLawByte;
    const sign = (muLawByte & 0x80);
    const exponent = (muLawByte >> 4) & 0x07;
    const mantissa = muLawByte & 0x0F;

    let sample = mantissa << (exponent + 3);
    if (exponent !== 0) {
        sample += BIAS << exponent;
    } else {
        sample += BIAS;
    }

    if (sign !== 0) {
        sample = -sample;
    }

    return Math.max(-CLIP, Math.min(CLIP, sample));
}

console.log("Server ready to handle Twilio calls with OpenAI integration");