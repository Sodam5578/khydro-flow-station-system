# 🌊 한국수자원조사기술원 자동유량관측시설 관리시스템 (2차 개발 서버)

전국 223개소 자동유량관측시설 제원 관리, 18종 유지관리 과업(176개소) 실시간 관제, 2026년 유속계 정기정도검정(30개소), 그리고 수자원 표준유역(850개) 분수계 연동을 지원하는 **풀스택 웹 기반 통합 관리시스템**입니다.

---

## 🌟 주요 기능

1. **📊 통합 운영 대시보드**: 권역별/형식별(EWSV, ADVM, ⚡이중화 10개소) 분포 도넛 차트 및 명확한 통계 수치 표출
2. **🗺️ 초깔끔 GIS 관측망 지도**: Esri World Light Gray Canvas 배경지도 + 국가 공식 850개 수자원 표준유역 분수계 경계망 레이어
3. **📋 관측시설 목록 관리**: 223개소 제원 실시간 검색, 권역/유속계/운영여부/특보 다중 결합 필터링, 정렬, 엑셀 입출력
4. **🛠️ 2026년 유지관리 과업 총괄 관제**: 18종 과업(자동복구차단기, 배터리, 소화기 RNS/기술원 등) 원클릭 조치완료 토글 및 실시간 추진율 모니터링
5. **🎯 유속계 정도검정 관리**: 2026년 정기정도검정 대상 30개 지점(176대)의 단계별(대기/시험중/완료) 검정일자 및 성적서 관리
6. **🔑 사용자 계정 및 보안 인증**: JWT 토큰 기반 로그인 인증, 팀원별 역할 권한 관리, 5인 이상 멀티유저 실시간 동기화

---

## 👥 기본 계정 안내 (로그인)

시스템 초기 구동 시 아래 계정으로 로그인하실 수 있습니다 (비밀번호는 로그인 후 자유롭게 변경 가능):

| 구분 | 아이디 (Username) | 비밀번호 (Password) | 역할 및 권한 |
| :--- | :--- | :--- | :--- |
| **최고 관리자** | `admin` | `admin1234` | 전체 권역 수정/삭제/관리, 데이터 백업 |
| **한강권역 담당자** | `han_manager` | `user1234` | 한강 권역 지점 및 유지관리/검정 관리 |
| **낙동강권역 담당자** | `nakdong_manager` | `user1234` | 낙동강 권역 지점 및 과업 관리 |
| **금강권역 담당자** | `geum_manager` | `user1234` | 금강 권역 지점 및 과업 관리 |
| **영산강권역 담당자** | `yeongsan_manager` | `user1234` | 영산강·섬진강 권역 지점 및 과업 관리 |
| **현장 뷰어** | `viewer` | `viewer1234` | 조회 전용 계정 |

---

## 🚀 로컬 서버 실행 방법

```bash
# 1. 패키지 설치
npm install

# 2. 서버 실행 (포트 3000)
npm start
# 또는
node server/index.js
```

브라우저 접속: **`http://localhost:3000`** (사내망: `http://[서버IP]:3000`)

---

## 🌐 무료 클라우드 배포 가이드 (Render.com 기준)

언제 어디서나(외부 출장지, 현장, 스마트폰 등) 사외망에서도 접속할 수 있도록 무료 클라우드에 배포하는 방법:

1. 本 소스코드를 **GitHub 리포지토리**에 Push합니다.
2. [Render.com](https://render.com)에 로그인 후 **[New +] ➡️ [Web Service]**를 클릭합니다.
3. GitHub 리포지토리를 선택합니다.
4. 아래와 같이 설정하고 **[Create Web Service]**를 클릭합니다:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
   - **Plan**: `Free`
5. 1분 후 발급되는 웹 주소(`https://khydro-flow-system.onrender.com`)로 전 세계 어디서든 접속 가능합니다!

---

## 🛠️ 기술 스택

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+), Leaflet.js, Chart.js 4.4.1, ChartDataLabels 2.2.0, SheetJS(xlsx)
- **Backend**: Node.js, Express 4.18
- **Database**: SQLite3 (Embedded Single-file DB `data/khydro.db`)
- **Authentication**: JWT (JSON Web Token), bcryptjs
- **Map Data**: Esri World Light Gray Canvas, Korea National Standard Watershed GeoJSON (850 Basins)
