// app/src/constants/logoRegistry.ts
import { ImageSourcePropType } from 'react-native';

/**
 * Static asset map for bank & card issuer logos.
 * Metro requires compile-time static require() calls with literal paths.
 */
export const BANK_LOGOS: Record<string, ImageSourcePropType> = {
  // Bank Presets
  SBI: require('../../assets/logos/sbi.png'),
  sbi: require('../../assets/logos/sbi.png'),
  'India Post': require('../../assets/logos/ippb.png'),
  'india post': require('../../assets/logos/ippb.png'),
  india_post: require('../../assets/logos/ippb.png'),
  IPPB: require('../../assets/logos/ippb.png'),
  ippb: require('../../assets/logos/ippb.png'),
  HDFC: require('../../assets/logos/hdfc.png'),
  hdfc: require('../../assets/logos/hdfc.png'),
  Canara: require('../../assets/logos/canara.png'),
  canara: require('../../assets/logos/canara.png'),
  PNB: require('../../assets/logos/pnb.png'),
  pnb: require('../../assets/logos/pnb.png'),
  BOB: require('../../assets/logos/bob.png'),
  bob: require('../../assets/logos/bob.png'),

  // Credit Card Issuer Presets
  'SBI Card': require('../../assets/logos/sbi_card.png'),
  'sbi card': require('../../assets/logos/sbi_card.png'),
  sbi_card: require('../../assets/logos/sbi_card.png'),
  sbicard: require('../../assets/logos/sbi_card.png'),
  ICICI: require('../../assets/logos/icici.png'),
  icici: require('../../assets/logos/icici.png'),
  Axis: require('../../assets/logos/axis.png'),
  axis: require('../../assets/logos/axis.png'),
  Kotak: require('../../assets/logos/kotak.png'),
  kotak: require('../../assets/logos/kotak.png'),
  Slice: require('../../assets/logos/slice.png'),
  slice: require('../../assets/logos/slice.png'),
  OneCard: require('../../assets/logos/onecard.png'),
  onecard: require('../../assets/logos/onecard.png'),
  one_card: require('../../assets/logos/onecard.png'),
  'one card': require('../../assets/logos/onecard.png'),
};

/**
 * Normalizes preset identifier to match the registry.
 */
export function normalizePresetId(presetId?: string | null): string {
  if (!presetId) return '';
  return presetId
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Resolves static logo asset by preset id/code.
 * Returns null if preset has no logo, is 'Custom', or is unknown.
 */
export function getBankLogo(presetId?: string | null): ImageSourcePropType | null {
  if (!presetId) return null;
  const raw = presetId.trim();
  if (raw === 'Custom' || raw.toLowerCase() === 'custom') return null;

  // 1. Direct match (e.g. 'SBI', 'HDFC', 'SBI Card', 'OneCard')
  if (BANK_LOGOS[raw]) return BANK_LOGOS[raw];

  // 2. Normalized match (e.g. 'sbi card', 'india post')
  const normalized = normalizePresetId(raw);
  if (BANK_LOGOS[normalized]) return BANK_LOGOS[normalized];

  // 3. Compact match without spaces (e.g. 'onecard', 'sbicard', 'indiapost')
  const compact = normalized.replace(/\s+/g, '');
  if (BANK_LOGOS[compact]) return BANK_LOGOS[compact];

  return null;
}
