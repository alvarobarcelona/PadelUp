import { supabase } from "./supabase";
import i18n from "./i18n";

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2000;

async function invokeAssistant(message: string) {
  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: { message, locale: i18n.language },
  });

  if (error) {
    let detail = error.message;
    try {
      if ("context" in error && error.context?.json) {
        const body = await error.context.json();
        detail = body?.error || detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data.reply as string;
}

export async function askAssistant(message: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await invokeAssistant(message);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`AI attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  console.error("AI Assistant Error (all retries failed):", lastError);
  throw lastError;
}
