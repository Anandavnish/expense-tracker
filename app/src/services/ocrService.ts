// src/services/ocrService.ts
// On-device OCR text recognition using expo-mlkit-ocr in the Expo managed workflow
// Extracts text and visual bounding boxes feeding into the unified transactionParser pipeline

import { isRunningInExpoGo } from 'expo';
import { OcrBlockInput } from './transactionParser';

export interface OcrResult {
  success: boolean;
  text: string;
  blocks?: OcrBlockInput[];
  error?: string;
}

/**
 * Performs on-device text recognition on an image URI using expo-mlkit-ocr.
 * Returns extracted text and structured OCR blocks with bounding boxes.
 * Safely handles environments where the native module is absent (e.g. Expo Go, web).
 */
export async function extractTextFromImage(imageUri: string): Promise<OcrResult> {
  // If running in Expo Go sandbox, native MLKit OCR is absent by design:
  // Skip requiring to avoid yellow LogBox warnings and cleanly delegate to Tier 3 Vision
  if (isRunningInExpoGo()) {
    console.log('[Boundary 1: ocrService] Expo Go sandbox detected: bypassing MLKit, delegating to Tier 3 Vision');
    return {
      success: false,
      text: '',
      error: 'expo-mlkit-ocr not available in Expo Go (using Tier 3 Vision fallback)',
    };
  }

  try {
    // Dynamically require for standalone builds / development builds
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mlkitOcr = require('expo-mlkit-ocr');
    if (mlkitOcr && typeof mlkitOcr.recognizeText === 'function') {
      const result = await mlkitOcr.recognizeText(imageUri);
      const text = result?.text || '';
      const blocks = result?.blocks || [];

      console.log('[Boundary 1: ocrService] extractTextFromImage completed successfully:', {
        success: true,
        textLength: text.length,
        blockCount: blocks.length,
        preview: text.substring(0, 100).replace(/\n/g, ' '),
      });

      return {
        success: true,
        text,
        blocks,
      };
    }
  } catch (err: any) {
    console.warn('[Boundary 1: ocrService] expo-mlkit-ocr extraction failed or unavailable:', err?.message);
    return {
      success: false,
      text: '',
      error: err?.message || 'On-device OCR failed or native module unavailable',
    };
  }

  console.warn('[Boundary 1: ocrService] expo-mlkit-ocr module not available in this environment');
  return {
    success: false,
    text: '',
    error: 'expo-mlkit-ocr module not available in this environment',
  };
}

/**
 * Checks if on-device MLKit OCR is supported in the current runtime
 */
export function isOcrSupported(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mlkitOcr = require('expo-mlkit-ocr');
    return Boolean(mlkitOcr && typeof mlkitOcr.isSupported === 'function' && mlkitOcr.isSupported());
  } catch {
    return false;
  }
}
