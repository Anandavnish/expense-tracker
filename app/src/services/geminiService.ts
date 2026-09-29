// src/services/geminiService.ts
// Gemini AI integration for Receipt Scanning and Spending Overview
// Supports Supabase Edge Function 'ask-gemini' with seamless direct Gemini fallback
// Multimodal Gemini 2.0 Flash vision for reading receipts and screenshots without native OCR dependencies

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { TransactionType } from '../types/database';
import { useSettingsStore, getGeminiStorageKey, LEGACY_GEMINI_API_KEY_STORAGE_KEY } from '../store/settingsStore';
import { redactSensitiveFields } from './dataSanitizer';

import { normalizeAndMatchCategory } from './smsParser';

export interface ParsedReceiptData {
  amount: number | null;
  merchant_or_person: string;
  suggested_category: string;
  suggested_type: TransactionType;
  date_if_present: string | null;
  detected_bank_or_source?: string | null;
}

export interface ParseReceiptOptions {
  text?: string;
  imageUri?: string;
  base64?: string;
  mimeType?: string;
  availableCategories?: string[];
}

export interface GeminiResponse<T> {
  success: boolean;
  data?: T;
  error?:
    | 'MISSING_KEY'
    | 'INVALID_KEY'
    | 'RATE_LIMIT'
    | 'FUNCTION_UNAVAILABLE'
    | 'GENERIC_ERROR'
    | 'INSUFFICIENT_DATA';
  message?: string;
}

/**
 * Normalizes suggested transaction type from AI to app's TransactionType enum
 */
export function normalizeSuggestedType(type?: string): TransactionType {
  if (!type) return 'expense';
  const lower = type.toLowerCase().trim();
  if (lower === 'income') return 'income';
  if (lower === 'lent' || lower === 'borrow_given') return 'borrow_given';
  if (lower === 'borrowed' || lower === 'borrow_taken') return 'borrow_taken';
  return 'expense';
}

/**
 * Retrieves the Gemini API key from settingsStore, user-scoped AsyncStorage, or database profile
 */
