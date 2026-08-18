import { storagePublicUrl } from '@/lib/storage/publicUrl';
import styles from './DriverAvatar.module.css';

type DriverAvatarProps = {
  firstName: string;
  lastName: string;
  profilePhotoPath: string | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
};

export function DriverAvatar({
  firstName,
  lastName,
  profilePhotoPath,
  size = 'md',
  className,
}: DriverAvatarProps) {
  const photoUrl = storagePublicUrl(profilePhotoPath);
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const sizeClass = size === 'sm' ? styles.photoSm : styles.photoMd;
  const fallbackSizeClass = size === 'sm' ? styles.photoFallbackSm : styles.photoFallbackMd;

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={[styles.photo, sizeClass, className].filter(Boolean).join(' ')}
      />
    );
  }

  return (
    <span
      className={[styles.photoFallback, fallbackSizeClass, className].filter(Boolean).join(' ')}
      aria-hidden
    >
      {initials}
    </span>
  );
}
