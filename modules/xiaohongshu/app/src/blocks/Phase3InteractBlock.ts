/**
 * Phase 3 Block: 闂備浇宕垫慨鏉懨洪妶鍥ｅ亾濮樼厧鐏︽い銏＄懇楠炲鎮欏▓鎸庨敜闂備礁婀遍崕銈夊垂娴ｅ喚鏉介梻鍌欑劍鐎笛呯矙閹存繐鑰挎繛鎾次焑ract闂?
 *
 * 闂傚倷鑳堕崢褍鐣烽鍕剹濞撴埃鍋撻柟顖氳嫰铻栭柛娑卞枟濞?
 * - 闂傚倷鑳堕幊鎾绘倶濮樿泛绠伴柛婵勫劜椤洟鏌熺€电校闁哄棙绮撻弻鈥崇暤椤斿吋鍣洪柟灞傚€濋弻锝夋偐閸欏銈梻鍌氬鐎氭澘鐣烽弴锛勭杸闁哄倽顔婄花鑽ょ磼閻愵剚绶叉い锕佷含缁牓宕滈崫绔慹Url闂傚倷鐒︾€笛呯矙閹达附鍤愭い鏍ㄧ矋瀹曟煡鏌嶈閸撴瑩鈥旈崘顔嘉ч柛顐亜濞堫參姊?xsec_token闂?
 * - 闂備浇顕х换鎺楀磻閻愯娲冀椤愶綆娼熼梺鐟邦嚟婵數鈧碍宀搁弻娑㈠即閵娿儲鐝梺鍝ュ枎閻楁捇寮?
 * - 濠电姷鏁告慨鎾晝閵夆晜鍤岄柣鎰靛墯閸欏繘鏌嶉崫鍕殲閻庢碍宀搁弻娑㈠即閵娿儲鐝梺鍝ュ枎閻楁捇寮诲☉銏犲唨妞ゆ劑鍨诲▓銈囩磽娴ｄ粙鍝虹紒璇插閸掓帡妫冨☉鎺擃潔闂佸啿鐏堥弲娑欑閹岀唵閻犺櫣灏ㄥ銉╂煟閿曗偓閻栧ジ寮诲☉姗嗘僵闁绘挸绨肩花濠氭⒑閸涘浼曢柛銉ｅ妿閸欏棗顪冮妶鍡橆梿闁稿鍔欓獮妤呮偄閸忚偐鍘介梺闈涱焾閸庨亶顢旈鍕厽闁挎洍鍋撴繛瀵稿厴楠?
 * - 婵犲痉鏉库偓鏇㈠磹閸︻厽绠掗梺璇查閻忔氨鏁敓鐘茬畺婵炲棙鍨堕崗婊堟煕濞戝崬鐏辨繛绮瑰亾闂傚倷绀佸﹢閬嶁€﹂崼銉嬪洭鎮界粙璺唶闂佺懓澧庨弲顐㈢暤娓氣偓閺屾盯骞橀懠顒夋М婵炲濯崹鍫曞蓟濞戙垹绠ｉ柨婵嗘噹閹偤姊虹粙娆惧劀缂佹彃娼￠獮?
 * - 闂傚倷娴囬～澶愬箚鐏炲墽顩叉繝濠傚幘閻熼偊娼ㄩ柍褜鍓熼獮蹇涘礃椤旇棄浠奸柣蹇曞仜婢т粙鏁嶅鈧鍝劽虹紒妯衡枏闂佸憡鏌ㄩ鍥嚍闁稁鏁嗗〒姘处椤旀棃鎮楅崗澶婁壕闂佸憡鍔︽禍婵嬶綖瀹ュ鈷戦柟绋挎捣閳藉鏌ｅΔ浣瑰磳闁诡喚鏁婚、娆撴偩瀹€濠冮敜婵＄偑鍊栧濠氬储瑜旇矾?闂傚倷鑳剁划顖炲礉濡ゅ懌鈧焦绻濋崟顓犵効闂佸湱澧楀妯兼喆閿曞倸绠归柟纰卞幖閻忥絿绱掗埀?
 */

import path from 'node:path';
import fs, { promises as fsp } from 'node:fs';
import os from 'node:os';
import { controllerAction, delay } from '../utils/controllerAction.js';
import { resolveDownloadRoot, savePngBase64, takeScreenshotBase64 } from './helpers/evidence.js';
import {
  ensureCommentsOpened,
  extractVisibleComments,
  highlightCommentRow,
  isCommentEnd,
  scrollComments,
  checkBottomWithBackAndForth,
  type XhsExtractedComment,
} from './helpers/xhsComments.js';