async function resolveGeminiApiKey(): Promise<string | null> {
  // 1. Check in-memory store
  const storeKey = useSettingsStore.getState().geminiApiKey;
  if (storeKey && storeKey.trim()) {
    return storeKey.trim().replace(/^["']|["']$/g, '');
  }

  // 2. Remove legacy shared key if present to prevent leakage
  AsyncStorage.removeItem(LEGACY_GEMINI_API_KEY_STORAGE_KEY).catch(() => {});

  // 3. Resolve active user session
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    const storageKey = getGeminiStorageKey(userId);

    // 4. Check user-scoped local storage
    const localKey = await AsyncStorage.getItem(storageKey);
    if (localKey && localKey.trim()) {
      const cleaned = localKey.trim().replace(/^["']|["']$/g, '');
      useSettingsStore.setState({ geminiApiKey: cleaned, hasGeminiApiKey: true });
      return cleaned;
    }

    // 5. Fallback to Supabase profiles table for this specific user
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('gemini_api_key')
        .eq('id', userId)
        .single();
      if (profile?.gemini_api_key && profile.gemini_api_key.trim()) {
        const key = profile.gemini_api_key.trim().replace(/^["']|["']$/g, '');
        useSettingsStore.setState({ geminiApiKey: key, hasGeminiApiKey: true });
        await AsyncStorage.setItem(storageKey, key).catch(() => {});
        return key;
      }
    }
  } catch (err) {
    console.warn('[geminiService] Could not resolve key:', err);
  }

  return null;
}

export interface WorkingModelConfig {
  model: string;
  apiVersion: 'v1beta' | 'v1';
}

let cachedWorkingModel: WorkingModelConfig | null = null;
let cachedKeyForModel: string | null = null;

// Multi-generation fallback cascade ordered by capability and speed (prioritizing active models with lowest latency and highest capacity)
const FALLBACK_MODEL_CANDIDATES = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-2.5-pro',
];

/**
 * Dynamically queries Google Generative Language API ListModels endpoint
 * to discover the exact model names supported by the user's specific API key.
 */
export async function resolveWorkingGeminiModel(
  rawApiKey: string
): Promise<WorkingModelConfig> {
  const apiKey = rawApiKey.trim().replace(/^["']|["']$/g, '');

  if (cachedKeyForModel === apiKey && cachedWorkingModel) {
    return cachedWorkingModel;
  }

  // 1. Attempt ListModels on v1beta, then v1
  for (const apiVersion of ['v1beta', 'v1'] as const) {
    try {
      // Try query-param auth only (passing both query param and header can trigger 400 Bad Request)
      let listUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(apiKey)}`;
      let res = await fetch(listUrl);

      // If query-param is rejected, try header auth only
      if (!res.ok) {
        listUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models`;
        res = await fetch(listUrl, {
          headers: { 'x-goog-api-key': apiKey },
        });
      }

      if (res.ok) {
        const body = await res.json();
        const models: any[] = body.models || [];
        // Filter models that support generateContent
        const supported = models.filter(
          (m) =>
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent')
        );

        if (supported.length > 0) {
          // Priority 1: Flash-Lite models (highest availability, lowest latency, immune to high-demand 503s)
          const flashLite = supported.find((m) => {
            const n = (m.name || '').toLowerCase();
            return (n.includes('3.5') || n.includes('3.1') || n.includes('latest')) && n.includes('flash-lite');
          });
          // Priority 2: 3.8 Flash (stable, fast)
          const flash38 = supported.find((m) => (m.name || '').toLowerCase().includes('3.8-flash'));
          // Priority 3: 3.5 Flash
          const flash35 = supported.find((m) => (m.name || '').toLowerCase().includes('3.5-flash'));
          // Priority 4: Any Flash model
          const anyFlash = supported.find((m) => (m.name || '').toLowerCase().includes('flash'));
          // Priority 5: Pro models
          const anyPro = supported.find((m) => (m.name || '').toLowerCase().includes('pro'));
          const chosen = flashLite || flash38 || flash35 || anyFlash || anyPro || supported[0];
          const cleanModelName = (chosen.name || '').replace(/^models\//, '');
          if (cleanModelName) {
            const config: WorkingModelConfig = { model: cleanModelName, apiVersion };
            cachedWorkingModel = config;
            cachedKeyForModel = apiKey;
            return config;
          }
        }
      }
    } catch {
      // Continue to next version
    }
  }

  // 2. Default fallback if ListModels was unavailable
  const defaultConfig: WorkingModelConfig = { model: 'gemini-3.5-flash-lite', apiVersion: 'v1beta' };
  return defaultConfig;
}

/**
 * Validates an API key with Google Gemini and discovers its active model
 */
export async function validateGeminiApiKey(
  rawApiKey: string
): Promise<{ valid: boolean; model?: string; error?: string }> {
  const apiKey = rawApiKey.trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    return { valid: false, error: 'Please enter a valid API key.' };
  }

  try {
    for (const apiVersion of ['v1beta', 'v1'] as const) {
      // Try query-param auth only
      let listUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(apiKey)}`;
      let res = await fetch(listUrl);

      // Try header auth only if query param failed
      if (!res.ok) {
        listUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models`;
        res = await fetch(listUrl, {
          headers: { 'x-goog-api-key': apiKey },
        });
      }

      if (res.ok) {
        const body = await res.json();
        const models: any[] = body.models || [];
        const supported = models.filter(
          (m) =>
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent')
        );
        const flashLite = supported.find((m) => {
          const n = (m.name || '').toLowerCase();
          return (n.includes('3.5') || n.includes('3.1') || n.includes('latest')) && n.includes('flash-lite');
        });
        const flash38 = supported.find((m) => (m.name || '').toLowerCase().includes('3.8-flash'));
        const flash35 = supported.find((m) => (m.name || '').toLowerCase().includes('3.5-flash'));
        const anyFlash = supported.find((m) => (m.name || '').toLowerCase().includes('flash'));
        const chosen = flashLite || flash38 || flash35 || anyFlash || supported[0];
        const cleanName = chosen ? (chosen.name || '').replace(/^models\//, '') : 'gemini-3.5-flash-lite';

        cachedWorkingModel = { model: cleanName, apiVersion };
        cachedKeyForModel = apiKey;

        return { valid: true, model: cleanName };
      }

      const errJson = await res.json().catch(() => null);
      const errMsg = errJson?.error?.message;
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return {
          valid: false,
          error: errMsg || 'Invalid API key. Please check your key at aistudio.google.com',
        };
      }
    }

    // Direct test if ListModels is restricted
    const testRes = await callGeminiDirect(apiKey, 'ping', undefined, false);
    if (testRes.success) {
      return { valid: true, model: cachedWorkingModel?.model || 'gemini-3.5-flash-lite' };
    }
    return { valid: false, error: testRes.message || 'Could not validate key with Google Gemini.' };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Network error connecting to Google Gemini.' };
  }
}

/**
 * Direct call to Google Gemini REST API with dynamic model resolution and multi-model cascade
 */
async function callGeminiDirect(
  apiKey: string,
  prompt: string,
  inlineData?: { mimeType: string; data: string },
  isJson: boolean = false
): Promise<GeminiResponse<any>> {
  const cleanedKey = apiKey.trim().replace(/^["']|["']$/g, '');
  try {
    const parts: any[] = [{ text: prompt }];
    if (inlineData) {
      parts.push({
        inlineData: {
          mimeType: inlineData.mimeType,
          data: inlineData.data,
        },
      });
    }

    const requestBody: Record<string, any> = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.2,
        ...(isJson ? { responseMimeType: 'application/json' } : {}),
      },
    };

    // 1. Resolve candidate models to try
    const modelConfig = await resolveWorkingGeminiModel(cleanedKey);

    const candidateAttempts: { model: string; apiVersion: 'v1beta' | 'v1' }[] = [
      modelConfig,
    ];

    for (const m of FALLBACK_MODEL_CANDIDATES) {
      if (m !== modelConfig.model) {
        candidateAttempts.push({ model: m, apiVersion: 'v1beta' });
        candidateAttempts.push({ model: m, apiVersion: 'v1' });
      } else {
        const altVer = modelConfig.apiVersion === 'v1beta' ? 'v1' : 'v1beta';
        candidateAttempts.push({ model: m, apiVersion: altVer });
      }
    }

    let lastErrorStatus: number | null = null;
    let lastErrorMessage: string = '';

    // 2. Cascade through models until success or decisive error (e.g. invalid key)
    for (const attempt of candidateAttempts) {
      const geminiUrl = `https://generativelanguage.googleapis.com/${attempt.apiVersion}/models/${attempt.model}:generateContent?key=${encodeURIComponent(cleanedKey)}`;

      let response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // If query-param auth was rejected, try header auth only
      if (response.status === 401 || response.status === 403) {
        const headerUrl = `https://generativelanguage.googleapis.com/${attempt.apiVersion}/models/${attempt.model}:generateContent`;
        const retryRes = await fetch(headerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanedKey,
          },
          body: JSON.stringify(requestBody),
        });
        if (retryRes.ok || retryRes.status !== 404) {
          response = retryRes;
        }
      }

      if (response.ok) {
        // Cache this verified working model
        cachedWorkingModel = attempt;
        cachedKeyForModel = cleanedKey;

        const data = await response.json();
        const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!candidate) {
          return {
            success: false,
            error: 'GENERIC_ERROR',
            message: 'No response received from Gemini.',
          };
        }

        let parsedResult = candidate;
        if (isJson) {
          try {
            let cleaned = candidate.trim();
            if (cleaned.startsWith('```json')) {
              cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
            } else if (cleaned.startsWith('```')) {
              cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
            }
            parsedResult = JSON.parse(cleaned);
          } catch {
            return {
              success: false,
              error: 'GENERIC_ERROR',
              message: "Couldn't parse financial details from this receipt.",
            };
          }
        }

        return {
          success: true,
          data: parsedResult,
        };
      }

      // Read Google's error payload for detailed diagnostics
      lastErrorStatus = response.status;
      try {
        const errJson = await response.json();
        lastErrorMessage = errJson?.error?.message || '';
      } catch {
        lastErrorMessage = '';
      }

      const lowerMsg = lastErrorMessage.toLowerCase();

      // Check if it's an explicit API key authentication failure
      const isAuthError =
        (lastErrorStatus === 401 || lastErrorStatus === 403) &&
        (lowerMsg.includes('api key') ||
          lowerMsg.includes('unregistered') ||
          lowerMsg.includes('not valid') ||
          lowerMsg.includes('key not found'));

      if (isAuthError) {
        return {
          success: false,
          error: 'INVALID_KEY',
          message: lastErrorMessage || 'Invalid Gemini API key. Please check your key in Settings.',
        };
      }

      // Check if account quota is completely exhausted
      if (lastErrorStatus === 429 && lowerMsg.includes('quota')) {
        return {
          success: false,
          error: 'RATE_LIMIT',
          message: lastErrorMessage || 'Gemini API quota exceeded or rate limit reached. Please try again later.',
        };
      }

      // Transient errors: 503 (model overloaded / high demand), 500 (internal), 404 (model not found),
      // 400 (model deprecated or generateContent unsupported for this model)
      // Log and seamlessly continue to the next candidate model in the cascade!
      console.warn(
        `[geminiService] Model attempt ${attempt.model} (${attempt.apiVersion}) failed with status ${lastErrorStatus}: ${lastErrorMessage}. Trying next candidate in cascade...`
      );
      continue;
    }

    // Reset cached model if everything failed so subsequent requests re-probe fresh
    cachedWorkingModel = null;
    cachedKeyForModel = null;

    if (lastErrorStatus === 503) {
      return {
        success: false,
        error: 'GENERIC_ERROR',
        message: 'Google Gemini is currently experiencing high demand. Please try again in a few moments.',
      };
    }

    if (lastErrorStatus === 404) {
      return {
        success: false,
        error: 'GENERIC_ERROR',
        message: lastErrorMessage || 'No compatible Gemini model found for this API key.',
      };
    }

    return {
      success: false,
      error: 'GENERIC_ERROR',
      message: lastErrorMessage || `Gemini API returned error code ${lastErrorStatus || 500}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'GENERIC_ERROR',
      message: err?.message || 'Network error communicating with Gemini API.',
    };
  }
}


/**
 * Parses transaction details from a receipt image or raw text using Gemini AI
 * Works 100% reliably in Expo Go, Dev Client, and standalone builds.
 */
export async function parseReceiptWithGemini(
  input: string | ParseReceiptOptions
): Promise<GeminiResponse<ParsedReceiptData>> {
  try {
    const apiKey = await resolveGeminiApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'MISSING_KEY',
        message: 'Set up your AI key in Settings to use this.',
      };
    }

    let rawText: string | undefined;
    let base64Data: string | undefined;
    let mimeType = 'image/jpeg';

    if (typeof input === 'string') {
      rawText = input;
    } else {
      rawText = input.text;
      base64Data = input.base64;
      if (input.mimeType) {
        mimeType = input.mimeType;
      } else if (input.imageUri?.toLowerCase().endsWith('.png')) {
        mimeType = 'image/png';
      }

      // If we have an imageUri but no base64, read it using expo-file-system
      if (!base64Data && input.imageUri) {
        try {
          base64Data = await FileSystem.readAsStringAsync(input.imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (fsErr) {
          console.warn('[geminiService] Failed reading image file as base64:', fsErr);
        }
      }
    }

    if (!rawText && !base64Data) {
      return {
        success: false,
        error: 'GENERIC_ERROR',
        message: "Couldn't read that screenshot — enter it manually",
      };
    }

    // Try Supabase Edge Function first if available
    let edgeSuccess = false;
    let edgeData: any = null;
    let edgeError: any = null;

    try {
      const { data, error } = await supabase.functions.invoke('ask-gemini', {
        body: {
          action: 'parse_receipt',
          text: rawText,
          image: base64Data ? { base64: base64Data, mimeType } : undefined,
        },
      });

      if (!error && data?.success && data?.data) {
        edgeSuccess = true;
        edgeData = data.data;
      } else if (error) {
        edgeError = error;
      }
    } catch (e) {
      edgeError = e;
    }

    const userCats =
      typeof input === 'object' && input.availableCategories && input.availableCategories.length > 0
        ? input.availableCategories
        : [
            'Food',
            'Travel',
            'Hostel/Rent',
            'Recharge/Data',
            'Subscriptions',
            'Books/Stationery',
            'Shopping',
            'Entertainment',
            'Other',
          ];

    // If Edge Function succeeded, use its result
    if (edgeSuccess && edgeData) {
      const normalizedCat = normalizeAndMatchCategory(edgeData.suggested_category, userCats).category;
      const parsed: ParsedReceiptData = {
        amount: typeof edgeData.amount === 'number' && !isNaN(edgeData.amount) ? Math.abs(edgeData.amount) : null,
        merchant_or_person: (edgeData.merchant_or_person || '').trim() || 'Unknown',
        suggested_category: normalizedCat,
        suggested_type: normalizeSuggestedType(edgeData.suggested_type),
        date_if_present: typeof edgeData.date_if_present === 'string' ? edgeData.date_if_present.trim() : null,
        detected_bank_or_source: typeof edgeData.detected_bank_or_source === 'string' ? edgeData.detected_bank_or_source.trim() : null,
      };
      return { success: true, data: parsed };
    }

    // If edge function returned an auth/key error, report it directly
    if (edgeError) {
      const handled = await handleEdgeFunctionError(edgeError);
      if (handled.error === 'MISSING_KEY' || handled.error === 'INVALID_KEY' || handled.error === 'RATE_LIMIT') {
        return handled;
      }
    }

    // Direct Gemini fallback (works with BYOK when edge function is un-deployed or offline)
    let prompt = `
You are an expert financial assistant that parses transaction receipts, payment screenshots, and SMS alerts (such as Google Pay, PhonePe, Paytm, UPI, credit card notifications, bank receipts).

Given the payment receipt, transaction screenshot, or text, extract the financial transaction details.

Return a STRICT JSON object with these EXACT keys:
{
  "amount": <number, positive float/integer or null if not found>,
  "merchant_or_person": <string, name of payee/merchant/person or "Unknown">,
  "suggested_category": <string, choose or match the best category from: ${userCats.join(', ')}. If it is a food/sweet/restaurant/grocery merchant like Gopal Sweet, Zomato, Swiggy, Blinkit, choose "Food">,
  "suggested_type": <string, one of: "expense", "income", "lent", "borrowed">,
  "date_if_present": <string in "YYYY-MM-DD" format, or null if no valid date found in the receipt>,
  "detected_bank_or_source": <string, name of the payer's source bank, card, or account (e.g. "State Bank of India", "SBI", "HDFC Bank", "Fino Payments Bank", "Slice", "Paytm Bank", or account digits like "0186"), or null if not mentioned. NOTE: Extract ONLY the payer's source of funds, NOT the payee's recipient bank or VPA handle>
}

Rules:
1. "amount": Extract the primary transaction amount (e.g. ₹450 -> 450). Never include currency symbols.
2. "merchant_or_person": The party paid to or received from (e.g., "Gopal Sweet", "Swiggy", "Rahul Sharma", "Uber", "Amazon").
3. "suggested_type": If paid/debited -> "expense". If received/credited -> "income". If lent to someone -> "lent". If borrowed -> "borrowed". Default to "expense" for typical UPI/card payments.
4. "detected_bank_or_source": The payer's source bank or card from "From:", "Paid using", "Debited from", or bank logos. Do NOT use the recipient's bank handle (e.g. in "Paid to Gopal Sweet gopalsweet@okhdfcbank", the payer bank is NOT HDFC).
5. Output STRICT JSON only. Do NOT include markdown code blocks or extra prose.
`;
    if (rawText) {
      prompt += `\n\nRaw Text:\n"""\n${rawText}\n"""`;
    }

    const inlineData = base64Data
      ? {
          mimeType,
          data: base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, ''),
        }
      : undefined;

    const directRes = await callGeminiDirect(apiKey, prompt, inlineData, true);

    if (!directRes.success || !directRes.data) {
      return {
        success: false,
        error: directRes.error || 'GENERIC_ERROR',
        message: directRes.message || "Couldn't read that screenshot — enter it manually",
      };
    }

    const raw = directRes.data;
    const normalizedDirectCat = normalizeAndMatchCategory(raw.suggested_category, userCats).category;
    const parsed: ParsedReceiptData = {
      amount: typeof raw.amount === 'number' && !isNaN(raw.amount) ? Math.abs(raw.amount) : null,
      merchant_or_person: (raw.merchant_or_person || '').trim() || 'Unknown',
      suggested_category: normalizedDirectCat,
      suggested_type: normalizeSuggestedType(raw.suggested_type),
      date_if_present: typeof raw.date_if_present === 'string' ? raw.date_if_present.trim() : null,
      detected_bank_or_source: typeof raw.detected_bank_or_source === 'string' ? raw.detected_bank_or_source.trim() : null,
    };

    if (parsed.amount === null && (parsed.merchant_or_person === 'Unknown' || !parsed.merchant_or_person)) {
      return {
        success: false,
        error: 'GENERIC_ERROR',
        message: "Couldn't read financial details from that screenshot — please enter manually.",
      };
    }

    return {
      success: true,
      data: parsed,
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'GENERIC_ERROR',
      message: err?.message || "Couldn't read that screenshot — enter it manually",
    };
  }
}

/**
 * Classifies an unrecognized merchant or payee into an existing category using Gemini AI.
 * Results from this function are taught back into user_merchant_rules.
 */
export interface ClassifyMerchantOptions {
  merchantName: string;
  rawText?: string;
  availableCategories?: string[];
}

/**
 * Classifies an unrecognized merchant or payee into an existing category using Gemini AI.
 * Redacts sensitive fields (balances, account numbers, phone numbers, OTP codes) from raw text before escalation.
 * Results from this function are taught back into user_merchant_rules.
 */
export async function classifyMerchantWithGemini(
  inputOrMerchant: string | ClassifyMerchantOptions,
  availableCategories: string[] = []
): Promise<GeminiResponse<{ category: string; type: TransactionType }>> {
  try {
    const apiKey = await resolveGeminiApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'MISSING_KEY',
        message: 'Set up your AI key in Settings to use this.',
      };
    }

    const merchantName =
      typeof inputOrMerchant === 'string' ? inputOrMerchant : inputOrMerchant.merchantName;
    const rawText = typeof inputOrMerchant === 'object' ? inputOrMerchant.rawText : undefined;
    const categoriesInput =
      typeof inputOrMerchant === 'object' && inputOrMerchant.availableCategories
        ? inputOrMerchant.availableCategories
        : availableCategories;

    const cats =
      categoriesInput.length > 0
        ? categoriesInput
        : [
            'Food',
            'Travel',
            'Hostel/Rent',
            'Recharge/Data',
            'Subscriptions',
            'Books/Stationery',
            'Shopping',
            'Entertainment',
            'Other',
          ];

    // Redact sensitive banking fields from transaction text while keeping keywords & merchant context
    const redactedContext = rawText ? redactSensitiveFields(rawText) : null;

    const prompt = `
You are an expert financial classification assistant.
Given this Indian merchant or person name: "${merchantName}"
${redactedContext ? `Transaction Context (sensitive balances and account numbers redacted):\n"""\n${redactedContext}\n"""\n` : ''}
Classify them into EXACTLY ONE category from this allowed list:
${cats.join(', ')}

Also determine if this is typically an expense, income, lent money (borrow_given), or borrowed money (borrow_taken).

Return a STRICT JSON object:
{
  "suggested_category": <one of: ${cats.map((c) => `"${c}"`).join(', ')}>,
  "suggested_type": "expense" | "income" | "borrow_given" | "borrow_taken"
}
`;

    const res = await callGeminiDirect(apiKey, prompt, undefined, true);
    if (res.success && res.data) {
      const normalizedCat = normalizeAndMatchCategory(res.data.suggested_category, cats).category;
      const normalizedType = normalizeSuggestedType(res.data.suggested_type);
      return {
        success: true,
        data: {
          category: normalizedCat,
          type: normalizedType,
        },
      };
    }

    return {
      success: false,
      error: res.error || 'GENERIC_ERROR',
      message: res.message || 'Could not classify merchant.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'GENERIC_ERROR',
      message: err?.message || 'Error communicating with Gemini.',
    };
  }
}

/**
 * Targeted amount extraction fallback using Gemini AI when deterministic OCR extraction has low confidence.
 * Redacts sensitive fields (balances, account numbers, phone numbers, OTP codes) from raw text before escalation.
 */
export async function extractAmountWithGemini(input: {
  text?: string;
  base64?: string;
  mimeType?: string;
  imageUri?: string;
}): Promise<GeminiResponse<number>> {
  try {
    const apiKey = await resolveGeminiApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'MISSING_KEY',
        message: 'Set up your AI key in Settings to use this.',
      };
    }

    let base64Data = input.base64;
    const mimeType = input.mimeType || 'image/jpeg';
    if (!base64Data && input.imageUri) {
      try {
        base64Data = await FileSystem.readAsStringAsync(input.imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (e) {
        console.warn('[geminiService] Failed reading image for amount extraction:', e);
      }
    }

    // Redact sensitive balances, account numbers, and OTP codes before sending to Gemini
    const sanitizedText = input.text ? redactSensitiveFields(input.text) : '';

    const prompt = `
You are an expert financial assistant.
Extract ONLY the primary transaction amount (in Indian Rupees / INR) from this payment screenshot, receipt, or text.
Ignore reference numbers (like 12-digit UTR), account numbers (like last 4 digits), dates, phone numbers, or balances.
${sanitizedText ? `\nText (sensitive balances & accounts redacted):\n"""\n${sanitizedText}\n"""` : ''}

Return a STRICT JSON object:
{
  "amount": <number float/int or null if not found>
}
`;

    const inlineData = base64Data
      ? {
          mimeType,
          data: base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, ''),
        }
      : undefined;

    const res = await callGeminiDirect(apiKey, prompt, inlineData, true);
    if (res.success && res.data && typeof res.data.amount === 'number' && !isNaN(res.data.amount)) {
      return {
        success: true,
        data: Math.abs(res.data.amount),
      };
    }

    return {
      success: false,
      error: res.error || 'GENERIC_ERROR',
      message: res.message || 'Could not determine amount with Gemini.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'GENERIC_ERROR',
      message: err?.message || 'Error communicating with Gemini.',
    };
  }
}

export interface OcrSpatialBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function extractOcrSpatialBlocks(blocks?: any[]): OcrSpatialBlock[] {
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) return [];

  const results: OcrSpatialBlock[] = [];

  for (const block of blocks) {
    if (!block) continue;
    // If lines exist, extract lines for higher vertical resolution
    if (block.lines && Array.isArray(block.lines) && block.lines.length > 0) {
      for (const line of block.lines) {
        if (!line || !line.text || !line.text.trim()) continue;
        const box = line.boundingBox || block.boundingBox;
        const x = box ? (box.x ?? box.left ?? 0) : 0;
        const y = box ? (box.y ?? box.top ?? 0) : 0;
        const width = box ? box.width ?? 0 : 0;
        const height = box ? box.height ?? 0 : 0;

        results.push({
          text: redactSensitiveFields(line.text.trim()),
          x: Math.round(Number(x) || 0),
          y: Math.round(Number(y) || 0),
          width: Math.round(Number(width) || 0),
          height: Math.round(Number(height) || 0),
        });
      }
    } else if (block.text && block.text.trim()) {
      const box = block.boundingBox;
      const x = box ? (box.x ?? box.left ?? 0) : 0;
      const y = box ? (box.y ?? box.top ?? 0) : 0;
      const width = box ? box.width ?? 0 : 0;
      const height = box ? box.height ?? 0 : 0;

      results.push({
        text: redactSensitiveFields(block.text.trim()),
        x: Math.round(Number(x) || 0),
        y: Math.round(Number(y) || 0),
        width: Math.round(Number(width) || 0),
        height: Math.round(Number(height) || 0),
      });
    }
  }

  return results;
}

export interface SpatialEscalationOptions {
  blocks?: any[];
  rawText?: string;
  availableCategories?: string[];
  userAccounts?: { id: string; name: string; type: string }[];
}

export interface SpatialEscalationResult {
  amount: number | null;
  merchant_or_person: string;
  direction: 'sent' | 'received';
  transaction_datetime: string | null;
  detected_bank_or_source: string | null;
  suggested_category: string;
}

/**
 * Tier 2: Structured Text + Bounding Box Geometry Escalation via Gemini.
 * Sends ONLY a structured JSON array of text blocks with spatial coordinates (y-pos, width, height)
 * without transmitting raw pixels or image bytes.
 */
export async function escalateWithSpatialHierarchyGemini(
  input: SpatialEscalationOptions
): Promise<GeminiResponse<SpatialEscalationResult>> {
  try {
    const apiKey = await resolveGeminiApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'MISSING_KEY',
        message: 'Set up your AI key in Settings to use this.',
      };
    }

    let spatialBlocks = extractOcrSpatialBlocks(input.blocks);

    // If blocks array was empty but rawText was provided, create line blocks
    if (spatialBlocks.length === 0 && input.rawText && input.rawText.trim()) {
      const lines = input.rawText.trim().split(/\r?\n/).filter(Boolean);
      spatialBlocks = lines.map((line, idx) => ({
        text: redactSensitiveFields(line.trim()),
        x: 0,
        y: idx * 25,
        width: 100,
        height: 20,
      }));
    }

    if (spatialBlocks.length === 0) {
      return {
        success: false,
        error: 'INSUFFICIENT_DATA',
        message: 'No OCR text blocks available for spatial escalation.',
      };
    }

    const cats =
      input.availableCategories && input.availableCategories.length > 0
        ? input.availableCategories
        : [
            'Food',
            'Travel',
            'Hostel/Rent',
            'Recharge/Data',
            'Subscriptions',
            'Books/Stationery',
            'Shopping',
            'Entertainment',
            'Uncategorized',
          ];

    const accountNames = (input.userAccounts || []).map((a) => a.name);

    const prompt = `
You are an expert financial assistant analyzing on-device OCR layout geometry from an Indian payment receipt or screenshot (Google Pay, PhonePe, Paytm, BHIM, CRED, or banking app).

You are provided with a structured JSON array of OCR text blocks with spatial bounding box coordinates:
- "text": The recognized text. Note: sensitive account numbers and balances have been pre-redacted.
- "x": Horizontal coordinate from the left edge.
- "y": Vertical coordinate from top of screen (lower y means higher on screen).
- "width": Bounding box width.
- "height": Bounding box height (directly proportional to font size/prominence!).

SPATIAL & HIERARCHY RULES:
1. "amount": Identify the primary HERO payment amount.
   - The hero amount is rendered in the LARGEST font size (highest "height") and is usually positioned prominently near the upper-middle of the card ("y").
   - Disqualify 12-digit UTR numbers, account digits, phone numbers, or dates as amounts.
   - Return as a positive float/integer (e.g., 450.00 -> 450). Return null if no valid amount found.
2. "merchant_or_person": The counterparty or payee/payer name or UPI handle.
   - Typically located immediately above or below the hero amount or next to "Paid to", "To", "Received from". Return "Unknown" if not found.
3. "direction": Determine transaction direction:
   - "sent": If the user paid/debited/transferred/sent money (e.g., "You paid", "Paid to", "Payment to", "Debited from", "Money sent").
   - "received": If the user received/credited money (e.g., "Received from", "Credited to", "Money received", "Refund").
4. "transaction_datetime": The actual date and time stamped on the screen (e.g., "29 Sep 2026", "29-09-2026", "Sep 29, 2026, 14:32").
   - Format as "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss".
   - NEVER default to today or now — return null if no date is explicitly visible on the screen.
5. "detected_bank_or_source": The bank or money source name displayed on screen (e.g., "State Bank of India", "SBI", "HDFC", "ICICI", "Axis", "Kotak", "Paytm Payments Bank").
   ${accountNames.length > 0 ? `User's configured accounts: ${accountNames.join(', ')}` : ''}
   - Return null if no bank or account is explicitly shown.
6. "suggested_category": Choose the single most appropriate category from:
   ${cats.join(', ')}
   - If food, sweets, dining, or groceries (e.g., Gopal Sweet, Zomato, Swiggy, Blinkit), pick "Food".
   - If unknown or ambiguous, pick "Uncategorized".

STRUCTURED SPATIAL BLOCKS JSON:
\`\`\`json
${JSON.stringify(spatialBlocks, null, 2)}
\`\`\`

Return a STRICT JSON object only (no markdown formatting, no explanations):
{
  "amount": <number or null>,
  "merchant_or_person": <string>,
  "direction": "sent" | "received",
  "transaction_datetime": <string or null>,
  "detected_bank_or_source": <string or null>,
  "suggested_category": <string>
}
`;

    // Note: Tier 2 does NOT send inline image bytes! Only spatial text JSON!
    const res = await callGeminiDirect(apiKey, prompt, undefined, true);

    if (res.success && res.data) {
      const d = res.data;
      const normalizedCat = normalizeAndMatchCategory(d.suggested_category, cats).category;
      return {
        success: true,
        data: {
          amount: typeof d.amount === 'number' && !isNaN(d.amount) ? Math.abs(d.amount) : null,
          merchant_or_person: (d.merchant_or_person || '').trim() || 'Unknown',
          direction: d.direction === 'received' ? 'received' : 'sent',
          transaction_datetime: typeof d.transaction_datetime === 'string' ? d.transaction_datetime.trim() : null,
          detected_bank_or_source: typeof d.detected_bank_or_source === 'string' ? d.detected_bank_or_source.trim() : null,
          suggested_category: normalizedCat || 'Uncategorized',
        },
      };
    }

    return {
      success: false,
      error: res.error || 'GENERIC_ERROR',
      message: res.message || 'Spatial escalation with Gemini failed.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'GENERIC_ERROR',
      message: err?.message || 'Error communicating with Gemini during spatial escalation.',
    };
  }
}

