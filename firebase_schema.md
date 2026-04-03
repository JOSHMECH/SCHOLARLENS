# Firebase Schema — ScholarLens

This document describes the Firestore data model and security rules for ScholarLens, replacing the previous `supabase_schema.sql`.

---

## Collection Structure

```
users/                          ← root collection
  {uid}/                        ← document per Firebase Auth user (uid = Auth.currentUser.uid)
    predictions/                ← sub-collection
      {predictionId}/           ← auto-generated document ID per analysis
        current_cgpa    number
        target_cgpa     number
        study_hours     number
        attendance      number
        carry_overs     number
        predicted_cgpa  number
        recommendations array of objects { type, icon, title, desc }
        risk_level      string  ("Low" | "Medium" | "High")
        created_at      timestamp (Firestore server timestamp)
```

---

## Firestore Security Rules

Paste these rules into **Firebase Console → Firestore → Rules**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own sub-collection
    match /users/{userId}/predictions/{predId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }

    // Deny all other access by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## Required Firebase Console Setup

1. **Authentication** → Sign-in methods → Enable **Email/Password**

2. **Firestore Database** → Create database (start in production mode)

3. Apply the security rules above

4. (Optional) Create a **Composite Index** for faster sorting:
   - Collection group: `predictions`
   - Fields: `user_id ASC`, `created_at DESC`
   - (Firestore will prompt you to create this automatically when needed)

---

## Backend (Python) Setup

The Flask backend uses **Firebase Admin SDK** for server-side Firestore writes.

1. In Firebase Console → Project Settings → Service Accounts → **Generate new private key**
2. Save the downloaded JSON as `backend/serviceAccountKey.json`
3. Set the env var in `backend/.env`:
   ```
   FIREBASE_SERVICE_ACCOUNT=serviceAccountKey.json
   ```
4. Install the dependency:
   ```bash
   pip install firebase-admin>=6.5.0
   ```

---

## Migrating from Supabase

| Supabase concept | Firebase equivalent |
|---|---|
| `auth.users` | Firebase Authentication Users |
| `public.profiles` | Firebase Auth `displayName` field |
| `public.student_inputs` table | Merged into `predictions` document |
| `public.predictions` table | `users/{uid}/predictions/{id}` |
| Row-Level Security (RLS) | Firestore Security Rules |
| `supabase-py` pip package | `firebase-admin` pip package |
| Supabase JS CDN | Firebase JS compat CDN |
