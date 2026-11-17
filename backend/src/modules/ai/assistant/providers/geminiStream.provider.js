'use strict';

/**
 * Gemini Streaming Provider (`geminiStream.provider.js`).
 *
 * Uses official `@google/genai` (Google AI Studio `v1beta`) with:
 *   - Verified primary model (`gemini-3.5-flash-lite`) + automatic fallback (`gemini-3.5-flash`)
 *     on transient `429` / `5xx` / `404` errors before tokens are emitted.
 *   - Immediate token delta streaming for sub-second voice clause synthesis.
 *   - Full preservation of `candidates[0].content.parts` (`thought`, `thoughtSignature`,
 *     `functionCall`) across multi-pass tool-calling turns.
 *   - Immediate cancellation via `AbortSignal` on user barge-in.
 *   - Structured provider health probe (`checkGeminiHealth`) with error classification.
 */

const { GoogleGenAI } = require('@google/genai');
const { getAssistantConfig, redactSecrets } = require('../config/assistant.config');

let cachedClient = null;
let cachedApiKey = null;
let injectedStreamImpl = null;
let injectedHealthImpl = null;
let healthCache = { checkedAt: 0, result: null };
const HEALTH_CACHE_TTL_MS = 60 * 1000;

function getGeminiClient() {
  const cfg = getAssistantConfig();
  if (!cfg.geminiConfigured) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'GEMINI_NOT_CONFIGURED';
    err.category = 'auth';
    err.statusCode = 503;
    throw err;
  }
  if (!cachedClient || cachedApiKey !== cfg.geminiApiKey) {
    cachedClient = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
    cachedApiKey = cfg.geminiApiKey;
  }
  return cachedClient;
}

function classifyGeminiError(err) {
  const status = Number(err?.status || err?.statusCode || err?.code || 0);
  const rawMessage = redactSecrets(err?.message || 'Gemini LLM request failed');

  if (
    status === 401 ||
    status === 403 ||
    err?.code === 'GEMINI_NOT_CONFIGURED' ||
    /api[_-\s]?key.*invalid|permission_denied|unauthenticated|forbidden|api key not valid/i.test(rawMessage)
  ) {
    return {
      category: 'auth',
      message: 'AI language model authentication failed (check GEMINI_API_KEY).',
      detail: rawMessage,
    };
  }

  if (
    status === 429 ||
    /resource_exhausted|quota|rate[-_\s]?limit|too many requests|billing/i.test(rawMessage)
  ) {
    return {
      category: 'quota',
      message: 'AI language model quota or rate limit exceeded.',
      detail: rawMessage,
    };
  }

  if (
    status === 404 ||
    /not_found|models\/.*is not found|not supported for generateContent/i.test(rawMessage)
  ) {
    return {
      category: 'model_not_found',
      message: 'Configured Gemini model was not found on this API version.',
      detail: rawMessage,
    };
  }

  return {
    category: 'network',
    message: 'AI language model is temporarily unreachable.',
    detail: rawMessage,
  };
}

function isRetriableForFallbackModel(err) {
  const status = Number(err?.status || err?.statusCode || 0);
  const msg = String(err?.message || '');
  return (
    status === 404 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /resource_exhausted|unavailable|overloaded|not_found|internal|deadline_exceeded|timed out/i.test(msg)
  );
}

function setGeminiStreamImplForTest(fn) {
  injectedStreamImpl = fn;
}

function setGeminiHealthImplForTest(fn) {
  injectedHealthImpl = fn;
  healthCache = { checkedAt: 0, result: null };
}

