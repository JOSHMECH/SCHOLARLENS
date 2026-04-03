"""
ScholarLens — Flask Backend
API server for CGPA prediction and academic analytics.
"""

import os
import json
import uuid
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import numpy as np

# Load model and components
from models.predictor import ScholarPredictor

load_dotenv()

# ── APP SETUP ─────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:5500",
                    "http://localhost:5500", "*"])

# ── FIREBASE ADMIN SETUP (optional) ──────────────────────────
db = None
try:
    import firebase_admin
    from firebase_admin import credentials, firestore

    service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT")  # path to JSON file
    if service_account and os.path.isfile(service_account):
        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account)
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("✅ Firebase Admin connected.")
    else:
        print("⚠️  FIREBASE_SERVICE_ACCOUNT not set or file not found — running in local mode.")
except ImportError:
    print("⚠️  firebase-admin not installed — running without DB persistence.")

# ── LOAD PREDICTOR ────────────────────────────────────────────
predictor = ScholarPredictor()
try:
    predictor.load("models/model.pkl")
    print("✅ Model loaded from models/model.pkl")
except FileNotFoundError:
    print("⚠️  No saved model found — training from scratch…")
    predictor.train_and_save("models/model.pkl")
    print("✅ Model trained and saved.")


# ══════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════

@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "ScholarLens API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": ["/analyze", "/history/<user_id>", "/health"],
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": predictor.is_fitted})