export const SPENDING_OVERVIEW_SYSTEM_PROMPT = `You are a spending-pattern observer for a personal finance app, not a financial advisor. You will be given aggregated JSON data (totals, category breakdowns, percentages — never raw transaction lists).

STRICT RULES:
- CURRENCY: All transactions and amounts are in Indian Rupees (INR). ALWAYS format currency with the Indian Rupee symbol "₹" (e.g. ₹22,211, ₹2,929). NEVER use the dollar sign "$" or "USD".
- FINANCIAL LOGIC & ACCURACY:
  * When totalIncome > totalExpense: Income exceeded expenses, resulting in positive net savings (e.g. "With total income of ₹25,140 surpassing expenses of ₹22,211, you achieved net savings of ₹2,929"). NEVER claim that expenses "outpaced" income when savings are positive!
  * When totalExpense > totalIncome: Expenses exceeded income, resulting in a deficit (e.g. "Total expenses of ₹25,000 outpaced income of ₹20,000, creating a deficit of ₹5,000").
  * Ensure mathematical consistency and never generate self-contradictory claims.
- Every claim must be directly derivable from the JSON provided. Never invent a number, merchant, date, or month-over-month comparison that isn't explicitly present in the input.
- Never recommend specific financial products, investments, loans, insurance, or debt actions. You observe spending behavior only — never prescribe financial decisions.
- If this period is marked as a historical/closed period, use past tense and frame as a finalized retrospective summary, not in-progress pace advice.
- If no budget is present in the data, do NOT comment on budget adherence, budget tracking, or "staying within budget".
- Do NOT output section headers, labels, bullets, numbered lists, or prefixes (do NOT write 'SNAPSHOT:', 'PATTERN:', 'FLAG:', or 'NEXT STEP:').
- Write a clean, natural, cohesive 2-3 sentence financial summary (strictly under 100 words total) in plain language:
  1. Factually synthesize the core spending and saving/budget performance from the data.
  2. Highlight the most prominent spending pattern or top category behavior.
  3. (Optional) Provide one concrete behavioral observation or relevant takeaway based strictly on these numbers.`;