async function consumeGeminiStream(streamIterable, { onTextDelta, onFirstToken, signal }) {
  let fullText = '';
  const functionCalls = [];
  const rawModelParts = [];
  let firstTokenLogged = false;
  let finishReason = null;
  let blockReason = null;

  for await (const chunk of streamIterable) {
    if (signal?.aborted) {
      const abortErr = new Error('Gemini stream aborted');
      abortErr.code = 'CLIENT_ABORTED';
      throw abortErr;
    }

    if (chunk?.candidates?.[0]?.finishReason) finishReason = String(chunk.candidates[0].finishReason);
    if (chunk?.promptFeedback?.blockReason) blockReason = String(chunk.promptFeedback.blockReason);

    const candidateParts = chunk?.candidates?.[0]?.content?.parts;
    if (Array.isArray(candidateParts) && candidateParts.length > 0) {
      for (const part of candidateParts) {
        // Preserve EVERY part (including `thought` and `thoughtSignature`) verbatim for Pass 2
        rawModelParts.push(part);

        if (part?.functionCall) {
          functionCalls.push({
            name: part.functionCall.name,
            args: part.functionCall.args || {},
            ...(part.functionCall.id ? { id: part.functionCall.id } : {}),
          });
          if (!firstTokenLogged) {
            firstTokenLogged = true;
            if (typeof onFirstToken === 'function') onFirstToken();
          }
        } else if (typeof part?.text === 'string' && part.text.length > 0 && !part.thought) {
          if (!firstTokenLogged) {
            firstTokenLogged = true;
            if (typeof onFirstToken === 'function') onFirstToken();
          }
          fullText += part.text;
          if (typeof onTextDelta === 'function') {
            onTextDelta(part.text);
          }
        }
      }
      continue;
    }

    // Support simplified mock chunks in unit tests (`{ text, functionCalls }`)
    if (Array.isArray(chunk?.functionCalls) && chunk.functionCalls.length > 0) {
      for (const fc of chunk.functionCalls) {
        functionCalls.push({
          name: fc.name,
          args: fc.args || {},
          ...(fc.id ? { id: fc.id } : {}),
        });
        rawModelParts.push({
          functionCall: {
            name: fc.name,
            args: fc.args || {},
            ...(fc.id ? { id: fc.id } : {}),
          },
        });
      }
      if (!firstTokenLogged) {
        firstTokenLogged = true;
        if (typeof onFirstToken === 'function') onFirstToken();
      }
    }

    if (typeof chunk?.text === 'string' && chunk.text.length > 0) {
      if (!firstTokenLogged) {
        firstTokenLogged = true;
        if (typeof onFirstToken === 'function') onFirstToken();
      }
      fullText += chunk.text;
      rawModelParts.push({ text: chunk.text });
      if (typeof onTextDelta === 'function') {
        onTextDelta(chunk.text);
      }
    }
  }

  return {
    text: fullText,
    functionCalls,
    rawModelParts,
    finishReason,
    blockReason,
  };
}

