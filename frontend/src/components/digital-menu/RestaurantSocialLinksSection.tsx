import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import type { PublicRestaurantSocialLinks } from '@/lib/digital-menu/restaurantSocialLinks';
import { hasPublicSocialLinks } from '@/lib/digital-menu/restaurantSocialLinks';
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from '@/components/digital-menu/SocialBrandIcons';
import styles from './RestaurantSocialLinksSection.module.css';

export type SocialLinksVariant =
  | 'default'
  | 'sidebar'
  | 'intro'
  | 'cover'
  | 'beforeMenu'
  | 'inline';

type RestaurantSocialLinksSectionProps = {
  socialLinks: PublicRestaurantSocialLinks | null | undefined;
  className?: string;
  variant?: SocialLinksVariant;
  cartBarInset?: boolean;
};

const LINKS = [
  {
    key: 'facebook_url' as const,
    label: 'Facebook',
    Icon: FacebookIcon,
    brandClass: styles.socialLinkFacebook,
  },
  {
    key: 'instagram_url' as const,
    label: 'Instagram',
    Icon: InstagramIcon,
    brandClass: styles.socialLinkInstagram,
  },
  {
    key: 'whatsapp_url' as const,
    label: 'WhatsApp',
    Icon: WhatsAppIcon,
    brandClass: styles.socialLinkWhatsApp,
  },
];

function sectionClassName(variant: SocialLinksVariant): string {
  switch (variant) {
    case 'sidebar':
      return styles.socialSectionSidebar;
    case 'intro':
    case 'inline':
      return styles.socialSectionIntro;
    case 'cover':
      return styles.socialSectionCover;
    case 'beforeMenu':
      return styles.socialSectionBeforeMenu;
    default:
      return '';
  }
}

export function RestaurantSocialLinksSection({
  socialLinks,
  className,
  variant = 'default',
  cartBarInset = false,
}: RestaurantSocialLinksSectionProps) {
  if (!hasPublicSocialLinks(socialLinks)) return null;

  const showTitle = variant === 'default' || variant === 'sidebar' || variant === 'beforeMenu';
  const showHint = variant === 'default';
  const isCover = variant === 'cover';

  return (
    <section
      className={`${styles.socialSection} ${sectionClassName(variant)} ${cartBarInset ? styles.socialSectionCartBarInset : ''} ${className ?? ''}`.trim()}
      aria-label="Redes sociales del restaurante"
    >
      {showTitle ? (
        <div className={styles.socialHeader}>
          <ShareOutlinedIcon className={styles.socialHeaderIcon} aria-hidden />
          <div className={styles.socialHeading}>
            <h2 className={styles.socialTitle}>Síguenos</h2>
            {showHint ? <p className={styles.socialHint}>Conéctate con nosotros</p> : null}
          </div>
        </div>
      ) : null}

      <div className={`${styles.socialLinksRow} ${isCover ? styles.socialLinksRowCover : ''}`.trim()}>
        {LINKS.map(({ key, label, Icon, brandClass }) => {
          const href = socialLinks?.[key];
          if (!href) return null;
          return (
            <a
              key={key}
              className={`${styles.socialLink} ${isCover ? styles.socialLinkOnCover : ''} ${brandClass}`.trim()}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              title={label}
            >
              <Icon className={styles.socialLinkIcon} aria-hidden />
            </a>
          );
        })}
      </div>
    </section>
  );
}
