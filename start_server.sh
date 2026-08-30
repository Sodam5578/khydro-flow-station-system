#!/bin/bash
# ==============================================================================
# 한국수자원조사기술원 자동유량관측시설 및 유지관리 총괄 시스템 (2차 개발 서버 실행기)
# ==============================================================================

cd "$(dirname "$0")"

echo "🌊 한국수자원조사기술원 자동유량관측시설 관리시스템 (2차 개발) 서버 구동 중..."

# Check node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되어 있지 않습니다. Node.js (v18+)를 설치해주세요."
    exit 1
fi

# Install dependencies if node_modules not present
if [ ! -d "node_modules" ]; then
    echo "📦 필요 패키지를 설치합니다..."
    npm install --silent
fi

echo "🚀 웹 서버를 시작합니다 (포트 3000)..."
node server/index.js
