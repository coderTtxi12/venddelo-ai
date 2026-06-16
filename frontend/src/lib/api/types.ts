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
  option_groups: OptionGroup[];
};
