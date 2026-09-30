import axios from 'axios';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Read lazily: dotenv.config() runs after module imports
const getModel = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';

interface ChatOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Ask OpenAI for a JSON object response (the prompt must mention JSON) */
  json?: boolean;
}

/**
 * Throws a "not configured" error (matched by controllers to return a clear message)
 * when no OpenAI API key is set.
 */
export function assertOpenAIConfigured(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured. Please add it to your .env file.');
  }
  return apiKey;
}

/**
 * Sends a system + user prompt to the OpenAI Chat Completions API and returns the response text.
 */
export async function chatCompletion({
  system,
  user,
  temperature = 0.3,
  maxTokens = 4000,
  timeoutMs = 60000,
  json = false
}: ChatOptions): Promise<string> {
  const apiKey = assertOpenAIConfigured();

  const response = await axios.post(
    OPENAI_API_URL,
    {
      model: getModel(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature,
      max_completion_tokens: maxTokens,
      ...(json && { response_format: { type: 'json_object' } })
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: timeoutMs
    }
  );

  const content: string | undefined = response.data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No response content from OpenAI API');
  }
  return content.trim();
}

/** Parses a JSON reply, tolerating markdown code fences around it. */
export function parseJsonResponse<T = any>(content: string): T {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned);
}