function formatError(err: unknown) {
  if (err instanceof Error) return err.stack || err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export interface InteractRoundStats {
  round: number;
  visible: number;
  harvestedNew: number;
  harvestedTotal: number;
  ruleHits: number;
  hitTotal?: number;
  skippedTotal?: number;
  likedTotalActual?: number;
  hitCheckOk?: boolean;
  gateBlocked: number;
  dedupSkipped: number;
  alreadyLikedSkipped: number;
  notVisibleSkipped: number;
  nestedParentSkipped?: number;
  clickFailed: number;
  verifyFailed: number;
  newLikes: number;
  likedTotal: number;
  reachedBottom: boolean;
  endReason?: string;
  ms: number;
}

export interface InteractInput {
  sessionId: string;
  noteId: string;
  safeUrl: string;
  likeKeywords: string[];
  maxLikesPerRound?: number;
  dryRun?: boolean;
  unifiedApiUrl?: string;
  keyword?: string;
  env?: string;
  reuseCurrentDetail?: boolean;
  commentsAlreadyOpened?: boolean;
  collectComments?: boolean;
  persistCollectedComments?: boolean;
  commentsFilePath?: string;
  evidenceDir?: string;
  onRound?: (stats: InteractRoundStats) => void;
}

export interface InteractOutput {
  success: boolean;
  noteId: string;
  likedCount: number;
  scannedCount: number;
  hitCount?: number;
  skippedCount?: number;
  likedTotal?: number;
  hitCheckOk?: boolean;
  mismatchEvidence?: {
    postScreenshot?: string | null;
  };
  errorEvidence?: {
    screenshot?: string | null;
  };
  likedComments: Array<{
    index: number;
    userId: string;
    userName: string;
    content: string;
    timestamp: string;
    screenshots?: { before?: string | null; after?: string | null };
    matchedRule?: string;
  }>;
  commentsAdded?: number;
  commentsTotal?: number;
  commentsPath?: string;
  evidenceDir?: string;
  dedupSkipped?: number;
  alreadyLikedSkipped?: number;
  reachedBottom: boolean;
  stopReason?: string;
  error?: string;
}

function normalizeText(s: string) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function readCurrentUrl(sessionId: string, apiUrl: string) {
  try {
    const res = await controllerAction(
      'browser:execute',
      { profile: sessionId, timeoutMs: 12000, script: 'window.location.href' },
      apiUrl,
    );
    return String(res?.result || res?.data?.result || '');
  } catch {
    return '';
  }
}

async function gotoDetailWithRetry(sessionId: string, safeUrl: string, apiUrl: string) {
  const attempts = [
    { timeoutMs: 30000, label: 'goto_30s' },
    { timeoutMs: 60000, label: 'goto_60s' },
  ];

  for (const attempt of attempts) {
    console.log(`[Phase3Interact] goto attempt=${attempt.label} url=${safeUrl}`);
    try {
      const navRes = await controllerAction(
        'browser:goto',
        { profile: sessionId, url: safeUrl, timeoutMs: attempt.timeoutMs },
        apiUrl,
      );
      if (navRes?.success === false) {
        const err = String(navRes?.error || 'goto_failed');
        console.warn(`[Phase3Interact] goto failed: ${err}`);
      } else {
        return { ok: true };
      }
    } catch (err: any) {
      const msg = String(err?.message || err || 'goto_error');
      console.warn(`[Phase3Interact] goto error: ${msg}`);
      if (!/timeout/i.test(msg)) {
        return { ok: false, error: msg };
      }
    }

    // If goto timed out, check whether we still landed on detail page.
    const currentUrl = await readCurrentUrl(sessionId, apiUrl);
    if (currentUrl.includes('/explore/') && currentUrl.includes('xsec_token=')) {
      console.log(`[Phase3Interact] goto timeout but detail loaded: ${currentUrl}`);
      return { ok: true };
    }
  }

  return { ok: false, error: 'goto_timeout' };
}

function resolveLikeIconState(useHref: string): 'liked' | 'unliked' | 'unknown' {
  const href = String(useHref || '').trim().toLowerCase();
  if (href.includes('#liked')) return 'liked';
  if (href.includes('#like')) return 'unliked';
  return 'unknown';
}

export type LikeRule =
  | { kind: 'contains'; include: string; raw: string }
  | { kind: 'and'; includeA: string; includeB: string; raw: string }
  | { kind: 'include_without'; include: string; exclude: string; raw: string };

function parseLikeRuleToken(token: string): LikeRule | null {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const m = raw.match(/^\{\s*(.+?)\s*([+\-\uFF0B\uFF0D])\s*(.+?)\s*\}$/);
  if (!m) {
    return { kind: 'contains', include: raw, raw };
  }

  const left = normalizeText(m[1]);
  const right = normalizeText(m[3]);
  if (!left || !right) return null;

  const op = m[2] === '\uFF0B' ? '+' : m[2] === '\uFF0D' ? '-' : m[2];
  if (op === '+') {
    return { kind: 'and', includeA: left, includeB: right, raw: `{${left} + ${right}}` };
  }
  return { kind: 'include_without', include: left, exclude: right, raw: `{${left} - ${right}}` };
}

export function compileLikeRules(likeKeywords: string[]): LikeRule[] {
  const rows = Array.isArray(likeKeywords) ? likeKeywords : [];
  const rules: LikeRule[] = [];
  for (const row of rows) {
    const parsed = parseLikeRuleToken(String(row || '').trim());
    if (!parsed) continue;
    rules.push(parsed);
  }
  return rules;
}

export function matchLikeText(textRaw: string, rules: LikeRule[]): { ok: boolean; reason: string; matchedRule?: string } {
  const text = normalizeText(textRaw);
  if (!text) return { ok: false, reason: 'empty_text' };
  if (!Array.isArray(rules) || rules.length === 0) return { ok: false, reason: 'no_rules' };

  for (const rule of rules) {
    if (rule.kind === 'contains') {
      if (text.includes(rule.include)) {
        return { ok: true, reason: 'contains_match', matchedRule: rule.raw };
      }
      continue;
    }
    if (rule.kind === 'and') {
      if (text.includes(rule.includeA) && text.includes(rule.includeB)) {
        return { ok: true, reason: 'and_match', matchedRule: rule.raw };
      }
      continue;
    }
    if (text.includes(rule.include) && !text.includes(rule.exclude)) {
      return { ok: true, reason: 'include_without_match', matchedRule: rule.raw };
    }
  }

  return { ok: false, reason: 'no_rule_match' };
}

async function highlightLikeButton(sessionId: string, index: number, apiUrl: string) {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'highlight',
      sessionId,
      timeoutMs: 12000,
      config: {
        index,
        target: '.like-wrapper',
        style: '12px solid #00e5ff',
        duration: 8000,
        channel: 'virtual-like-like',
        visibleOnly: true,
      },
    },
    apiUrl,
  );
}

async function isLikeButtonInViewport(sessionId: string, index: number, apiUrl: string): Promise<boolean> {
  try {
    const res = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const idx = ${index};
          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
          };
          const items = Array.from(document.querySelectorAll('.comment-item')).filter(isVisible);
          const el = items[idx];
          if (!el) return { ok: false, inViewport: false };
          const like = Array.from(el.querySelectorAll('.like-wrapper')).find((node) => node.closest('.comment-item') === el);
          if (!like) return { ok: false, inViewport: false };
          const r = like.getBoundingClientRect();
          const inViewport = r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
          return { ok: true, inViewport };
        })()`,
      },
      apiUrl,
    );
    return res?.result?.inViewport === true;
  } catch {
    return false;
  }
}

async function ensureCommentVisibleCentered(sessionId: string, apiUrl: string, index: number) {
  for (let i = 0; i < 3; i++) {
    const rect = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const idx = ${index};
          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
          };
          const items = Array.from(document.querySelectorAll('.comment-item')).filter(isVisible);
          if (!items[idx]) return { ok: false };
          const r = items[idx].getBoundingClientRect();
          const vh = window.innerHeight;
          return { ok: true, top: r.top, bottom: r.bottom, height: r.height, vh };
        })()`
      },
      apiUrl,
    ).then(res => res?.result || res?.data?.result || null);

    if (!rect || rect.ok !== true) return false;

    const pad = 80;
    const visible = rect.top >= pad && rect.bottom <= (rect.vh - pad);
    if (visible) return true;

    const dir = rect.top < pad ? 'up' : 'down';
    const amount = Math.min(800, Math.ceil((rect.top < pad ? (pad - rect.top) : (rect.bottom - (rect.vh - pad))) + 120));

    await controllerAction(
      'container:operation',
      {
        containerId: 'xiaohongshu_detail.comment_section',
        operationId: 'scroll',
        sessionId,
        timeoutMs: 12000,
        config: { direction: dir, amount },
      },
      apiUrl,
    ).catch(() => {});
    await delay(500);
  }
  return false;
}

async function clickLikeButtonByIndex(sessionId: string, index: number, apiUrl: string) {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'click',
      sessionId,
      timeoutMs: 12000,
      // 闂傚倷绀侀幖顐も偓姘煎墮闇夐柣鎴ｆ閻忚櫕淇婇姘倯閻忓繐閰ｉ弻鐔封枔閸喗鐝濋梺绋跨箰濞层劎妲愰幘瀛樺闁告繂瀚悘浣逛繆閵堝洤孝婵炲樊鍙冮獮鍐ㄢ枎閹炬潙浠梺鍝勵槹鐎笛囨儊閺嶎厽鈷戦柟绋挎捣閳藉绻涢悡搴ｇickOperation 闂傚倷绀侀幉锟犲礉閺囥垹绠犳慨妞诲亾鐎规洘娲熼獮姗€顢欓挊澶夌紦?bbox/elementFromPoint 闂傚倸鍊风欢锟犲磻閸曨垁鍥焼瀹ュ懐锛涢梺鎸庣箓椤﹀崬鐣垫笟鈧弻鐔碱敍濞戞﹩妫嗗┑鐐茬墕閻栧ジ寮?systemInput.mouseClick闂?
      config: { index, target: '.like-wrapper', useSystemMouse: true, visibleOnly: true },
    },
    apiUrl,
  );
}

async function expandMoreComments(sessionId: string, apiUrl: string): Promise<void> {
  await controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.show_more_button',
      operationId: 'click',
      sessionId,
      timeoutMs: 12000,
      config: { visibleOnly: true, useSystemMouse: true },
    },
    apiUrl,
  ).catch(() => {});
}

