import {getApp, getApps, initializeApp, type FirebaseOptions} from "firebase/app"
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth"


export interface DraftyFirebaseEnvironment {
  NEXT_PUBLIC_FIREBASE_API_KEY?: string
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string
}

const environment = (): DraftyFirebaseEnvironment => ({
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
})

export const draftyFirebaseConfig = (
  values: DraftyFirebaseEnvironment = environment(),
): FirebaseOptions | null => {
  const apiKey = values.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()
  const authDomain = values.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()
  const projectId = values.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim()
  if (!apiKey || !authDomain || !projectId) return null
  return {apiKey, authDomain, projectId}
}

let persistenceReady: Promise<void> | null = null

export const getDraftyFirebaseAuth = (): {auth: Auth, ready: Promise<void>} => {
  const config = draftyFirebaseConfig()
  if (!config) throw new Error("Google profile sync is not configured")
  const app = getApps().length > 0 ? getApp() : initializeApp(config)
  const auth = getAuth(app)
  persistenceReady ||= setPersistence(auth, browserLocalPersistence)
  return {auth, ready: persistenceReady}
}
