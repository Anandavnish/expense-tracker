// src/services/versionService.ts
// Remote version check service for In-App Update Prompts & Releases (GitHub Releases + Supabase fallback)

import Constants from 'expo-constants';
import { supabase } from './supabase';

export const CURRENT_APP_VERSION =
  Constants.expoConfig?.version ||
  (Constants as any).nativeAppVersion ||
  '1.0.0';

export const CURRENT_VERSION_CODE =
  Constants.expoConfig?.android?.versionCode ||
  ((Constants as any).nativeBuildVersion ? parseInt((Constants as any).nativeBuildVersion, 10) : 1);

export const GITHUB_REPO_OWNER = 'Anandavnish';
export const GITHUB_REPO_NAME = 'expense-tracker';

export interface AppReleaseInfo {
  id?: string;
  version: string;
  version_code: number;
  title: string;
  release_notes: string;
  download_url: string;
  is_critical: boolean;
  min_version_code?: number;
  created_at?: string;
  source?: 'github' | 'supabase';
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  isMandatory: boolean;
  currentVersion: string;
  currentVersionCode: number;
  release?: AppReleaseInfo;
  error?: string;
}

/**
 * Compare two SemVer strings (e.g. "1.0.2" vs "1.0.0").
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemVer(v1: string, v2: string): number {
  const clean = (v: string) =>
    (v || '')
      .replace(/^v/i, '')
      .split('-')[0] // remove tags like -alpha, -beta
      .split('.')
      .map(part => parseInt(part, 10) || 0);

  const p1 = clean(v1);
  const p2 = clean(v2);
  const maxLen = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Parse an embedded version code from GitHub release metadata or body.
 * Format: `version_code: 3` or `versionCode: 3`
 */
function parseVersionCodeFromBody(body: string | undefined): number | null {
  if (!body) return null;
  const match = body.match(/(?:version_?code|build_?number)\s*[:=]\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Checks GitHub Releases for a newer version with an attached .apk asset
 */
async function checkGitHubReleases(): Promise<AppReleaseInfo | null> {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'ExpenseTracker-MobileApp',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data || !data.tag_name) {
      return null;
    }

    // Find the APK file among release assets
    const apkAsset = data.assets?.find((asset: any) =>
      asset.name?.toLowerCase().endsWith('.apk')
    );

    if (!apkAsset || !apkAsset.browser_download_url) {
      return null;
    }

    const releaseVersion = data.tag_name.replace(/^v/i, '').trim();
    const parsedCode = parseVersionCodeFromBody(data.body);

    // Is it marked critical / mandatory in release notes?
    const isCritical =
      /\[(?:critical|mandatory)\]/i.test(data.body || '') ||
      /\bmandatory update\b/i.test(data.body || '');

    return {
      id: String(data.id),
      version: releaseVersion,
      version_code: parsedCode || 0,
      title: data.name || `Expense Tracker v${releaseVersion}`,
      release_notes: data.body || 'New release available.',
      download_url: apkAsset.browser_download_url,
      is_critical: isCritical,
      created_at: data.published_at || data.created_at,
      source: 'github',
    };
  } catch {
    // Network / rate-limit error, silently ignore and fallback
    return null;
  }
}

/**
 * Fallback: Check Supabase `app_versions` table
 */
async function checkSupabaseReleases(): Promise<AppReleaseInfo | null> {
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .order('version_code', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    return {
      ...data[0],
      source: 'supabase',
    };
  } catch {
    return null;
  }
}

/**
 * Checks the latest release against the currently installed app version.
 * Tries GitHub Releases first, then falls back to Supabase `app_versions`.
 */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const defaultResult: UpdateCheckResult = {
    hasUpdate: false,
    isMandatory: false,
    currentVersion: CURRENT_APP_VERSION,
    currentVersionCode: CURRENT_VERSION_CODE,
  };

  try {
    // 1. Check GitHub Releases first (free hosting up to 2GB per asset, direct APK download)
    const githubRelease = await checkGitHubReleases();
    if (githubRelease) {
      const isNewerSemver = compareSemVer(githubRelease.version, CURRENT_APP_VERSION) > 0;
      const isNewerCode =
        githubRelease.version_code > 0 &&
        githubRelease.version_code > CURRENT_VERSION_CODE;

      if (isNewerSemver || isNewerCode) {
        return {
          hasUpdate: true,
          isMandatory: githubRelease.is_critical,
          currentVersion: CURRENT_APP_VERSION,
          currentVersionCode: CURRENT_VERSION_CODE,
          release: githubRelease,
        };
      }
      // If GitHub had the latest release and it is NOT newer, app is up to date
      return defaultResult;
    }

    // 2. Fallback to Supabase app_versions if GitHub is unreachable
    const supabaseRelease = await checkSupabaseReleases();
    if (supabaseRelease) {
      const isNewerCode = supabaseRelease.version_code > CURRENT_VERSION_CODE;
      const isNewerSemver = compareSemVer(supabaseRelease.version, CURRENT_APP_VERSION) > 0;
      const isMandatory =
        supabaseRelease.is_critical ||
        (typeof supabaseRelease.min_version_code === 'number' &&
          CURRENT_VERSION_CODE < supabaseRelease.min_version_code);

      if (isNewerCode || isNewerSemver) {
        return {
          hasUpdate: true,
          isMandatory: !!isMandatory,
          currentVersion: CURRENT_APP_VERSION,
          currentVersionCode: CURRENT_VERSION_CODE,
          release: supabaseRelease,
        };
      }
    }

    return defaultResult;
  } catch (err: any) {
    return {
      ...defaultResult,
      error: err?.message || 'Could not verify latest app version.',
    };
  }
}

