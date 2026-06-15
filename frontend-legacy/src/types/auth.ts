/** Perfil de sesión compatible con componentes que antes usaban Firebase `User`. */
export type AppUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};
