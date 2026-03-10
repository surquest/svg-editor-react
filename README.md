# SVG Studio

SVG Studio is a powerful, visual SVG editor built with Next.js and Material UI. It combines the ease of a canvas-based design tool with the precision of a real-time code editor and the intelligence of Gemini AI.

![SVG Studio Interface](https://via.placeholder.com/800x450?text=SVG+Studio+Interface)

## 🚀 Features

- **🎨 Visual Canvas Editor**: Drag, resize, select, and modify SVG shapes intuitively.
  - Multi-select, grouping/ungrouping, and alignment tools.
  - Layer management (Bring to Front / Send to Back).
  - Auto-connecting lines between shapes.
- **💻 Real-time Code Editor**: Integrated Monaco Editor (VS Code engine) for direct SVG source code editing with live visual synchronization.
- **🤖 AI-Powered Generation**: Leverage Google's Gemini models to generate unique SVGs from text prompts or reference images.
- **📚 Shape Library**: A rich collection of pre-defined SVG shapes, arrows, flowchart symbols, and icons.
- **🔗 Share & Export**: 
  - Export as high-quality SVG or PNG.
  - Generate shareable links via URL-encoded compressed data.
  - Direct copy-to-clipboard functionality.
- **🔒 Secure Credentials**: Support for both personal Gemini API keys and Google Cloud Vertex AI via OAuth.

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (Static Export)
- **UI Architecture**: [React](https://react.dev/) 19 & [Material UI (MUI)](https://mui.com/) 7
- **Code Editor**: [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- **AI Integration**: [Google Gemini Pro/Flash](https://deepmind.google/technologies/gemini/) (Vertex AI & REST)
- **SVG Processing**: [SVGO](https://github.com/svg/svgo/) for optimization
- **Data Compression**: [LZ-String](https://pieroxy.net/blog/pages/lz-string/index.html) for shareable URLs

## 🏁 Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/svg-editor-react.git
   cd svg-editor-react
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (optional for AI features):
   Create a `.env.local` file:
   ```env
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
   NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT=your_project_id
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔌 AI Configuration

To use the AI generation features, you have two options:
1. **API Key**: Enter your Gemini API key in the AI Panel (stored locally in your browser).
2. **Google OAuth**: Sign in with your Google account to use Vertex AI endpoints (requires `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to be configured).

## 📦 Deployment

The project is designed for static hosting (e.g., GitHub Pages, Vercel, Netlify).

To create a production build:
```bash
npm run build
```

The output will be in the `out/` (or `.next/`) directory depending on your configuration.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
