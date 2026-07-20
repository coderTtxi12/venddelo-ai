import type {
  LiveMenuSocialPlacement,
  PublicRestaurantSocialLinks,
} from '@/lib/digital-menu/restaurantSocialLinks';
import {
  hasPublicSocialLinks,
  isSocialAtPlacement,
} from '@/lib/digital-menu/restaurantSocialLinks';
import {
  RestaurantSocialLinksSection,
  type SocialLinksVariant,
} from '@/components/digital-menu/RestaurantSocialLinksSection';

type LiveMenuSocialLinksProps = {
  socialLinks: PublicRestaurantSocialLinks | null | undefined;
  placement: string | null | undefined;
  slot: LiveMenuSocialPlacement;
  /** Override derived layout. Prefer letting slot choose the variant. */
  variant?: SocialLinksVariant;
  cartBarInset?: boolean;
  className?: string;
};

function variantForSlot(slot: LiveMenuSocialPlacement): SocialLinksVariant {
  switch (slot) {
    case 'intro':
      return 'intro';
    case 'cover':
      return 'cover';
    case 'before_menu':
      return 'beforeMenu';
    case 'footer':
    default:
      return 'default';
  }
}

export function LiveMenuSocialLinks({
  socialLinks,
  placement,
  slot,
  variant,
  cartBarInset = false,
  className,
}: LiveMenuSocialLinksProps) {
  if (!isSocialAtPlacement(placement, slot)) return null;
  if (!hasPublicSocialLinks(socialLinks)) return null;

  return (
    <RestaurantSocialLinksSection
      socialLinks={socialLinks}
      variant={variant ?? variantForSlot(slot)}
      cartBarInset={cartBarInset}
      className={className}
    />
  );
}
