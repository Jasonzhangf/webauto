/**
 * Date extraction utilities for social media posts
 * Handles various time formats from platforms like Weibo, Xiaohongshu
 */

/**
 * Parse relative time strings to absolute date
 * 
 * Supported formats:
 * - "刚刚" / "刚刚来自..." → now
 * - "5分钟前" / "30秒前" → relative to now
 * - "今天 08:30" / "今天08:30" → today
 * - "昨天 14:20" / "昨天14:20" → yesterday
 * - "前天 10:00" → 2 days ago
 * - "01-15" / "1月15日" → this year
 * - "2025-12-01" / "2025年12月01日" → exact date
 * - "12-01 15:30" → this year with time
 */
export function parsePlatformDate(
  text: string,
  options: {
    now?: Date;
    timezone?: string;
  } = {}
): { date: string; time: string; fullText: string } | null {
  const { now = new Date(), timezone = 'Asia/Shanghai' } = options;
  const trimmed = text.trim();
  
  if (!trimmed) return null;
  
  // Get current date in specified timezone
  const currentDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentYear = currentDate.getFullYear();
  
  // "刚刚" / "刚刚来自..."
  if (trimmed.includes('刚刚')) {
    return {
      date: formatDate(currentDate),
      time: formatTime(currentDate),
      fullText: formatDateTime(currentDate)
    };
  }
  
  // "X分钟前" / "X秒前" / "X小时前"
  const relativeMatch = trimmed.match(/(\d+)\s*(秒|分钟|小时)前/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const result = new Date(currentDate);
    
    if (unit === '秒') result.setSeconds(result.getSeconds() - amount);
    else if (unit === '分钟') result.setMinutes(result.getMinutes() - amount);
    else if (unit === '小时') result.setHours(result.getHours() - amount);
    
    return {
      date: formatDate(result),
      time: formatTime(result),
      fullText: formatDateTime(result)
    };
  }
  
  // "今天 08:30" / "今天08:30"
  const todayMatch = trimmed.match(/今天\s*(\d{1,2}):(\d{2})/);
  if (todayMatch) {
    const hour = parseInt(todayMatch[1], 10);
    const minute = parseInt(todayMatch[2], 10);
    const result = new Date(currentDate);
    result.setHours(hour, minute, 0, 0);
    
    return {
      date: formatDate(result),
      time: formatTime(result),
      fullText: formatDateTime(result)
    };
  }
  
  // "昨天 14:20" / "昨天14:20"
  const yesterdayMatch = trimmed.match(/昨天\s*(\d{1,2}):(\d{2})/);
  if (yesterdayMatch) {
    const hour = parseInt(yesterdayMatch[1], 10);
    const minute = parseInt(yesterdayMatch[2], 10);
    const result = new Date(currentDate);
    result.setDate(result.getDate() - 1);
    result.setHours(hour, minute, 0, 0);
    
    return {
      date: formatDate(result),
      time: formatTime(result),
      fullText: formatDateTime(result)
    };
  }
  
  // "前天 10:00"
  const dayBeforeYesterdayMatch = trimmed.match(/前天\s*(\d{1,2}):(\d{2})/);
  if (dayBeforeYesterdayMatch) {
    const hour = parseInt(dayBeforeYesterdayMatch[1], 10);
    const minute = parseInt(dayBeforeYesterdayMatch[2], 10);
    const result = new Date(currentDate);
    result.setDate(result.getDate() - 2);
    result.setHours(hour, minute, 0, 0);
    
    return {
      date: formatDate(result),
      time: formatTime(result),
      fullText: formatDateTime(result)
    };
  }
  
 // "2天前" / "3天前"
 const daysAgoMatch = trimmed.match(/(\d+)\s*天前/);
 if (daysAgoMatch) {
   const days = parseInt(daysAgoMatch[1], 10);
   const result = new Date(currentDate);
   result.setDate(result.getDate() - days);
   
   return {
     date: formatDate(result),
     time: '',
     fullText: formatDate(result)
   };
 }
 
  // "2025-12-01" / "2025年12月01日" - Full date (must match before MM-DD)
  const fullDateMatch = trimmed.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})/);
  if (fullDateMatch) {
    const year = parseInt(fullDateMatch[1], 10);
    const month = parseInt(fullDateMatch[2], 10);
    const day = parseInt(fullDateMatch[3], 10);
    const result = new Date(year, month - 1, day);
    
    // Check if there's time info
    const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      result.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
      if (result.getTime() > currentDate.getTime()) {
        result.setFullYear(currentYear - 1);
      }
      return {
        date: formatDate(result),
        time: formatTime(result),
        fullText: formatDateTime(result)
      };
    }
    
    return {
      date: formatDate(result),
      time: '',
      fullText: formatDate(result)
    };
  }
  
 // "01-15" / "1月15日" (this year, fallback to previous year when parsed date is in future)
 const monthDayMatch = trimmed.match(/(\d{1,2})[-月](\d{1,2})日?/);
 if (monthDayMatch && !trimmed.includes('年')) {
    const month = parseInt(monthDayMatch[1], 10);
    const day = parseInt(monthDayMatch[2], 10);
    const result = new Date(currentYear, month - 1, day);
    
    // Check if there's time info
    const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      result.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
      if (result.getTime() > currentDate.getTime()) {
        result.setFullYear(currentYear - 1);
      }
      return {
        date: formatDate(result),
        time: formatTime(result),
        fullText: formatDateTime(result)
      };
    }
    if (result.getTime() > currentDate.getTime()) {
      result.setFullYear(currentYear - 1);
    }
    
   return {
     date: formatDate(result),
     time: '',
     fullText: formatDate(result)
   };
 }
 
 
 return null;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format time as HH:MM
 */
