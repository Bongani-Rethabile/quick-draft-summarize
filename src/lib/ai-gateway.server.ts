import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Shared provider helper for the Lovable AI Gateway (server-only).
 * The gateway key is passed explicitly — read it from process.env inside
 * a server route handler or createServerFn handler, never at module scope.
 */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": apiKey,
    },
  });
}
