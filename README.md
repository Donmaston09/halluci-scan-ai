# HalluciScan: AI Forensic Slide Auditor

**HalluciScan** is a professional, human-in-the-loop auditing platform designed to detect hallucinations and discrepancies in AI-generated slides with forensic precision. 

![HalluciScan Interface](https://raw.githubusercontent.com/Donmaston09/halluci-scan-ai/main/src/assets/hero.png)

## 🛡️ Core Philosophy: Skeptical Forensic Auditing
Unlike standard AI checkers, HalluciScan operates on a "Guilty Until Proven Innocent" basis. It is engineered to actively challenge slide claims by cross-referencing them against technical source materials (Papers, Reports, PDFs) using a multimodal vision protocol.

## 🚀 Key Features

*   **👁️ Multimodal Vision Protocol**: Uses Gemini 1.5/2.0 Vision to "see" charts, graphs, and diagrams. It detects visual hallucinations (e.g., a chart showing 12% growth when the source says 10%) that text extraction ignores.
*   **🧠 Hybrid Intelligence**: 
    *   **AI Mode**: High-reasoning forensic auditing using Google Gemini.
    *   **Local Heuristic Mode**: Offline, zero-cost auditing using TF-IDF and Cosine Similarity (Local Semantic RAG).
*   **🛠️ Resolution Center**: Automatically synthesizes every audit failure into a **"Perfect Slide Prompt."** Copy these instructions to instantly re-generate hallucination-free slides in any AI presentation tool.
*   **🤝 Human-in-the-Loop**: Aggregate confidence metrics remain "Pending" until a human auditor manually verifies or flags every claim, ensuring the highest level of data integrity.
*   **📊 Forensic Reasoning**: Provides detailed "Internal Reasoning" for every verdict, showing exactly *why* a claim was flagged.

## 🛠️ Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Donmaston09/halluci-scan-ai.git
   cd halluci-scan-ai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

## 📖 Usage Guide

1.  **Configure API**: Enter your Gemini API Key in the setup screen. If left blank, the app will run in **Local Heuristic Mode**.
2.  **Upload Data**: 
    *   Upload your **Slides** (PDF/PPTX). Use PDF for the best Vision Protocol results.
    *   Upload your **Source Materials** (Scientific papers, technical reports).
3.  **Run Audit**: The system will extract claims and cross-reference them.
4.  **Review & Override**: Go through the claims terminal. Select any claim to see the direct source evidence and AI reasoning.
5.  **Generate Fix**: Once complete, click **"Generate Fix Prompt"** to get corrective instructions for your deck.

## 🧪 Technology Stack
- **Frontend**: React, Vite, Framer Motion (Animations), Lucide (Icons).
- **Extraction**: PDF.js (PDF), JSZip (PPTX), Tesseract.js (OCR fallback).
- **Core Engine**: Gemini API (v1beta), jsonrepair.
- **Local RAG**: Custom TF-IDF/Vector implementation.

---

### Created with ❤️ by [Anthony Onoja](https://github.com/Donmaston09), Email: donmaston09@gmail.com
**Support the Project**: [PayPal.me/Onoja412](https://paypal.me/Onoja412)
