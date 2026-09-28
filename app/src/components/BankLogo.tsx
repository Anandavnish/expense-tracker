// app/src/components/BankLogo.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  StyleProp,
  ViewStyle,
  ImageStyle,
} from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { getBankLogo, normalizePresetId } from '../constants/logoRegistry';
import { BANK_BRAND_COLORS, CARD_BRAND_COLORS } from '../theme/tokens';
import { Account } from '../types/database';

export interface BankLogoProps {
  /** Size (width & height) in density points. Defaults to 36 */
  size?: number;
  /** Bank or Card preset identifier, e.g. 'SBI', 'HDFC', 'OneCard', 'Custom' */
  presetId?: string | null;
  /** Account or institution display name for initials fallback */
  name?: string | null;
  /** Explicit brand/custom color to tint the initials avatar fallback */
  brandColor?: string | null;
  /** Optional account entity: automatically extracts presetId, brandColor, and name */
  account?: Account | null;
  /** Optional outer container style override */
  style?: StyleProp<ViewStyle>;
  /** Optional inner Image style override */
  imageStyle?: StyleProp<ImageStyle>;
}

/**
 * Extracts 1-2 uppercase initials from a name or preset.
 */
export function getInitials(name?: string | null, presetId?: string | null): string {
  const target = (name || presetId || '').trim();
  if (!target) return 'BK';

  // Strip non-alphanumeric leading symbols (like '+ Custom' or '•')
  const clean = target.replace(/^[+\-•\s]+/, '').trim();
  if (!clean) return 'BK';

  const parts = clean.split(/[\s•\-_/]+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].charAt(0).toUpperCase();
    const second = parts[1].charAt(0).toUpperCase();
    if (/[A-Z0-9]/.test(first) && /[A-Z0-9]/.test(second)) {
      return `${first}${second}`;
    }
    if (/[A-Z0-9]/.test(first)) return first;
  }

  // Single word: take first 1-2 letters
  const word = parts[0] || '';
  const letters = word.replace(/[^A-Za-z0-9]/g, '');
  if (letters.length >= 2) {
    return letters.substring(0, 2).toUpperCase();
  }
  if (letters.length === 1) {
    return letters.toUpperCase();
  }
  return 'BK';
}

/**
 * Infers a known bank or card preset ID from freeform text / account names.
 */
export function inferPresetFromText(text?: string | null): string | null {
  if (!text) return null;
  const clean = text.trim();
  if (!clean) return null;

  // If text contains '•', check the parts first
  if (clean.includes('•')) {
    const parts = clean.split('•').map((s) => s.trim());
    for (const part of parts) {
      const match = inferPresetFromText(part);
      if (match) return match;
    }
  }

  const lower = clean.toLowerCase();

  // Distinct card brands & multi-word presets
  if (lower.includes('sbi card') || lower.includes('sbicard')) return 'SBI Card';
  if (lower.includes('onecard') || lower.includes('one card')) return 'OneCard';
  if (lower.includes('india post') || lower.includes('ippb') || lower.includes('post office')) return 'India Post';
  if (lower.includes('bank of baroda') || lower.includes('bob')) return 'BOB';
  if (lower.includes('punjab national') || lower.includes('pnb')) return 'PNB';
  if (lower.includes('state bank') || lower.includes('sbi')) return 'SBI';

  // Bank & Card single names
  if (lower.includes('hdfc')) return 'HDFC';
  if (lower.includes('icici')) return 'ICICI';
  if (lower.includes('axis')) return 'Axis';
  if (lower.includes('kotak')) return 'Kotak';
  if (lower.includes('canara')) return 'Canara';
  if (lower.includes('slice')) return 'Slice';

  return null;
}

/**
 * Extracts preset code from an Account if present or inferred from name.
 */
