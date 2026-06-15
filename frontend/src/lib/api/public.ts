import { apiRequest } from "./client";

export type PublicRestaurant = {
  name: string;
  subdomain: string;
  color_palette: string | null;
  whatsapp_phone: string | null;
  original_language: string;
};

export function getPublicRestaurant(subdomain: string) {
  return apiRequest<PublicRestaurant>(`/public/restaurants/${subdomain}`);
}
