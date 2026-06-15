/** Perfil de sesión para componentes del panel. */
export type AppUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};
