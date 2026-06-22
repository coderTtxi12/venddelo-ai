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

export type DeliveryProviderMeResponse = {
  provider: DeliveryProvider | null;
  member_role: string | null;
};
