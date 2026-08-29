import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/api/apiClient";
import { firebaseAuth, onAuthStateChanged as onFirebaseAuthStateChanged } from "@/lib/firebase";
import { apiUrl } from "@/lib/apiBase";

const AuthContext = createContext(null);

async function getSession() {
  const response = await fetch(apiUrl("/api/auth/me"), {
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("تعذر التحقق من جلسة تسجيل الدخول.");
  const data = await response.json();
  return data?.authenticated ? data.user : null;
}

function persistUser(user) {
  if (user) {
    localStorage.setItem("education_platform_session_v1", JSON.stringify({ id: user.id }));
    localStorage.setItem("user", JSON.stringify(user));
  } else {
    localStorage.removeItem("education_platform_session_v1");
    localStorage.removeItem("user");
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const syncFirebaseSession = useCallback(async (nextFirebaseUser) => {
    setAuthError(null);

    if (!nextFirebaseUser) {
      setFirebaseUser(null);
      setUser(null);
      persistUser(null);
      return null;
    }

    setFirebaseUser(nextFirebaseUser);

    try {
      // Re-create the secure server session whenever Firebase restores a
      // browser session. This prevents the app from ever depending on
      // localhost URLs or an old server cookie after deployment.
      const idToken = await nextFirebaseUser.getIdToken();
      await api.auth.createServerSession(idToken);
      const next = await getSession();
      setUser(next);
      persistUser(next);
      if (!next) throw new Error("تم تسجيل الدخول في Firebase لكن تعذر إنشاء جلسة المنصة.");
      return next;
    } catch (error) {
      setUser(null);
      persistUser(null);
      setAuthError(error?.message || "تعذر مزامنة جلسة تسجيل الدخول.");
      return null;
    }
  }, []);

  const checkUserAuth = useCallback(async () => {
    const current = firebaseAuth.currentUser;
    if (current) return syncFirebaseSession(current);

    try {
      const next = await getSession();
      setUser(next);
      persistUser(next);
      return next;
    } catch (error) {
      setAuthError(error?.message || "تعذر التحقق من تسجيل الدخول.");
      return null;
    }
  }, [syncFirebaseSession]);

  useEffect(() => {
    let active = true;

    const unsubscribe = onFirebaseAuthStateChanged(firebaseAuth, async (nextFirebaseUser) => {
      if (!active) return;
      await syncFirebaseSession(nextFirebaseUser);
      if (active) setIsLoadingAuth(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [syncFirebaseSession]);

  const logout = useCallback(async (redirect = true) => {
    try {
      await api.auth.logout();
    } finally {
      setFirebaseUser(null);
      setUser(null);
      persistUser(null);
      if (redirect) window.location.replace("/login");
    }
  }, []);

  const navigateToLogin = useCallback((returnTo = "/") => {
    const suffix = returnTo !== "/" ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    window.location.replace(`/login${suffix}`);
  }, []);

  const value = useMemo(() => ({
    user,
    firebaseUser,
    isAuthenticated: Boolean(user),
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError,
    authChecked: !isLoadingAuth,
    appPublicSettings: { standalone: true },
    logout,
    navigateToLogin,
    checkUserAuth,
    checkAppState: async () => {},
  }), [user, firebaseUser, isLoadingAuth, authError, logout, navigateToLogin, checkUserAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
