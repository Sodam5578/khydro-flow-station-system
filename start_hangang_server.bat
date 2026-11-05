@echo off
chcp 65001 >nul
title 한국수자원조사기술원 자동유량관측시설 관리시스템 (한강대교 실운영 서버)

echo ===========================================================================
echo  [한국수자원조사기술원] 자동유량관측시설 관리시스템 - 한강대교 실서버 구동
echo ===========================================================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo [1/2] 최초 실행 패키지(node_modules) 설치 중...
    call npm install
)

echo [2/2] 무중단 서버 및 GitHub 자동 배포 감시기(hangang_auto_runner.js) 시작...
echo  - 접속 주소: http://183.96.156.168:3000 (또는 http://localhost:3000)
echo  - 로컬 DB (data\khydro.db) 및 설정 자동 보존 활성화됨
echo.

node hangang_auto_runner.js
pause