export function resolveAccountPreset(acc?: Account | null): string | null {
  if (!acc) return null;
  if (acc.type === 'bank') {
    if (acc.bank_preset && acc.bank_preset !== 'Custom') return acc.bank_preset;
  }
  if (acc.type === 'credit_card') {
    if (acc.card_issuer && acc.card_issuer !== 'Custom') return acc.card_issuer;
  }
  // Check name if formatted as "Preset • CustomName" or containing brand keywords
  if (acc.name) {
    const inferred = inferPresetFromText(acc.name);
    if (inferred) return inferred;
  }
  return acc.bank_preset || acc.card_issuer || null;
}

/**
 * Resolves brand color for an Account / preset fallback.
 */
export function resolveAccountBrandColor(
  acc?: Account | null,
  presetId?: string | null,
  fallbackColor: string = '#6366F1'
): string {
  if (acc?.custom_color) return acc.custom_color;
  if (acc?.type === 'cash') return '#10B981';

  const effectivePreset = presetId || resolveAccountPreset(acc) || inferPresetFromText(acc?.name);
  if (effectivePreset) {
    const norm = normalizePresetId(effectivePreset).replace(/\s+/g, '');
    if (norm === 'sbi') return BANK_BRAND_COLORS.sbi;
    if (norm === 'indiapost' || norm === 'ippb') return BANK_BRAND_COLORS.indiaPost;
    if (norm === 'hdfc') return BANK_BRAND_COLORS.hdfc;
    if (norm === 'canara') return BANK_BRAND_COLORS.canara;
    if (norm === 'pnb') return BANK_BRAND_COLORS.pnb;
    if (norm === 'bob') return BANK_BRAND_COLORS.bob;

    if (norm === 'sbicard') return CARD_BRAND_COLORS.sbiCard;
    if (norm === 'icici') return CARD_BRAND_COLORS.icici;
    if (norm === 'axis') return CARD_BRAND_COLORS.axis;
    if (norm === 'kotak') return CARD_BRAND_COLORS.kotak;
    if (norm === 'slice') return CARD_BRAND_COLORS.slice;
    if (norm === 'onecard') return CARD_BRAND_COLORS.oneCard;
  }

  return fallbackColor;
}

export const BankLogo: React.FC<BankLogoProps> = ({
  size = 36,
  presetId,
  name,
  brandColor,
  account,
  style,
  imageStyle,
}) => {
  const { colors } = useSettingsStore();
  const [hasImageError, setHasImageError] = useState(false);

  const effectivePreset =
    presetId ??
    resolveAccountPreset(account) ??
    inferPresetFromText(account?.name) ??
    inferPresetFromText(name);
  const effectiveName = name ?? account?.name;
  const effectiveBrandColor =
    brandColor ??
    resolveAccountBrandColor(account, effectivePreset, colors.primary);

  const logoSource = effectivePreset ? getBankLogo(effectivePreset) : null;
  const borderRadius = Math.max(4, Math.round(size * 0.28));

  if (logoSource && !hasImageError) {
    // Proportional padding: 4-6px for standard sizes (32-48), scaling down for tiny badges
    const padding = Math.max(2, Math.min(6, Math.round(size * 0.12)));

    return (
      <View
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor: colors.logoTileBackground || '#FFFFFF',
            padding,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle || '#E2E2E8',
          },
          style,
        ]}
      >
        <Image
          source={logoSource}
          style={[
            styles.logoImage,
            {
              width: '100%',
              height: '100%',
            },
            imageStyle,
          ]}
          resizeMode="contain"
          onError={() => setHasImageError(true)}
        />
      </View>
    );
  }

  // Fallback: Initials Avatar tinted with the brand/custom color
  const initials = getInitials(effectiveName, effectivePreset);
  const fontSize = Math.max(9, Math.round(size * (initials.length > 1 ? 0.36 : 0.42)));

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: `${effectiveBrandColor}1E`,
          borderColor: `${effectiveBrandColor}45`,
          borderWidth: StyleSheet.hairlineWidth,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.initialsText,
          {
            color: effectiveBrandColor,
            fontSize,
            fontWeight: '700',
            letterSpacing: -0.2,
          },
        ]}
        numberOfLines={1}
      >
        {initials}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  initialsText: {
    textAlign: 'center',
    includeFontPadding: false,
  },
});
