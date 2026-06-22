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
};

export type DeliveryProviderMeResponse = {
  provider: DeliveryProvider | null;
  member_role: string | null;
  primary_zone: DeliveryProviderZone | null;
};

export type DeliveryProviderProfileUpdate = {
  company_name: string;
  responsible_name: string;
  responsible_phone: string;
  whatsapp_phone: string;
  service_zone_name: string;
  service_zone_polygon: GeoJsonPolygon;
  center_lat: number | null;
  center_lng: number | null;
  logo_base64: string | null;
  logo_file_name: string | null;
};
