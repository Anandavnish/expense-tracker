// src/utils/categoryIcons.ts
import { Ionicons } from '@expo/vector-icons';
import { TransactionType } from '../types/database';
import { COLORS } from '../theme/tokens';

export const getCategoryIcon = (
  category: string,
  type?: TransactionType
): keyof typeof Ionicons.glyphMap => {
  const lower = (category || '').toLowerCase();

  if (type === 'income') {
    if (lower.includes('salary')) return 'cash-outline';
    if (lower.includes('freelance')) return 'briefcase-outline';
    if (lower.includes('invest')) return 'trending-up-outline';
    if (lower.includes('gift')) return 'gift-outline';
    if (lower.includes('refund') || lower.includes('cashback')) return 'refresh-outline';
    if (lower.includes('card')) return 'card-outline';
    return 'arrow-down-circle-outline';
  }

  if (type === 'borrow_given' || type === 'borrow_taken') {
    if (lower.includes('dinner') || lower.includes('split')) return 'people-outline';
    if (lower.includes('trip')) return 'airplane-outline';
    if (lower.includes('emergency')) return 'medkit-outline';
    return 'swap-horizontal-outline';
  }

  // Expense categories
  if (lower.includes('food') || lower.includes('dining') || lower.includes('restaurant')) return 'fast-food-outline';
  if (lower.includes('travel') || lower.includes('cab') || lower.includes('metro')) return 'airplane-outline';
  if (lower.includes('rent') || lower.includes('hostel')) return 'home-outline';
  if (lower.includes('recharge') || lower.includes('data') || lower.includes('mobile')) return 'cellular-outline';
  if (lower.includes('subscript') || lower.includes('netflix') || lower.includes('spotify')) return 'play-circle-outline';
  if (lower.includes('book') || lower.includes('stationery') || lower.includes('educat')) return 'book-outline';
  if (lower.includes('shop') || lower.includes('clothing') || lower.includes('amazon')) return 'bag-handle-outline';
  if (lower.includes('entertain') || lower.includes('movie') || lower.includes('game')) return 'game-controller-outline';
  if (lower.includes('grocer')) return 'cart-outline';
  if (lower.includes('health') || lower.includes('med')) return 'medkit-outline';
  if (lower.includes('care') || lower.includes('salon')) return 'sparkles-outline';

  return 'pricetag-outline';
};

export const getCategoryColor = (
  category: string,
  type?: TransactionType,
  accentHex: string = COLORS.accent
): { bg: string; text: string } => {
  if (type === 'income') {
    return { bg: `${accentHex}20`, text: accentHex };
  }
  if (type === 'borrow_given') {
    return { bg: `${COLORS.warning}20`, text: COLORS.warning };
  }
  if (type === 'borrow_taken') {
    return { bg: '#38BDF820', text: '#38BDF8' };
  }

  const lower = (category || '').toLowerCase();
  if (lower.includes('food')) return { bg: '#F9731620', text: '#FB923C' };
  if (lower.includes('travel')) return { bg: '#06B6D420', text: '#22D3EE' };
  if (lower.includes('rent')) return { bg: '#8B5CF620', text: '#A78BFA' };
  if (lower.includes('recharge')) return { bg: '#3B82F620', text: '#60A5FA' };
  if (lower.includes('subscript')) return { bg: '#EC489920', text: '#F472B6' };
  if (lower.includes('book')) return { bg: '#10B98120', text: '#34D399' };
  if (lower.includes('shop')) return { bg: '#F43F5E20', text: '#FB7185' };
  if (lower.includes('entertain')) return { bg: '#A855F720', text: '#C084FC' };

  return { bg: `${COLORS.alert}20`, text: COLORS.alert };
};
