export function riderApkReadOnlyHint(): string {
  return 'Solo lectura. Pide al propietario que suba o cambie el APK.';
}

export function riderApkEmptyHint(): string {
  return 'Aún no hay un APK publicado. Los riders no tendrán enlace de descarga.';
}

export function riderApkOwnerHint(): string {
  return 'Arrastra el APK, elige un archivo o pega una URL https. Ese enlace es el que recibe la app si hay que forzar actualización.';
}

export function riderApkDropIdleHint(): string {
  return 'Arrastra el APK aquí o elige un archivo';
}

export function riderApkDropActiveHint(): string {
  return 'Suelta para subir el APK';
}

export function riderApkDropRejectHint(): string {
  return 'Solo se aceptan archivos .apk.';
}

export type RiderApkFileLike = {
  name: string;
  type?: string;
};

export function isRiderApkFile(file: RiderApkFileLike): boolean {
  const name = file.name.trim().toLowerCase();
  const type = (file.type ?? '').trim().toLowerCase();
  return name.endsWith('.apk') || type === 'application/vnd.android.package-archive';
}

export function pickDroppedApkFile<T extends RiderApkFileLike>(
  files: ArrayLike<T> | Iterable<T>,
): T | null {
  for (const file of Array.from(files as ArrayLike<T>)) {
    if (isRiderApkFile(file)) return file;
  }
  return null;
}

