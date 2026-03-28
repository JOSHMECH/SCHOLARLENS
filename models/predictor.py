"""
ScholarLens — Predictive Model
Multivariate Linear Regression for CGPA prediction.

Model:
    Y = β0 + β1(study_hours) + β2(attendance) + β3(current_cgpa) + β4(carry_overs)

Uses scikit-learn for training, with a manual fallback implementation.
"""

import os
import pickle
import numpy as np
import random

try:
    from sklearn.linear_model import LinearRegression, Ridge
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import r2_score, mean_squared_error
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("⚠️  scikit-learn not installed — using manual OLS implementation.")


# ══════════════════════════════════════════════════════════════
#  DATA GENERATOR
# ══════════════════════════════════════════════════════════════

def generate_synthetic_dataset(n_samples: int = 2000, seed: int = 42) -> tuple:
    """
    Generate a realistic synthetic student dataset for training.

    Features:
        study_hours   : Normal(20, 8), clipped 0–60
        attendance    : Normal(75, 15), clipped 40–100
        current_cgpa  : Normal(3.0, 0.7), clipped 1.0–5.0
        carry_overs   : Poisson(1.5), clipped 0–12

    Target (predicted_cgpa):
        Determined by a realistic formula + Gaussian noise
    """
    rng = np.random.default_rng(seed)

    study_hours  = np.clip(rng.normal(20, 8,    n_samples), 0,    60)
    attendance   = np.clip(rng.normal(75, 15,   n_samples), 40,   100)
    current_cgpa = np.clip(rng.normal(3.0, 0.7, n_samples), 1.0,  5.0)
    carry_overs  = np.clip(rng.poisson(1.5,     n_samples), 0,    12).astype(float)

    # True relationship (ground truth)
    y = (
        0.512
        + 0.0312 * study_hours
        + 0.0198 * attendance
        + 0.6140 * current_cgpa
        - 0.0823 * carry_overs
        + rng.normal(0, 0.12, n_samples)   # realistic noise
    )
    y = np.clip(y, 0.5, 5.0)

    X = np.column_stack([study_hours, attendance, current_cgpa, carry_overs])
    return X, y


# ══════════════════════════════════════════════════════════════
#  MANUAL OLS IMPLEMENTATION (fallback if sklearn not installed)
# ══════════════════════════════════════════════════════════════

class ManualOLS:
    """Ordinary Least Squares via the normal equation: β = (X'X)⁻¹ X'y"""

    def __init__(self):
        self.beta = None

    def fit(self, X: np.ndarray, y: np.ndarray):
        # Add bias column
        n = X.shape[0]
        Xb = np.hstack([np.ones((n, 1)), X])
        # Normal equation
        self.beta = np.linalg.pinv(Xb.T @ Xb) @ Xb.T @ y
        # Compute R²
        y_pred = Xb @ self.beta
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - y.mean()) ** 2)
        self.r_squared_ = 1 - ss_res / ss_tot
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        n = X.shape[0]
        Xb = np.hstack([np.ones((n, 1)), X])
        return Xb @ self.beta


# ══════════════════════════════════════════════════════════════
#  MAIN PREDICTOR CLASS
# ══════════════════════════════════════════════════════════════

