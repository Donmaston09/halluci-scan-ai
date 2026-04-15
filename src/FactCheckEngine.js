/**
 * FactCheckEngine.js
 * Handles core LLM logic with Multimodal (Vision) support & JSON recovery.
 */

import { jsonrepair } from 'jsonrepair';

export const GEMINI_MODELS = [
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro (Frontier)', speed: 'High Reasoning' },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash (Fast)', speed: 'Hyper-speed' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Refined)', speed: 'Balanced' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', speed: 'Efficient' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Legacy)', speed: 'Classic' }
];

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "number" },
          slide: { type: "string" },
          text: { type: "string" },
          type: { type: "string" },
          rawText: { type: "string" }
        },
        required: ["id", "slide", "text", "type", "rawText"]
      }
    }
  },
  required: ["claims"]
};

const AUDIT_SCHEMA = {
  type: "object",
  properties: {
    audits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "number" },
          verdict: { type: "string" },
          confidence: { type: "number" },
          epistemic_uncertainty: { type: "number" },
          aleatoric_uncertainty: { type: "number" },
          source_match: { type: "string" },
          reasoning: { type: "string" },
          bias_flags: { type: "array", items: { type: "string" } }
        },
        required: ["id", "verdict", "confidence", "epistemic_uncertainty", "aleatoric_uncertainty", "source_match", "reasoning", "bias_flags"]
      }
    }
  },
  required: ["audits"]
};

const getEndpoint = (modelId, apiKey) => 
  `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

const SYSTEM_PROMPTS = {
  extract: `Extract claims from the SLIDE DECK (text and visual figures/charts). Output MUST be valid JSON. 
  Example: { "claims": [{"id": 1, "slide": "1", "text": "...", "type": "fact", "rawText": "..."}] }`,
  
  audit: `You are a Skeptical Forensic Auditor. Your goal is to DISPROVE slide claims by finding subtle mismatches in the source material.
  IMPORTANT: Look at both text AND figures/charts. Detect visual hallucinations (e.g. chart showing 15% but source saying 10%).
  
  Check for:
  - Numeric Inaccuracy (especially in charts vs text).
  - Framing Bias.
  - Omission of Negative Qualifiers.
  
  Example Result (Hallucinated): { "audits": [{"id": 1, "verdict": "hallucinated", "confidence": 95, "epistemic_uncertainty": 0.1, "aleatoric_uncertainty": 0.2, "source_match": "The actual value is $5M, not $10M.", "reasoning": "Numeric inflation detected in the Bar Chart on slide 2.", "bias_flags": ["visual_hallucination"]}] }`
};

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

export async function callGemini(apiKey, modelId, system, user, schema = null, fileData = null, retryCount = 0) {
  const MAX_RETRIES = 3;
  
  try {
    const generationConfig = { 
      maxOutputTokens: 8192, 
      temperature: 0,
      responseMimeType: "application/json"
    };

    if (schema) {
      generationConfig.responseSchema = schema;
    }

    const parts = [{ text: `${system}\n\nUSER INPUT / CONTEXT:\n${user}` }];
    
    if (fileData) {
      parts.push({
        inline_data: {
          mime_type: fileData.mimeType,
          data: fileData.base64
        }
      });
    }

    const res = await fetch(getEndpoint(modelId, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const msg = errorData.error?.message || res.statusText;
      
      if ((res.status === 503 || res.status === 429) && retryCount < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        await sleep(backoffMs);
        return callGemini(apiKey, modelId, system, user, schema, fileData, retryCount + 1);
      }

      throw new Error(`Gemini Error (${res.status}): ${msg}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("AI response was blocked or empty.");
    }

    return text;
  } catch (err) {
    if (retryCount < MAX_RETRIES && (err.message.includes('fetch') || err.message.includes('network'))) {
      await sleep(1000);
      return callGemini(apiKey, modelId, system, user, schema, fileData, retryCount + 1);
    }
    throw err;
  }
}

function normalizeKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  
  const mapped = {};
  for (const key in obj) {
    // Map AI-variations to our standard keys
    let targetKey = key;
    if (key === 'sourceMatch' || key === 'evidence') targetKey = 'source_match';
    if (key === 'biasFlags') targetKey = 'bias_flags';
    if (key === 'epistemicUncertainty' || key === 'epitemic_uncertainity') targetKey = 'epistemic_uncertainty';
    if (key === 'aleatoricUncertainty' || key === 'aleatoric_uncertainity') targetKey = 'aleatoric_uncertainty';
    
    mapped[targetKey] = normalizeKeys(obj[key]);
  }
  return mapped;
}

function parseLLMJson(text) {
  try {
    const repaired = jsonrepair(text);
    const parsed = JSON.parse(repaired);
    return normalizeKeys(parsed);
  } catch (e) {
    console.error("Critical JSON Recovery Failed. Raw:", text);
    const snippet = text.length > 200 ? text.substring(0, 200) + "..." : text;
    throw new Error(`Structural Integrity Failure: [${snippet}]`);
  }
}

export async function runFullAudit(apiKey, modelId, slidesText, sourceText, slidesFileBase64, slidesMime, onProgress) {
  const mime = slidesMime || "application/pdf";
  const isSupported = mime.includes('pdf') || mime.includes('image');
  const slidesFile = (slidesFileBase64 && isSupported) ? { mimeType: mime, base64: slidesFileBase64 } : null;

  onProgress("Forensic Visual Extraction...", 10);
  const extractionRaw = await callGemini(apiKey, modelId, SYSTEM_PROMPTS.extract, slidesText, EXTRACTION_SCHEMA, slidesFile);
  const { claims } = parseLLMJson(extractionRaw);
  
  onProgress(`Visual Cross-referencing ${claims.length} claims...`, 40);
  const auditRaw = await callGemini(apiKey, modelId, SYSTEM_PROMPTS.audit, `CLAIMS:\n${JSON.stringify(claims)}\n\nSOURCE MATERIAL:\n${sourceText}`, AUDIT_SCHEMA, slidesFile);
  const { audits } = parseLLMJson(auditRaw);
  
  onProgress("Finalizing analysis...", 90);
  
  const results = claims.map(c => ({
    ...c,
    ...(audits.find(a => a.id === c.id) || {})
  }));
  
  onProgress("Audit Complete", 100);
  return results;
}
