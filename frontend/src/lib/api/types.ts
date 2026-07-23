export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export class ApiError extends Error {
  code: string;
  httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type CursorPage<T> = {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
};

export type Restaurant = {
  id: string;
  name: string;
  subdomain: string;
  original_language: string;
  status: string;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  logo_path: string | null;
  cover_path: string | null;
  digital_menu_theme_id: string;
  digital_menu_promotions_category_enabled: boolean;
  digital_menu_promotions_category_name: string;
  digital_menu_limited_time_category_enabled: boolean;
  digital_menu_limited_time_category_name: string;
  whatsapp_phone: string | null;
  live_menu_social_enabled: boolean;
  live_menu_social_facebook_enabled: boolean;
  live_menu_social_instagram_enabled: boolean;
  live_menu_social_whatsapp_enabled: boolean;
  live_menu_social_placement: string;
  facebook_url: string | null;
  instagram_url: string | null;
  owner_contact_name: string | null;
  owner_phone: string | null;
  color_palette: string | null;
  takeout_enabled: boolean;
  delivery_enabled: boolean;
  branch_count: number | null;
  owner_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RestaurantMeResponse = {
  restaurant: Restaurant | null;
  member_role: string | null;
};

export type RestaurantAccessItem = {
  restaurant: Restaurant;
  member_role: 'owner' | 'admin';
  member_id: string;
  last_accessed_at: string | null;
};

export type RestaurantAccessListResponse = {
  items: RestaurantAccessItem[];
};

export type RestaurantAdminInvite = {
  id: string;
  email: string;
  created_at: string;
};

export type RestaurantMember = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  member_role: 'owner' | 'admin';
  created_at: string;
};

export type RestaurantSchedule = {
  id: string;
  service_type: 'takeout' | 'delivery';
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

export type RestaurantDeliveryPartnership = {
  id: string;
  provider_name: string;
  provider_slug: string;
  status: 'pending' | 'active' | 'suspended';
  is_default: boolean;
  created_at: string;
  activated_at: string | null;
};

export type RestaurantDeliveryPartnershipResponse = {
  partnership: RestaurantDeliveryPartnership | null;
};

export type DeliveryProviderScheduleKind = 'regular' | 'night';

export type DeliveryProviderSchedule = {
  id: string;
  schedule_kind: DeliveryProviderScheduleKind;
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

export type DeliveryProviderPaymentMethod = {
  id: string;
  method: 'cash' | 'transfer' | 'card_terminal';
  enabled: boolean;
};

export type RestaurantScheduleCreateInput = {
  service_type: 'takeout' | 'delivery';
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

export type RestaurantPaymentMethod = {
  id: string;
  method: 'cash' | 'transfer' | 'card_terminal';
  service_type: 'takeout' | 'delivery';
  enabled: boolean;
};

export type SubdomainAvailability = {
  subdomain: string;
  available: boolean;
  valid: boolean;
  message: string | null;
};

export type CategoryDisplayLayout = 'vertical' | 'horizontal' | 'grid';

export type Category = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  sort_index: number;
  display_layout: CategoryDisplayLayout | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type OptionItem = {
  id: string;
  label: string;
  price_delta_cents: number;
  sort_index: number;
  is_active: boolean;
};

export type ProductStatus = 'active' | 'inactive' | 'draft';

export type OptionGroup = {
  id: string;
  product_id: string;
  title: string;
  required: boolean;
  selection: 'single' | 'multi';
  min_selections: number;
  max_selections: number | null;
  sort_index: number;
  is_active: boolean;
  items: OptionItem[];
};

export type Product = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  image_path: string | null;
  image_url?: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  category_ids: string[];
  category_sort_indices?: Record<string, number>;
  option_groups: OptionGroup[];
};

export type Promotion = {
  id: string;
  restaurant_id: string;
  name: string;
  image_path: string | null;
  type: 'percent' | 'amount' | 'combo' | 'bundle' | '2x1';
  scope: 'product' | 'category' | 'order';
  percent: number | null;
  amount_cents: number | null;
  min_order_cents: number | null;
  starts_at: string | null;
  ends_at: string | null;
  bundle?: { get_quantity: number; pay_quantity: number; pairing_mode?: string } | null;
  schedule?: {
    weekdays: number[];
    use_time_window: boolean;
    daily_start_time: string | null;
    daily_end_time: string | null;
  } | null;
  recurrence_weekdays?: number[] | null;
  recurrence_start_time?: string | null;
  recurrence_end_time?: string | null;
  effective_status?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_ids: string[];
  category_ids: string[];
  option_item_ids?: string[];
};

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type OrderStatusSummary = {
  pending: number;
  confirmed: number;
  preparing: number;
  ready: number;
  delivered: number;
  cancelled: number;
  active: number;
  total: number;
};

export type OrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  product_image_path: string | null;
  quantity: number;
  unit_price_cents: number;
  selected_options: Record<string, string[]> | null;
  line_subtotal_cents: number;
  discount_cents: number;
  line_total_cents: number;
  applied_promotion_id: string | null;
  applied_discounts: AppliedOrderDiscount[];
};

export type AppliedOrderDiscount = {
  label: string;
  badge: string | null;
  discount_cents: number;
  applied: boolean;
};

export type Order = {
  id: string;
  restaurant_id: string;
  type: 'takeout' | 'delivery';
  customer_name: string;
  customer_phone: string;
  payment_method: 'cash' | 'transfer' | 'card_terminal';
  subtotal_cents: number;
  subtotal_before_discount_cents: number;
  discount_cents: number;
  total_cents: number;
  applied_order_promotion_id: string | null;
  applied_order_discounts: AppliedOrderDiscount[];
  status: OrderStatus;
  delivery_address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  delivery_fee_cents: number;
  cash_denomination_cents: number | null;
  cancellation_reason: string | null;
  idempotency_key: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
};
