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
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  logo_path: string | null;
  whatsapp_phone: string | null;
  color_palette: string | null;
  owner_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  sort_index: number;
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
  selection: "single" | "multi";
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
  option_groups: OptionGroup[];
};

export type FullMenu = {
  restaurant_id: string;
  categories: Category[];
  products: Product[];
};

export type OrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  selected_options: Record<string, unknown> | null;
  line_total_cents: number;
};

export type Order = {
  id: string;
  restaurant_id: string;
  type: string;
  customer_name: string;
  customer_phone: string;
  payment_method: string;
  subtotal_cents: number;
  total_cents: number;
  status: string;
  delivery_address: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
};

export type Promotion = {
  id: string;
  restaurant_id: string;
  name: string;
  type: string;
  scope: string;
  percent: number | null;
  amount_cents: number | null;
  min_order_cents: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  product_ids: string[];
  category_ids: string[];
};

export type AIJob = {
  id: string;
  restaurant_id: string;
  job_type: string;
  status: "pending" | "processing" | "completed" | "failed";
  input_ref: string | null;
  result_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type AIArtifact = {
  id: string;
  restaurant_id: string;
  entity_type: string;
  entity_id: string;
  field: string;
  original_value: string | null;
  optimized_value: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ScheduleInput = {
  service_type: "takeout" | "delivery";
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

export type PaymentMethodInput = {
  method: "cash" | "transfer" | "card_terminal";
  service_type: "takeout" | "delivery";
  enabled: boolean;
};

export type PublicOrderInput = {
  type: "takeout" | "delivery";
  customer_name: string;
  customer_phone: string;
  payment_method: string;
  delivery_address?: string;
  note?: string;
  items: {
    product_id: string;
    quantity: number;
    selected_options?: Record<string, unknown>;
  }[];
};