# ── POST /analyze ─────────────────────────────────────────────
@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Accept student inputs, run prediction, return results.

    Body (JSON):
        current_cgpa  float   0–5
        target_cgpa   float   0–5
        study_hours   float   0–100
        attendance    float   0–100
        carry_overs   int     0–30
        user_id       str     (optional — Firebase UID)
    """
    data = request.get_json(force=True)

    # ── Validate ─────────────────────────────────────────────
    errors = validate_input(data)
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 400

    current_cgpa = float(data["current_cgpa"])
    target_cgpa  = float(data["target_cgpa"])
    study_hours  = float(data["study_hours"])
    attendance   = float(data["attendance"])
    carry_overs  = int(data["carry_overs"])
    user_id      = data.get("user_id")

    # ── Predict ───────────────────────────────────────────────
    predicted_cgpa = predictor.predict(study_hours, attendance, current_cgpa, carry_overs)
    gap            = round(target_cgpa - predicted_cgpa, 4)
    risk_level     = compute_risk(predicted_cgpa, target_cgpa, carry_overs)
    recommendations = build_recommendations(
        predicted_cgpa, target_cgpa, study_hours, attendance, carry_overs,
        predictor.coefficients
    )

    result = {
        "predicted_cgpa":   predicted_cgpa,
        "target_cgpa":      target_cgpa,
        "gap":              gap,
        "risk_level":       risk_level,
        "recommendations":  recommendations,
        "model_accuracy":   round(predictor.r_squared * 100, 1),
        "timestamp":        datetime.utcnow().isoformat() + "Z",
    }

    # ── Persist to Firestore (if configured + user_id given) ──
    if db and user_id:
        try:
            # Write a single flat document to users/{uid}/predictions
            db.collection("users").document(user_id).collection("predictions").add({
                "current_cgpa":    current_cgpa,
                "target_cgpa":     target_cgpa,
                "study_hours":     study_hours,
                "attendance":      attendance,
                "carry_overs":     carry_overs,
                "predicted_cgpa":  predicted_cgpa,
                "recommendations": recommendations,
                "risk_level":      risk_level,
                "created_at":      firestore.SERVER_TIMESTAMP,
            })
        except Exception as e:
            print(f"Firestore write error: {e}")

    return jsonify(result), 200


# ── GET /history/<user_id> ────────────────────────────────────
@app.route("/history/<user_id>", methods=["GET"])
def get_history(user_id):
    if not db:
        return jsonify({"error": "Database not configured"}), 503

    try:
        snap = (
            db.collection("users")
            .document(user_id)
            .collection("predictions")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(50)
            .stream()
        )
        records = []
        for doc in snap:
            d = doc.to_dict()
            records.append({
                "id":            doc.id,
                "user_id":       user_id,
                "current_cgpa":  d.get("current_cgpa"),
                "target_cgpa":   d.get("target_cgpa"),
                "study_hours":   d.get("study_hours"),
                "attendance":    d.get("attendance"),
                "carry_overs":   d.get("carry_overs"),
                "predicted_cgpa": d.get("predicted_cgpa"),
                "recommendations": d.get("recommendations"),
                "risk_level":    d.get("risk_level"),
                "created_at":    d["created_at"].isoformat() if hasattr(d.get("created_at"), "isoformat") else str(d.get("created_at", "")),
            })
        return jsonify({"history": records}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════

def validate_input(data: dict) -> list[str]:
    errors = []
    required = {
        "current_cgpa": (0, 5),
        "target_cgpa":  (0, 5),
        "study_hours":  (0, 100),
        "attendance":   (0, 100),
        "carry_overs":  (0, 30),
    }
    for field, (lo, hi) in required.items():
        if field not in data:
            errors.append(f"'{field}' is required.")
            continue
        try:
            val = float(data[field])
            if not (lo <= val <= hi):
                errors.append(f"'{field}' must be between {lo} and {hi}. Got {val}.")
        except (TypeError, ValueError):
            errors.append(f"'{field}' must be a number.")
    return errors


def compute_risk(predicted: float, target: float, carry_overs: int) -> str:
    gap = target - predicted
    if carry_overs >= 5 or gap > 1.5:
        return "High"
    elif carry_overs >= 2 or gap > 0.5:
        return "Medium"
    else:
        return "Low"


def build_recommendations(
    predicted: float,
    target: float,
    study_hours: float,
    attendance: float,
    carry_overs: int,
    coefficients: dict,
) -> list[dict]:
    """
    Generate specific, numeric recommendations to close the CGPA gap.
    """
    recs = []
    gap  = target - predicted
    b1   = coefficients.get("study_hours", 0.031)
    b2   = coefficients.get("attendance",  0.020)

    if gap > 0:
        # Study hours recommendation
        extra_hours = round(max(0, (gap * 0.45) / b1), 1)
        if extra_hours > 0:
            new_hours = round(study_hours + extra_hours, 1)
            recs.append({
                "type":  "study",
                "icon":  "📚",
                "title": f"Increase weekly study time by {extra_hours} hrs",
                "desc":  f"Target {new_hours} hrs/week (currently {study_hours} hrs). "
                         f"This alone could add ~{round(extra_hours * b1, 2)} CGPA points.",
            })

        # Attendance recommendation
        target_att = min(100, round(attendance + (gap * 0.3) / b2))
        if target_att > attendance:
            recs.append({
                "type":  "attendance",
                "icon":  "🏫",
                "title": f"Boost attendance to at least {target_att}%",
                "desc":  f"Your attendance is {attendance}%. Reaching {target_att}% "
                         f"could add ~{round((target_att - attendance) * b2, 2)} CGPA points.",
            })

        # Carry-over recommendation
        if carry_overs > 0:
            recs.append({
                "type":  "carryovers",
                "icon":  "⚠️",
                "title": f"Prioritise clearing your {carry_overs} carry-over{'s' if carry_overs > 1 else ''}",
                "desc":  "Each unresolved carry-over drags your CGPA significantly. "
                         "Dedicate focused revision blocks to resolving them this semester.",
            })

        # Study technique
        recs.append({
            "type":  "technique",
            "icon":  "🗓️",
            "title": "Implement a structured weekly study schedule",
            "desc":  "Consistent daily study beats last-minute cramming. "
                     "Use the Pomodoro technique (25 min study / 5 min break) and review notes within 24 hrs of lectures.",
        })

        # Seek support if high risk
        if gap > 1.0:
            recs.append({
                "type":  "support",
                "icon":  "🤝",
                "title": "Seek academic support and tutoring",
                "desc":  "With a gap of over 1.0 CGPA point, consider joining study groups, "
                         "visiting office hours, or hiring a tutor for difficult courses.",
            })

    else:
        recs.append({
            "type":  "maintain",
            "icon":  "🌟",
            "title": "You're on track! Maintain your current habits.",
            "desc":  f"Your predicted CGPA of {predicted} meets your target of {target}. "
                     f"Stay consistent and don't let your guard down.",
        })
        if attendance < 90:
            recs.append({
                "type":  "attendance",
                "icon":  "🏫",
                "title": "Consider boosting attendance above 90%",
                "desc":  f"You're on track, but lifting attendance (now {attendance}%) "
                         f"above 90% could push your CGPA even higher.",
            })

    return recs


# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV", "development") == "development"
    print(f"🚀 ScholarLens API running on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
