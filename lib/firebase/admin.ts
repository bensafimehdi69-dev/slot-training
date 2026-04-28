import { initializeApp, getApps, cert, applicationDefault, type ServiceAccount } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

function getCredential() {
  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    const serviceAccount: ServiceAccount = {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }
    return cert(serviceAccount)
  }
  return applicationDefault()
}

// Default Storage bucket. App Hosting injects the bucket name through
// NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET; we forward it to the Admin SDK so
// `getStorage().bucket()` resolves without an explicit name on every call.
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

const app =
  getApps().length === 0
    ? initializeApp({
        credential: getCredential(),
        ...(storageBucket ? { storageBucket } : {}),
      })
    : getApps()[0]

const adminAuth = getAuth(app)
const adminDb = getFirestore(app)
const adminStorage = getStorage(app)

export { adminAuth, adminDb, adminStorage }
