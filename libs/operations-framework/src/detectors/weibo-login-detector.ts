
/**
 * 事件驱动的微博登录状态检测器
 * 基于事件驱动容器系统，正确检测微博登录状态
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventBus } from '../event-driven/EventBus';
import { WorkflowEngine } from '../event-driven/WorkflowEngine';

// 类型定义
interface WeiboLoginDetectorOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
  userAgent?: string;
  cookiesPath?: string;
  debug?: boolean;
}

interface LoginStatus {
  isLoggedIn: boolean;
  details: string;
  detectedElements: Array<{ selector: string; count: number; visible: boolean }>;
  badgeDetected: boolean;
  loginConfirmed: boolean;
}

interface BadgeInfo {
  selector: string;
  count: number;
  visible: boolean;
}

interface DetectionState {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  loginStatus: LoginStatus | null;
  detectionResults: LoginStatus | null;
}

interface BadgeDetectionCompleteData {
  badgeDetected: boolean;
  loginConfirmed: boolean;
  visibleBadges: number;
  totalBadges: number;
  hasWeiboCookies: boolean;
  detectionTime: number;
}