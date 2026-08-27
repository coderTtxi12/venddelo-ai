export function riderApkReadOnlyHint(): string {
  return 'Solo lectura. Pide al propietario que suba o cambie el APK.';
}

export function riderApkEmptyHint(): string {
  return 'Aún no hay un APK publicado. Los riders no tendrán enlace de descarga.';
}

export function riderApkOwnerHint(): string {
  return 'Sube el APK o pega una URL https. Ese enlace es el que recibe la app si hay que forzar actualización.';
}
