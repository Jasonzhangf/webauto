/**
 * 修正微博容器定义
 * 
 * 修正内容：
 * 1. 更新 weibo_main_page.feed_list 的选择器，确保能匹配到
 * 2. 更新 weibo_main_page.feed_post 的选择器，适配最新 DOM
 */

import fs from 'fs';
import path from 'path';

// 修正 feed_list 定义
const feedListPath = 'container-library/weibo/weibo_main_page/feed_list/container.json';
const feedList = JSON.parse(fs.readFileSync(feedListPath, 'utf-8'));

feedList.selectors = [
  {
    // 更宽泛的选择器，匹配 Home_feed
    "css": "div[class*='Home_feed_']",
    "variant": "primary",
    "score": 1.0
  },
  {
    "css": "main[class*='Main_wrap_'] div[class*='Home_feed_']",
    "variant": "fallback",
    "score": 0.8
  },
  {
    // 匹配滚动容器
    "css": "div[class*='vue-recycle-scroller']",
    "variant": "structure",
    "score": 0.7
  }
];

fs.writeFileSync(feedListPath, JSON.stringify(feedList, null, 2));
console.log('Updated feed_list definition');

// 修正 feed_post 定义
const feedPostPath = 'container-library/weibo/weibo_main_page/feed_post/container.json';
const feedPost = JSON.parse(fs.readFileSync(feedPostPath, 'utf-8'));

feedPost.selectors = [
  {
    "css": "article[class*='Feed_wrap_']",
    "variant": "primary",
    "score": 1.0
  },
  {
    // 适配虚拟列表中的 item
    "css": "div[class*='wbpro-scroller-item']",
    "variant": "structure",
    "score": 0.8
  },
  {
    "css": "div[class*='vue-recycle-scroller__item-view']",
    "variant": "fallback",
    "score": 0.6
  }
];

fs.writeFileSync(feedPostPath, JSON.stringify(feedPost, null, 2));
console.log('Updated feed_post definition');
