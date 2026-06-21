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
  whatsapp_phone: string | null;
  color_palette: string | null;
  takeout_enabled: boolean;
  delivery_enabled: boolean;
  owner_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RestaurantSchedule = {
  id: string;
  service_type: 'takeout' | 'delivery';
  day_of_week: number;
  opens_at: string;
  closes_at: string;
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
  approval_status: string;
  is_published: boolean;
  is_active: boolean;
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