/**
 * Enforces the ~120-word cap on AI overview output and sanitizes currency symbols
 */
export function cleanAndCapOverviewText(rawText: string, maxWords: number = 120): string {
  // Defensive guardrail: sanitize any rogue dollar signs or USD labels to Indian Rupees (₹)
  let trimmed = rawText.trim().replace(/\$/g, '₹').replace(/\bUSD\b/g, 'INR');
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return trimmed;
  }

  // Find sentence endings before or near maxWords
  const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
  let accumulated = '';
  for (const sentence of sentences) {
    const candidate = (accumulated + ' ' + sentence).trim();
    const count = candidate.split(/\s+/).filter(Boolean).length;
    if (count <= maxWords) {
      accumulated = candidate;
    } else {
      break;
    }
  }

  if (accumulated.trim().length > 0) {
    return accumulated.trim();
  }

  return words.slice(0, maxWords).join(' ') + '...';
}

/**
 * Invokes Gemini AI to generate an on-demand plain-language spending overview
 */
export async function getSpendingOverviewWithGemini(
  summary: Record<string, any>
): Promise<GeminiResponse<string>> {
  // 1. Concrete deterministic trigger gate (defense-in-depth before calling Gemini)
  if (
    typeof summary.transactionCount === 'number' &&
    typeof summary.distinctCategoriesCount === 'number'
  ) {
    if (summary.transactionCount < 5 || summary.distinctCategoriesCount < 2) {
      return {
        success: false,
        error: 'INSUFFICIENT_DATA',
        message: 'Log a few more transactions this month to unlock an overview',
      };
    }
  }

  try {
    const apiKey = await resolveGeminiApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'MISSING_KEY',
        message: 'Set up your AI key in Settings to use this.',
      };
    }

    // Try Supabase Edge Function first
    try {
      const { data, error } = await supabase.functions.invoke('ask-gemini', {
        body: {
          action: 'spending_overview',
          summary,
        },
      });

      if (!error && data?.success && data?.data) {
        return {
          success: true,
          data: cleanAndCapOverviewText(String(data.data), 120),
        };
      }
    } catch {
      // Fall through to direct call
    }

    // Direct Gemini fallback with Tuned Prompt
    const buildPrompt = (retryConstraint?: string) => `
${SPENDING_OVERVIEW_SYSTEM_PROMPT}

${retryConstraint ? `\nCRITICAL RETRY REQUIREMENT: ${retryConstraint}\n` : ''}
Aggregated Monthly Financial Data (JSON):
${JSON.stringify(summary, null, 2)}
`;

    let directRes = await callGeminiDirect(apiKey, buildPrompt(), undefined, false);

    if (directRes.success && directRes.data) {
      let text = String(directRes.data).trim();
      const words = text.split(/\s+/).filter(Boolean);

      // Check if wildly over length (> 125 words)
      const isWildlyOver = words.length > 125;

      if (isWildlyOver) {
        const retryRes = await callGeminiDirect(
          apiKey,
          buildPrompt(
            `Your previous response was ${words.length} words. Re-generate strictly under 100 words in 2-3 natural sentences without any headings or labels.`
          ),
          undefined,
          false
        );
        if (retryRes.success && retryRes.data) {
          text = String(retryRes.data).trim();
        }
      }

      const capped = cleanAndCapOverviewText(text, 120);
      return {
        success: true,
        data: capped,
      };
    }

    return {
      success: false,
      error: directRes.error || 'GENERIC_ERROR',
      message: directRes.message || 'Failed to generate spending overview.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'GENERIC_ERROR',
      message: err?.message || 'Failed to generate spending overview.',
    };
  }
}

