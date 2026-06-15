import { apiRequest } from "./client";
import type { AIArtifact, AIJob } from "./types";

export function startExtractMenu(
  token: string,
  restaurantId: string,
  file: File,
) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<AIJob>(`/restaurants/${restaurantId}/ai/jobs/extract-menu`, {
    method: "POST",
    token,
    body: form,
  });
}

export function startOptimizeMenu(token: string, restaurantId: string) {
  return apiRequest<AIJob>(`/restaurants/${restaurantId}/ai/jobs/optimize-menu`, {
    method: "POST",
    token,
  });
}

export function startPickPalette(token: string, restaurantId: string) {
  return apiRequest<AIJob>(`/restaurants/${restaurantId}/ai/jobs/pick-palette`, {
    method: "POST",
    token,
  });
}

export function getAIJob(token: string, restaurantId: string, jobId: string) {
  return apiRequest<AIJob>(`/restaurants/${restaurantId}/ai/jobs/${jobId}`, {
    token,
  });
}

export function listAIArtifacts(token: string, restaurantId: string) {
  return apiRequest<AIArtifact[]>(`/restaurants/${restaurantId}/ai/artifacts`, {
    token,
  });
}

export function revertAIArtifact(
  token: string,
  restaurantId: string,
  artifactId: string,
) {
  return apiRequest<AIArtifact>(
    `/restaurants/${restaurantId}/ai/artifacts/${artifactId}/revert`,
    { method: "POST", token },
  );
}
