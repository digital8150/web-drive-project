# 📂 LiteDrive

**LiteDrive**는 Node.js와 Express.js를 기반으로 한 경량 웹 드라이브 서버입니다. 서버의 특정 디렉토리를 웹 브라우저를 통해 탐색하고, 파일을 안전하게 미리보기하거나 다운로드 및 업로드할 수 있는 기능을 제공합니다.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

---

## ✨ 주요 기능

- **📁 파일 탐색**: 서버 디스크의 파일 및 폴더 구조를 실시간으로 탐색
- **🔍 멀티미디어 미리보기**:
  - **이미지**: PNG, JPG, JPEG, GIF 지원
  - **비디오**: MP4 스트리밍 (Range Header 지원으로 끊김 없는 재생)
  - **문서**: PDF 및 TXT 파일 브라우저 내 직접 보기
- **📥 파일 다운로드**: 모든 타입의 파일을 손쉽게 다운로드
- **📤 관리자 업로드**: 관리자 인증(비밀번호)을 통한 안전한 파일 업로드 (Multer 활용)
- **🔒 보안 강화**:
  - `path.resolve` 및 `path.join`을 활용한 **Path Traversal(경로 조작)** 공격 방지
  - 업로드 파일 용량 제한 (기본 100MB)
- **📱 반응형 UI**: PC와 모바일 환경 모두 고려한 Clean & Modern 디자인

---

## 🚀 빠른 시작 (Getting Started)

### 1. 설치
```bash
git clone https://github.com/digital8150/web-drive-project.git
cd web-drive-project
npm install
```

### 2. 환경 설정 (`.env`)
루트 디렉토리에 `.env` 파일을 생성하고 설정합니다.
```env
PORT=3000
DATA_PATH=./uploads
ADMIN_PASSWORD=your_secure_password
```

### 3. 실행
```bash
# 운영 모드
npm start

# 개발 모드 (Auto Reload)
npm run dev
```

---

## 🛠 기술 스택 (Tech Stack)

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JS, HTML5, CSS3
- **Middleware**: Multer (File Upload), Dotenv (Config)
- **Security**: Path Traversal Protection, Simple Auth Middleware

---

## 📝 개발 로드맵 (Roadmap)

- [x] Phase 1: 기초 환경 구축 및 서버 설정
- [x] Phase 2: 파일 탐색 및 다운로드 API/UI
- [x] Phase 3: 미디어 미리보기 엔진 (이미지/비디오/PDF)
- [x] Phase 4: 관리자 인증 및 업로드 기능
- [x] Phase 5: 보안 강화 및 UX 최적화

---

## 📜 라이선스
이 프로젝트는 [ISC License](LICENSE)를 따릅니다.
