// src/services/ocrService.ts
// On-device OCR text recognition using expo-mlkit-ocr in the Expo managed workflow
// Extracts text and visual bounding boxes feeding into the unified transactionParser pipeline

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
 * Safely handles environments where the native module is absent.
 */
export async function extractTextFromImage(imageUri: string): Promise<OcrResult> {
  try {
    // Dynamically require to safely handle environments (Expo Go, test runners)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mlkitOcr = require('expo-mlkit-ocr');
    if (mlkitOcr && typeof mlkitOcr.recognizeText === 'function') {
      const result = await mlkitOcr.recognizeText(imageUri);
      return {
        success: true,
        text: result?.text || '',
        blocks: result?.blocks || [],
      };
    }
  } catch (err: any) {
    console.warn('[ocrService] expo-mlkit-ocr extraction failed or unavailable:', err?.message);
    return {
      success: false,
      text: '',
      error: err?.message || 'On-device OCR failed or native module unavailable',
    };
  }

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
