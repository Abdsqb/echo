import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "../env";
import type { Usage } from "../types";

// USD per million tokens: [input, output, cache read]. Cache writes bill at 1.25x input.
const PRICES: Record<string, [number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
};

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1"];

export const MODEL_OPTIONS = Object.keys(PRICES);

export function costOf(model: string, u: Anthropic.Beta.BetaUsage): number {
  const [inp, out, read] = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
  const write = u.cache_creation_input_tokens ?? 0;
  const cached = u.cache_read_input_tokens ?? 0;
  return (u.input_tokens * inp + write * inp * 1.25 + cached * read + u.output_tokens * out) / 1_000_000;
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: env.anthropicKey() }));

export class AiError extends Error {}

type StructuredCall<S extends z.ZodType> = {
  schema: S;
  // Stable instructions first, then the cacheable voice profile, so repeated
  // calls reuse the cached prefix.
  system: string;
  cachedContext?: string;
  user: string;
  effort?: "low" | "medium" | "high";
  model?: string;
  // Deterministic stand-in used in mock mode (no API key / ECHO_MOCK_AI=1).
  mock: () => z.infer<S>;
};

export async function structured<S extends z.ZodType>(call: StructuredCall<S>): Promise<{ data: z.infer<S>; usage: Usage; model: string }> {
  const model = call.model ?? env.model();

  if (env.mockAi()) {
    return { data: call.mock(), usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, model: `mock:${model}` };
  }

  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: call.system }];
  if (call.cachedContext) system.push({ type: "text", text: call.cachedContext, cache_control: { type: "ephemeral" } });

  const useFallbacks = FALLBACK_MODELS.includes(model);

  let response;
  try {
    response = await getClient().beta.messages.parse({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: call.user }],
      output_config: { format: betaZodOutputFormat(call.schema), effort: call.effort ?? "medium" },
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("Claude API key is invalid");
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Claude rate limit hit; will retry later");
    if (err instanceof Anthropic.APIError) throw new AiError(`Claude API error ${err.status}: ${err.message}`);
    throw err;
  }

  if (response.stop_reason === "refusal") throw new AiError("Claude declined this request");
  if (response.stop_reason === "max_tokens") throw new AiError("Claude output was cut off (max_tokens)");
  if (response.parsed_output == null) throw new AiError("Claude returned output that did not match the schema");

  const usage: Usage = {
    inputTokens:
      response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
    costUsd: costOf(model, response.usage),
  };
  return { data: response.parsed_output as z.infer<S>, usage, model: response.model };
}

export const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  costUsd: a.costUsd + b.costUsd,
});
export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
