import {useCallback, useEffect, useMemo, useState} from "react"
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth"

import {draftyFirebaseConfig, getDraftyFirebaseAuth} from "../firebaseAuth"


export type DraftyAuthState = "disabled" | "loading" | "signed_out" | "signed_in" | "error"

export const useDraftyAuth = (enabled: boolean) => {
  const configured = Boolean(draftyFirebaseConfig())
  const [user, setUser] = useState<User | null>(null)
  const [state, setState] = useState<DraftyAuthState>(
    enabled && configured ? "loading" : "disabled",
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !configured) {
      setState("disabled")
      setUser(null)
      return
    }
    let unsubscribe: () => void = () => undefined
    let cancelled = false
    try {
      const client = getDraftyFirebaseAuth()
      void client.ready.then(() => {
        if (cancelled) return
        unsubscribe = onAuthStateChanged(client.auth, nextUser => {
          setUser(nextUser)
          setState(nextUser ? "signed_in" : "signed_out")
          setError(null)
        }, caught => {
          setState("error")
          setError(caught.message)
        })
      }).catch(caught => {
        if (cancelled) return
        setState("error")
        setError(caught instanceof Error ? caught.message : "Google sign-in is unavailable")
      })
    } catch (caught) {
      setState("error")
      setError(caught instanceof Error ? caught.message : "Google sign-in is unavailable")
    }
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [configured, enabled])

  const signIn = useCallback(async () => {
    const client = getDraftyFirebaseAuth()
    setState("loading")
    setError(null)
    try {
      await client.ready
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({prompt: "select_account"})
      const result = await signInWithPopup(client.auth, provider)
      setUser(result.user)
      setState("signed_in")
    } catch (caught) {
      setState("error")
      setError(caught instanceof Error ? caught.message : "Google sign-in failed")
      throw caught
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    try {
      const client = getDraftyFirebaseAuth()
      await client.ready
      await firebaseSignOut(client.auth)
      setUser(null)
      setState("signed_out")
    } catch (caught) {
      setState("error")
      setError(caught instanceof Error ? caught.message : "Google sign-out failed")
      throw caught
    }
  }, [])

  return useMemo(() => ({
    configured,
    enabled,
    state,
    user,
    error,
    signIn,
    signOut,
  }), [configured, enabled, error, signIn, signOut, state, user])
}

export type DraftyAuthControls = ReturnType<typeof useDraftyAuth>
