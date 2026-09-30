import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../config/logger';

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5';

let client: Anthropic | null = null;

/**
 * Throws a "not configured" error (matched by controllers to return a clear message)
 * when no Anthropic API key is set.
 */
export function assertClaudeConfigured(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Please add it to your .env file.');
  }
}

function getClient(): Anthropic {
  assertClaudeConfigured();
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

interface AskClaudeOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

/**
 * Sends a single system + user prompt to Claude and returns the response text.
 * Refused requests are retried server-side on a fallback model; if the whole chain refuses, this throws.
 */
export async function askClaude({ system, prompt, maxTokens = 16000 }: AskClaudeOptions): Promise<string> {
  const response = await getClient().beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: prompt }]
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to process this request');
  }
  if (response.stop_reason === 'max_tokens') {
    logger.warn(`Claude response hit max_tokens (${maxTokens}); output may be truncated`);
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  if (!text) {
    throw new Error('No response content from Claude API');
  }
  return text;
}