async function verifyLikedBySignature(
  sessionId: string,
  apiUrl: string,
  signature: { userId?: string; userName?: string; text: string },
): Promise<boolean> {
  const targetText = normalizeText(signature.text);
  if (!targetText) return false;

  // 婵犵數鍋炲娆撳触鐎ｎ喗鏅梻浣告啞钃辩紒瀣崌楠炴劘顦圭€殿喛娉涢埢搴ㄥ箚瑜庡▍宥夋⒒?extract闂傚倷鐒︾€笛呯矙閹达附鍋嬮柛鈩冨搸娴滃湱鎲搁弮鍫濈畾闁搞儮鏂侀崑鎾绘晲鎼粹€冲濠电偛鍚嬬敮锟犲蓟濞戞ǚ鏋庢繛鍡樺灥閸╁矂姊洪崫銉ヤ沪闁瑰憡濞婂?
  try {
    const rows = await extractVisibleComments(sessionId, apiUrl, 60);
    const found = rows.find((r) => {
      const t = normalizeText(String(r.text || ''));
      if (!t || t !== targetText) return false;
      const uid = String(r.user_id || '').trim();
      const un = String(r.user_name || '').trim();
      if (signature.userId && uid && uid !== signature.userId) return false;
      if (!signature.userId && signature.userName && un && un !== signature.userName) return false;
      return true;
    });
    if (found) {
      // user container-lib 闂傚倷绀侀幉锟犳偡椤栫偛鍨傞柣銏㈩焾缁€鍌涙叏濡炶浜鹃悗娈垮枤閺佸銆侀弮鍫濋唶婵犻潧妫滅粊瀵哥磽?like_status闂傚倷鐒︾€笛呯矙閹烘梻鐭欓柟閭﹀枤缁?like_active 婵犵數鍋為崹鍫曞箰閸濄儳鐭撻梻鍫熷厷閿濆绠瑰ù锝呮憸娴煎鈹戦悩璇у伐闁哥噥鍋婂畷鐢稿箳濡や胶鍘介梺褰掑亰閸ｎ噣寮ㄩ幍顔剧＜闁稿本绋戞慨宥夋煕閵婏箑鍔ら柍瑙勫灦缁绘繃鎯旈埄鍐惧悩婵犵數鍋為崹鍫曞蓟閵娾敒銊╁焵椤掑倻纾奸弶鍫涘妿缁犳﹢鏌嶈閸撴瑥锕㈤柆宥呯疇闁圭偓鏋奸弸宥夋煙閻戞ɑ鈷掔痪鎯с偢閺岀喖骞嗚閸ょ喎霉濠婂骸鐏犻棁澶愭煟濡搫绾ч柛锝呮憸缁辨挸顓奸崱妯煎弳濡炪倖娲╃徊鎯ь焽韫囨稑惟闁靛／鍐ｅ亾閹烘梻纾藉ù锝嗗絻娴?
      const hint = String(found.like_status || '');
      if (hint.includes('liked') || hint.includes('like-liked')) return true;
    }
  } catch {
    // fallback below
  }

  // fallback闂傚倷鐒︾€笛呯矙閹烘埈娼╅柕濞垮剭濞差亜閿ゆ俊銈傚亾缂佺姵濞婇弻鏇熷緞濡厧甯ラ梺?DOM闂傚倷鐒︾€笛呯矙閹达附鍋嬮柟鐐綑椤曢亶鏌嶉崫鍕櫣缂佲偓?index 濠电姷鏁告慨闈浢洪弽顓炵９閻犱礁纾弰鍌炴⒑鐠囪尙鍑圭紒鑼帛缁旂喖宕奸妷銉ユ優閻熸粌绻橀獮蹇涙偐濞茬粯鏅┑顔斤供閸撴稒瀵奸崼銉︹拺?
  try {
    const res = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const targetText = ${JSON.stringify(targetText)};
          const userName = ${JSON.stringify(String(signature.userName || ''))};
          const items = Array.from(document.querySelectorAll('.comment-item'));
          for (const el of items) {
            const r = el.getBoundingClientRect();
            const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
            if (!visible) continue;
            const textEl = el.querySelector('.content') || el.querySelector('.comment-content') || el.querySelector('p');
            const t = (textEl?.textContent || '')
              .replace(/\\s+/g, ' ')
              .trim();
            if (t !== targetText) continue;
            if (userName) {
              const n = (el.querySelector('.name')?.textContent || el.querySelector('.username')?.textContent || el.querySelector('.user-name')?.textContent || '')
                .replace(/\\s+/g, ' ')
                .trim();
              if (n && n !== userName) continue;
            }
            const like = el.querySelector('.like-wrapper');
            const use = like?.querySelector('use');
            const useHref = use?.getAttribute('xlink:href') || use?.getAttribute('href') || '';
            return { ok: true, useHref };
          }
          return { ok: false, useHref: '' };
        })()`,
      },
      apiUrl,
    );
    const useHref = String(res?.result?.useHref || res?.useHref || '');
    return useHref.includes('#liked');
  } catch {
    return false;
  }
}

async function getLikeStateForVisibleCommentIndex(
  sessionId: string,
  apiUrl: string,
  index: number,
): Promise<{ useHref: string; count: string; likeClass: string; iconState: 'liked' | 'unliked' | 'unknown' }> {
  try {
    const res = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const idx = ${JSON.stringify(index)};
          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
          };
          const visibleItems = Array.from(document.querySelectorAll('.comment-item')).filter(isVisible);
          const el = visibleItems[idx];
          if (!el) return { ok: false, likeClass: '', useHref: '', count: '', iconState: 'unknown' };
          const like = el.querySelector('.like-wrapper');
          const use = like?.querySelector('svg.like-icon use') || like?.querySelector('use');
          const useHref = use?.getAttribute('xlink:href') || use?.getAttribute('href') || use?.href?.baseVal || '';
          const count = (like?.querySelector('.count')?.textContent || '').replace(/\\s+/g, ' ').trim();
          const likeClass = like ? String(like.className || '') : '';
          const iconState = useHref.includes('#liked') ? 'liked' : useHref.includes('#like') ? 'unliked' : (likeClass.includes('like-active') ? 'liked' : 'unknown');
          return { ok: true, likeClass, useHref, count, iconState };
        })()`,
      },
      apiUrl,
    );
    const useHref = String(res?.result?.useHref || res?.useHref || '');
    return {
      useHref,
      count: String(res?.result?.count || res?.count || ''),
      likeClass: String(res?.result?.likeClass || res?.likeClass || ''),
      iconState: resolveLikeIconState(String(res?.result?.iconState || res?.iconState || useHref)),
    };
  } catch {
    return { useHref: '', count: '', likeClass: '', iconState: 'unknown' };
  }
}

async function checkLikeGate(profileId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  try {
    const res = await fetch(`http://127.0.0.1:7790/like/status/${encodeURIComponent(profileId)}`);
    const data = await res.json();
    return {
      allowed: Boolean(data?.allowed ?? data?.ok ?? true),
      current: Number(data?.current ?? data?.countInWindow ?? 0),
      limit: Number(data?.limit ?? data?.maxCount ?? 6),
    };
  } catch {
    return { allowed: true, current: 0, limit: 6 };
  }
}

async function requestLikeGate(profileId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  try {
    const res = await fetch('http://127.0.0.1:7790/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, key: profileId }),
    });
    const data = await res.json();
    return {
      allowed: Boolean(data?.allowed ?? data?.ok ?? true),
      current: Number(data?.current ?? data?.countInWindow ?? 0),
      limit: Number(data?.limit ?? data?.maxCount ?? 6),
    };
  } catch {
    return { allowed: true, current: 0, limit: 6 };
  }
}

function emitLikeEvent(keyword: string, env: string, payload: any) {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
    const logPath = require('path').join(home, '.webauto', 'download', 'xiaohongshu', env, keyword, 'run-events.jsonl');
    const row = { ts: new Date().toISOString(), type: 'like', ...payload };
    fs.appendFileSync(logPath, JSON.stringify(row) + '\n', 'utf8');
  } catch {}
}


// Like deduplication: persist liked signatures to disk
function getLikeStatePath(keyword: string, env: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
  return path.join(home, '.webauto', 'download', 'xiaohongshu', env, keyword, '.like-state.jsonl');
}

