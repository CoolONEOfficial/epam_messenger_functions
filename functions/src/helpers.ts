export const admin = require("firebase-admin");
export const firebase_tools = require('firebase-tools');
export const FieldValue = admin.firestore.FieldValue;
admin.initializeApp();

export const db = admin.firestore();
export const storage = admin.storage().bucket();