async function runGeminiStreamingPass({
  systemInstruction,
  contents,
  functionDeclarations = [],
  toolCallingMode = 'AUTO',
  modelOverride = null,
  temperature = 0.35,
  onTextDelta,
  onFirstToken,
  signal,
}) {
  if (signal?.aborted) {
    const abortErr = new Error('Gemini stream aborted');
    abortErr.code = 'CLIENT_ABORTED';
    throw abortErr;
  }

  const cfg = getAssistantConfig();
  const primaryModel =
    modelOverride && cfg.llmFallbackModel === modelOverride
      ? cfg.llmFallbackModel
      : cfg.llmPrimaryModel;
  const fallbackModel = cfg.llmFallbackModel;

  const buildGenConfig = () => {
    const genCfg = {
      systemInstruction,
      maxOutputTokens: cfg.llmMaxOutputTokens,
      temperature,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    };
    if (Array.isArray(functionDeclarations) && functionDeclarations.length > 0) {
      genCfg.tools = [{ functionDeclarations }];
      if (toolCallingMode === 'NONE') {
        genCfg.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
      }
    } else if (toolCallingMode === 'NONE') {
      genCfg.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
    }
    if (signal) {
      genCfg.abortSignal = signal;
    }
    return genCfg;
  };

  if (injectedStreamImpl) {
    const stream = await injectedStreamImpl({
      model: primaryModel,
      contents,
      config: buildGenConfig(),
    });
    const out = await consumeGeminiStream(stream, { onTextDelta, onFirstToken, signal });
    return { ...out, modelUsed: primaryModel };
  }

  const ai = getGeminiClient();
  let emittedTextCount = 0;
  const trackedDelta = (delta) => {
    emittedTextCount += delta.length;
    if (typeof onTextDelta === 'function') onTextDelta(delta);
  };

  const invokeModel = async (modelId) => {
    const stream = await ai.models.generateContentStream({
      model: modelId,
      contents,
      config: buildGenConfig(),
    });
    const out = await consumeGeminiStream(stream, {
      onTextDelta: trackedDelta,
      onFirstToken,
      signal,
    });
    return { ...out, modelUsed: modelId };
  };

  try {
    return await invokeModel(primaryModel);
  } catch (err) {
    if (signal?.aborted || err?.code === 'CLIENT_ABORTED' || err?.name === 'AbortError') {
      const abortErr = new Error('Gemini stream aborted');
      abortErr.code = 'CLIENT_ABORTED';
      throw abortErr;
    }

    if (
      emittedTextCount === 0 &&
      fallbackModel &&
      fallbackModel !== primaryModel &&
      isRetriableForFallbackModel(err)
    ) {
      try {
        return await invokeModel(fallbackModel);
      } catch (fallbackErr) {
        const classified = classifyGeminiError(fallbackErr);
        const wrapped = new Error(classified.message);
        wrapped.code = `GEMINI_${classified.category.toUpperCase()}`;
        wrapped.category = classified.category;
        wrapped.statusCode = classified.category === 'quota' ? 429 : 502;
        throw wrapped;
      }
    }

    const classified = classifyGeminiError(err);
    const wrapped = new Error(classified.message);
    wrapped.code = `GEMINI_${classified.category.toUpperCase()}`;
    wrapped.category = classified.category;
    wrapped.statusCode = classified.category === 'quota' ? 429 : 502;
    throw wrapped;
  }
}

async function checkGeminiHealth({ forceRefresh = false } = {}) {
  if (injectedHealthImpl) {
    return injectedHealthImpl();
  }

  const cfg = getAssistantConfig();
  if (!cfg.geminiConfigured) {
    return {
      ok: false,
      category: 'auth',
      primaryModel: cfg.llmPrimaryModel,
      fallbackModel: cfg.llmFallbackModel,
      message: 'GEMINI_API_KEY is missing.',
    };
  }

  if (String(process.env.NODE_ENV || '').trim() === 'test' && !forceRefresh) {
    return {
      ok: true,
      category: null,
      primaryModel: cfg.llmPrimaryModel,
      fallbackModel: cfg.llmFallbackModel,
      message: 'Gemini configured (isolated test mode)',
    };
  }

  const now = Date.now();
  if (!forceRefresh && healthCache.result && now - healthCache.checkedAt < HEALTH_CACHE_TTL_MS) {
    return healthCache.result;
  }

  try {
    const ai = getGeminiClient();
    await ai.models.get({ model: cfg.llmPrimaryModel });
    const okResult = {
      ok: true,
      category: null,
      primaryModel: cfg.llmPrimaryModel,
      fallbackModel: cfg.llmFallbackModel,
      message: 'Gemini reachable',
    };
    healthCache = { checkedAt: now, result: okResult };
    return okResult;
  } catch (err) {
    const classified = classifyGeminiError(err);
    const failResult = {
      ok: false,
      category: classified.category,
      primaryModel: cfg.llmPrimaryModel,
      fallbackModel: cfg.llmFallbackModel,
      message: classified.message,
    };
    healthCache = { checkedAt: now, result: failResult };
    return failResult;
  }
}

module.exports = {
  runGeminiStreamingPass,
  classifyGeminiError,
  checkGeminiHealth,
  setGeminiStreamImplForTest,
  setGeminiHealthImplForTest,
};

