# NoNumber Live Chat Firebase Build

This is the proper live-chat version of the NoNumber Chat pilot.

It uses:

- Firebase Anonymous Authentication
- Cloud Firestore realtime listeners
- GitHub Pages-ready static files
- Nickname-only joining
- QR invite links
- Live group messages
- Typing dots
- Presence / "people about"
- Creator Admin pilot dashboard
- Good-cause application flow
- Group Admin flow
- No phone number fields

## Important

This version **can work as real chat** between phones, but only after you connect it to Firebase.

GitHub Pages hosts the app files. Firebase stores and syncs the live messages.

## Setup steps

### 1. Create Firebase project

Go to Firebase Console and create a project.

### 2. Add a Web App

In Firebase:

Project settings → Your apps → Web app

Copy the Firebase config.

### 3. Paste config

Open:

```text
firebase-config.js
```

Replace the placeholder values with your Firebase config.

### 4. Enable Anonymous Authentication

Firebase Console:

Authentication → Sign-in method → Anonymous → Enable

This lets people use the app without email or phone number.

### 5. Create Firestore database

Firebase Console:

Firestore Database → Create database

Start in production mode, then paste the included rules.

### 6. Publish rules

Open the file:

```text
firestore.rules
```

Copy it into:

Firestore Database → Rules

Then publish.

### 7. Upload to GitHub Pages

Upload these files to the root of your GitHub repository:

- index.html
- styles.css
- app.js
- firebase-config.js
- manifest.json
- sw.js
- assets folder

Then:

Settings → Pages → Deploy from branch → main → /root → Save

## Creator Admin demo PIN

```text
0000
```

This is only for the pilot.

For a real public app, Creator Admin control must be secured using proper admin accounts, Firebase custom claims or Cloud Functions.

## What is live in this version?

- Messages are stored in Firestore
- Other phones see messages update live
- Typing dots use Firestore
- Online/people-about status uses Firestore presence heartbeats
- QR links join the real group
- Creator Admin can freeze/unfreeze groups
- Creator Admin can reset QR codes
- Good-cause applications are stored in Firestore
- Approved admins are stored in Firestore

## What still needs hardening before public launch?

- Proper Creator Admin login
- Proper Group Admin login
- Server-side role checks
- Stronger Firestore rules
- Report-message workflow
- Better member approval flow
- Push notifications
- Abuse reporting / audit logs
- Privacy policy and terms

## Phone install

iPhone:

1. Open the GitHub Pages link in Safari.
2. Tap Share.
3. Tap Add to Home Screen.

Android:

1. Open the link in Chrome.
2. Tap the three-dot menu.
3. Add to Home Screen / Install.