function loadLikedSignatures(keyword: string, env: string): Set<string> {
  try {
    const p = getLikeStatePath(keyword, env);
    if (!fs.existsSync(p)) return new Set();
    const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
    const sigs = new Set<string>();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.signature) sigs.add(obj.signature);
      } catch {}
    }
    return sigs;
  } catch {
    return new Set();
  }
}

function saveLikedSignature(keyword: string, env: string, signature: string): void {
  try {
    const p = getLikeStatePath(keyword, env);
    const row = { ts: new Date().toISOString(), signature };
    fs.appendFileSync(p, JSON.stringify(row) + '\n', 'utf8');
  } catch {}
}

function makeSignature(noteId: string, userId: string, userName: string, text: string): string {
  const normalizedText = String(text || '').trim().slice(0, 200);
  return [noteId, String(userId || ''), String(userName || ''), normalizedText].join('|');
}

function normalizeHarvestComment(noteId: string, row: XhsExtractedComment) {
  return {
    noteId,
    userName: String((row as any).user_name || '').trim(),
    userId: String((row as any).user_id || '').trim(),
    content: String((row as any).text || '').replace(/\s+/g, ' ').trim(),
    time: String((row as any).timestamp || '').trim(),
    likeCount: 0,
    ts: new Date().toISOString(),
  };
}

