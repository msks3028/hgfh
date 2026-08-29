export const TEACHER_EMAIL = "mostafakareem978@gmail.com";

export const ROLES = {
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
};

export const ROLE_HOME = {
  TEACHER: "/teacher",
  STUDENT: "/student",
};

export const ROLE_LABEL = {
  TEACHER: "المدرّس",
  STUDENT: "الطالب",
};

export function roleForEmail(email = "") {
  return email.trim().toLowerCase() === TEACHER_EMAIL
    ? ROLES.TEACHER
    : ROLES.STUDENT;
}

export function normalizeRole(role) {
  return role === ROLES.TEACHER ? ROLES.TEACHER : ROLES.STUDENT;
}

export function roleHome(role) {
  return ROLE_HOME[normalizeRole(role)] || ROLE_HOME.STUDENT;
}

export function userFromFirebase(firebaseUser) {
  if (!firebaseUser) return null;
  const role = roleForEmail(firebaseUser.email || "");
  return {
    id: firebaseUser.uid,
    uid: firebaseUser.uid,
    email: firebaseUser.email || "",
    full_name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "طالب",
    photoURL: firebaseUser.photoURL || "",
    role,
    provider: firebaseUser.providerData?.[0]?.providerId || "password",
  };
}
