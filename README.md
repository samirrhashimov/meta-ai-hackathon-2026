<div align="center">
<img src="./frontend/src/assets/logo-white.svg" width="100px">
</div>

<h3 align="center">An autonomous second brain</h3>

<p align="center">
   <img src="https://img.shields.io/github/license/samirrhashimov/meta-ai-hackathon-2026?style=flat">
</p>

<p align="center">Flama is a privacy-focused, blazing-fast desktop note-taking application designed to streamline knowledge organization through modern UI and autonomous AI workflows.</p>


---

> **Built for Meta Global AI Developer Hackathon 2026**



---

### 🎬 Official Trailer
[![Flama Official Trailer](https://img.youtube.com/vi/26VeVRDTcAM/maxresdefault.jpg)](https://www.youtube.com/watch?v=26VeVRDTcAM)

<br />


### 📸 Hackathon Journey

<img width="800" height="450" alt="metahackathon" src="https://github.com/user-attachments/assets/72d91bc3-6aae-4e8e-a82a-b6c8c977d6e0" />

![Flama Hackathon Journey](https://github.com/user-attachments/assets/72d91bc3-6aae-4e8e-a82a-b6c8c977d6e0)

---

## ✨ Key Features

* **AI-Powered Knowledge Agent:** Auto-categorizes, tags, and structures notes using Meta's Muse Spark Open model via Baseten API.
* **Rich Markdown & Math:** Native support for Markdown formatting, LaTeX equations, and inter-note WikiLinks.
* **Blazing Fast Performance:** Powered by Tauri v2 (Rust) with an ultra-lightweight footprint and minimal memory usage.
* **Distraction-Free Interface:** Designed with customizable dark/light themes and modern UI components.

---

## 🛠️ Tech Stack

* **Desktop Engine:** [Tauri v2](https://tauri.app/) (Rust core)
* **Frontend:** React, TypeScript, Tailwind CSS
* **AI Model Integration:** Meta Muse Spark
* **Backend & Microservices:** Node.js, Express.js, MongoDB

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* Rust toolchain (installed via `rustup` for Tauri v2 compilation)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/samirrhashimov/meta-ai-hackathon-2026.git
   cd meta-ai-hackathon-2026
   ```

2. **Install frontend & backend dependencies:**
   ```bash
   cd frontend && npm install
   cd ../backend && npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the `backend` directory:
   ```env
   PORT=5000
   HOST=0.0.0.0
   MONGODB_URI=mongodb://user:password@host:27017/ai-notes?authSource=admin
   META_API_KEY=
   META_API_BASE_URL=https://api.meta.ai/v1
   META_MODEL=muse-spark-1.3-contributor
   JWT_SECRET=change-me-to-a-long-random-string
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
   FRONTEND_URL=http://localhost:5173

   ```

4. **Run in Development Mode:**
   ```bash
   # Start backend server
   cd backend && npm run dev

   # Start Tauri desktop application
   cd frontend && npm run tauri dev
   ```

---

## 📦 Releases

Pre-compiled desktop binaries are available on the [Releases](https://github.com/samirrhashimov/meta-ai-hackathon-2026/releases) page.

---

## 📄 License

This project was built during the **Meta Global AI Developer Hackathon 2026** and is open-sourced under the MIT License.
