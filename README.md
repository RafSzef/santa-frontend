# ✨ Santa Frontend (`santa-frontend`)

An enchanting, interactive web client for the festive family application **"Santa's Post Office"**.

The application transforms Christmas wishlists into an atmospheric storybook experience inspired by aged parchment, starry winter skies, and Harry Potter lore. It allows family members to submit gift lists and secretly reserve surprises for children.

---

## 💡 Origin & Proof of Concept with Google Gemini

This project was built as an experimental **Proof of Concept (PoC)** to evaluate **Google Gemini (via Antigravity)** in an AI-assisted frontend pair-programming workflow:

- **Backend ([`santa-backend`](https://github.com/RafSzef/santa-backend))**: Designed and implemented **entirely by hand from scratch** in Java 21 / Spring Boot 3 with PostgreSQL and Flyway migrations.
- **Frontend (this repository)**: Developed as an **AI-assisted project with Gemini** — testing the model's capabilities in orchestrating complex CSS3/SVG animations, procedural Web Audio synthesizers, reactive state in Angular 22, and seamless client-side integration with a custom backend.
- **Deployment**: The complete stack was containerized via Docker and deployed to a free Oracle Cloud VM, serving the family during the holiday season.

---

## 🛠️ Tech Stack

- **Framework**: Angular 22 (Standalone Components, Signals, Router, SSR / Prerendering)
- **Language**: TypeScript, HTML5, Modern CSS3 (Flexbox & CSS Grid)
- **Audio**: Web Audio API (procedurally synthesized sound effects — jingle bells, brass fanfares, parchment wax seal stamps, ambient chimes — zero external audio assets required)
- **Visuals & Animations**: Pure CSS3 Keyframes with hardware GPU acceleration, responsive SVG graphics, and optimized illustration assets
- **Production Server**: Nginx Alpine (lightweight SPA static file delivery with `try_files` SPA routing and `/api` reverse proxying)
- **Containerization**: Docker (multi-stage build: Node 22 Alpine -> Nginx Alpine)

---

## 🎨 Key Features & User Experience

1. **Storybook Atmosphere & Parchment Aesthetic**:
   - Deep starry night sky with twinkling stars, nebulas, and an animated aurora.
   - Procedural snowfall activating automatically after **1 minute of user inactivity**.
   - Rolled parchment scrolls adorned with wax seals and calligraphic typography.

2. **Levitating Password Gatekeeper**:
   - Access to family room codes (e.g., `/kowalscy`, `/alohomora`) protected by passwords.
   - An ethereal floating input stage that drifts smoothly upward off-screen upon successful authentication.

3. **Santa's Sleigh Flyover**:
   - Once authorized, Santa's sleigh and reindeer fly briskly across the entire night sky, leaving a stardust trail accompanied by holiday chime melodies.

4. **Owl Post (Hedwig Delivery)**:
   - Submitting or modifying a letter triggers a flight animation of Hedwig the Snowy Owl carrying a sealed envelope in her beak to deliver it into the night sky.

5. **Children's Wishlists & The Elf Stamp**:
   - Within children's wishlists (*Elf Workshop*), relatives can discreetly claim presents.
   - **Transient Selection**: clicking a checkbox updates only local UI state; claims are only persisted to the database once confirmed via *"Stamp with Elf Seal"*.
   - **Live Sync**: the client polls the backend every 7 seconds — when another family member claims an item on their device, an animated **Christmas house-elf** pops up celebrating with confetti over that letter tile.

6. **Interactive Guide with Owl Notification**:
   - After Santa's initial flyover, a snowy owl with a glowing exclamation badge slides up offering a walkthrough of the app's features.
   - A docked `📜 Guide` button remains conveniently parked in the bottom-left corner for anytime reference.

---

## 🚀 Local Development

### Prerequisites:
- Node.js (version 22+)
- npm 10+
- Optional: Angular CLI (`npm install -g @angular/cli`)

### Setup & Run:
```bash
# 1. Clone repository and navigate to folder
cd santa-frontend

# 2. Install dependencies
npm ci

# 3. Start local development server
npm start
# or: ng serve
```

The application will be accessible at: `http://localhost:4200/`.
By default, API calls are directed to `http://localhost:8080/api/`.

---

## 🐳 Docker & Containerization

The project uses an efficient multi-stage `Dockerfile`:
```bash
# Build production image
docker build -t santa-frontend .

# Run container on port 80
docker run -d --name santa-frontend -p 80:80 santa-frontend
```

In production, `nginx.conf` handles client-side routing fallback (`index.csr.html`) and proxies `/api/` requests directly to the `backend:8080` service within the shared Docker network.
