export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export type DeliveryProvider = {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'pending_review' | 'active' | 'rejected' | 'suspended';
  service_manually_enabled: boolean;
  responsible_name: string | null;
  responsible_phone: string | null;
  whatsapp_phone: string | null;
  logo_path: string | null;
  submitted_at: string | null;
};

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

export type DeliveryProviderZone = {
  id: string;
  name: string;
  polygon: GeoJsonPolygon | null;
  center_lat: number | null;
  center_lng: number | null;
  weather_mode: DeliveryWeatherMode;
  service_manually_enabled: boolean;
  restaurant_count: number;
};

export type DeliveryProviderZoneWrite = {
  name: string;
  polygon: GeoJsonPolygon;
  center_lat?: number | null;
  center_lng?: number | null;
};

export type DeliveryProviderMeResponse = {
  provider: DeliveryProvider | null;
  member_role: string | null;
  zones: DeliveryProviderZone[];
};

export type DeliveryProviderAdminInvite = {
  id: string;
  email: string;
  member_role: 'admin' | 'operator';
  created_at: string;
};

export type DeliveryProviderMember = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  member_role: 'owner' | 'admin' | 'operator' | 'dispatcher' | 'driver';
  created_at: string;
};

export type DeliveryProviderProfileUpdate = {
  company_name: string;
  responsible_name: string;
  responsible_phone: string;
  whatsapp_phone: string;
  logo_base64: string | null;
  logo_file_name: string | null;
};

export type DeliveryProviderScheduleKind = 'regular' | 'night';

export type DeliveryProviderSchedule = {
  id: string;
  schedule_kind: DeliveryProviderScheduleKind;
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

export type DeliveryProviderScheduleCreateInput = {
  schedule_kind: DeliveryProviderScheduleKind;
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

export type DeliveryProviderServiceStatusReason =
  | 'active'
  | 'manual_off'
  | 'outside_schedule';

export type DeliveryProviderServiceStatus = {
  manually_enabled: boolean;
  within_schedule: boolean;
  service_active: boolean;
  status_reason: DeliveryProviderServiceStatusReason;
  next_change_at: string | null;
  timezone: string;
};

export type DeliveryProviderServiceStatusUpdate = {
  manually_enabled: boolean;
};

export type DeliveryPaymentMethodKey = 'cash' | 'transfer' | 'card_terminal';

export type DeliveryProviderPaymentMethod = {
  id: string;
  method: DeliveryPaymentMethodKey;
  enabled: boolean;
};

export type DeliveryProviderPaymentMethodUpdate = {
  method: DeliveryPaymentMethodKey;
  enabled: boolean;
};

export type DeliveryWeatherMode = 'none' | 'light' | 'heavy' | 'intense';

export type OutsideTariffBracket = {
  min_km: number;
  max_km: number;
  repa_cents: number;
  mexy_cents: number;
  restaurant_cents: number;
  rain_light_cents: number;
  rain_heavy_cents: number;
};

export type InsideWeatherTariffs = {
  day_cents: number;
  night_cents: number;
};

export type DeliveryProviderPricingConfig = {
  inside_polygon: {
    none: InsideWeatherTariffs;
    light: InsideWeatherTariffs;
    heavy: InsideWeatherTariffs;
  };
  outside_polygon: {
    max_distance_km: number;
    brackets: OutsideTariffBracket[];
  };
};

export type DeliveryProviderPricingResponse = {
  weather_mode: DeliveryWeatherMode;
  config: DeliveryProviderPricingConfig;
};

export type DeliveryProviderPricingUpdate = {
  config: DeliveryProviderPricingConfig;
};

export type DeliveryProviderWeatherModeUpdate = {
  weather_mode: DeliveryWeatherMode;
};

export type DeliveryPricingSimulateRequest = {
  inside_polygon: boolean;
  distance_km?: number | null;
  is_night?: boolean;
  weather_mode?: DeliveryWeatherMode | null;
};

export type DeliveryPricingQuote = {
  available: boolean;
  reason: string | null;
  total_cents: number;
  repa_cents: number;
  mexy_cents: number;
  restaurant_cents: number;
  inside_polygon: boolean;
  distance_km: number | null;
  weather_mode: DeliveryWeatherMode;
  is_night: boolean;
};

export type DeliveryPartnershipRestaurant = {
  id: string;
  name: string;
  subdomain: string;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  whatsapp_phone: string | null;
  owner_display_name: string | null;
  owner_phone: string | null;
  logo_path: string | null;
  status: string;
  delivery_enabled: boolean;
};

export type DeliveryPartnershipRequest = {
  id: string;
  status: 'pending' | 'active' | 'suspended';
  is_default: boolean;
  created_at: string;
  activated_at: string | null;
  zone: { id: string; name: string };
  restaurant: DeliveryPartnershipRestaurant;
};

export type DeliveryAssignmentSettings = {
  offer_timeout_seconds: number;
  pre_free_eta_seconds: number;
  driver_location_staleness_seconds: number;
  min_protected_drivers: number;
  high_demand_available_drivers_max: number;
  high_demand_occupied_ratio: number;
  high_demand_pending_min: number;
  near_destination_radius_meters: number;
  max_extra_route_minutes: number;
  max_pickup_detour_minutes: number;
  max_destination_detour_minutes: number;
  max_active_packages_per_driver: number;
  assignment_retry_seconds: number;
  assignment_timeout_seconds: number;
  pre_free_speed_mps: number;
};

export type DeliveryAssignmentSettingsUpdate = Omit<
  DeliveryAssignmentSettings,
  'pre_free_speed_mps'
>;

export type DeliverySearchLeadTime = {
  prep_minutes: number;
  search_ahead_minutes: number;
};

export type DeliverySearchLeadTimeUpdate = DeliverySearchLeadTime;

export type DeliveryDriverStatus = 'invited' | 'active' | 'blocked';
export type DeliveryDriverCompartmentSize = 'normal' | 'grande';

export type DeliveryDriver = {
  id: string;
  user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  profile_photo_path: string;
  ine_document_path: string;
  license_document_path: string;
  insurance_document_path: string;
  credit_limit_cents: number;
  credit_held_cents: number;
  compartment_size: DeliveryDriverCompartmentSize;
  plate: string;
  motorcycle_brand: string;
  motorcycle_color: string;
  registered_zone_id: string | null;
  registered_zone_name: string | null;
  status: DeliveryDriverStatus;
  is_online: boolean;
};

export type DeliveryDriverCreateInput = {
  first_name: string;
  last_name: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  email: string;
  compartment_size: DeliveryDriverCompartmentSize;
  plate: string;
  motorcycle_brand: string;
  motorcycle_color: string;
  registered_zone_id?: string | null;
  credit_limit_cents?: number;
  profile_photo_base64: string;
  profile_photo_file_name?: string | null;
  ine_document_base64: string;
  ine_document_file_name?: string | null;
  license_document_base64: string;
  license_document_file_name?: string | null;
  insurance_document_base64: string;
  insurance_document_file_name?: string | null;
};

export type DeliveryDriverUpdateInput = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  email?: string;
  compartment_size?: DeliveryDriverCompartmentSize;
  plate?: string;
  motorcycle_brand?: string;
  motorcycle_color?: string;
  registered_zone_id?: string | null;
  credit_limit_cents?: number;
  status?: DeliveryDriverStatus;
};

export type DeliveryDriverDocumentsUpdateInput = {
  profile_photo_base64?: string;
  profile_photo_file_name?: string | null;
  ine_document_base64?: string;
  ine_document_file_name?: string | null;
  license_document_base64?: string;
  license_document_file_name?: string | null;
  insurance_document_base64?: string;
  insurance_document_file_name?: string | null;
};

export type DispatchMonitorMetrics = {
  drivers_online: number;
  drivers_offline: number;
  drivers_location_stale: number;
  requests_pending: number;
  requests_due_search: number;
  requests_in_progress: number;
  offers_open: number;
  credit_holds_active: number;
  drivers_credit_blocked: number;
  high_demand: boolean;
  requests_unassigned: number;
  high_demand_few_free?: boolean;
  high_demand_high_occupancy?: boolean;
  high_demand_large_queue?: boolean;
  high_demand_free_count?: number;
  high_demand_occupied_ratio?: number;
  assignment_timeout_seconds?: number;
  offer_timeout_seconds?: number;
  assignment_retry_seconds?: number;
  max_active_packages_per_driver?: number;
  tasks_backend?: string;
};

export type DispatchMonitorDriver = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_online: boolean;
  status: string;
  plate: string;
  motorcycle_color: string;
  compartment_size: string;
  profile_photo_path: string;
  last_lat: number | null;
  last_lng: number | null;
  location_updated_at: string | null;
  location_stale: boolean;
  location_age_seconds?: number | null;
  credit_limit_cents: number;
  credit_held_cents: number;
  credit_available_cents: number;
  credit_blocked: boolean;
  active_request_id: string | null;
  active_request_status: string | null;
  open_offer_id: string | null;
  is_pre_free?: boolean;
  pre_free_eta_seconds?: number | null;
  occupied_job_count?: number;
  active_package_count?: number;
};

