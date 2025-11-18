# Smart Hospital and Resource Optimization 

A web-based dashboard for managing hospital operations, including patient records, beds, staff, doctors, nurses, analytics, resources, billing, and AI-driven insights. The app runs as a static site using HTML, CSS, and JavaScript with Firebase for backend services and optional Google Gemini AI integration.

## Features

- Role dashboards: Doctors, Nurses, Staff
- Patient management with Aadhaar/ABHA integration demo
- Bed and resource management
- Reports and analytics
- Emergency response workflow with alert sound
- Settings to configure environment
- AI Insights powered by Gemini (optional)
- Firebase integration (Auth/Firestore/Storage as configured)

## Tech Stack

- Frontend: HTML, CSS, JavaScript (vanilla)
- Firebase: Configurable via `firebase-config.js`
- AI: Google Gemini via `js/gemini-ai.js`
- Build/Host: Static hosting (e.g., Firebase Hosting or any static server)

## Project Structure

- index.html                      Home entry point
- dashboard.html                  Dashboard overview
- patients.html                   Patient management
- abha-patient.html               ABHA/Aadhaar demo page
- beds.html                       Bed management
- doctor.html                     Doctor workspace
- nurse.html                      Nurse workspace
- staff.html                      Staff management
- analytics.html                  Analytics view
- ai-insights.html                AI insights interface
- reports.html                    Reporting
- resources.html                  Resources and inventory
- settings.html                   Application settings
- emergency.html                  Emergency response page
- firebase-config.js              Firebase initialization/config
- firebase.json                   Firebase Hosting config (if used)
- js/
  - shared.js                     Shared UI/helpers
  - utils.js                      Utilities
  - analytics.js                  Analytics logic
  - patients.js                   Patient module
  - beds.js                       Bed module
  - staff.js                      Staff module
  - doctor.js                     Doctor module
  - nurse.js                      Nurse module
  - resources.js                  Resources module
  - reports.js                    Reports module
  - settings.js                   Settings module
  - dashboard.js                  Dashboard logic
  - ai-assistant.js               AI assistant logic
  - ai-insights.js                AI insights logic
  - gemini-ai.js                  Gemini API wrapper/integration
  - emergency-response.js         Emergency workflows
  - aadhaar-scanner.js            Aadhaar scanning demo logic
  - emergency_alert.mp3           Alert sound asset

## Prerequisites

- Node.js 18+ (for local static server and Firebase CLI, optional)
- Firebase project (optional, if you want cloud features)
- Google Generative AI (Gemini) API key (optional, for AI features)

## Demo

https://arova-smh.web.app/

## Setup

1) Clone or copy this repository to your machine.

2) Configure Firebase:
   - Create a Firebase project in the Firebase console.
   - Enable the services you need (Auth, Firestore, Storage, Hosting, etc.).
   - Update `firebase-config.js` with your project's config object. Example:

     ```js
     // firebase-config.js
     const firebaseConfig = {
       apiKey: "...",
       authDomain: "...",
       projectId: "...",
       storageBucket: "...",
       messagingSenderId: "...",
       appId: "..."
     };
     // export or initialize as required by your app structure
     ```

3) Configure Gemini (optional):
   - Obtain an API key from Google AI Studio.
   - Follow instructions in `js/gemini-ai.js` to set the key and model.

4) Serve locally:
   - Option A: Use any static server (e.g., VS Code Live Server, `npx serve`):
     - `npx serve .`
     - Open http://localhost:3000 or the provided URL.
   - Option B: Use Firebase Hosting locally:
     - Install Firebase CLI: `npm i -g firebase-tools`
     - Login: `firebase login`
     - Initialize hosting (if not already): `firebase init hosting`
     - Serve: `firebase emulators:start` or `firebase hosting:channel:deploy` for previews.

5) Open the app in your browser:
   - Open `index.html` directly or via the local server URL.

## Environment/Secrets

- Do not commit real keys to source control.
- For local development, you may load API keys via:
  - Local `.env` + small JS loader, or
  - Environment variables injected by your host, or
  - Using Firebase Hosting config and rewrites.

Review `js/gemini-ai.js` and `firebase-config.js` for how credentials are read.

## Usage Notes

- Navigation: Use the top-level pages to access each module. Most pages import shared JS from `js/`.
- Data: If Firebase is configured, data is stored in your Firebase project. Without Firebase, pages may run in demo mode or with mocked behavior depending on module implementation.
- Aadhaar/ABHA: The Aadhaar scanner and ABHA patient pages are demo flows and should be integrated with compliant services before production use.
- Emergency: The emergency page triggers `emergency_alert.mp3` and related workflows in `js/emergency-response.js`.

## Development

- Code style: Vanilla JS modules; keep logic modular inside `js/` files.
- Add new pages by creating an HTML file and a corresponding JS module under `js/`.
- Shared utilities belong in `js/shared.js` or `js/utils.js`.
- When modifying Firebase usage, ensure `firebase-config.js` exports/initializes consistently across modules.

## Deployment

- Any static host works (Firebase Hosting, Netlify, Vercel static, Nginx/Apache).
- For Firebase Hosting, ensure `firebase.json` matches your desired public dir and headers. Then run:
  - `firebase deploy --only hosting`

## Troubleshooting

- Blank page or console errors: Open DevTools Console and Network tabs to inspect missing configs or CORS.
- Firebase permission errors: Check Firestore rules/Auth state. Ensure `firebase-config.js` is correct.
- AI/Gemini errors: Verify API key, model name, and network access in `js/gemini-ai.js`.
- Audio not playing: Some browsers require user interaction before playing sound; ensure a user gesture triggers the alert.

## Security and Compliance

- Do not load real PHI/PII in non-secure environments.
- If handling real patient data, implement authentication, authorization, and audit logging.
- Ensure compliance with relevant regulations (HIPAA, local equivalents) and use HTTPS.

## License

Proprietary or internal use unless otherwise specified. Replace with your preferred license.

## Acknowledgments

- Firebase (Google)
- Google Generative AI (Gemini)
- Open-source community utilities and patterns

