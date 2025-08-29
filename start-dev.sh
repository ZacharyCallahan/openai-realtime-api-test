#!/bin/bash

# Start development servers for Twilio + OpenAI Realtime integration

echo "🚀 Starting Twilio + OpenAI Realtime Development Environment"
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $(jobs -p) 2>/dev/null
    exit
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

echo "📡 Starting WebSocket Server..."
cd ws-server && npm start &
WS_PID=$!

echo "🌐 Starting Next.js App..."
cd ..
npm run dev &
NEXT_PID=$!

echo ""
echo "✅ Both servers are starting..."
echo "   WebSocket Server: ws://localhost:8080"
echo "   Next.js App: http://localhost:3000 (or next available port)"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for background processes
wait