function formatTime(date: Date): string {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

/**
 * Format datetime as YYYY-MM-DD HH:MM
 */
function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Get current timestamp in ISO format with timezone
 */
export function getCurrentTimestamp(timezone: string = 'Asia/Shanghai'): {
  collectedAt: string;      // ISO 8601 UTC: 2026-02-20T14:58:44.494Z
  collectedAtLocal: string; // Local with TZ: 2026-02-20 22:58:44.494 +08:00
  collectedDate: string;    // Date only: 2026-02-20
} {
  const now = new Date();
  
  // UTC ISO string
  const collectedAt = now.toISOString();
  
  // Local time with timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  const ms = get('fractionalSecond');
  
  // Get timezone offset
  const tzOffset = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset'
  }).format(now).split(' ').pop() || '+08:00';
  
  const collectedAtLocal = `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms} ${tzOffset}`;
  const collectedDate = `${year}-${month}-${day}`;
  
  return {
    collectedAt,
    collectedAtLocal,
    collectedDate
  };
}

/**
 * Weibo-specific date extraction from post element
 */
export function extractWeiboPostDate(
  postElement: Element,
  now: Date = new Date()
): { date: string; time: string; fullText: string } | null {
  // Weibo post time is usually in:
  // - <a class="head-info_time_..."> or similar
  // - Element with from, time info
  
  const timeSelectors = [
    'a[class*="time"]',
    'a[class*="date"]',
    'span[class*="time"]',
    '.from a',
    'a[href*="weibo.com"]'
  ];
  
  for (const selector of timeSelectors) {
    const timeEl = postElement.querySelector(selector);
    if (timeEl) {
      const text = timeEl.textContent?.trim();
      if (text) {
        const parsed = parsePlatformDate(text, { now });
        if (parsed) return parsed;
      }
    }
  }
  
  // Fallback: search all text content for date patterns
  const allText = postElement.textContent || '';
  const datePatterns = [
    /刚刚/,
    /\d+\s*(秒|分钟|小时)前/,
    /今天\s*\d{1,2}:\d{2}/,
    /昨天\s*\d{1,2}:\d{2}/,
    /\d{1,2}-\d{1,2}/,
    /\d{4}-\d{1,2}-\d{1,2}/
  ];
  
  for (const pattern of datePatterns) {
    const match = allText.match(pattern);
    if (match) {
      const parsed = parsePlatformDate(match[0], { now });
      if (parsed) return parsed;
    }
  }
  
  return null;
}
