// src/utils/categoryIcons.ts
import { Ionicons } from '@expo/vector-icons';
import { TransactionType } from '../types/database';
import {
  getCategoryToken,
  LOCKED_FINANCIAL_TOKENS,
} from '../theme/tokens';

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
  if (lower.includes('food') || lower.includes('dining') || lower.includes('restaurant') || lower.includes('eat') || lower.includes('cafe')) {
    return 'fast-food-outline';
  }
  if (lower.includes('travel') || lower.includes('cab') || lower.includes('metro') || lower.includes('transport') || lower.includes('bus')) {
    return 'car-outline';
  }
  if (lower.includes('rent') || lower.includes('hostel') || lower.includes('home') || lower.includes('room')) {
    return 'home-outline';
  }
  if (lower.includes('recharge') || lower.includes('data') || lower.includes('mobile') || lower.includes('wifi') || lower.includes('phone')) {
    return 'phone-portrait-outline';
  }
  if (lower.includes('subscript') || lower.includes('netflix') || lower.includes('spotify') || lower.includes('ott') || lower.includes('stream')) {
    return 'play-circle-outline';
  }
  if (lower.includes('book') || lower.includes('stationery') || lower.includes('educat') || lower.includes('study')) {
    return 'book-outline';
  }
  if (lower.includes('shop') || lower.includes('clothing') || lower.includes('amazon') || lower.includes('cart')) {
    return 'cart-outline';
  }
  if (lower.includes('entertain') || lower.includes('movie') || lower.includes('game') || lower.includes('party')) {
    return 'film-outline';
  }
  if (lower.includes('grocer')) return 'cart-outline';
  if (lower.includes('health') || lower.includes('med') || lower.includes('doctor') || lower.includes('gym')) {
    return 'medkit-outline';
  }
  if (lower.includes('care') || lower.includes('salon') || lower.includes('beauty')) {
    return 'sparkles-outline';
  }

  return 'pricetag-outline';
};

export const getCategoryColor = (
  category: string,
  type?: TransactionType,
  _accentHex?: string,
  mode: 'dark' | 'light' = 'dark'
): { bg: string; text: string } => {
  const financial = LOCKED_FINANCIAL_TOKENS[mode];

  // Strictly locked semantic financial tokens
  if (type === 'income') {
    return { bg: financial.incomeMuted, text: financial.income };
  }
  if (type === 'borrow_given') {
    return { bg: financial.lentMuted, text: financial.lent };
  }
  if (type === 'borrow_taken') {
    return { bg: financial.borrowedMuted, text: financial.borrowed };
  }

  // Centralized Category Design Tokens
  const token = getCategoryToken(category);
  return { bg: token.bg, text: token.text };
};

export const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Allowance',
  'Gift',
  'Refund',
  'Cashback',
  'Credit Card Payment',
  'Reward Redemption',
  'Other',
];

export const DEFAULT_BORROW_CATEGORIES = [
  'Personal Loan',
  'Dinner Split',
  'Trip Expense',
  'Emergency',
  'Other',
];
