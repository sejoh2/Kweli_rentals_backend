const admin = require("firebase-admin");

let firebaseApp = null;

const getServiceAccountFromBase64 = () => {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) return null;

  const json = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(json);
};

const normalizePrivateKey = (key) => {
  if (!key) return null;
  return key.replace(/\\n/g, "\n");
};

const getServiceAccountFromEnvFields = () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey,
  };
};

const initializeFirebase = () => {
  if (firebaseApp) return firebaseApp;

  if (admin.apps.length > 0) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  const serviceAccount =
    getServiceAccountFromBase64() || getServiceAccountFromEnvFields();

  if (!serviceAccount) {
    console.warn(
      "Firebase Admin is not configured. Push notifications will be skipped."
    );
    return null;
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
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
  getMessaging,
};