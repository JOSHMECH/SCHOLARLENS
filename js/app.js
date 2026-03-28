/* ============================================================
   ScholarLens — Shared Utilities
   app.js: Auth state, Toast system, Theme toggle, Storage helpers
   ============================================================ */

// ── SUPABASE CONFIG ──────────────────────────────────────────
// Replace these with your actual Supabase credentials from .env
const SUPABASE_URL = window.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'your-anon-key';

// Initialize Supabase client (loaded via CDN in HTML)
let supabase = null;
function initSupabase() {
  if (window.supabase && SUPABASE_URL !== 'https://your-project.supabase.co') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

// ── LOCAL STORAGE HELPERS (fallback when Supabase not configured) ──
const Store = {
  get(key, def = null) {
    try { const v = localStorage.getItem('sl_' + key); return v ? JSON.parse(v) : def; }
    catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('sl_' + key, JSON.stringify(val)); } catch {}
  },
  remove(key) { try { localStorage.removeItem('sl_' + key); } catch {} },
};

// ── AUTH STATE ───────────────────────────────────────────────
const Auth = {
  currentUser: null,

  async init() {
    initSupabase();
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      this.currentUser = session?.user || null;
    } else {
      // Fallback: use localStorage demo auth
      this.currentUser = Store.get('user');
    }
    return this.currentUser;
  },

  async signUp(email, password, name) {
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name } }
      });
      if (error) throw error;
      this.currentUser = data.user;
      return data.user;
    } else {
      // Demo mode
      const users = Store.get('users', {});
      if (users[email]) throw new Error('Email already registered.');
      const user = { id: crypto.randomUUID(), email, name, created_at: new Date().toISOString() };
      users[email] = { ...user, password };
      Store.set('users', users);
      Store.set('user', user);
      this.currentUser = user;
      return user;
    }
  },

  async signIn(email, password) {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      this.currentUser = data.user;
      return data.user;
    } else {
      const users = Store.get('users', {});
      const found = users[email];
      if (!found || found.password !== password) throw new Error('Invalid email or password.');
      const user = { id: found.id, email: found.email, name: found.name, created_at: found.created_at };
      Store.set('user', user);
      this.currentUser = user;
      return user;
    }
  },

  async signOut() {
    if (supabase) {
      await supabase.auth.signOut();
    } else {
      Store.remove('user');
    }
    this.currentUser = null;
  },

  isAuthenticated() { return !!this.currentUser; },
  getUser() { return this.currentUser; },
  getUserName() {
    const u = this.currentUser;
    if (!u) return 'Student';
    return u.user_metadata?.full_name || u.name || u.email?.split('@')[0] || 'Student';
  },
};

// ── TOAST NOTIFICATIONS ──────────────────────────────────────
const Toast = {
  container: null,
  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'default', duration = 3500) {
    if (!this.container) this.init();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${message}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  },
  success(msg, d) { this.show(msg, 'success', d); },
  error(msg, d)   { this.show(msg, 'error', d); },
  warning(msg, d) { this.show(msg, 'warning', d); },
};

// ── THEME TOGGLE ─────────────────────────────────────────────
const Theme = {
  current: 'light',
  init() {
    this.current = Store.get('theme', 'light');
    this.apply();
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', () => this.toggle());
    });
  },
  apply() {
    document.documentElement.dataset.theme = this.current;
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = this.current === 'dark' ? '☀️' : '🌙';
      btn.title = this.current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    });
  },
  toggle() {
    this.current = this.current === 'dark' ? 'light' : 'dark';
    Store.set('theme', this.current);
    this.apply();
  },
};

