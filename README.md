# CAD3D Electron Shell

Blank Electron desktop shell backed by a Vite-powered React renderer. Use this as a starting point for building the CAD3D experience.

## Getting Started

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Start the development environment (runs Vite + Electron together):
   ```powershell
   npm run dev
   ```
   Vite serves the renderer on `http://localhost:5173`, and Electron automatically opens a window once that server is ready.

## Production Preview

1. Build the renderer bundle:
   ```powershell
   npm run build
   ```
2. Launch Electron against the compiled renderer:
   ```powershell
   npm start
   ```

The renderer output lands in `dist/renderer`, which is what the Electron main process loads when `NODE_ENV=production`.
