// src/services/ocrService.ts
// Compatibility shim: on-device OCR native library replaced by Gemini Multimodal Vision
// This file is retained to prevent any broken imports while avoiding native module crashes.

export interface OcrResult {
  success: boolean;
  text: string;
  error?: string;
}

/**
 * Extracts raw text from an image URI (Deprecated: use parseReceiptWithGemini directly for multimodal vision)
 */
export async function extractTextFromImage(imageUri: string): Promise<OcrResult> {
  // On-device MLKit is replaced by Gemini Vision which parses images directly with zero native dependencies
  return {
    success: false,
    text: '',
    error: 'Direct on-device OCR is deprecated. Use parseReceiptWithGemini({ imageUri }) instead.',
  };
}
