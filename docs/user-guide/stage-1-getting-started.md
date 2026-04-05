# Flowright — Getting Started

## What is Flowright?

Flowright is a test automation tool built for QA teams. You write test cases in plain English. Flowright converts them into automated tests and runs them for you — no coding required.

---

## Who is it for?

- **Manual testers** who spend hours clicking through regression flows every sprint
- **Automation testers** who want to maintain tests as readable descriptions, not code

---

## What do you need to get started?

- Access to the Flowright URL provided by your team (e.g. `http://flowright.yourcompany.com`)
- A browser (Chrome recommended)
- Nothing else — no installs, no terminals

---

## First time setup (Admin only)

If you are setting up Flowright for your team for the first time:

### Prerequisites
- A server or VM with Docker installed
- A Google Gemini API key
- The app URLs you want to test (dev and/or staging)

### Steps

1. Clone the Flowright repository on your server
2. Copy the environment file:
   ```
   cp .env.example .env
   ```
3. Open `.env` and fill in your `GEMINI_API_KEY`
4. Start the application:
   ```
   docker compose up --build -d
   ```
5. Flowright is now running at `http://your-server-ip:3000`

Share that URL with your team. They open it in a browser and start using it immediately.

---

## What's next?

Once Flowright is running, the next step is to **create a Project** and **add your app's environments** (dev and staging URLs).

See: [Stage 2 — Setting up your first project and crawling your app](./stage-2-crawler.md)
