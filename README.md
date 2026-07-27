<p align="center">
  <img src="assets/banner.png" alt="TubeMind AI Banner" width="100%"/>
</p>

<h1 align="center">🧠 TubeMind AI</h1>
<h3 align="center">AI-Powered YouTube Learning Assistant</h3>

<p align="center">
  Retrieval-Augmented Generation • Semantic Search • FAISS • Groq • Chrome Extension
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-v1.0-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-success?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Platform-Chrome-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Built%20With-FastAPI-green?style=for-the-badge" />
</p>

---

## 🚀 Overview

TubeMind AI is an AI-powered Chrome Extension that transforms YouTube videos into an interactive learning experience.

Using Retrieval-Augmented Generation (RAG), semantic search, FAISS vector search, and Groq LLMs, TubeMind AI enables users to:

- 💬 Chat with YouTube videos
- 📄 Generate AI summaries
- 📝 Create structured study notes
- 💡 Review key takeaways
- 📍 Jump to timestamp citations
- 🧠 Learn faster with AI

---

## ✨ Features

### 🤖 AI Chat
- Multi-turn conversation memory
- Streaming AI responses
- Timestamp citations
- Markdown rendering
- Retry & Copy responses

### 📚 AI Learning
- Short Summary
- Detailed Summary
- Bullet Summary
- Study Notes
- Key Takeaways

### 🧠 RAG Pipeline
- Transcript Retrieval
- Semantic Chunking
- Sentence Transformers
- FAISS Vector Search
- Semantic Retrieval
- Prompt Engineering

---

## 🖼️ Screenshots

> Add your screenshots to the `assets/` folder.

| Chat | Summary |
|------|---------|
| ![](assets/chat.png) | ![](assets/summary.png) |

| Study Notes | Takeaways |
|-------------|-----------|
| ![](assets/notes.png) | ![](assets/takeaways.png) |

---

## 🎥 Demo

<p align="center">
  <img src="assets/demo.gif" width="900"/>
</p>

---

## 🛠️ Tech Stack

<p align="center">
  <img src="https://skillicons.dev/icons?i=react,ts,tailwind,vite,python,fastapi,git,github,vscode"/>
</p>

### AI Stack
- Groq
- Llama 3.3 70B
- Sentence Transformers
- FAISS
- Retrieval-Augmented Generation (RAG)
- Prompt Engineering

---

## 🏗️ Architecture

```mermaid
flowchart TD
A[YouTube Video] --> B[Transcript Retrieval]
B --> C[Semantic Chunking]
C --> D[Sentence Transformers]
D --> E[Embeddings]
E --> F[FAISS Index]
F --> G[Semantic Search]
G --> H[Prompt Builder]
H --> I[Groq LLM]
I --> J[Streaming Response]
J --> K[Chrome Extension]
```

---

## 📂 Project Structure

```text
TubeMind-AI
│
├── assets
│   ├── banner.png
│   ├── demo.gif
│   ├── chat.png
│   ├── summary.png
│   ├── notes.png
│   └── takeaways.png
│
├── backend
├── extension
├── README.md
└── .gitignore
```

---

## ⚙️ Installation

### Clone

```bash
git clone https://github.com/Omkar-narsale/TubeMind-AI.git
cd TubeMind-AI
```

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env`

```env
GROQ_API_KEY=YOUR_API_KEY
GROQ_MODEL=llama-3.3-70b-versatile
```

Run

```bash
uvicorn app.main:app --reload
```

### Extension

```bash
cd extension
npm install
npm run build
```

Load the generated `extension/dist` folder from `chrome://extensions` using **Load unpacked**.

---

## 📖 Usage

1. Open any YouTube video.
2. Launch TubeMind AI.
3. Wait for transcript processing.
4. Chat with the video.
5. Generate summaries.
6. Generate study notes.
7. Review key takeaways.

---

## 🛣️ Roadmap

### ✅ Completed
- Chrome Extension
- FastAPI Backend
- Transcript Retrieval
- Semantic Search
- FAISS
- RAG
- Groq Integration
- Streaming Chat
- Conversation Memory
- Timestamp Citations
- AI Summary
- Study Notes
- Key Takeaways

### 🚧 Coming Soon
- Hybrid RAG
- Flashcards
- Quiz Generator
- Practice Questions
- PDF Export
- Bookmarks
- Learning Dashboard
- User API Key Support
- Chrome Web Store Release

---

## 🤝 Contributing

Contributions are welcome!

```bash
git checkout -b feature/my-feature
git commit -m "Add amazing feature"
git push origin feature/my-feature
```

Open a Pull Request.

---

## 📄 License

Licensed under the MIT License.

---

## 👨‍💻 Author

**Omkar Narsale**

- GitHub: https://github.com/Omkar-narsale
- LinkedIn: www.linkedin.com/in/omkar-narsale45

---

## ⭐ Support

If you found this project useful, please give it a ⭐ on GitHub.

<p align="center">
  Made with ❤️ using React, FastAPI, FAISS and Groq.
</p>
