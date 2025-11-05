# Enspurna Light Control

A WebRTC-based front-end for orchestrating Enspurna-powered lighting sessions. The UI allows an operator to configure server timings, coordinate client interactions, and drive a local light API while keeping the WebRTC offer/answer exchange entirely in-browser.

## Features

- **Manual vs Automatic signalling** – paste SDP and QR codes on the init page, or point the app at a REST signalling server for unattended handshakes.
- **Stage automation** – configurable prepare/blanking/light/rest stages with randomised timing, automatic light toggling, and continue buttons when appropriate.
- **Normal vs Admin clients** – normal clients see a single stage action button; admin clients get full timelines and stage controls guarded by a four-digit password.
- **Signalling pluggability** – sample signalling servers are provided both as a FastAPI service and as a Python stdlib-only script, plus Cloudflare Pages Functions backed by R2 storage.
- **Shareable client links** – when automatic mode is active the init screen produces a `clientonly=true` link so normal/admin clients can connect without touching SDP.

## Requirements

- Node.js 18+
- npm 9+
- (Optional) Python 3.9+ for the standalone signalling servers
- (Optional) Cloudflare account for deploying the Pages Functions

## Getting Started

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`. The first screen lets you configure the Enspurna HTTP API and choose between server mode or client mode.

## Server Mode Workflow

1. Enter the relay API endpoint/key and (optionally) a signalling base URL, e.g.
   `http://host:port/sig`. Automatic mode is active whenever the field is non-empty.
2. Click **Start Server Mode**. The init page opens.
3. Configure stage timings.
   - Manual mode shows the SDP offer (text + QR) and an answer textbox.
   - Automatic mode pushes the offer to the signalling server and shows the share link instead of the answer box.
4. Share the SDP/QR or the automatic client link with participants.
5. Press **Start Session** when ready; the running page updates in real time.

## Client Mode Workflow

1. Open the landing page, paste the signalling URL if one was shared (leave blank for manual mode).
2. Enter the admin password if you need admin controls; otherwise leave it blank.
3. Click **Connect**.
   - Manual mode expects you to paste the server’s offer and returns an answer.
   - Automatic mode auto-fetches the offer, replies with an answer, and waits for the connection.

## Signalling Servers

The app only requires four endpoints:

```
PUT  /{prefix}/{room}/offer
GET  /{prefix}/{room}/offer
PUT  /{prefix}/{room}/answer
DELETE /{prefix}/{room}/answer
```

Health checks are performed on:

```
GET /{prefix}/health
GET /{prefix}/{room}/health
```

### FastAPI version

```
pip install fastapi uvicorn
uvicorn signalling_server:app --host 0.0.0.0 --port 8000
```

### Built-in Python version (stdlib only)

```
python signalling_server_builtin.py --host 0.0.0.0 --port 8000
```

### Cloudflare Pages Functions (R2)

1. Bind an R2 bucket as `SIGNAL_R2` in your Pages project.
2. Deploy the functions under `functions/sig/**`.
3. Use the Pages URL plus `/sig/<room>` as the signalling base.

All implementations return `204 No Content` when an answer has not yet been published, so the front-end just keeps polling quietly.

## Health Checks

Before pushing offers or attempting automatic connects the app hits the prefix + room `/health` endpoints. Make sure your signalling deployment returns `200/JSON` so users get immediate feedback when misconfigured.

## Building

```
npm run build
```

This runs TypeScript type checking and produces the Vite build artefacts in `dist/`.

## Project Structure

```
functions/               Cloudflare Pages Functions for R2 signalling
signalling_server.py     FastAPI signalling reference implementation
signalling_server_builtin.py  stdlib-only signalling server
src/                     React + Material UI application source
```

## Troubleshooting

- **Automatic connection fails repeatedly** – check the alert on the connect screen; clicking *Adjust* returns to the landing page with all parameters intact.
- **Data channel immediately closes** – inspect the console logs on both server and client; the app logs every peer connection and data channel event.
- **Camera access errors** – QR scanning is automatically disabled on insecure origins. Use HTTPS or paste the offer manually.

## License

MIT