class ScholarPredictor:

    FEATURE_NAMES = ["study_hours", "attendance", "current_cgpa", "carry_overs"]

    def __init__(self):
        self.model      = None
        self.scaler     = None
        self.is_fitted  = False
        self.r_squared  = 0.0
        self.rmse       = 0.0
        self.coefficients: dict = {}

    # ── TRAIN ───────────────────────────────────────────────
    def train_and_save(self, save_path: str = "models/model.pkl"):
        print("🔄 Generating synthetic dataset…")
        X, y = generate_synthetic_dataset(n_samples=3000)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        ) if SKLEARN_AVAILABLE else (X[:2400], X[2400:], y[:2400], y[2400:])

        print("🔄 Training model…")
        if SKLEARN_AVAILABLE:
            self.scaler = StandardScaler()
            X_train_sc  = self.scaler.fit_transform(X_train)
            X_test_sc   = self.scaler.transform(X_test)

            # Use Ridge regression for slight regularisation
            self.model = Ridge(alpha=0.1)
            self.model.fit(X_train_sc, y_train)

            y_pred         = self.model.predict(X_test_sc)
            self.r_squared = r2_score(y_test, y_pred)
            self.rmse      = np.sqrt(mean_squared_error(y_test, y_pred))

            # Store human-readable coefficients
            coef = self.model.coef_
            # coef are on the *scaled* features; convert back to original scale
            scale = self.scaler.scale_
            self.coefficients = {
                name: round(float(coef[i] / scale[i]), 5)
                for i, name in enumerate(self.FEATURE_NAMES)
            }
            self.coefficients["intercept"] = round(float(self.model.intercept_), 5)

        else:
            self.model     = ManualOLS()
            self.model.fit(X_train, y_train)
            self.r_squared = self.model.r_squared_
            y_pred         = self.model.predict(X_test)
            self.rmse      = float(np.sqrt(np.mean((y_test - y_pred)**2)))
            beta = self.model.beta
            self.coefficients = {
                "intercept":   round(float(beta[0]), 5),
                **{name: round(float(beta[i+1]), 5) for i, name in enumerate(self.FEATURE_NAMES)},
            }

        self.is_fitted = True
        print(f"✅ Model trained  |  R²={self.r_squared:.4f}  |  RMSE={self.rmse:.4f}")
        print(f"   Coefficients: {self.coefficients}")
        self._save(save_path)

    # ── PREDICT ─────────────────────────────────────────────
    def predict(
        self,
        study_hours: float,
        attendance: float,
        current_cgpa: float,
        carry_overs: float,
    ) -> float:
        if not self.is_fitted:
            raise RuntimeError("Model not fitted. Call train_and_save() first.")

        X = np.array([[study_hours, attendance, current_cgpa, carry_overs]])

        if SKLEARN_AVAILABLE and self.scaler is not None:
            X_sc = self.scaler.transform(X)
            pred = float(self.model.predict(X_sc)[0])
        else:
            pred = float(self.model.predict(X)[0])

        # Clip to valid CGPA range
        return round(np.clip(pred, 0.0, 5.0), 2)

    # ── SAVE / LOAD ──────────────────────────────────────────
    def _save(self, path: str):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump({
                "model":        self.model,
                "scaler":       self.scaler,
                "r_squared":    self.r_squared,
                "rmse":         self.rmse,
                "coefficients": self.coefficients,
            }, f)
        print(f"💾 Model saved to {path}")

    def load(self, path: str):
        with open(path, "rb") as f:
            data = pickle.load(f)
        self.model        = data["model"]
        self.scaler       = data.get("scaler")
        self.r_squared    = data["r_squared"]
        self.rmse         = data["rmse"]
        self.coefficients = data["coefficients"]
        self.is_fitted    = True

    def metrics(self) -> dict:
        return {
            "r_squared":    round(self.r_squared, 4),
            "rmse":         round(self.rmse, 4),
            "coefficients": self.coefficients,
        }


# ══════════════════════════════════════════════════════════════
#  CLI — run directly to train the model
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import argparse, sys, json

    parser = argparse.ArgumentParser(description="ScholarLens Model Trainer")
    parser.add_argument("--train",   action="store_true", help="Train and save the model")
    parser.add_argument("--predict", action="store_true", help="Run a sample prediction")
    parser.add_argument("--metrics", action="store_true", help="Print model metrics")
    parser.add_argument("--model",   default="model.pkl",  help="Path to save/load model")
    args = parser.parse_args()

    predictor = ScholarPredictor()

    if args.train or not os.path.exists(args.model):
        predictor.train_and_save(args.model)
    else:
        predictor.load(args.model)
        print(f"✅ Loaded model from {args.model}")

    if args.metrics:
        print("\n── Model Metrics ──────────────────────────")
        print(json.dumps(predictor.metrics(), indent=2))

    if args.predict:
        # Sample student
        examples = [
            (20, 85, 3.2, 1),   # Average student
            (35, 95, 4.0, 0),   # High performer
            (10, 60, 2.1, 5),   # Struggling student
        ]
        print("\n── Sample Predictions ─────────────────────")
        header = f"{'Study Hrs':>10} {'Attendance':>12} {'Curr CGPA':>10} {'Carry-Overs':>12} {'Predicted':>10}"
        print(header)
        print("─" * len(header))
        for sh, att, cgpa, co in examples:
            pred = predictor.predict(sh, att, cgpa, co)
            print(f"{sh:>10} {att:>12} {cgpa:>10} {co:>12} {pred:>10.2f}")
