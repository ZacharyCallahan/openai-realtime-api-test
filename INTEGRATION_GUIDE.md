# Twilio-OpenAI Realtime API Integration Guide

## ✅ Implementation Complete

The integration has been successfully implemented based on the latest OpenAI Realtime API documentation. Here's what has been built:

### 🔧 Core Features Implemented

1. **WebSocket Bridge Server** - Handles connections between Twilio and OpenAI
2. **Audio Format Conversion** - Converts between Twilio's μ-law and OpenAI's PCM16
3. **Real-time Audio Streaming** - Bidirectional audio streaming using OpenAI events
4. **Session Management** - Proper OpenAI session configuration for phone calls
5. **Connection Management** - Robust handling of WebSocket connections and cleanup

### 📋 OpenAI Events Implementation

Based on the provided documentation, the system implements:

**Audio Input Events:**
- `input_audio_buffer.append` - Streams audio chunks from Twilio to OpenAI
- Automatic audio format conversion (μ-law → PCM16 → Base64)

**Audio Output Events:**
- `response.audio.delta` - Receives AI audio response chunks
- Direct streaming back to Twilio in μ-law format

**Session Configuration:**
- `session.update` with proper audio formats:
  - Input: `pcm16` with semantic VAD
  - Output: `g711_ulaw` for Twilio compatibility
  - Voice: `alloy` at normal speed

## 🚀 Setup Instructions

### 1. Environment Variables

Create `ws-server/.env`:
```bash
# WebSocket Server Configuration
WS_PORT=8080

# OpenAI Configuration (REQUIRED)
OPENAI_API_KEY=your_actual_openai_api_key
```

Create `.env.local` in project root:
```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# WebSocket Server
WS_SERVER_URL=ws://localhost:8080

# For production, use wss://your-domain.com
```

### 2. Start the Services

**Terminal 1 - WebSocket Server:**
```bash
cd ws-server
npm start
```

**Terminal 2 - Next.js App:**
```bash
npm run dev
```

### 3. Configure Twilio Webhook

In your Twilio Console:
1. Go to Phone Numbers → Manage → Active numbers
2. Select your Twilio phone number
3. Set the Webhook URL to: `https://your-domain.com/api/twiml`
4. Method: POST

## 🔄 How It Works

1. **Call Initiation**: User dials your Twilio number
2. **TwiML Response**: Twilio hits `/api/twiml` endpoint, gets XML pointing to WebSocket
3. **WebSocket Connection**: Twilio connects to `ws-server` with audio stream
4. **OpenAI Connection**: Server creates corresponding OpenAI Realtime API connection
5. **Audio Bridge**: 
   - Incoming audio: Twilio (μ-law) → PCM16 → OpenAI
   - Outgoing audio: OpenAI (g711_ulaw) → Twilio
6. **AI Conversation**: OpenAI processes speech and responds naturally

## 🎯 Testing the Integration

### Basic Test
1. Start both servers
2. Call your Twilio phone number
3. Speak after the connection is established
4. You should hear AI responses through the phone

### Debug Logs
The WebSocket server logs:
- Connection establishments
- Audio format conversions
- OpenAI event types
- Error conditions

### Expected Log Output
```
WebSocket server started on port 8080
Twilio connection established for call: [callId]
OpenAI connection established for call: [callId]
OpenAI session.created for call: [callId]
OpenAI event for call [callId]: response.audio.delta
```

## 🛠 Technical Implementation Details

### Audio Conversion Pipeline
```
Twilio μ-law → Base64 Decode → Linear PCM → PCM16 → Base64 → OpenAI
OpenAI g711_ulaw → Base64 → Twilio Media Stream
```

### OpenAI Session Configuration
```javascript
{
  type: "session.update",
  session: {
    instructions: "Natural phone conversation AI",
    output_modalities: ["audio"],
    audio: {
      input: { format: "pcm16", turn_detection: { type: "semantic_vad" }},
      output: { format: "g711_ulaw", voice: "alloy" }
    }
  }
}
```

## 🚨 Troubleshooting

### No Audio Response
- Check OpenAI API key is valid and has credits
- Verify WebSocket connections are established
- Check audio format conversion logs

### Connection Issues
- Ensure ports 8080 is accessible
- For production, use `wss://` not `ws://`
- Check Twilio webhook URL is reachable

### Audio Quality Issues
- Verify μ-law conversion is working correctly
- Check for dropped WebSocket frames
- Monitor network latency

## 📚 Architecture Notes

The implementation follows the exact OpenAI Realtime API documentation:
- Uses `input_audio_buffer.append` for streaming input
- Listens for `response.audio.delta` for output
- Configures proper audio formats for phone compatibility
- Implements semantic VAD for natural conversation flow

This creates a seamless bridge between traditional phone systems and modern AI conversation capabilities.