async function readJsonlRows(filePath: string): Promise<any[]> {
  try {
    const text = await fsp.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function appendJsonlRows(filePath: string, rows: any[]): Promise<void> {
  if (!rows.length) return;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await fsp.appendFile(filePath, payload, 'utf8');
}

export async function execute(input: InteractInput): Promise<InteractOutput> {
  const {
    sessionId,
    noteId,
    safeUrl,
    likeKeywords,
    maxLikesPerRound = 2,
    dryRun = false,
    unifiedApiUrl = 'http://127.0.0.1:7701',
    keyword = 'unknown',
    env = 'debug',
    reuseCurrentDetail = false,
    commentsAlreadyOpened = false,
    collectComments = false,
    persistCollectedComments = false,
    commentsFilePath = '',
    evidenceDir = '',
    onRound,
  } = input;

  // Load persisted liked signatures for dedup (resume support)
  const likedSignatures = loadLikedSignatures(keyword, env);
  const compiledLikeRules = compileLikeRules(likeKeywords);
  console.log(`[Phase3Interact] 闂佽瀛╅鏍窗閹烘纾婚柟鐐灱閺€鑺ャ亜閺冨倵鎷￠柛搴＄箲閵囧嫰鏁傜憴鍕彋闂佽鍠栭悥鐓庣暦閸楃倣鏃堝礃椤忓懎娅ч梻? ${noteId}, 闂佽楠稿﹢閬嶁€﹂崼婵愬殨閻犺櫣灏ㄩ懓鍨€掑锝呬壕闂佽鍠楅悷褍鈽夐悽绋垮窛妞ゆ牭绲剧粊銈夋⒑閼姐倕小闁绘帪绠戦…鍨熼懖鈺冾槸? ${likedSignatures.size}`);
  console.log(
    `[Phase3Interact] 闂傚倷鑳堕…鍫㈡崲閹寸偟绠惧┑鐘叉搐閺嬩焦銇勯幘璺盒ｉ悗姘皑閳ь剙绠嶉崕閬嶆偋濠婂喚鐒介柟鎵閻? ${compiledLikeRules.length > 0 ? compiledLikeRules.map((r) => r.raw).join(' | ') : '(empty)'}`,
  );

  const likedComments: InteractOutput['likedComments'] = [];
  let likedCount = 0;
  let scannedCount = 0;
  let reachedBottom = false;
  let bottomReason = '';
  let scrollCount = 0;
  let totalDedupSkipped = 0;
  let totalAlreadyLikedSkipped = 0;
  let totalRuleHits = 0;
  let totalNotVisibleSkipped = 0;
  let totalNestedSkipped = 0;
  let totalGateBlocked = 0;
  let totalClickFailed = 0;
  let totalVerifyFailed = 0;
  let totalClickAttempts = 0;
  let mismatchPostScreenshot: string | null = null;
  const maxScrolls = Infinity;

  const harvestPath = String(commentsFilePath || '').trim();
  const shouldHarvest = Boolean(collectComments);
  const shouldPersistHarvest = shouldHarvest && Boolean(persistCollectedComments) && Boolean(harvestPath);
  const harvestedKeySet = new Set<string>();
  let harvestedAdded = 0;
  let harvestedTotal = 0;

  if (shouldPersistHarvest && harvestPath) {
    const existingRows = await readJsonlRows(harvestPath);
    for (const row of existingRows) {
      const key = `${String(row?.userId || '')}:${String(row?.content || '')}`;
      if (!key.endsWith(':')) harvestedKeySet.add(key);
    }
    harvestedTotal = harvestedKeySet.size;
  }

  const likeEvidenceBaseDir = String(evidenceDir || '').trim() || path.join(
    resolveDownloadRoot(),
    'xiaohongshu',
    env,
    keyword,
    dryRun ? 'virtual-like' : 'like-evidence',
    noteId,
  );
  const errorEvidenceBaseDir = path.join(
    resolveDownloadRoot(),
    'xiaohongshu',
    env,
    keyword,
    'phase3-error',
    noteId,
  );
  let likeEvidenceDir: string | null = null;
  let errorEvidenceDir: string | null = null;
  const ensureLikeEvidenceDir = async () => {
    if (likeEvidenceDir) return likeEvidenceDir;
    await fsp.mkdir(likeEvidenceBaseDir, { recursive: true });
    likeEvidenceDir = likeEvidenceBaseDir;
    return likeEvidenceDir;
  };
  const writeHitMeta = async (prefix: string, payload: Record<string, any>) => {
    try {
      const dir = await ensureLikeEvidenceDir();
      const filePath = path.join(dir, `${prefix}.json`);
      await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return filePath;
    } catch {
      return null;
    }
  };
  const ensureErrorEvidenceDir = async () => {
    if (errorEvidenceDir) return errorEvidenceDir;
    await fsp.mkdir(errorEvidenceBaseDir, { recursive: true });
    errorEvidenceDir = errorEvidenceBaseDir;
    return errorEvidenceDir;
  };
  const captureLikeEvidence = async (prefix: string) => {
    try {
      const base64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);
      if (!base64) return null;
      const dir = await ensureLikeEvidenceDir();
      const name = `${prefix}-${Date.now()}.png`;
      return await savePngBase64(base64, path.join(dir, name));
    } catch {
      return null;
    }
  };
  const captureErrorEvidence = async (prefix: string) => {
    try {
      const base64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);
      if (!base64) return null;
      const dir = await ensureErrorEvidenceDir();
      const name = `${prefix}-${Date.now()}.png`;
      return await savePngBase64(base64, path.join(dir, name));
    } catch {
      return null;
    }
  };

  const gateStatus = await checkLikeGate(sessionId);
  console.log('[Phase3Interact] Like Gate: ' + gateStatus.current + '/' + gateStatus.limit + ' ' + (gateStatus.allowed ? 'OK' : 'BLOCKED'));

  if (!reuseCurrentDetail) {
    const navRes = await gotoDetailWithRetry(sessionId, safeUrl, unifiedApiUrl);
    if (!navRes.ok) {
      const errorShot = await captureErrorEvidence('goto-failed');
      return {
        success: false,
        noteId,
        likedCount: 0,
        scannedCount: 0,
        likedComments: [],
        evidenceDir: likeEvidenceDir || '',
        dedupSkipped: 0,
        alreadyLikedSkipped: 0,
        reachedBottom: false,
        error: navRes?.error || 'goto failed',
        errorEvidence: { screenshot: errorShot },
      };
    }
    await delay(2200);
  } else {
    console.log('[Phase3Interact] reuse current detail page, skip goto');
  }

  // 2) 闂備浇顕х换鎺楀磻閻愯娲冀椤愶綆娼熼梺鐟邦嚟婵數鈧碍宀搁弻娑㈠即閵娿儲鐝梺鍝ュ枎閻楁捇寮诲☉銏犲唨妞ゆ劑鍨诲▓銈囩磽娴ｄ粙鍝洪柣鐕傞檮缁岃鲸绻濋崶褏锛滃┑鐐村灦閻噣宕欐禒瀣拺闁革富鍙庨悞鐐亜閿旂偓鏆鐐村姇閻ｇ兘宕堕敐鍛濠电偞鍨堕顏堫敂閸曟儼鈧寧銇勮箛鎾跺缂佲偓閸℃绠鹃柛鈩兠悘銉ッ归悪鈧崹鍫曞蓟濞戙垹绠ｆ繝濠傛噸鐟曞棛绱撴笟鈧禍鑸电鐠鸿櫣鏆﹂柕澶嗘櫆閺呮繈鏌嶈閸撶喎鐣疯ぐ鎺濇晬婵犲﹤瀚弸鍌炴⒑缁洖澧叉繛鍙夌箘缁牏鈧綆鍏橀崑鎾绘偡閻楀牆鏆堥悷婊勬緲閸熸挳骞嗛崼婵愬悑闁告粈绀佸▓銊╂⒑闁偛鑻晶鎾煛?
  if (!commentsAlreadyOpened) {
    await ensureCommentsOpened(sessionId, unifiedApiUrl);
  } else {
    console.log('[Phase3Interact] comments already opened, skip open click');
  }

  // 3) 濠电姷鏁告慨鎾晝閵夆晜鍤岄柣鎰靛墯閸欏繘鏌嶉崫鍕殲閻庢碍宀搁弻娑㈠即閵娿儲鐝梺鍝ュ枎閻楁捇寮?+ 缂傚倸鍊烽悞锔剧矙閹烘鍎庢い鏍仜閻?+ 闂傚倷鑳剁划顖炲礉濡ゅ懌鈧焦绻濋崟顓犵効?
  while (likedCount < maxLikesPerRound && scrollCount < maxScrolls) {
    scrollCount += 1;
    const roundStartMs = Date.now();
    let roundRuleHits = 0;
    let roundGateBlocked = 0;
    let roundDedupSkipped = 0;
    let roundAlreadyLikedSkipped = 0;
    let roundNotVisibleSkipped = 0;
    let roundNestedSkipped = 0;
    let roundClickFailed = 0;
    let roundVerifyFailed = 0;
    let roundNewLikes = 0;

    let extracted: XhsExtractedComment[] = [];
    try {
      extracted = await extractVisibleComments(sessionId, unifiedApiUrl, 40);
    } catch (err) {
      const errMsg = formatError(err);
      const errorShot = await captureErrorEvidence('extract-comments-failed');
      console.error(`[Phase3Interact] extractVisibleComments failed: ${errMsg}`);
      return {
        success: false,
        noteId,
        likedCount,
        scannedCount,
        likedComments,
        commentsAdded: shouldHarvest ? harvestedAdded : undefined,
        commentsTotal: shouldHarvest ? harvestedTotal : undefined,
        commentsPath: shouldPersistHarvest ? harvestPath : undefined,
        evidenceDir: likeEvidenceDir || '',
        dedupSkipped: totalDedupSkipped,
        alreadyLikedSkipped: totalAlreadyLikedSkipped,
        reachedBottom,
        error: `extract_visible_comments_failed: ${errMsg}`,
        errorEvidence: { screenshot: errorShot },
      };
    }
    scannedCount += extracted.length;

    let roundHarvestedNew = 0;
    if (shouldHarvest && extracted.length > 0) {
      const rowsToAppend: any[] = [];
      for (const row of extracted) {
        const normalized = normalizeHarvestComment(noteId, row);
        if (!normalized.content) continue;
        const key = `${normalized.userId}:${normalized.content}`;
        if (harvestedKeySet.has(key)) continue;
        harvestedKeySet.add(key);
        harvestedAdded += 1;
        harvestedTotal += 1;
        roundHarvestedNew += 1;
        if (shouldPersistHarvest) rowsToAppend.push(normalized);
      }
      if (shouldPersistHarvest && rowsToAppend.length > 0) {
        try {
          await appendJsonlRows(harvestPath, rowsToAppend);
        } catch {
          // ignore comment append errors to avoid blocking like flow
        }
      }
    }
    const candidates: Array<{
      index: number;
      domIndex: number;
      text: string;
      likeMatch: ReturnType<typeof matchLikeText>;
      row: XhsExtractedComment & { domIndex?: number; isLeaf?: boolean };
      isLeaf: boolean;
    }> = [];
    for (let i = 0; i < extracted.length; i++) {
      const c: any = extracted[i] || {};
      const text = String(c.text || '').trim();
      if (!text) continue;
      const likeMatch = matchLikeText(text, compiledLikeRules);
      if (!likeMatch.ok) continue;
      const domIndex = typeof (c as any).domIndex === 'number' ? (c as any).domIndex : i;
      const isLeaf = (c as any).isLeaf !== false;
      candidates.push({ index: i, domIndex, text, likeMatch, row: c, isLeaf });
    }

    // 闂備礁婀遍…鍫ニ囬弶瑁も偓鎺楀醇閺囩偞顥濋梺瑙勵問閸犳鎮?DOM 濠碉紕鍋戦崐鏇㈠箹椤愩倛濮虫い鎾跺枎椤曡鲸淇婇姘儓閻㈩垬鍎甸弻锝夊箛椤曞懏鏁紓?
    candidates.sort((a, b) => {
      if (a.domIndex !== b.domIndex) return b.domIndex - a.domIndex;
      return b.index - a.index;
    });

    for (const candidate of candidates) {
      if (likedCount >= maxLikesPerRound) break;
      const { index: i, domIndex, text, likeMatch, row: c, isLeaf } = candidate;
      const visibleIndex = i;
      roundRuleHits += 1;
      console.log(
        `[Phase3Interact] 闂備礁鎲＄粙鎺楀垂濠靛鍤堥柟瀵稿У閸犲棝鏌涢弴銊ヤ簻闁?note=${noteId} visibleRow=${visibleIndex} domRow=${domIndex >= 0 ? domIndex : 'na'} rule=${likeMatch.matchedRule || likeMatch.reason}`,
      );
      const hitMeta = {
        noteId,
        visibleIndex,
        domIndex,
        isLeaf,
        userId: String(c.user_id || '').trim(),
        userName: String(c.user_name || '').trim(),
        text,
        matchedRule: likeMatch.matchedRule || likeMatch.reason,
        ts: new Date().toISOString(),
      };

      if (!isLeaf) {
        roundNestedSkipped += 1;
        console.log(`[Phase3Interact] 闂佽崵濮撮幖顐︽偪閸モ晜宕查柛鎰靛枟閸婇鐥鐐村櫧妞?note=${noteId} visibleRow=${visibleIndex} reason=nested_parent`);
        continue;
      }

      let inViewport = true;
      if (dryRun) {
        // dry-run 闂備礁缍婂褏绮旇ぐ鎺撳仧妞ゆ梻鏅々?        await highlightCommentRow(sessionId, visibleIndex, unifiedApiUrl, 'virtual-like-row').catch((): null => null);
        const highlightRes = await highlightLikeButton(sessionId, visibleIndex, unifiedApiUrl);
        inViewport = highlightRes?.inViewport === true;
        await delay(450);
      } else {
        inViewport = await isLikeButtonInViewport(sessionId, visibleIndex, unifiedApiUrl);
      }
      if (!inViewport) {
        roundNotVisibleSkipped += 1;
        console.log(`[Phase3Interact] 闂佽崵濮撮幖顐︽偪閸モ晜宕查柛鎰靛枟閸婇鐥鐐村櫧妞?note=${noteId} visibleRow=${visibleIndex} reason=not_in_viewport`);
        continue;
      }

      // 缂備胶铏庨崣搴ㄥ窗閺囩姵宕叉慨妯块哺鐎氭岸鏌涢弴銊ユ珮闁哥喎鐗嗛—鍐Χ閸ャ劌娈屽┑鐘亾妞ゅ繐妫欓崰鍡涙煕閳╁喚娈旂紓宥嗘尭閳藉骞欓崘銊ョ睄闂佺瀛╅幐鎶藉极瀹ュ懐鏆嗛柛鏇ㄤ簽缁辨岸姊虹粙璺ㄧ缂佸鏁诲畷娲川閺夋垹鍊?闂備胶绮崝妤呭箠閹捐鍚规い鏇楀亾鐎规洘鍨肩粻娑㈠即?
      const centered = await ensureCommentVisibleCentered(sessionId, unifiedApiUrl, visibleIndex);
      if (!centered) {
        roundNotVisibleSkipped += 1;
        console.log(`[Phase3Interact] 闂佽崵濮撮幖顐︽偪閸モ晜宕查柛鎰靛枟閸婇鐥鐐村櫧妞?note=${noteId} visibleRow=${visibleIndex} reason=center_failed`);
        continue;
      }

      if (dryRun) {
        // dry-run 闂備礁缍婂褏绮旇ぐ鎺撳仧妞ゆ梻鏅々?        await highlightCommentRow(sessionId, visibleIndex, unifiedApiUrl, 'virtual-like-row').catch((): null => null);
        await highlightLikeButton(sessionId, visibleIndex, unifiedApiUrl).catch((): null => null);
        await delay(300);
      }

      const signature = {
        userId: String(c.user_id || '').trim() || undefined,
        userName: String(c.user_name || '').trim() || undefined,
        text,
      };

      const sigKey = makeSignature(noteId, String(signature.userId || ''), String(signature.userName || ''), text);
      if (likedSignatures.has(sigKey)) {
        roundDedupSkipped += 1;
        continue;
      }

      const beforeState = await getLikeStateForVisibleCommentIndex(sessionId, unifiedApiUrl, visibleIndex);
      let beforeLiked = beforeState.iconState === 'liked';
      if (!beforeLiked && beforeState.iconState === 'unknown') {
        beforeLiked = await verifyLikedBySignature(sessionId, unifiedApiUrl, signature);
      }
      if (beforeLiked) {
        roundAlreadyLikedSkipped += 1;
        likedSignatures.add(sigKey);
        if (!dryRun) {
          saveLikedSignature(keyword, env, sigKey);
        }
        continue;
      }

      let beforePath: string | null = null;
      let afterPath: string | null = null;
      let beforeBase64: string | null = null;
      let afterBase64: string | null = null;
      let didClick = false;

      if (!dryRun) {
        // 闂佽崵濮村ú顓㈠绩闁秵鍎戝ù鐓庣摠閸婇鐥鐐村櫧妞も晝鏁婚幃瑙勬媴娓氼垳鍔搁悷婊呭閻擄繝寮澶婇唶闁靛鍨规禍楣冩煟閺傛寧鎯堥柤鐑樺▕濮婂宕熼鈧慨鍥煕閳哄偆娈滈柡浣哥У瀵板嫭绻濋崒娑㈡暘闂備線娼荤拹鐔煎礉婢舵劕鐒垫い鎺嶈兌閻﹦鈧鎸稿Λ娑欑閹间礁骞㈡俊顖濄€€閹稿啴鏌ｉ悙瀵糕槈闁兼椿鍨堕幃鍧楀礋椤栨稈鎸冮梺鍛婁緱閸ㄧ増绂掗鐐村仯鐟滃繘宕戦悢鐓庣；闁挎繂顦粈鍕煟閹存梹鏉归柛瀣尭閳规垿宕堕…鎴炐濋梺鑽ゅ枑閻熻京绮婚幋锝冧汗?
        const likePermit = await requestLikeGate(sessionId);
        if (process.env.WEBAUTO_LIKE_GATE_BYPASS === '1') {
          likePermit.allowed = true;
        }
        if (!likePermit.allowed) {
          roundGateBlocked += 1;
          console.log(`[Phase3Interact] 闂?闂備胶绮崝妤呫€佹繝鍕焿闁规壆澧楅悞濠氭煟閺傛寧鎯堥柤鐑樺▕濮婂宕熼鈧慨鍥煕閳哄偆娈滈柡?{likePermit.current}/${likePermit.limit}`);
          await delay(1000);
          continue;
        }

        beforeBase64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);

        const clickRes = await clickLikeButtonByIndex(sessionId, visibleIndex, unifiedApiUrl);
        if (!clickRes?.success) {
          roundClickFailed += 1;
          continue;
        }
        didClick = true;
        totalClickAttempts += 1;
        await delay(650);
        afterBase64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);
      } else {
        // dry-run: do not actually like; leave evidence only
        await delay(450);
      }

      if (didClick) {
        const hitMetaPath = await writeHitMeta('hit-idx-' + String(i).padStart(3, '0'), hitMeta);
        if (hitMetaPath) {
          console.log(`[Phase3Interact] hit meta saved: ${hitMetaPath}`);
        }

        if (beforeBase64) {
          const dir = await ensureLikeEvidenceDir();
          const hitName = `hit-idx-${String(i).padStart(3, '0')}-${Date.now()}.png`;
          await savePngBase64(beforeBase64, path.join(dir, hitName));

          const beforeName = `like-before-idx-${String(i).padStart(3, '0')}-${Date.now()}.png`;
          beforePath = await savePngBase64(beforeBase64, path.join(dir, beforeName));
        }

        if (afterBase64) {
          const dir = await ensureLikeEvidenceDir();
          const afterName = `like-after-idx-${String(i).padStart(3, '0')}-${Date.now()}.png`;
          afterPath = await savePngBase64(afterBase64, path.join(dir, afterName));
        }
      }

      if (!dryRun) {
        const afterState = await getLikeStateForVisibleCommentIndex(sessionId, unifiedApiUrl, visibleIndex);
        const nowLiked =
          afterState.iconState === 'liked' || (await verifyLikedBySignature(sessionId, unifiedApiUrl, signature));
        if (!nowLiked) {
          roundVerifyFailed += 1;
          continue;
        }
      }

      likedCount += 1;
      roundNewLikes += 1;
      likedSignatures.add(sigKey);
      if (!dryRun) {
        saveLikedSignature(keyword, env, sigKey);
      }
      likedComments.push({
        index: i,
        userId: String(signature.userId || ''),
        userName: String(signature.userName || ''),
        content: String(text || ''),
        timestamp: String(c.timestamp || ''),
        screenshots: { before: beforePath, after: afterPath },
        matchedRule: likeMatch.matchedRule,
      });

      // 闂備胶绮崝妤呫€佹繝鍕焿闁规壆澧楅埛鎺楁煙缂併垹鏋熸い?
      await delay(900);
    }
    totalDedupSkipped += roundDedupSkipped;
    totalAlreadyLikedSkipped += roundAlreadyLikedSkipped;
    totalRuleHits += roundRuleHits;
    totalNotVisibleSkipped += roundNotVisibleSkipped;
    totalNestedSkipped += roundNestedSkipped;
    totalGateBlocked += roundGateBlocked;
    totalClickFailed += roundClickFailed;
    totalVerifyFailed += roundVerifyFailed;

    const roundLikedTotal = roundNewLikes + roundDedupSkipped + roundAlreadyLikedSkipped;
    const roundSkippedTotal =
      roundNotVisibleSkipped + roundNestedSkipped + roundGateBlocked + roundClickFailed + roundVerifyFailed;
    const roundOutcomeTotal = roundLikedTotal + roundSkippedTotal;
    const roundHitOk = roundOutcomeTotal === roundRuleHits;
    if (!roundHitOk) {
      console.warn(
        `[Phase3Interact] hit-check mismatch round=${scrollCount} hits=${roundRuleHits} outcomes=${roundOutcomeTotal} liked=${roundLikedTotal} skipped=${roundSkippedTotal}`,
      );
    }

    // 闂備浇顕х换鎰崲閹寸姵宕查柛鈩冪⊕閸庡﹥銇勯弽銊х焼婵炲矈浜弻锟犲炊閳轰椒鎴风紒鐐劤椤兘寮婚敓鐘茬倞闁靛濡囩粙鍥ь渻閵堝繒鐣虫繛澶嬫礋楠炲繘鎮╃拠鑼槹濡炪倖娲栭幊搴ㄥ疾閵夆晜鈷戦柟鑲╁仜閸斻倝鏌涚€ｎ偆娲撮挊婵嬫煛鐏炶鍔滈柡鍜佸墰閳ь剙鍘滈崑鎾绘煕閺囥劋绨界紒杈ㄥ哺濮婅櫣绮欑捄銊ь唶缂備礁顦遍ˉ鎰板Φ閹邦垼妲炬繛瀵稿缁犳挸顕ｉ幘顔藉€烽柣銏㈩暜缁卞崬鈹戦悙鏉戠仸闁瑰憡鎸冲畷鎴﹀箻缂佹ê鈧爼鏌ｉ幇顓炵祷闁逞屽墯閹倿銆佸鑸电劶鐎广儱妫楀▓婊堟⒑閸濆嫷妲归柛銊ョ埣瀹曠敻骞掗幋鏃€顫嶉梺鐟扮仢閸燁偄顕ｉ娴庡綊鎮╅崘鎻掝潓濡炪値鍘奸悿鍥╃不濞戞埃鍋撻敍鍗炲暕婢?    await expandMoreComments(sessionId, unifiedApiUrl);
    await delay(350);

    // 闂備礁婀遍崢褔鎮洪妸銉冩椽鎮㈤悡搴ｏ紵闂佸搫顦伴崵锕€鈽夐姀鐘靛姦濡炪倖宸婚崑鎾绘婢舵劖鍊甸柨婵嗘噹椤ｅ磭绱?
    // - 婵犵數鍋炲娆撳触鐎ｎ喗鏅梻浣告啞钃辩紒瀣浮楠炲繘宕ㄩ娑樼／闂侀潧顭梽鍕枔閵忋倖鈷戦柛婵嗗椤忊晜绻涚€电鍘撮柛?end marker / 缂傚倸鍊风粈渚€鎯岄崒婊呯＝婵鍩栭崕濠囧箹鏉堝墽绋诲┑顖氥偢閺岋綁骞嬮悜鍡欏姺闂佹悶鍔岄妶鎼佸箖?
    // - 闂備浇顕у锕傦綖婢跺苯鏋堢€广儱鎷戦懓鍧楁煃閳轰礁鏆炲┑顖涙尦閹綊骞侀幒鎴濐瀴闂佸搫妫楃换鎺楀焵椤掆偓閻忔碍绔熺€ｎ喖纾婚柟鎹愵嚙缁狙囨煃閸濆嫬鈧綊鍩涢幇顔剧＜妞ゆ棁濮ょ亸锔锯偓瑙勬礃缁诲牊淇婇幖浣规櫆缂備焦菤閹稿嫭绻濋悽闈涗沪婵炲吋鐟╅、鏍箣閻樻剚娼熷┑鐘绘涧椤戝棝鎮炴總鍛婄厱妞ゎ厽鍨甸弸娑㈡偨椤栨稑鈻曢柡灞剧☉椤啰鎷犻幓鎺嗘嫟婵＄偑鍊栫敮妤呭箰閸愯尙鏆﹂柣鎴ｆ鎯熼梺鍐茬亪閺呮稒绂嶉悙顒傜瘈濠电姴鍊归崳铏圭磼閻樺磭鎳囬柟顔绢攰椤﹀綊鏌￠埀顒勫础閻戝棛鍔烽梺鍓茬厛閸嬪懏绂嶉妶鍡曠箚妞ゆ牗姘ㄦ禒銏ゆ煕濡櫣鎽犵紒缁樼箖缁绘繈宕橀鍡楀綆缂傚倷鐒﹁ぐ鍐╂櫠娴犲鐒垫い鎺嗗亾婵犫偓闁秴纾婚柕鍫濇媼閻庤埖銇勯弽銊с€掗柍缁樻⒒閳ь剙绠嶉崕閬嶅箠鎼淬劌鐤炬繛鍡樻尰閻撴洟鏌￠崘銊モ偓鎼佺€锋繝鐢靛仦濞兼瑥煤椤撱垹鍨傞柟顖嗏偓閺€浠嬫煕椤愩倕鏋旈柡鍡欏█濮婅櫣绱掑鍡欏姼闂佺硶鏅滈悧鐘诲春閳?
    const basicEnd = await isCommentEnd(sessionId, unifiedApiUrl);
    if (basicEnd) {
      reachedBottom = true;
      bottomReason = 'end_marker_or_empty';
    } else if (scrollCount % 10 === 0) {
      const bf = await checkBottomWithBackAndForth(sessionId, unifiedApiUrl, 3).catch(() => ({ reachedBottom: false, reason: 'error' }));
      reachedBottom = bf.reachedBottom;
      bottomReason = bf.reason;
    }
    if (reachedBottom) {
      const roundMs = Date.now() - roundStartMs;
      console.log(
        `[Phase3Interact] round=${scrollCount} visible=${extracted.length} harvestedNew=${roundHarvestedNew} harvestedTotal=${harvestedTotal} ruleHits=${roundRuleHits} gateBlocked=${roundGateBlocked} dedup=${roundDedupSkipped} alreadyLiked=${roundAlreadyLikedSkipped} notVisible=${roundNotVisibleSkipped} nestedParent=${roundNestedSkipped} clickFailed=${roundClickFailed} verifyFailed=${roundVerifyFailed} newLikes=${roundNewLikes} likedTotal=${likedCount}/${maxLikesPerRound} end=${bottomReason} ms=${roundMs}`,
      );
      try {
        onRound?.({
          round: scrollCount,
          visible: extracted.length,
          harvestedNew: roundHarvestedNew,
          harvestedTotal,
          ruleHits: roundRuleHits,
          hitTotal: roundRuleHits,
          skippedTotal: roundSkippedTotal,
          likedTotalActual: roundLikedTotal,
          hitCheckOk: roundHitOk,
          gateBlocked: roundGateBlocked,
          dedupSkipped: roundDedupSkipped,
          alreadyLikedSkipped: roundAlreadyLikedSkipped,
          notVisibleSkipped: roundNotVisibleSkipped,
          nestedParentSkipped: roundNestedSkipped,
          clickFailed: roundClickFailed,
          verifyFailed: roundVerifyFailed,
          newLikes: roundNewLikes,
          likedTotal: likedCount,
          reachedBottom: true,
          endReason: bottomReason,
          ms: roundMs,
        });
      } catch {
        // ignore onRound callback failures
      }
      console.log(`[Phase3Interact] reachedBottom=true reason=${bottomReason}`);
      break;
    }

    // 缂傚倸鍊风欢锟犲垂闂堟稓鏆﹂柣銏ゆ涧閸ㄦ繈鏌ц箛鎾磋础婵☆偒鍨抽幉鍛婃償閿濆懎鐏婇梺鍦檸閸犳牜绮堟径瀣ㄤ簻妞ゆ挾鍠庣粭褏绱掗埀顒勫礋椤栨稈鎷哄銈嗗坊閸嬫捇鏌ｈ箛鏃傜疄鐎规洏鍨芥俊鍫曞幢濡ゅ啰鐛柣鐔哥矋閸ㄧ敻鍩㈤弮鍫濆嵆闁绘梻顭堥崝鍛存⒑閹稿孩顥嗛柕鍡忓亾闂佺顑嗛幐濠氬箯閸涱噮妲归幖杈剧稻閸ｇ鈹戦悜鍥╁埌婵炶濡囬幑銏ゅ幢濞戞瑥鍓ㄦ繝銏ｅ煐閸旀洟骞戦崼鏇熺厪濠电偛鐏濇俊鎸庝繆閸欏鐏撮柟顔款潐閹峰懘宕ㄦ繝鍐ㄥ壍闂佽绻愬ù姘跺垂鐠鸿櫣鏆︽繛宸簼閸嬪嫰鏌涢幘鑼跺厡闁瑰樊浜滈埞鎴︽偐鐠囇勬暰闂佺厧婀遍崑鎾诲箞閵娾晛鐓涢柛娑卞枟濞?
    await scrollComments(sessionId, unifiedApiUrl, 650);
    await delay(900);

    const roundMs = Date.now() - roundStartMs;
    console.log(
      `[Phase3Interact] round=${scrollCount} visible=${extracted.length} harvestedNew=${roundHarvestedNew} harvestedTotal=${harvestedTotal} ruleHits=${roundRuleHits} gateBlocked=${roundGateBlocked} dedup=${roundDedupSkipped} alreadyLiked=${roundAlreadyLikedSkipped} notVisible=${roundNotVisibleSkipped} nestedParent=${roundNestedSkipped} clickFailed=${roundClickFailed} verifyFailed=${roundVerifyFailed} newLikes=${roundNewLikes} likedTotal=${likedCount}/${maxLikesPerRound} end=no ms=${roundMs}`,
    );
    try {
      onRound?.({
        round: scrollCount,
        visible: extracted.length,
        harvestedNew: roundHarvestedNew,
        harvestedTotal,
        ruleHits: roundRuleHits,
        hitTotal: roundRuleHits,
        skippedTotal: roundSkippedTotal,
        likedTotalActual: roundLikedTotal,
        hitCheckOk: roundHitOk,
        gateBlocked: roundGateBlocked,
        dedupSkipped: roundDedupSkipped,
        alreadyLikedSkipped: roundAlreadyLikedSkipped,
          notVisibleSkipped: roundNotVisibleSkipped,
          nestedParentSkipped: roundNestedSkipped,
          clickFailed: roundClickFailed,
          verifyFailed: roundVerifyFailed,
          newLikes: roundNewLikes,
          likedTotal: likedCount,
          reachedBottom: false,
        ms: roundMs,
      });
    } catch {
      // ignore onRound callback failures
    }
  }

  // 闂傚倷娴囪闁稿鎹囬弻锝夋晲閸涱喗鎷辩紒鎯у⒔椤牓鍩ユ径鎰妞ゆ牗鐭竟鏇炩攽閻愬樊鍤熷┑顔惧亾閹便劑濡舵径濠勭枀閻庤娲栧ú锕傚疮閸濆嫨鈧帒顫濋濠傚缂備讲鍋撳璺侯焾閳ь剚甯掗～婵嬵敄閸欍儳閽电紓鍌欑贰閻撳牓宕滃顒夊殫闁告洦鍋掗崥瀣煕閵夛絽濡块柨娑欙耿濮婃椽骞愭惔锝傛闂佺粯顨呴幊鎰垝椤撶喎绶為幖瀛樼◥濮规姊洪崨濠庢畼闁稿鍋ら獮鍡椻枎韫囧﹥顫嶉梺瑙勫劤婢у海鏁☉姘辩＜濞撴艾锕ら々顒傜磼椤旂晫鎳呴柍褜鍓ㄧ徊鑺ユ櫠鎼达絿鐭?
  const likedTotal = likedCount + totalDedupSkipped + totalAlreadyLikedSkipped;
  const skippedTotal = totalNotVisibleSkipped + totalNestedSkipped + totalGateBlocked + totalClickFailed + totalVerifyFailed;
  const outcomeTotal = likedTotal + skippedTotal;
  const hitCheckOk = outcomeTotal === totalRuleHits;
  console.log(
    `[Phase3Interact] hit-check summary: hits=${totalRuleHits} liked=${likedTotal} skipped=${skippedTotal} ok=${hitCheckOk}`,
  );
  if (totalClickAttempts > 0) {
    try {
      const dir = await ensureLikeEvidenceDir();
      await fsp.writeFile(
        path.join(dir, `summary-${Date.now()}.json`),
        JSON.stringify(
          {
            noteId,
            safeUrl,
            likeKeywords,
            likedCount,
            hitCount: totalRuleHits,
            likedTotal,
            skippedTotal,
            hitCheckOk,
            skippedBreakdown: {
              notVisible: totalNotVisibleSkipped,
              nestedParent: totalNestedSkipped,
              gateBlocked: totalGateBlocked,
              clickFailed: totalClickFailed,
              verifyFailed: totalVerifyFailed,
            },
            likedBreakdown: {
              newLikes: likedCount,
              alreadyLiked: totalAlreadyLikedSkipped,
              dedup: totalDedupSkipped,
            },
            clickAttempts: totalClickAttempts,
            mismatchEvidence: {
              postScreenshot: mismatchPostScreenshot,
            },
            reachedBottom,
            likedComments,
            ts: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf8',
      );
    } catch {
      // ignore
    }
  }

  if (!hitCheckOk && totalClickAttempts > 0) {
    try {
      const navRes = await gotoDetailWithRetry(sessionId, safeUrl, unifiedApiUrl);
      if (navRes.ok) {
        await delay(1800);
        mismatchPostScreenshot = await captureLikeEvidence('hit-mismatch-post');
      }
    } catch {
      // ignore mismatch evidence failures
    }
  }

  const strictHitCheck = process.env.WEBAUTO_PHASE3_HIT_ASSERT === '1';
  if (strictHitCheck && !hitCheckOk) {
    return {
      success: false,
      noteId,
      likedCount,
      scannedCount,
      likedComments,
      commentsAdded: shouldHarvest ? harvestedAdded : undefined,
      commentsTotal: shouldHarvest ? harvestedTotal : undefined,
      commentsPath: shouldPersistHarvest ? harvestPath : undefined,
      evidenceDir: likeEvidenceDir || '',
      dedupSkipped: totalDedupSkipped,
      alreadyLikedSkipped: totalAlreadyLikedSkipped,
      reachedBottom,
      stopReason: reachedBottom ? bottomReason : undefined,
      hitCount: totalRuleHits,
      skippedCount: skippedTotal,
      likedTotal,
      hitCheckOk,
      mismatchEvidence: { postScreenshot: mismatchPostScreenshot },
      error: `hit_count_mismatch hits=${totalRuleHits} outcomes=${outcomeTotal}`,
    };
  }

  return {
    success: true,
    noteId,
    likedCount,
    scannedCount,
    hitCount: totalRuleHits,
    skippedCount: skippedTotal,
    likedTotal,
    hitCheckOk,
    mismatchEvidence: { postScreenshot: mismatchPostScreenshot },
    likedComments,
    commentsAdded: shouldHarvest ? harvestedAdded : undefined,
    commentsTotal: shouldHarvest ? harvestedTotal : undefined,
    commentsPath: shouldPersistHarvest ? harvestPath : undefined,
    evidenceDir: likeEvidenceDir || '',
    dedupSkipped: totalDedupSkipped,
    alreadyLikedSkipped: totalAlreadyLikedSkipped,
    reachedBottom,
    stopReason: reachedBottom ? bottomReason : undefined,
  };
}
