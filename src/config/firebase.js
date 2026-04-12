const admin = require('firebase-admin');

// Initialize Firebase Admin SDK using environment variables
if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountJson) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT not found in environment variables!');
    console.error('Please add FIREBASE_SERVICE_ACCOUNT to your .env file');
    process.exit(1);
  }
  
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK initialized from environment variables');
  } catch (error) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', error.message);
    process.exit(1);
  }
}

const verifyFirebaseToken = async (idToken) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error('Invalid Firebase token');
  }
};

// Sign up with email and password
const signUpWithEmailPassword = async (email, password, displayName = null) => {
  const fetch = require('node-fetch');
  
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('FIREBASE_API_KEY not found in environment variables');
  }
  
  // Create the user account
  const signUpResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: password,
        returnSecureToken: true,
      }),
    }
  );
  
  const signUpData = await signUpResponse.json();
  
  if (!signUpResponse.ok) {
    throw new Error(signUpData.error?.message || 'Sign up failed');
  }
  
  // Update profile with display name if provided
  if (displayName) {
    const updateResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: signUpData.idToken,
          displayName: displayName,
          returnSecureToken: true,
        }),
      }
    );
    
    const updateData = await updateResponse.json();
    if (updateResponse.ok) {
      signUpData.displayName = updateData.displayName;
    }
  }
  
  return {
    idToken: signUpData.idToken,
    refreshToken: signUpData.refreshToken,
    localId: signUpData.localId,
    email: signUpData.email,
    emailVerified: signUpData.emailVerified || false,
    displayName: signUpData.displayName || displayName,
  };
};

// Sign in with email and password
const signInWithEmailPassword = async (email, password) => {
  const fetch = require('node-fetch');
  
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('FIREBASE_API_KEY not found in environment variables');
  }
  
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: password,
        returnSecureToken: true,
      }),
    }
  );
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || 'Authentication failed');
  }
  
  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    localId: data.localId,
    email: data.email,
    emailVerified: data.emailVerified || false,
    displayName: data.displayName,
  };
};

// Refresh token
const refreshFirebaseToken = async (refreshToken) => {
  const fetch = require('node-fetch');
  
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('FIREBASE_API_KEY not found in environment variables');
  }
  
  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }
  );
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || 'Token refresh failed');
  }
  
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in
  };
};

module.exports = { 
  admin, 
  verifyFirebaseToken, 
  signUpWithEmailPassword,
  signInWithEmailPassword,
  refreshFirebaseToken
};