// ── PREDICTION DATA STORE ────────────────────────────────────
const PredictionStore = {
  async save(userId, input, result) {
    const record = {
      id: crypto.randomUUID(),
      user_id: userId,
      ...input,
      ...result,
      created_at: new Date().toISOString(),
    };
    if (supabase) {
      // Save input
      await supabase.from('student_inputs').insert([{
        user_id: userId, current_cgpa: input.current_cgpa, target_cgpa: input.target_cgpa,
        study_hours: input.study_hours, attendance: input.attendance, carry_overs: input.carry_overs,
      }]);
      // Save prediction
      await supabase.from('predictions').insert([{
        user_id: userId, predicted_cgpa: result.predicted_cgpa,
        recommendations: JSON.stringify(result.recommendations),
        risk_level: result.risk_level,
      }]);
    } else {
      const history = Store.get(`history_${userId}`, []);
      history.unshift(record);
      Store.set(`history_${userId}`, history.slice(0, 50)); // keep last 50
    }
    // Always cache latest for results page
    Store.set('last_result', { input, result, timestamp: new Date().toISOString() });
    return record;
  },

  async getHistory(userId) {
    if (supabase) {
      const { data } = await supabase
        .from('predictions')
        .select('*, student_inputs(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    }
    return Store.get(`history_${userId}`, []);
  },
};

// ── NAVBAR ACTIVE STATE ───────────────────────────────────────
function setActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href.includes(path) || (path === 'index.html' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

// ── GUARD: Redirect if not auth'd ────────────────────────────
async function requireAuth(redirectTo = 'auth.html') {
  await Auth.init();
  if (!Auth.isAuthenticated()) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

// ── GUARD: Redirect if already auth'd ────────────────────────
async function redirectIfAuth(redirectTo = 'dashboard.html') {
  await Auth.init();
  if (Auth.isAuthenticated()) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

// ── FORMAT HELPERS ───────────────────────────────────────────
const fmt = {
  cgpa: (v) => parseFloat(v).toFixed(2),
  date: (s) => {
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  time: (s) => {
    const d = new Date(s);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  },
  riskColor: (r) => {
    if (r === 'Low')    return 'green';
    if (r === 'Medium') return 'amber';
    if (r === 'High')   return 'red';
    return 'blue';
  },
  progressColor: (predicted, target) => {
    const ratio = predicted / target;
    if (ratio >= 1)    return 'green';
    if (ratio >= 0.85) return 'amber';
    return 'red';
  },
};

// ══════════════════════════════════════════════════════════════
//  MULTI-STEP WIZARD STATE
// ══════════════════════════════════════════════════════════════
const AppState = {
  // Step 1 – Profile & Institution
  scale: 5.0,
  level: '200L',
  duration: '4',
  current_cgpa: '',
  target_cgpa: '',
  study_hours: '',
  attendance: '',
  carry_overs: '',
  // Step 2 – Logistics
  commute: 1,
  work: 2,
  sleep: 7,
  // Step 3 – Courses
  courses: [],

  save() { Store.set('wizard_state', this._data()); },
  load() {
    const d = Store.get('wizard_state');
    if (d) Object.assign(this, d);
  },
  clear() { Store.remove('wizard_state'); },
  _data() {
    return {
      scale: this.scale, level: this.level, duration: this.duration,
      current_cgpa: this.current_cgpa, target_cgpa: this.target_cgpa,
      study_hours: this.study_hours, attendance: this.attendance,
      carry_overs: this.carry_overs,
      commute: this.commute, work: this.work, sleep: this.sleep,
      courses: this.courses,
    };
  },
  availableHoursPerDay() {
    return Math.max(2, 24 - this.sleep - this.commute - this.work - 6); // 6 misc
  },
};

// ══════════════════════════════════════════════════════════════
//  GRADE SCALE SYSTEM
// ══════════════════════════════════════════════════════════════
const GradeSystem = {
  zones: {
    5.0: [
      { from: 0,   to: 2.0, color: '#fca5a5', darkColor: '#dc2626', label: 'Fail',         abbr: 'FAIL' },
      { from: 2.0, to: 3.0, color: '#fdba74', darkColor: '#ea580c', label: 'Third Class',  abbr: '3RD'  },
      { from: 3.0, to: 3.5, color: '#fde68a', darkColor: '#ca8a04', label: '2nd Lower',    abbr: '2.2'  },
      { from: 3.5, to: 4.5, color: '#93c5fd', darkColor: '#2563eb', label: '2nd Upper',    abbr: '2.1'  },
      { from: 4.5, to: 5.0, color: '#86efac', darkColor: '#16a34a', label: 'First Class',  abbr: '1ST'  },
    ],
    4.0: [
      { from: 0,   to: 1.5, color: '#fca5a5', darkColor: '#dc2626', label: 'Fail',          abbr: 'FAIL' },
      { from: 1.5, to: 2.5, color: '#fdba74', darkColor: '#ea580c', label: 'Pass',          abbr: 'PASS' },
      { from: 2.5, to: 3.0, color: '#fde68a', darkColor: '#ca8a04', label: 'Lower Credit',  abbr: 'LC'   },
      { from: 3.0, to: 3.5, color: '#93c5fd', darkColor: '#2563eb', label: 'Upper Credit',  abbr: 'UC'   },
      { from: 3.5, to: 4.0, color: '#86efac', darkColor: '#16a34a', label: 'Distinction',   abbr: 'DIST' },
    ],
  },

  getZones(scale) { return this.zones[scale] || this.zones[5.0]; },

  getClassification(cgpa, scale) {
    const zones = this.getZones(scale);
    for (const z of [...zones].reverse()) {
      if (cgpa >= z.from) return z;
    }
    return zones[0];
  },

  getGaugeColor(cgpa, scale) {
    return this.getClassification(cgpa, scale).darkColor;
  },
};

// ══════════════════════════════════════════════════════════════
//  TIMETABLE GENERATOR
// ══════════════════════════════════════════════════════════════
const TimetableGenerator = {
  HOURS: Array.from({ length: 17 }, (_, i) => i + 6), // 6 am – 10 pm
  DAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],

  COURSE_COLORS: [
    { bg: '#bbf7d0', text: '#14532d', border: '#22c55e' },
    { bg: '#bfdbfe', text: '#1e3a8a', border: '#3b82f6' },
    { bg: '#fde68a', text: '#713f12', border: '#f59e0b' },
    { bg: '#fbcfe8', text: '#831843', border: '#ec4899' },
    { bg: '#c7d2fe', text: '#312e81', border: '#6366f1' },
    { bg: '#fed7aa', text: '#7c2d12', border: '#f97316' },
    { bg: '#d9f99d', text: '#365314', border: '#84cc16' },
    { bg: '#e9d5ff', text: '#4c1d95', border: '#a855f7' },
    { bg: '#99f6e4', text: '#134e4a', border: '#14b8a6' },
    { bg: '#fecaca', text: '#7f1d1d', border: '#ef4444' },
  ],

  _polarXY(cx, cy, r, deg) {
    const rad = deg * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  },

  // donut arc segment using angle system: -180° = left, 0° = right, -90° = top
  donutArcPath(cx, cy, r1, r2, a1, a2) {
    const p = (r, d) => this._polarXY(cx, cy, r, d);
    const f = n => n.toFixed(3);
    const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
    const o1 = p(r1, a1), o2 = p(r1, a2);
    const i2 = p(r2, a2), i1 = p(r2, a1);
    return `M${f(o1.x)} ${f(o1.y)} A${r1} ${r1} 0 ${large} 1 ${f(o2.x)} ${f(o2.y)} L${f(i2.x)} ${f(i2.y)} A${r2} ${r2} 0 ${large} 0 ${f(i1.x)} ${f(i1.y)}Z`;
  },

  // value → gauge angle (−180° at 0, 0° at max)
  valueToAngle(v, max) { return -180 + (Math.min(v, max) / max) * 180; },

  buildGaugeSVG(predicted, target, scale) {
    const max  = scale;
    const cx = 200, cy = 195;
    const OR = 152, IR = 102; // outer / inner radius
    const zones = GradeSystem.getZones(scale);
    const isDark = document.documentElement.dataset.theme === 'dark';

    // Zone arcs
    const zoneArcs = zones.map(z => {
      const a1 = this.valueToAngle(z.from, max);
      const a2 = this.valueToAngle(z.to,   max);
      return `<path d="${this.donutArcPath(cx, cy, OR, IR, a1, a2)}" fill="${isDark ? z.darkColor + 'cc' : z.color}" stroke="var(--bg2)" stroke-width="1.5"/>`;
    }).join('');

    // Tick marks at zone boundaries
    const ticks = zones.map(z => {
      const a = this.valueToAngle(z.from, max);
      const p1 = this._polarXY(cx, cy, OR + 4, a);
      const p2 = this._polarXY(cx, cy, OR + 12, a);
      return `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="var(--border)" stroke-width="2"/>`;
    }).join('');

    // Zone labels
    const zoneLabels = zones.map(z => {
      const mid = (z.from + z.to) / 2;
      const a   = this.valueToAngle(mid, max);
      const lp  = this._polarXY(cx, cy, (OR + IR) / 2, a);
      return `<text x="${lp.x.toFixed(1)}" y="${lp.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="700" fill="${isDark ? '#fff' : '#1a1a1a'}" opacity="0.75">${z.abbr}</text>`;
    }).join('');

    // Scale value labels along outer edge
    const scaleStops = scale === 5
      ? [0, 1, 2, 3, 4, 5]
      : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
    const scaleLabels = scaleStops.map(v => {
      const a  = this.valueToAngle(v, max);
      const lp = this._polarXY(cx, cy, OR + 22, a);
      return `<text x="${lp.x.toFixed(1)}" y="${lp.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="10" font-family="DM Sans,sans-serif" fill="var(--text-muted)">${v}</text>`;
    }).join('');

    // Target marker line
    const tAngle = this.valueToAngle(target, max);
    const tp1    = this._polarXY(cx, cy, IR - 6, tAngle);
    const tp2    = this._polarXY(cx, cy, OR + 6, tAngle);
    const targetLine = `<line x1="${tp1.x.toFixed(1)}" y1="${tp1.y.toFixed(1)}" x2="${tp2.x.toFixed(1)}" y2="${tp2.y.toFixed(1)}" stroke="#6366f1" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${tp2.x.toFixed(1)}" cy="${tp2.y.toFixed(1)}" r="5" fill="#6366f1"/>`;

    // Needle
    const needleAngle = this.valueToAngle(predicted, max);
    const needleRad   = needleAngle * Math.PI / 180;
    const nTip   = this._polarXY(cx, cy, IR - 8,  needleAngle);
    const nLeft  = { x: cx + 8 * Math.cos(needleRad + Math.PI / 2), y: cy + 8 * Math.sin(needleRad + Math.PI / 2) };
    const nRight = { x: cx + 8 * Math.cos(needleRad - Math.PI / 2), y: cy + 8 * Math.sin(needleRad - Math.PI / 2) };
    const needleColor = GradeSystem.getGaugeColor(predicted, scale);
    const needle = `
      <path d="M${nLeft.x.toFixed(2)} ${nLeft.y.toFixed(2)} L${nTip.x.toFixed(2)} ${nTip.y.toFixed(2)} L${nRight.x.toFixed(2)} ${nRight.y.toFixed(2)}Z"
        fill="${needleColor}" opacity="0.95"/>
      <circle cx="${cx}" cy="${cy}" r="13" fill="${needleColor}" opacity="0.9"/>
      <circle cx="${cx}" cy="${cy}" r="5" fill="var(--card-bg)"/>`;

    // Center labels
    const classInfo  = GradeSystem.getClassification(predicted, scale);
    const centerText = `
      <text x="${cx}" y="${cy + 38}" text-anchor="middle" font-size="28" font-weight="900" font-family="Playfair Display,serif" fill="${needleColor}">${predicted.toFixed(2)}</text>
      <text x="${cx}" y="${cy + 58}" text-anchor="middle" font-size="11" font-weight="600" font-family="DM Sans,sans-serif" fill="var(--text-muted)">PREDICTED CGPA</text>
      <text x="${cx}" y="${cy + 74}" text-anchor="middle" font-size="12" font-weight="700" font-family="DM Sans,sans-serif" fill="${needleColor}">${classInfo.label.toUpperCase()}</text>`;

    // Target legend
    const targetLegend = `
      <rect x="${cx - 70}" y="5" width="10" height="10" rx="2" fill="#6366f1"/>
      <text x="${cx - 56}" y="14" font-size="10" font-family="DM Sans,sans-serif" fill="var(--text-muted)">Target: ${target.toFixed(2)}</text>`;

    return `<svg viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;display:block;margin:0 auto;">
      ${zoneArcs}${ticks}${zoneLabels}${scaleLabels}${targetLine}${needle}${centerText}${targetLegend}
    </svg>`;
  },

  // ── TIMETABLE ALGORITHM ──────────────────────────────────────
  generate(courses, logistics) {
    const { commute, work, sleep } = logistics;
    const grid = {}; // "Day-Hour" → cell object

    // Wake / sleep boundaries
    const wakeHour  = Math.min(10, Math.max(6, Math.round(24 - sleep - (24 - 23)))); // ~6-10am
    const sleepHour = Math.min(22, 23 - Math.max(0, 8 - sleep)); // wind-down start

    const mark = (day, h, cell) => {
      if (!grid[`${day}-${h}`]) grid[`${day}-${h}`] = cell;
    };

    // Sleep blocks (before wake + after sleep)
    this.DAYS.forEach(day => {
      for (let h = 6;         h < wakeHour;  h++) mark(day, h, { type: 'sleep', icon: '😴', title: 'Sleep' });
      for (let h = sleepHour; h <= 22;       h++) mark(day, h, { type: 'sleep', icon: '😴', title: 'Sleep' });
    });

    // Commute blocks (Mon–Fri only)
    if (commute > 0) {
      const morn = Math.ceil(commute / 2);
      const eve  = Math.floor(commute / 2);
      ['Mon','Tue','Wed','Thu','Fri'].forEach(day => {
        for (let h = wakeHour; h < wakeHour + morn && h < 22; h++)
          mark(day, h, { type: 'commute', icon: '🚌', title: 'Commute' });
        for (let h = 17; h < 17 + eve && h < sleepHour; h++)
          mark(day, h, { type: 'commute', icon: '🚌', title: 'Commute' });
      });
    }

    // Work / extracurricular blocks (Mon–Fri)
    if (work > 0) {
      const workStart = wakeHour + Math.ceil(commute / 2);
      ['Mon','Tue','Wed','Thu','Fri'].forEach(day => {
        for (let h = workStart; h < workStart + work && h < sleepHour; h++)
          mark(day, h, { type: 'work', icon: '💼', title: 'Work / Extra' });
      });
    }

    // Assign colors to courses and sort by priority
    const coloredCourses = courses.map((c, i) => ({
      ...c,
      ...this.COURSE_COLORS[i % this.COURSE_COLORS.length],
    })).sort((a, b) => (b.difficulty * b.units) - (a.difficulty * a.units));

    // Preferred hours for study (afternoon-first, then morning)
    const PREF = [15, 16, 14, 17, 10, 11, 13, 9, 12, 18, 19, 8, 20, 21];

    // Place study blocks for each course
    coloredCourses.forEach(course => {
      const hoursNeeded  = Math.max(1, Math.round(course.units * course.difficulty * 0.38));
      const classDaySet  = new Set(course.classDays || []);
      const studyDays    = this.DAYS.filter(d => !classDaySet.has(d));
      let placed = 0;

      outer: for (let pass = 0; pass < 3; pass++) {         // up to 3 passes over days
        for (const day of studyDays) {
          for (const h of PREF) {
            if (placed >= hoursNeeded) break outer;
            if (h < 6 || h > 22) continue;
            const key = `${day}-${h}`;
            if (!grid[key]) {
              grid[key] = {
                type: 'study', icon: '📖',
                title: course.code,
                label: course.code,
                bg: course.bg, text: course.text, border: course.border,
              };
              placed++;
            }
          }
        }
      }

      // Mark class days (visual indicator only)
      classDaySet.forEach(day => {
        [9, 10, 11].forEach(h => {
          const key = `${day}-${h}`;
          if (!grid[key]) {
            grid[key] = {
              type: 'class', icon: '🏛',
              title: `${course.code} Class`,
              label: course.code,
              bg: course.bg + '80', text: course.text, border: course.border,
              isClass: true,
            };
          }
        });
      });
    });

    return { grid, courses: coloredCourses };
  },

  renderHTML(courses, logistics) {
    const { grid, courses: coloredCourses } = this.generate(courses, logistics);
    const LABEL = h => h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;

    // Header row
    const headerRow = `<div class="tt-cell tt-corner"></div>` +
      this.DAYS.map(d => `<div class="tt-cell tt-day-head">${d}</div>`).join('');

    // Body rows
    const bodyRows = this.HOURS.map(h => {
      const cells = this.DAYS.map(day => {
        const cell = grid[`${day}-${h}`];
        if (!cell) return `<div class="tt-cell tt-free"></div>`;
        const styles = cell.bg
          ? `background:${cell.bg};color:${cell.text};border:1px solid ${cell.border};`
          : '';
        const cls = `tt-cell tt-block tt-${cell.type}`;
        return `<div class="${cls}" style="${styles}" title="${cell.title}">${cell.icon} <span>${cell.label || ''}</span></div>`;
      }).join('');
      return `<div class="tt-cell tt-time">${LABEL(h)}</div>${cells}`;
    }).join('');

    // Legend
    const legend = coloredCourses.map(c =>
      `<div class="tt-legend-item">
        <div class="tt-legend-dot" style="background:${c.bg};border:2px solid ${c.border};"></div>
        <span style="color:var(--text);font-size:.8rem;">${c.code} <span style="color:var(--text-muted)">(${c.units}u · ⭐${c.difficulty})</span></span>
      </div>`
    ).join('');

    return { headerRow, bodyRows, legend };
  },
};

// ── INIT ON EVERY PAGE ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  Toast.init();
  setActiveNav();

  // Wire up any logout buttons
  document.querySelectorAll('[data-action="logout"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await Auth.signOut();
      window.location.href = 'index.html';
    });
  });
});
