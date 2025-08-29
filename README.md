# Twilio + OpenAI Realtime API Integration

This project integrates Twilio phone calls with OpenAI's Realtime API for conversational AI using a separated architecture with a dedicated WebSocket server.

## Architecture

- **Next.js App** (`/`): Web interface for initiating calls and managing the application
- **WebSocket Server** (`ws-server/`): Handles real-time audio streaming between Twilio and OpenAI
- **TwiML API** (`app/api/twiml/`): Generates TwiML instructions for Twilio

## Setup

### 1. Environment Variables

Create `.env.local` in the root directory:

```bash
# Cloudflare Tunnel (if using)
TUNNEL_ORIGIN_CERT=~/.cloudflared/cert.pem
PUBLIC_URL=https://your-tunnel-url.trycloudflare.com

# WebSocket Server
WS_SERVER_URL=ws://localhost:8080

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

Create `.env` in the `ws-server/` directory:

```bash
# WebSocket Server Configuration
WS_PORT=8080

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

### 2. Install Dependencies

```bash
# Root directory
npm install

# WebSocket server
cd ws-server
npm install
cd ..
```

## Running the Application

### Development Mode

1. **Start the WebSocket Server:**
   ```bash
   cd ws-server
   npm start
   ```
   The WebSocket server will run on `ws://localhost:8080`

2. **Start the Next.js App:**
   ```bash
   npm run dev
   ```
   The Next.js app will run on `http://localhost:3000` (or next available port)

3. **Optional: Start Cloudflare Tunnel**
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
   Update `PUBLIC_URL` in `.env.local` with the tunnel URL

### Production Mode

For production, you'll need to:

1. Deploy the WebSocket server to a hosting service that supports WebSocket connections
2. Update `WS_SERVER_URL` in the Next.js app to point to your deployed WebSocket server
3. Deploy the Next.js app to Vercel/Netlify/etc.
4. Set up proper SSL certificates for secure WebSocket connections (wss://)

## How It Works

1. **Call Initiation**: User enters phone number in Next.js app
2. **TwiML Generation**: Next.js generates TwiML pointing to WebSocket server
3. **Twilio Connection**: Twilio calls the number and connects to WebSocket server
4. **Audio Streaming**: WebSocket server streams audio between Twilio and OpenAI Realtime API
5. **AI Conversation**: OpenAI processes audio and responds with AI-generated speech

## File Structure

```
/                           # Next.js App Root
├── app/
│   ├── api/twiml/route.js  # TwiML generation endpoint
│   └── page.js            # Main web interface
├── ws-server/             # Separate WebSocket Server
│   ├── server.js          # WebSocket server implementation
│   ├── package.json       # WebSocket server dependencies
│   └── .env              # WebSocket server environment
├── src/
│   └── domains/calls/     # Domain logic for call management
└── .env.local            # Next.js environment variables
```

## Troubleshooting

### WebSocket Connection Issues
- Ensure the WebSocket server is running on the correct port (8080)
- Check that `WS_SERVER_URL` in `.env.local` matches your WebSocket server URL
- For production, use `wss://` (secure WebSocket) instead of `ws://`

### Twilio Issues
- Verify your Twilio credentials are correct
- Check that your Twilio phone number has the correct webhook URL set
- Ensure the `PUBLIC_URL` is accessible by Twilio

### OpenAI Issues
- Verify your OpenAI API key is valid and has sufficient credits
- Check the OpenAI Realtime API status

## Development Notes

- The WebSocket server logs all connections and disconnections
- Audio streaming happens in real-time between Twilio and OpenAI
- Call transcripts are logged to the WebSocket server console
- The Next.js app handles only the web interface and TwiML generation

## Security Considerations

- Never commit API keys to version control
- Use environment variables for all sensitive configuration
- In production, use secure WebSocket connections (wss://)
- Consider implementing authentication for the WebSocket server
- Validate all input data to prevent injection attacks