export type DispatchMonitorSearchBlocker = {
  code: string;
  count: number;
};

export type DispatchMonitorRequest = {
  id: string;
  short_id: string;
  status: string;
  customer_name: string;
  customer_phone?: string;
  restaurant_name: string;
  restaurant_lat: number | null;
  restaurant_lng: number | null;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  payment_method: string;
  collect_cents: number;
  cash_denomination_cents?: number | null;
  search_at: string;
  ready_at: string;
  next_attempt_at: string;
  assignment_timeout_at?: string;
  is_due_search: boolean;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  last_assigned_driver_name?: string | null;
  dispatch_group_id: string | null;
  zone_name: string | null;
  package_size: string;
  package_count?: number;
  quoted_fee_cents?: number;
  notes?: string | null;
  last_case?: string | null;
  last_decision?: Record<string, unknown> | null;
  eligible_driver_count?: number;
  search_blockers?: DispatchMonitorSearchBlocker[];
  cycle_rejected_count?: number;
  cycle_silent_count?: number;
};

export type DispatchMonitorOffer = {
  id: string;
  request_id: string;
  short_id: string;
  driver_id: string;
  driver_name: string;
  status: string;
  case_applied: string;
  expires_at: string;
  customer_name: string;
  restaurant_name: string;
  dropoff_address?: string | null;
  score_json?: Record<string, unknown> | null;
};

export type DispatchMonitorCreditHold = {
  id: string;
  driver_id: string;
  driver_name: string;
  request_id: string;
  short_id: string;
  amount_cents: number;
  status: string;
  customer_name: string;
  restaurant_name: string;
};

export type DispatchMonitorRoute = {
  request_id: string;
  short_id: string;
  driver_id: string;
  driver_name: string;
  status: string;
  origin_lat: number;
  origin_lng: number;
  origin_label: string;
  destination_lat: number;
  destination_lng: number;
  destination_label: string;
};

export type DispatchMonitorSnapshot = {
  generated_at: string;
  metrics: DispatchMonitorMetrics;
  drivers: DispatchMonitorDriver[];
  requests: DispatchMonitorRequest[];
  offers: DispatchMonitorOffer[];
  credit_holds: DispatchMonitorCreditHold[];
  routes: DispatchMonitorRoute[];
};
