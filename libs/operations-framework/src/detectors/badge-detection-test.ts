
/**
 * 徽章检测测试
 * 测试微博登录状态的徽章检测功能
 */

import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

console.log('🔍 徽章检测测试...\n');

interface BadgeDetectionResult {
  success: boolean;
  badgeDetected: boolean;
  loginConfirmed: boolean;
  visibleBadges: number;
  totalBadges: number;
  hasWeiboCookies: boolean;
  details: string;
  detectedElements: string[];
  isLoggedIn: boolean;
}

interface BadgeInfo {
  selector: string;
  count: number;
  visible: boolean;
}