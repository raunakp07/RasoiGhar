# RasoiHub – Firebase Setup Guide

## Overview
RasoiHub uses **Firebase Authentication** and **Cloud Firestore** as its backend.
Follow these steps to connect your project.

---

## Step 1 – Create a Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → enter a name (e.g. `rasoihub`) → Continue
3. Disable Google Analytics if not needed → **Create project**

---

## Step 2 – Enable Authentication

1. In your project, click **Authentication** in the left sidebar
2. Click **Get started**
3. Under **Sign-in method**, enable **Email/Password**
4. Click **Save**

---

## Step 3 – Create Firestore Database

1. Click **Firestore Database** in the left sidebar
2. Click **Create database**
3. Choose **Production mode** → select your region → **Done**

---

## Step 4 – Set Firestore Security Rules

Go to **Firestore → Rules** and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Users can only read/write their own bookings
    match /bookings/{bookingId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.uid;
      allow create:      if request.auth != null && request.auth.uid == request.resource.data.uid;
    }
  }
}
```

Click **Publish**.

---

## Step 5 – Create Required Indexes

Go to **Firestore → Indexes → Composite** and add:

| Collection | Fields                                    | Query Scope |
|------------|-------------------------------------------|-------------|
| bookings   | uid (Asc), date (Desc), time (Desc)       | Collection  |

Or just run the app — Firebase will provide a direct link to create missing indexes automatically when you open the browser console.

---

## Step 6 – Get Your Firebase Config

1. In Firebase Console, click the **gear icon** → **Project Settings**
2. Scroll to **Your apps** → click the **</>** (Web) icon
3. Register your app (e.g. `rasoihub-web`)
4. Copy the `firebaseConfig` object

---

## Step 7 – Add Config to the Project

Open **`js/firebase.js`** and replace the placeholder config:

```javascript
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

---

## Step 8 – Serve the Project

Since the project uses ES Modules (`type="module"`), you **cannot** open HTML files directly with `file://`. You need a local server:

**Option A – VS Code Live Server**
Install the "Live Server" extension → right-click `index.html` → Open with Live Server

**Option B – Python**
```bash
cd rasoihub
python -m http.server 8000
```
Then open: http://localhost:8000

**Option C – Node.js**
```bash
npx serve .
```

---

## Project Structure

```
rasoihub/
├── index.html          # Landing page
├── login.html          # Sign in
├── signup.html         # Create account
├── reset.html          # Forgot password
├── dashboard.html      # Stats overview (auth required)
├── bookings.html       # CRUD reservations (auth required)
├── profile.html        # Account management (auth required)
├── css/
│   └── style.css       # All styles
├── js/
│   └── firebase.js     # Firebase init + shared utilities
└── SETUP.md            # This file
```

---

## Features

- ✅ Email/Password Authentication (signup, login, logout)
- ✅ Password reset via email
- ✅ Auth guard on protected pages (auto-redirect)
- ✅ Create, Edit, Delete bookings (Firestore CRUD)
- ✅ Filter bookings: All / Upcoming / Past
- ✅ Dashboard stats (total bookings, guests, upcoming count)
- ✅ Profile update (name, password)
- ✅ Toast notifications
- ✅ Loading states and skeleton screens
- ✅ Fully responsive design
- ✅ Input validation on all forms
