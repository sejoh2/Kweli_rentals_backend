const admin = require("firebase-admin");

let firebaseApp = null;

const normalizePrivateKey = (key) => {
  if (!key) return null;
  return key.replace(/\\n/g, "\n");
};

const initializeFirebase = () => {
  if (firebaseApp) return firebaseApp;

  if (admin.apps.length > 0) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      "Firebase Admin is not configured. Push notifications will be skipped."
    );
    return null;
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });

  return firebaseApp;
};

const getMessaging = () => {
  const app = initializeFirebase();
  if (!app) return null;
  return admin.messaging(app);
};

module.exports = {
  initializeFirebase,
  getMessaging
};