/**
 * Maps Supabase Edge Function error to user-friendly typed responses
 */
async function handleEdgeFunctionError(error: any): Promise<GeminiResponse<any>> {
  try {
    if (error.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.json();
        if (body.error === 'MISSING_KEY') {
          return {
            success: false,
            error: 'MISSING_KEY',
            message: 'Set up your AI key in Settings to use this.',
          };
        }
        if (body.error === 'INVALID_KEY') {
          return {
            success: false,
            error: 'INVALID_KEY',
            message: 'Invalid Gemini API key. Please check your key in Settings.',
          };
        }
        if (body.error === 'RATE_LIMIT') {
          return {
            success: false,
            error: 'RATE_LIMIT',
            message: 'Gemini API quota exceeded or rate limit reached. Please try again later.',
          };
        }
        if (body.message) {
          return {
            success: false,
            error: 'GENERIC_ERROR',
            message: body.message,
          };
        }
      } catch {
        // failed to parse body
      }
    }

    const errMsg = String(error.message || '');
    if (errMsg.includes('404') || errMsg.includes('not found') || error.status === 404) {
      return {
        success: false,
        error: 'FUNCTION_UNAVAILABLE',
        message: "The 'ask-gemini' Edge Function is not reachable.",
      };
    }

    if (errMsg.includes('MISSING_KEY') || errMsg.includes('No Gemini API key')) {
      return {
        success: false,
        error: 'MISSING_KEY',
        message: 'Set up your AI key in Settings to use this.',
      };
    }

    if (errMsg.includes('INVALID_KEY') || errMsg.includes('Invalid Gemini API key')) {
      return {
        success: false,
        error: 'INVALID_KEY',
        message: 'Invalid Gemini API key. Please check your key in Settings.',
      };
    }

    if (errMsg.includes('RATE_LIMIT') || errMsg.includes('quota')) {
      return {
        success: false,
        error: 'RATE_LIMIT',
        message: 'Gemini API quota exceeded or rate limit reached. Please try again later.',
      };
    }

    return {
      success: false,
      error: 'GENERIC_ERROR',
      message: errMsg || 'An error occurred while communicating with the AI service.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'GENERIC_ERROR',
      message: err?.message || 'AI service communication failure.',
    };
  }
}
