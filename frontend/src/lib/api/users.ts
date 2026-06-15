import { apiRequest } from "./client";

export type User = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  plan: string;
  billing_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export function getMe(token: string) {
  return apiRequest<User>("/users/me", { token });
}

export function updateMe(
  token: string,
  data: { display_name?: string; avatar_url?: string },
) {
  return apiRequest<User>("/users/me", { method: "PATCH", token, body: data });
}
