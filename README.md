# 🎓 ScholarLens — Predictive Academic Analytics

> Predict your CGPA before results drop. AI-powered study recommendations, smart timetable generation, and multi-semester progress tracking.

**[🚀 Live Demo](https://your-username.github.io/scholarlens/)** &nbsp;|&nbsp; [Report Bug](../../issues) &nbsp;|&nbsp; [Request Feature](../../issues)

---

## 📋 Table of Contents
- [About](#about)
- [Features](#features)
- [Folder Structure](#folder-structure)
- [GitHub Pages Deployment](#github-pages-deployment)
- [Supabase Setup](#supabase-setup-optional)
- [Backend Setup](#backend-setup-optional)
- [Tech Stack](#tech-stack)

---

## About

ScholarLens is a static web application that uses a Multivariate Linear Regression model (running entirely in-browser via JavaScript) to predict a student's CGPA and generate a personalised Smart Study Timetable.

**No server required** — it runs 100% in the browser using `localStorage` for persistence. Optionally connect a Supabase backend for real authentication and cloud storage.

---

## Features

| Feature | Description |
|---|---|
| 🎓 Grading Scale Toggle | Switch between 5.0 (University) and 4.0 (Polytechnic) — all inputs, charts, and grade labels adapt |
| ⏰ Time & Logistics | Sliders for commute, work, and sleep — calculates real available study hours |
| 📋 Course Matrix | Dynamic course cards with code, units, 5-star difficulty, and class-day selectors |
| 🧮 ML Prediction | In-browser multivariate regression — predicts CGPA in milliseconds |
| 🎯 Semi-circular Gauge | SVG gauge with animated needle and dynamic grade zones (First Class / Distinction etc.) |
| 📅 Smart Timetable | CSS Grid timetable — places study blocks on non-class days, respects commute/sleep schedule |
| 📊 Gap Analysis | Progress bars + bar chart comparing current, predicted, and target CGPA |
| 🌙 Dark Mode | One-click toggle, preference persisted to localStorage |
| 📜 History | All analyses stored locally; trend chart; CSV export |

---

## Folder Structure

```
scholarlens/                   ← GitHub Pages root (deploy this folder)
├── index.html                 Landing page
├── auth.html                  Login / Register
├── dashboard.html             4-step analysis wizard
├── results.html               Gauge + Timetable + Recommendations
├── history.html               Analysis history + trend chart
├── 404.html                   Custom 404 with auto-redirect
├── .nojekyll                  Disables Jekyll processing on GitHub Pages
│
├── css/
│   └── styles.css             Complete design system (merged, single file)
│
├── js/
│   └── app.js                 Auth, theme, storage, shared utilities
│
├── backend/                   Python Flask API (deploy separately — optional)
│   ├── app.py
│   ├── requirements.txt
│   └── .env.example
│
└── models/                    ML model code
    ├── predictor.py           scikit-learn Ridge Regression trainer
    └── model.pkl              Pre-trained model weights
```

---

## GitHub Pages Deployment

### Option 1 — Deploy from the repo root (recommended)

1. **Fork or push this repo to GitHub**

2. **Go to Settings → Pages**

3. **Set source:**
   - Branch: `main` (or `master`)
   - Folder: `/ (root)`

4. **Save** — GitHub Pages will publish at:
   `https://your-username.github.io/scholarlens/`

> ✅ The `.nojekyll` file is already included — GitHub Pages will serve the HTML files directly without Jekyll processing.

---

### Option 2 — Deploy using GitHub Actions (automatic on push)

Create `.github/workflows/deploy.yml` in your repo:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - uses: actions/deploy-pages@v4
        id: deployment
```

---

### Option 3 — Deploy with Netlify (alternative, also free)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# From the repo root:
netlify deploy --dir=. --prod
```

---

## Supabase Setup (Optional)

By default the app runs in **demo mode** using localStorage. To enable real auth and cloud persistence:

1. Create a project at [supabase.com](https://supabase.com)

2. Run `supabase_schema.sql` in your Supabase **SQL Editor**

3. Add this snippet **before** `<script src="js/app.js">` in every HTML file:

```html
<script>
  window.SUPABASE_URL      = 'https://your-project.supabase.co';
  window.SUPABASE_ANON_KEY = 'your-anon-public-key';
</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

4. The demo-mode banner will disappear automatically once Supabase is detected.

> **Security:** Only the `anon` key belongs in the frontend. Never expose your `service_role` key.

---

## Backend Setup (Optional)

The Python Flask backend enables server-side ML inference and database writes via the service role key.

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY

# Train the model
cd ../models
python predictor.py --train --metrics

# Start the API
cd ../backend
python app.py
# → http://localhost:5000
```

Deploy the backend to Railway, Render, or Heroku (see `backend/README` for details).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (custom design system), Vanilla JavaScript |
| ML Model | Multivariate Ridge Regression — runs in JS (browser) or Python (server) |
| Charts | Chart.js 4.x, SVG (gauge) |
| Auth & DB | Supabase (optional) / localStorage (demo mode) |
| Backend | Python + Flask (optional) |
| Deployment | GitHub Pages / Netlify / Vercel |

---

## License

MIT — free to use, modify, and distribute.
