// supabase/functions/ask-gemini/index.ts
// Supabase Edge Function for Gemini BYOK (Bring Your Own Key) Proxy
// Securely proxies requests to Google Gemini using the caller's private API key
// NEVER accepts the API key from the client body — reads strictly from profiles.gemini_api_key

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestPayload {
  action: "parse_receipt" | "spending_overview";
  text?: string;
  summary?: Record<string, any>;
  prompt?: string;
}

function cleanAndCapOverviewText(rawText: string, maxWords: number = 120): string {
  const trimmed = rawText.trim().replace(/\$/g, '₹').replace(/\bUSD\b/g, 'INR');
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return trimmed;
  }

  const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
  let accumulated = "";
  for (const sentence of sentences) {
    const candidate = (accumulated + " " + sentence).trim();
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

  return words.slice(0, maxWords).join(" ") + "...";
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: "UNAUTHORIZED",
          message: "Missing Authorization header. You must be signed in.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Authenticate user via JWT
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "UNAUTHORIZED",
          message: "Invalid or expired session. Please sign in again.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch calling user's gemini_api_key strictly from profiles table (Service Role or RLS user client)
    const dbClient = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : supabaseUserClient;

    const { data: profile, error: profileError } = await dbClient
      .from("profiles")
      .select("gemini_api_key")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.gemini_api_key || !profile.gemini_api_key.trim()) {
      return new Response(
        JSON.stringify({
          error: "MISSING_KEY",
          message: "No Gemini API key set for this account. Set up your AI key in Settings to use this.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiApiKey = profile.gemini_api_key.trim();

    // 3. Parse and validate request body
    const body: RequestPayload & { image?: { base64: string; mimeType?: string } } = await req.json();
    const { action, text, summary, image } = body;

    let geminiPrompt = "";
    let isJsonResponse = false;

    if (action === "parse_receipt") {
      if ((!text || !text.trim()) && !image?.base64) {
        return new Response(
          JSON.stringify({
            error: "INVALID_REQUEST",
            message: "Missing text or image payload for receipt parsing.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      isJsonResponse = true;
      geminiPrompt = `
You are an expert financial assistant that parses transaction receipts, payment screenshots, and SMS alerts (such as Google Pay, PhonePe, Paytm, UPI, credit card notifications, bank receipts).

Given the payment receipt or transaction screenshot, extract the financial transaction details.
${text ? `\nRaw OCR Text:\n"""\n${text}\n"""` : ""}

Return a STRICT JSON object with these EXACT keys:
{
  "amount": <number, positive float/integer or null if not found>,
  "merchant_or_person": <string, name of payee/merchant/person or "Unknown">,
  "suggested_category": <string, choose the closest from: "Food & Dining", "Groceries", "Rent & Utilities", "Transport", "Shopping", "Entertainment", "Subscriptions", "Health", "Education", "Personal Care", "Travel", "Miscellaneous">,
  "suggested_type": <string, one of: "expense", "income", "lent", "borrowed">,
  "date_if_present": <string in "YYYY-MM-DD" format, or null if no valid date found in the receipt>
}

Rules:
1. "amount": Extract the primary transaction amount (e.g. ₹450 -> 450). Never include currency symbols.
2. "merchant_or_person": The party paid to or received from (e.g., "Swiggy", "Rahul Sharma", "Uber", "Amazon").
3. "suggested_type": If paid/debited -> "expense". If received/credited -> "income". If lent to someone -> "lent". If borrowed -> "borrowed". Default to "expense" for typical UPI/card payments.
4. Output STRICT JSON only. Do NOT include markdown code blocks or extra prose.
`;
    } else if (action === "spending_overview") {
      if (!summary) {
        return new Response(
          JSON.stringify({
            error: "INVALID_REQUEST",
            message: "Missing summary payload for AI spending overview.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Concrete deterministic trigger gate
      if (
        typeof summary.transactionCount === "number" &&
        typeof summary.distinctCategoriesCount === "number"
      ) {
        if (summary.transactionCount < 5 || summary.distinctCategoriesCount < 2) {
          return new Response(
            JSON.stringify({
              error: "INSUFFICIENT_DATA",
              message: "Log a few more transactions this month to unlock an overview",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      isJsonResponse = false;
      geminiPrompt = `You are a spending-pattern observer for a personal finance app, not a financial advisor. You will be given aggregated JSON data (totals, category breakdowns, percentages — never raw transaction lists).

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
  3. (Optional) Provide one concrete behavioral observation or relevant takeaway based strictly on these numbers.

Aggregated Monthly Financial Data (JSON):
${JSON.stringify(summary, null, 2)}
`;
    } else {
      return new Response(
        JSON.stringify({
          error: "INVALID_ACTION",
          message: "Invalid action. Supported actions are 'parse_receipt' and 'spending_overview'.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Call Google Gemini API using BYOK key
    const parts: any[] = [{ text: geminiPrompt }];
    if (image?.base64) {
      parts.push({
        inlineData: {
          mimeType: image.mimeType || "image/jpeg",
          data: image.base64.replace(/^data:image\/[a-zA-Z]+;base64,/, ""),
        },
      });
    }

    const geminiRequestBody: Record<string, any> = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.2,
      },
    };

    if (isJsonResponse) {
      geminiRequestBody.generationConfig.responseMimeType = "application/json";
    }

    // Active Gemini models ordered by capability and speed (prioritizing active models with lowest latency and highest capacity)
    const candidateModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
    ];

    let geminiResponse: Response | null = null;

    for (const model of candidateModels) {
      for (const ver of ["v1beta", "v1"] as const) {
        // Try query param authentication first
        let url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${encodeURIComponent(
          geminiApiKey
        )}`;

        let res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(geminiRequestBody),
        });

        // If query param is rejected with 401 or 403, try header auth only
        if (res.status === 401 || res.status === 403) {
          url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent`;
          res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiApiKey,
            },
            body: JSON.stringify(geminiRequestBody),
          });
        }

        if (res.ok) {
          geminiResponse = res;
          break;
        }

        const errClone = await res.clone().text().catch(() => "");
        let errJson: any = null;
        try {
          errJson = JSON.parse(errClone);
        } catch {
          // ignore
        }
        const errMsg = (errJson?.error?.message || "").toLowerCase();

        // If key is fundamentally invalid, stop immediately
        if (
          (res.status === 401 || res.status === 403) &&
          (errMsg.includes("api key") || errMsg.includes("unregistered") || errMsg.includes("not valid"))
        ) {
          geminiResponse = res;
          break;
        }

        // If user quota is completely exhausted, stop cascade
        if (res.status === 429 && errMsg.includes("quota")) {
          geminiResponse = res;
          break;
        }

        // On 503 (high demand), 500, 404, or 400 (unsupported model/config), keep cascading!
        geminiResponse = res;
      }

      if (geminiResponse && geminiResponse.ok) {
        break;
      }
      if (
        geminiResponse &&
        (geminiResponse.status === 401 || geminiResponse.status === 403 || geminiResponse.status === 429)
      ) {
        break;
      }
    }

    if (!geminiResponse) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_ERROR",
          message: "Could not establish connection with Google Gemini.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Handle Gemini API response codes with specific errors
    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      let errJson: any = null;
      try {
        errJson = JSON.parse(errText);
      } catch {
        // fallback
      }

      const status = geminiResponse.status;
      if (status === 503) {
        return new Response(
          JSON.stringify({
            error: "SERVICE_UNAVAILABLE",
            message: "Google Gemini is currently experiencing high demand. Please try again in a few moments.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (status === 400 || status === 403 || status === 401) {
        return new Response(
          JSON.stringify({
            error: "INVALID_KEY",
            message:
              errJson?.error?.message ||
              "Invalid Gemini API key. Please check and re-enter your key in Settings.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (status === 429) {
        return new Response(
          JSON.stringify({
            error: "RATE_LIMIT",
            message:
              "Gemini API rate limit or quota exceeded. Please wait a moment or check your API key quota at Google AI Studio.",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          error: "GEMINI_ERROR",
          message: errJson?.error?.message || `Gemini API returned error code ${status}.`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Extract generated content
    const geminiData = await geminiResponse.json();
    const candidate = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidate) {
      return new Response(
        JSON.stringify({
          error: "EMPTY_RESPONSE",
          message: "Gemini returned an empty response. Please try again.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsedResult: any = candidate;
    if (isJsonResponse) {
      try {
        // Clean markdown backticks if present
        let cleaned = candidate.trim();
        if (cleaned.startsWith("```json")) {
          cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
        } else if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
        }
        parsedResult = JSON.parse(cleaned);
      } catch {
        return new Response(
          JSON.stringify({
            error: "PARSE_ERROR",
            message: "Failed to parse structured JSON from Gemini response.",
            raw: candidate,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (action === "spending_overview") {
      parsedResult = cleanAndCapOverviewText(candidate, 120);
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        data: parsedResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: error?.message || "An unexpected error occurred in the ask-gemini Edge Function.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
