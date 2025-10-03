#!/bin/bash

# Start Complete Backend Stack
# Kernel (Rust) + AI Service (Python gRPC) + Backend (Go)
# Run from project root: ./scripts/start-backend.sh

cd "$(dirname "$0")/.." || exit

echo "=============================="
echo "🚀 Starting Backend Stack"
echo "=============================="
echo ""

# Create logs directory
mkdir -p logs

# Kill any existing backend processes
echo "🧹 Cleaning up existing processes..."
pkill -f "ai_os_kernel" 2>/dev/null
pkill -f "backend/bin/server" 2>/dev/null
pkill -f "grpc_server" 2>/dev/null
sleep 1

# Start Kernel (Rust)
echo "1️⃣  Starting Rust Kernel..."
cd kernel || exit
if [ ! -f "target/release/kernel" ]; then
    echo "   Building kernel..."
    cargo build --release 2>&1 | tee ../logs/kernel-build.log
fi
./target/release/kernel > ../logs/kernel.log 2>&1 &
KERNEL_PID=$!
echo "   ✅ Kernel started (PID: $KERNEL_PID)"
cd ..

sleep 2

# Start Python AI gRPC Service
echo "2️⃣  Starting Python AI gRPC Service..."
cd ai-service || exit
if [ ! -d "venv" ]; then
    echo "   ❌ Virtual environment not found. Please run: python3 -m venv venv"
    exit 1
fi
source venv/bin/activate
PYTHONPATH=src python3 -m grpc_server > ../logs/ai-grpc.log 2>&1 &
AI_PID=$!
echo "   ✅ AI gRPC Service started (PID: $AI_PID)"
cd ..

sleep 2

# Start Go Backend
echo "3️⃣  Starting Go Backend..."
cd backend || exit
if [ ! -f "bin/server" ]; then
    echo "   Building backend..."
    go build -o bin/server ./cmd/server
fi
./bin/server -port 8000 -kernel localhost:50051 -ai localhost:50052 > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "   ✅ Backend started (PID: $BACKEND_PID)"
cd ..

echo ""
echo "=============================="
echo "✅ Backend Stack Running"
echo "=============================="
echo ""
echo "🌐 Services:"
echo "   - Kernel:      localhost:50051"
echo "   - AI gRPC:     localhost:50052"
echo "   - Backend:     localhost:8000"
echo ""
echo "📊 Logs:"
echo "   - Kernel:      logs/kernel.log"
echo "   - AI gRPC:     logs/ai-grpc.log"
echo "   - Backend:     logs/backend.log"
echo ""
echo "🛑 To stop: pkill -f kernel && pkill -f grpc_server && pkill -f backend"
echo "📺 Tail logs: tail -f logs/backend.log"
echo ""
