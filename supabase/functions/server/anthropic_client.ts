// ==============================================================================
// Production wiring of the Anthropic SDK (Deno only).
// Kept out of claude.ts so the pipeline can be unit tested in Node with an injected fake client.
// ==============================================================================

import Anthropic from "npm:@anthropic-ai/sdk";
import type { AnthropicFactory } from "./claude.ts";

export const createAnthropicClient: AnthropicFactory = (apiKey: string) =>
  new Anthropic({ apiKey }) as unknown as ReturnType<AnthropicFactory>;
