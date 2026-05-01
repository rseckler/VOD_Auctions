/**
 * MiniMax LLM client — OpenAI-compatible endpoint, MiniMax-M2 only.
 *
 * ⚠️  Reasoning-Trap: M2 is a reasoning model. Reasoning tokens are deducted
 *     from max_tokens BEFORE visible output is generated.
 *     min safe: 300 (classification), 800 (summary), 2000 (bulk output).
 *     content === "" means ALL tokens went to reasoning — increase max_tokens.
 *
 * DSGVO: M2 server is Shanghai. Never pass customer PII (names, emails,
 * addresses, order IDs). Only public data and internal product metadata.
 */

const MINIMAX_API_HOST = process.env.MINIMAX_API_HOST ?? "https://api.minimax.io"
const MINIMAX_API_KEY  = process.env.MINIMAX_API_KEY

const REASONING_MIN_TOKENS = 300

export class MinimaxError extends Error {
  constructor(message: string, public readonly code?: number) {
    super(message)
    this.name = "MinimaxError"
  }
}

export class MinimaxBalanceEmptyError extends MinimaxError {
  constructor() {
    super("MiniMax balance empty (error 1008). Top up at https://platform.minimax.io → Billing.")
    this.name = "MinimaxBalanceEmptyError"
  }
}

export class MinimaxModelNotInPlanError extends MinimaxError {
  constructor(model: string) {
    super(`Model "${model}" not in current plan (error 2061). Token Plan supports MiniMax-M2 only.`)
    this.name = "MinimaxModelNotInPlanError"
  }
}

export interface M2Message {
  role: "system" | "user" | "assistant"
  content: string
}

export interface M2Options {
  /** Minimum 300 (reasoning model deducts reasoning tokens first). Default: 500. */
  max_tokens?: number
  temperature?: number
  /** Set to true to log reasoning_tokens to console (useful for cost visibility). Default: false. */
  log_reasoning?: boolean
}

export interface M2Result {
  content: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    reasoning_tokens: number
    total_tokens: number
  }
  model: string
}

/**
 * Send a chat completion request to MiniMax-M2.
 * Uses the OpenAI-compatible endpoint at api.minimax.io/v1/chat/completions.
 */
export async function m2Chat(messages: M2Message[], options: M2Options = {}): Promise<M2Result> {
  if (!MINIMAX_API_KEY) {
    throw new MinimaxError("MINIMAX_API_KEY not configured in environment.")
  }

  const max_tokens = Math.max(options.max_tokens ?? 500, REASONING_MIN_TOKENS)
  if ((options.max_tokens ?? 500) < REASONING_MIN_TOKENS) {
    console.warn(`[minimax] max_tokens ${options.max_tokens} < ${REASONING_MIN_TOKENS} — bumped to ${REASONING_MIN_TOKENS} (reasoning trap)`)
  }

  const body = {
    model: "MiniMax-M2",
    messages,
    max_tokens,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  }

  const res = await fetch(`${MINIMAX_API_HOST}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  // 429 = MiniMax maps error 1008 (balance empty) to HTTP 429
  if (res.status === 429) throw new MinimaxBalanceEmptyError()
  if (!res.ok) throw new MinimaxError(`HTTP ${res.status}`, res.status)

  const data = await res.json() as any

  const baseResp = data?.base_resp
  if (baseResp?.status_code === 1008) throw new MinimaxBalanceEmptyError()
  if (baseResp?.status_code === 2061) throw new MinimaxModelNotInPlanError("MiniMax-M2")
  if (baseResp && baseResp.status_code !== 0) {
    throw new MinimaxError(`MiniMax error ${baseResp.status_code}: ${baseResp.status_msg}`, baseResp.status_code)
  }

  const choice = data?.choices?.[0]
  const content: string = choice?.message?.content ?? ""
  const usage = data?.usage ?? {}
  const reasoning_tokens: number = usage?.completion_tokens_details?.reasoning_tokens ?? 0

  if (content === "") {
    console.warn(`[minimax] content is empty — all ${max_tokens} tokens went to reasoning. Increase max_tokens.`)
  }

  if (options.log_reasoning && reasoning_tokens > 0) {
    console.log(`[minimax] reasoning_tokens=${reasoning_tokens} completion_tokens=${usage.completion_tokens} total=${usage.total_tokens}`)
  }

  return {
    content,
    usage: {
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
      reasoning_tokens,
      total_tokens: usage.total_tokens ?? 0,
    },
    model: data?.model ?? "MiniMax-M2",
  }
}

/**
 * Strip <think>...</think> reasoning blocks from M2 response content.
 * MiniMax-M2 includes visible reasoning in <think> tags within the content field.
 * Always call this before using content as structured output or display text.
 */
export function stripThinking(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
}

/**
 * Quick connectivity check — returns true if M2 responds correctly.
 * Used by the health probe (costs ~$0.001 per call).
 */
export async function m2Ping(): Promise<{ ok: boolean; latency_ms: number; error?: string; reasoning_tokens?: number }> {
  const start = Date.now()
  try {
    const result = await m2Chat(
      [{ role: "user", content: "Reply with exactly: OK" }],
      { max_tokens: 300, log_reasoning: false }
    )
    const latency_ms = Date.now() - start
    return {
      ok: result.content.trim().length > 0,
      latency_ms,
      reasoning_tokens: result.usage.reasoning_tokens,
    }
  } catch (e: any) {
    return { ok: false, latency_ms: Date.now() - start, error: e?.message }
  }
}
