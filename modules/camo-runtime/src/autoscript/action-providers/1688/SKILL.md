---
name: 1688-automation
description: 用 Camo 操作 1688 平台
version: 2.0.0
platform: 1688
last_verified: "2026-04-16"
---

# 1688 Automation

## 锚点
1. 登录: `body.includes('下午好，')`
2. 搜索成功: `body.includes('已售')`
3. 店铺: `a[href*='shop'][href*='.1688.com']`
4. 旺旺: `a[href*='uid=']`

## 输出字段
offerId, companyName, shopUrl, wwNick, wwHref, href

## 运行
`webauto 1688 collect --profile 1688-test-1 --keyword <关键词>`
