# WebAuto 浠诲姟杩借釜锛堝皬绾功 Workflow 鎷?Block 钀藉湴锛?

> 鐩爣锛氬熀浜庡鍣ㄩ┍鍔ㄧ殑 Workflow 瀹屾垚灏忕孩涔︽悳绱?+ 璇︽儏 + 璇勮閲囬泦锛堝綋鍓嶅叏娴佺▼鐩爣锛?00 鏉★級銆?

## 褰撳墠鎵ц浠诲姟锛?026-01-15锛?

### 馃幆 涓荤嚎鐩爣锛堟寜浣犵殑鏈€鏂版祦绋嬶級

1. Phase1锛氬惎鍔ㄥ畧闂ㄤ汉锛堟寜渚濊禆椤哄簭纭繚 `Unified API(7701)` 鈫?`Browser Service(7704)` 鈫?浼氳瘽瀛樺湪 鈫?宸茬櫥褰曪級銆?
2. Phase2锛氬彧鎼滅储涓€娆?鈫?**鍙粴鍔ㄦ悳绱㈢粨鏋滈〉** 鈫?姣忔鍙鐞嗏€滆鍙ｅ唴鍗＄墖鈥濓細
   - 绯荤粺鐐瑰嚮鍗＄墖杩涘叆璇︽儏锛?
   - 鍦ㄨ鎯呴〉鎷垮埌甯?`xsec_token` 鐨勫畨鍏ㄩ摼鎺ワ紱
   - 鍚屾椂鎶藉彇鈥滄鏂?鍥剧墖/浣滆€呪€濈瓑鍩虹淇℃伅锛?
   - 钀界洏锛氬啓鍏?`safe-detail-urls.jsonl`锛堜互鍙?Phase2 璇︽儏鍩虹鏁版嵁锛屼緵鍚庣画璇勮闃舵浣跨敤锛夈€?
   - 杩愯绛栫暐锛堢画浼?vs 杩藉姞锛夛細
     - 鑻ュ巻鍙?`safe-detail-urls` 涓粛瀛樺湪鏈惤鐩樼殑 note锛堢己 `comments.md`锛夛紝浼樺厛缁紶 Phase3-4锛屼笉閲嶅鎼滅储锛?
     - 鑻ュ巻鍙?`safe-detail-urls` 宸插叏閮ㄨ惤鐩橈紝鍒欒繘鍏モ€滆拷鍔犻噰闆嗏€濇ā寮忥細鍦ㄧ幇鏈?safeCount 鍩虹涓婂啀杩藉姞 `target` 鏉℃柊閾炬帴锛堥伩鍏?`safeCount>=target` 鏃舵棤浜嬪彲鍋氾級銆?
3. Phase3锛堝彲閫夛級锛氬熀浜?Phase2 鐨勫垪琛紝浣跨敤 **N 涓?tab 甯搁┗琛ヤ綅** 杞浆閲囬泦璇勮锛堥粯璁?4锛涙瘡甯栨瘡杞渶澶?100 鏉★級锛岄伩鍏嶅崟甯栬繛缁粴鍔ㄣ€?
4. Phase4锛氳惤鐩橈紙缁紶 + 鍘婚噸锛夛細涓柇鍚庢寜 step 鎭㈠锛涙湰鍦板凡鏈夊唴瀹瑰繀椤诲彲璺宠繃/鍙閲忔洿鏂般€?

### 馃З 鏂板锛氬悗鍙拌繍琛岋紙2026-01-16锛?

- `phase1-4-full-collect.mjs` 鏀寔 `--daemon true`锛氱埗杩涚▼浼氫互 detached 鏂瑰紡鎷夎捣瀛愯繘绋嬪苟绔嬪埢閫€鍑猴紝瀛愯繘绋嬫寔缁啓鍏ユ湰鍦?run log锛涘叧闂粓绔笉褰卞搷浠诲姟缁х画杩愯銆?

### 鉁?宸插畬鎴愶紙绋冲畾閮ㄥ垎锛?

- [x] Phase1 鍩虹鏈嶅姟瀹堥棬浜猴細鑴氭湰鍙嚜鍔ㄦ媺璧?`unified-api`/`browser-service`锛屽鐢ㄥ凡瀛樺湪鐨?`xiaohongshu_fresh` 浼氳瘽锛涙湭鎵惧埌浼氳瘽鏃跺彲鍚庡彴鍚姩 `start-headful` 骞剁瓑寰呬細璇濆嚭鐜般€?
- [x] 鐧诲綍鎬佹娴嬶細鏀寔閫氳繃瀹瑰櫒閿氱偣锛坄login_anchor/login_guard/qrcode_guard`锛夎瘑鍒€滃凡鐧诲綍/鏈櫥褰?椋庢帶鈥濆苟闃绘柇鏈櫥褰曘€?
- [x] SearchGate 鍦ㄧ嚎妫€娴嬩笌鑷惎鍔紙Phase3/4 鑺傛祦鍏ュ彛锛夈€?
- [x] 澶辫触閫€鍑虹爜涓庣悊鐢憋細鑴氭湰澶辫触鏃惰緭鍑?`[Exit] code=<number> reason=<string>`锛屽苟鎸夐樁娈电矖绮掑害鏄犲皠锛坄phase2_* 鈫?20+`, `phase3_* 鈫?30+`, `phase4_* 鈫?40+`锛涙湭鐭ラ敊璇负 `1`锛夈€?
- [x] Run-level 鏃ュ織涓庢椂闂寸嚎锛氭瘡娆¤繍琛屼細鐢熸垚 `run.<runId>.log` 涓?`run-events.<runId>.jsonl`锛岀敤浜庡洖鏀惧拰瀹氫綅鍗＄偣锛堢洰褰曞湪 `~/.webauto/download/xiaohongshu/{env}/{keyword}/`锛夈€?
- [x] 璇勮鍖烘縺娲讳笌 hover锛氬鈥滄鏂囧緢闀垮鑷磋瘎璁哄尯涓嶅湪瑙嗗彛 / 闇€鍏堢偣璇勮鎸夐挳鈥濈殑椤甸潰锛學armupComments 浼氬厛鐐瑰嚮 `xiaohongshu_detail.comment_button`锛坄.chat-wrapper`锛夊啀閲嶆柊瀹氫綅 `comment_section`锛屽苟鍦ㄦ粴鍔ㄥ墠寮哄埗 hover/click 鍒拌瘎璁哄尯锛岄伩鍏嶇劍鐐瑰仠鍦ㄨ緭鍏ユ瀵艰嚧婊氬姩鏃犳晥銆?
- [x] Phase3-4 Tab 甯搁┗琛ヤ綅锛氫笉鍐嶁€? 甯栦竴缁勬暣浣撳叧闂€濓紝鏀逛负 **N 涓?tab 甯搁┗**锛堥粯璁?4锛夛紝褰撴娴嬪埌 `reachedEnd` 鎴?`emptyState`锛堟垨杈惧埌 `maxRoundsPerNote`锛夊嵆鍒ゅ畾璇ュ笘瀹屾垚锛屽苟鍦ㄥ悓涓€涓?tab 鍐呮墽琛?`goto` 瀵艰埅鍒颁笅涓€鏉￠摼鎺ヨˉ浣嶏紙闃熷垪鑰楀敖鍒欎繚鎸佺┖闂诧級銆?
- [x] Headless 娴嬭瘯寮€鍏筹細鑴氭湰鏀寔 `--headless true` + `--restart-session true` 浠?headless 妯″紡鍚姩/閲嶅缓浼氳瘽骞舵墽琛岄噰闆嗭紙鐢ㄤ簬鑷姩鍖栧洖褰掓祴璇曪級銆?

### 馃Ж 褰撳墠闃诲锛堥渶瑕佸鐜?+ 淇锛?

> 鐩爣锛歅hase2 蹇呴』鍋氬埌鈥滃彧鎼滅储涓€娆?+ 绯荤粺婊氬姩锛堢姝?JS fallback锛? 鍏抽敭瀛椾笉婕傜Щ + 瑙嗗彛鍐呯偣鍑烩€濓紝骞惰兘鍦ㄩ珮閲忚瘝涓嬪揩閫熻窇婊＄洰鏍囨暟銆?

1. [ ] Phase2 绂佹閲嶅 GoToSearch锛氬惊鐜唴鍙厑璁糕€滃洖閫€/ESC鈥濇仮澶嶅埌鎼滅储椤碉紝绂佹鍐嶆瑙﹀彂鎼滅储锛堥伩鍏嶉噸澶嶅埛鏂颁笌姝诲惊鐜級銆?
2. [x] Phase2 绯荤粺婊氬姩锛氬凡绉婚櫎 JS scroll 鍏滃簳锛涙粴鍔ㄦ敼涓衡€滅郴缁熸粴杞€濓細
   - 浼樺厛璧?`browser-service(7704) /command mouse:wheel`锛堟湇鍔￠噸鍚悗鐢熸晥锛夛紱
   - 鑻ュ綋鍓嶆湇鍔＄増鏈湭鍖呭惈 `mouse:wheel`锛岃剼鏈嚜鍔ㄥ洖閫€鍒?`browser-service(8765) WS user_action.scroll`锛堜粛鏄?Playwright mouse.wheel锛岄潪 JS 婊氬姩锛夛紱
   - 姣忔婊氬姩鍚庤褰曞苟楠岃瘉 `scrollY/scrollTop/visibleSig`锛屾棤鍙樺寲鍒欏仠涓嬮伩鍏嶆寰幆锛?
   - 鏂板 `isAtEnd` 鍒ゅ畾锛氭粴鍔ㄥ墠鍏堝垽鏂槸鍚﹀凡鍒板簳锛坙ist/window 浠婚€夊叾涓€锛夛紝宸插埌搴曞垯鐩存帴 stop 骞惰褰曞師鍥狅紝閬垮厤璇姤鈥滄粴鍔ㄦ棤鍙樺寲鈥濄€?
3. [ ] Phase2 鍏抽敭瀛楁紓绉绘娴嬶細涓€鏃?URL keyword 涓庨娆℃悳绱?canonical keyword 涓嶄竴鑷达紝蹇呴』鍋滀笅锛堟垨浠呭厑璁镐竴娆♀€滃悗閫€鈥濇仮澶嶏級锛岄伩鍏嶅湪閿欒鍏抽敭璇嶄笅缁х画閲囬泦銆?
4. [ ] Phase2 鈥滄棤 token鈥濆鐞嗭細鎵撳紑璇︽儏鍚庡鏋?URL 娌℃湁 `xsec_token`锛岀珛鍒诲仠鍦ㄨ鎯呴〉锛堢粰浜哄伐妫€鏌ワ級+ 鐢熸垚鎴浘/DOM 蹇収 + 鏄庣‘閫€鍑哄師鍥?閫€鍑虹爜銆?
5. [ ] Phase2 閫熷害搴﹂噺锛氭妸鈥滄瘡鏉¤鎯呮墦寮€鑰楁椂銆佹€昏€楁椂銆佸钩鍧囪€楁椂鈥濆啓鍏?JSONL锛堜究浜庣‘璁ゆ參鍦ㄥ摢閲岋級銆?
6. [ ] Phase3 4-tab 鎺ュ姏绋冲畾鎬э細蹇呴』纭繚鈥滄墦寮€鏂?tab 鈫?杩涘叆璇︽儏 鈫?璇勮婊氬姩鐢熸晥 鈫?澧為噺钀界洏鈥濓紝浠讳綍闃舵澶辫触閮介渶瑕?`debug snapshot + 闈為浂閫€鍑虹爜`銆?
7. [x] 璇勮鏁伴噺瀵归綈楠岃瘉锛堜氦浠樺繀娴嬶級锛?
   - 姣忎釜 note 璁板綍 `totalFromHeader`锛堣鎯呴〉璇勮鎸夐挳/澶撮儴缁熻锛変笌 `collected`锛堟湰鍦版姄鍙栫殑璇勮鏉℃暟锛夛紱
   - 鐢熸垚 `summary.comments.jsonl` + `summary.comments.md`锛堟瘡涓?note 涓€琛岋級锛?
   - 浠绘剰 note 鍑虹幇涓嶅榻愶紙`collected !== totalFromHeader`锛夊垯鍏ㄦ祦绋嬩互闈為浂閫€鍑虹爜缁撴潫锛堝苟淇濈暀 summary 渚涙帓鏌ワ級銆?
8. [x] 璇勮鏂偣缁紶钀界洏锛?
   - 璇勮澧為噺鍐欏叆 `{noteId}/comments.jsonl`锛堟瘡娆″彧 append 鏂拌瘎璁猴紝鏀寔 crash 鍚庢仮澶嶏級锛?
   - 瀹屾垚鍚庡啓 `{noteId}/comments.done.json` 浣滀负鈥滃凡瀹屾垚鈥濇爣璁帮紙鍏煎鍘嗗彶浠?`comments.md` 鐨勬棫鏁版嵁锛夈€?

### 鉁?鏈€鏂板疄娴嬭褰曪紙2026-01-15锛?

- Phase2(ListOnly) 鐩爣杈炬垚锛歚keyword=澶栬锤 target=200 env=debug` 宸茶窇婊?200 鏉?`xsec_token` 閾炬帴锛堣€楁椂绾?13 鍒嗛挓锛夛紝钀界洏 `~/.webauto/download/xiaohongshu/debug/澶栬锤/safe-detail-urls.jsonl`锛坄phase2-detail-failures.jsonl` 璁板綍 1 鏉＄偣鍑昏繘璇︽儏澶辫触锛夈€?
- Phase3/4 璇勮婊氬姩涓庡榻愰獙璇侊細`noteId=691ef02d000000000d03b9cd` 宸插畬鎴愬苟瀵归綈锛坄headerTotal=67 collected=67`锛夛紝钀界洏 `comments.jsonl/comments.md/comments.done.json`銆?
- 鍏抽敭淇锛氬懡涓?`end_marker/empty_state` 鏃讹紝涓嶅啀鍙?`commentsPerRound` 闄愬埗锛屾湰娆′細鎶娾€滈〉闈㈠凡娓叉煋浣嗗皻鏈惤鐩樷€濈殑璇勮涓€娆℃€у啓鍏ワ紝閬垮厤鈥滃凡鍒板簳浣嗘案杩滅己璇勮瀵艰嚧涓嶅榻愨€濈殑姝诲惊鐜€?

---

### 2026-02-02：CLI/安装包/GPU 启动修复
- browser-service 启动增加 Chromium 禁用 GPU 参数（win32），缓解 headful 启动崩溃
- CLI 帮助改为 xhs，补充 -k/-n/-cn/--headless/--headful 说明，默认无参显示帮助
- macOS 打包脚本与安装脚本改为根目录 xhs/xhs.bat，移除 xhs-cli/bin
- README 中 PowerShell 示例修复 `.\xhs.bat` 转义
### 2026-02-03：Phase2 退出态与视口校验
- Phase2 采集前增加“退出态正确 + 视口内可采集”校验，失败先恢复再重试
- 检测搜索页风控/验证码标记（URL/弹层），命中即停止并保留证据
### 2026-02-04：视口/窗口同步与心跳退出
- EnsureSession 视口基于屏幕可用高度自适配，默认缩放 50%
- BrowserSession 设置视口时同步窗口尺寸，避免视口与窗口不一致
- 服务与 SearchGate 增加心跳监控，主进程停止后自动退出
- 心跳锚点切换为浏览器会话：由 browser-service 写入状态，浏览器退出后统一自杀
- Phase1 视口高度改为屏幕高度-40（略低于系统显示高度）
- Phase1/EnsureSession 使用 browser-service 提供的系统显示分辨率，避免 Playwright screen 仅返回视口高度
- system:display 增加 native 分辨率读取（Win32 VideoController），保证 4K 设备获取到真实高度
- Phase34/评论 rotate4 新开 tab 增加 page:new fallback（list 前后差分），避免返回空 index 直接失败
- browser:page:new 兜底：controller 侧读取 page:list 的 activeIndex 补齐 index
### 2026-02-01锛氶摼鎺ラ噰闆?婊氬姩/闄愭祦鏇存柊
- Phase2 閾炬帴閲囬泦鎸?target 鑾峰彇锛屼笉鍐嶅弻鍊?- 閾炬帴鐐瑰嚮澶辫触锛氳瀵熷綋鍓?URL/瀹瑰櫒鐘舵€佸苟灏濊瘯鎭㈠鍒版悳绱㈠垪琛?- Phase1/Phase34 瑙嗗彛楂樺害鏀逛负灞忓箷鑷€傚簲
- 鎼滅储缁撴灉闅忔満鐐瑰嚮锛屾粴鍔ㄥ崱浣忔椂鎵ц 3-6 涓婃粴 + 3 涓嬫粴锛屾渶澶?3 娆?- SearchGate 鍚屽叧閿瘝 3 鍒嗛挓鍐呮渶澶?3 娆?
### 2026-01-27锛欳LI/鎵撳寘/鍚堝苟缁撴灉鏇存柊
- 鏂板鍏抽敭瀛楃洰褰?`merged.md` 鍚堝苟杈撳嚭锛堝寘鍚鏂囦笌璇勮锛?- CLI 鍏ュ彛鏀逛负 xhs锛屾敮鎸?`-k/-n/-cn/--headless/--headful`锛岄粯璁ょ敓浜х幆澧冿紙prod锛夛紝鏃犲弬鏄剧ず甯姪
- 鎵撳寘浜х墿绮剧畝锛氬幓闄?package-lock/README/install 鑴氭湰锛孋LI 鍏ュ彛鏀炬牴鐩綍
- 澧為噺閲囬泦涓庤瘎璁轰笂闄愭敮鎸侊紙targetCountMode=incremental + maxComments锛?- 鍗曟祴/瑕嗙洊鐜囷細helpers 鐩綍瑕嗙洊鐜?statements=100%锛宐ranch=92%锛坈8锛?- CLI 鍙傛暟瑙ｆ瀽鍗曟祴鏂板锛沚uild:services 涓?build-cli-win 楠岃瘉閫氳繃
- 鎵撳寘鎭㈠ install 鑴氭湰鐢熸垚锛坕nstall.bat/install.sh锛?
## 鍘嗗彶鎵ц浠诲姟锛?026-01-13锛?

### 馃敡 褰撳墠鐘舵€侊紙16:xx锛?
- Phase1 宸插彲鎵ц骞跺畬鎴愮櫥褰曟鏌ワ紙褰撳墠浼氳瘽 `xiaohongshu_fresh` 瀛樺湪锛岀櫥褰曢敋鐐瑰彲鍛戒腑锛夈€?
- Phase2 褰撳墠鎶ラ敊锛歚GoToSearch` 杩囩▼涓?`entryAnchor/exitAnchor = null`锛岄殢鍚?`fetch failed`锛屾悳绱㈡湭瀹屾垚銆?
- 宸蹭慨澶?`container:operation type` 鍙墽琛岋紙缁熶竴 API 杩斿洖 success锛夈€?

### 鉁?鏈疆淇鐩爣锛堟寜椤哄簭鎵ц锛?
1. **鏇存柊 task.md 鍚庡啀鎵ц**锛堝凡瀹屾垚锛夈€?
2. **淇 GoToSearch 鐨勫叆鍙ｇ姸鎬佽幏鍙栦笌閿氱偣楠岃瘉**锛?
   - 纭繚 `getCurrentUrl()` 鍦ㄤ細璇濆瓨鍦ㄦ椂杩斿洖姝ｇ‘ URL銆?
   - 淇 `verifyAnchorByContainerId()` 鐨勫け璐ヨ矾寰勪笌鏃ュ織锛屾槑纭け璐ュ師鍥狅紙瀹瑰櫒 index / selector / session锛夈€?
3. **瀹屾垚 Phase2 瀹屾暣娴嬭瘯**锛歋earchGate 璁稿彲鍚庢墽琛屾悳绱紝纭 search_result_list 鍛戒腑骞堕噰闆嗗垪琛ㄣ€?
4. **鎸夋柊瑙勫垯澧炲己鍥為€€**锛氱粺涓€鍏ュ彛鐘舵€佸垽鏂?鈫?灏忔鍥為€€ 鈫?涓婚〉鍥為€€锛堜粎鍏佽涓婚〉 URL 鐩磋揪锛夈€?
### 馃敡 姝ｅ湪淇锛氱粺涓€鐘舵€佹娴嬩笌鍥為€€鏈哄埗锛?026-01-13 04:35 PM锛?

**闂鍒嗘瀽锛?*
- 鑴氭湰鍚勮嚜鐙珛鍒ゆ柇褰撳墠鐘舵€侊紝缂轰箯缁熶竴鐨勫伐浣滄棩蹇楄褰?
- 鍥為€€绛栫暐涓嶇粺涓€锛屾湁鐨勮剼鏈洿鎺?URL 璺宠浆锛岃繚鍙嶉鎺ц姹?
- 缂哄皯鍩轰簬閿氱偣鐨勬笎杩涘紡鍥為€€锛堝厛灏忔 ESC锛屼笉琛屾墠鍥炰富椤碉級

**淇鏂规锛?*
1. **缁熶竴鐘舵€佹娴嬪叆鍙?*锛?
   - 鍦ㄦ墍鏈?Phase 鑴氭湰鍏ュ彛璋冪敤 `DetectPageStateBlock` 鑾峰彇褰撳墠 `stage`
   - 浠?StateRegistry 璇诲彇 `lastPhase` / `lastAnchor` 浣滀负宸ヤ綔鐘舵€佽褰?
   - 瀵规瘮褰撳墠 stage 涓庤褰曠姸鎬侊紝鍒ゆ柇鏄惁闇€瑕佸洖閫€

2. **鏅鸿兘鍥為€€閾捐矾**锛?
   - **灏忔鍥為€€**锛歞etail 鈫?ESC (ErrorRecoveryBlock)锛屾悳绱㈤〉 鈫?娓呯┖杈撳叆妗?
   - **涓鍥為€€**锛氱偣鍑?sidebar 鍙戠幇椤垫寜閽?
   - **澶ф鍥為€€**锛氳闂皬绾功涓婚〉 `https://www.xiaohongshu.com`锛堝敮涓€鍏佽鐨勭洿鎺?URL锛?

3. **閿氱偣楠岃瘉闂幆**锛?
   - 鍥為€€鍚庡繀椤婚噸鏂伴獙璇侀敋鐐癸紙URL + 瀹瑰櫒鍖归厤锛?
   - 鏈揪鍒伴鏈熺姸锟斤拷鍓嶄笉杩涘叆鍚庣画涓氬姟閫昏緫

**瀹炴柦姝ラ锛?*
- [ ] 鍒涘缓 `DetectWorkflowStateBlock`锛氳鍙?StateRegistry + 璋冪敤 DetectPageStateBlock
- [ ] 澧炲己 `RestorePhaseBlock`锛氬疄鐜板皬姝モ啋涓鈫掑ぇ姝ョ殑涓夌骇鍥為€€
- [ ] 鏇存柊鎵€鏈?Phase 鑴氭湰鍏ュ彛锛氬厛鐘舵€佹娴?鍥為€€锛屽啀鎵ц涓氬姟閫昏緫

---

## 褰撳墠鎵ц浠诲姟锛?026-01-13锛?

1. **杩涘叆鑴氭湰鍏堝仛鐘舵€佸垽鏂?*锛氱粺涓€鍦ㄨ剼鏈叆鍙ｈ鍙栧苟鎵撳嵃褰撳墠娴忚鍣ㄧ姸鎬侊紙URL + 闃舵 + 涓婃鏃ュ織璁板綍鐨勯敋鐐癸級銆?
   - 濡傛灉褰撳墠閿氱偣涓庤褰曠姸鎬佸尮閰?鈫?缁х画鎵ц銆?
   - 濡傛灉涓嶅尮閰?鈫?鎸変互涓嬬瓥鐣ュ洖閫€銆?
2. **鍥為€€绛栫暐**锛氫紭鍏堚€?*灏忔鍥為€€**鈥濓紙濡?ESC 閫€鍑鸿鎯呮垨鍏抽棴 overlay锛夛紝涓嶈鍐嶁€?*涓婚〉鍥為€€**鈥濄€?
   - 灏忔鍥為€€闇€鍩轰簬瀹瑰櫒閿氱偣鍒ゆ柇鏄惁鎴愬姛銆?
   - 涓婚〉鍥為€€鍚庨噸鏂版鏌ラ樁娈典笌閿氱偣锛屽啀缁х画銆?
3. **绂佹闈炰富椤?URL 鐩存帴璁块棶**锛氶櫎 `https://www.xiaohongshu.com` 澶栵紝绂佹鐩存帴璁块棶鍏跺畠 URL锛涜繘鍏ユ悳绱?璇︽儏/璇勮绛夊繀椤婚€氳繃瀹瑰櫒鐐瑰嚮銆?
4. 瀵逛簬鎵€鏈夋搷浣滐紙鎼滅储銆佸垪琛ㄦ粴鍔ㄣ€佹墦寮€璇︽儏銆佽瘎璁烘粴鍔?灞曞紑锛夛紝鍏ㄩ儴閫氳繃 **瀹瑰櫒 + 绯荤粺鐐瑰嚮 / 绯荤粺閿洏 / 绯荤粺婊氬姩** 瀹炵幇锛岀姝㈢洿鎺?DOM `.click()` 鎴栨瀯閫犱笟鍔?URL 瀵艰埅銆?
5. 鍦ㄦ瘡涓€涓?Phase / Block 鍐咃紝鏄庣‘鎵撳嵃 **鍏ュ彛閿氱偣** 鍜?**鍑哄彛閿氱偣**锛圲RL + stage + 鍛戒腑鐨勫鍣?ID + Rect锛夛紝濡傛灉鍏ュ彛閿氱偣鏈懡涓垯瑙嗕负鏈繘鍏ヨ闃舵锛岀珛鍗冲仠姝㈠悗缁楠ゅ苟瑙﹀彂鍥為€€銆?
6. 鍦ㄨ惤鐩樹晶锛屽 `~/.webauto/download/xiaohongshu/debug/<keyword>/<noteId>/` 鍋?**纾佺洏绾у幓閲?*锛氬悓涓€ `noteId` 鐩綍瀛樺湪鏃讹紝鏈疆浠呮洿鏂板繀瑕佸唴瀹规垨璺宠繃鍐欑洏锛屽苟閫氳繃鏃ュ織鏄庣‘鏍囪鈥滃懡涓巻鍙茶褰曗€濄€?

## 褰撳墠瀹炵幇鐘舵€侊紙2026-01-13 04:10 PM锛?

### 馃幆 鏍稿績鏈嶅姟宸插畬鎴愶紙daemon + state center锛?

#### 鉁?鏈嶅姟灞傦紙缁熶竴 daemon 甯搁┗锛?
- **Core Daemon**锛歚scripts/core-daemon.mjs` 宸茶惤鍦?
  - 鍛戒护锛歚start|stop|status|restart`
  - 缁熶竴绠＄悊锛歎nified API(7701)銆丅rowser Service(7704)銆丼earchGate(7790)
  - PID 绠＄悊 + 鍋ュ悍妫€鏌?
  - 鐘舵€侀獙璇侊細鎵€鏈夋湇鍔¤繍琛屾甯?
    ```bash
    $ node scripts/core-daemon.mjs status
    unified-api       7701     healthy      -          鉁?OK
    browser-service   7704     healthy      -          鉁?OK
    search-gate       7790     healthy      -          鉁?OK
    ```

#### 鉁?鐘舵€佷腑蹇冿紙StateRegistry锛?
- **鏂囦欢**锛歚services/unified-api/state-registry.ts`
- **鍔熻兘**锛?
  - ServiceState锛氭湇鍔″悕绉?绔彛/鐘舵€?鍋ュ悍鏃堕棿
  - SessionState锛歱rofile/session/URL/闃舵/娲诲姩鏃堕棿
  - EnvState锛氭瀯寤虹増鏈?閰嶇疆璺緞/鐗规€у紑鍏?

#### 鉁?娴忚鍣ㄤ細璇濈鐞?
- **start-headful.mjs**锛氬凡鏀逛负 daemon 妯″紡
  - 涓嶅啀鍚姩鏈嶅姟锛屼粎鍒涘缓浼氳瘽
  - 鏀寔 headless 鍙傛暟浼犻€?
  - 鐧诲綍妫€娴嬪熀浜庡鍣ㄥ尮閰?
- **褰撳墠浼氳瘽**锛歚xiaohongshu_fresh` 宸插垱寤哄苟杩愯
  - Browser Service 鍙锛堥€氳繃 `/command getStatus`锛?
  - Phase 鑴氭湰鍙鐢紙閫氳繃 `session:list`锛?

### 鉁?闃舵 0锛氭牳蹇冨熀纭€璁炬柦

- 鉁?Core Daemon + StateRegistry锛氫繚鎸佺ǔ瀹氾紙瑙佷笂锛?
- 鉁?`browser-service`锛氫細璇濆鐢ㄦ甯革紝`xiaohongshu_fresh` 鑳借 `getStatus` 鐪嬭
- 鉁?`session-manager` CLI dist 璺緞淇锛歚services/unified-api/server.ts` 鏀逛负浣跨敤 `repoRoot = path.resolve(__dirname, '../../..')`锛岃繍琛屾椂涓嶅啀璁块棶 `dist/dist/...`锛宍session:list` 宸叉仮澶嶅伐浣?

### 鉁?闃舵 1锛氳剼鏈笌浠诲姟鍏ュ彛

- 鉁?鏂板 `scripts/xiaohongshu/tests/phase2-search.mjs`
  - **鐘舵€佹娴嬪寮?*锛氬叆鍙ｉ泦鎴?`DetectPageStateBlock`锛屾鏌ュ綋鍓嶉〉闈㈢姸鎬侊紙stage: home/search/detail/unknown锛?
  - **鏅鸿兘鍥為€€鏈哄埗**锛?
    - 浠?detail 鎬佽繘鍏ワ細浣跨敤 `ErrorRecoveryBlock(recoveryMode='esc')` 閫€鍑鸿鎯?
    - 浠庨潪绔欏唴杩涘叆锛氭彁绀轰汉宸ュ鑸洖灏忕孩涔︿富椤?
  - **鍏ュ彛/鍑哄彛閿氱偣楠岃瘉**锛?
    - 鍏ュ彛閿氱偣锛氱珯鍐?+ 鏃犺鎯?overlay + search_bar 瀹瑰櫒鍛戒腑
    - 鍑哄彛閿氱偣锛歴earch_result_list 瀹瑰櫒鍛戒腑
  - **绯荤粺绾ц緭鍏?*锛氫娇鐢ㄥ鍣?`type` 鎿嶄綔锛圥laywright keyboard.type锛夛紝绂佹鐩存帴 DOM 鎿嶄綔
  - **褰撳墠闂**锛?
    - `GoToSearchBlock` 涓?entryAnchor/exitAnchor 涓?null锛坴erifyAnchorByContainerId 杩斿洖绌猴級
    - 瀵艰嚧鎼滅储澶辫触锛岄敊璇俊鎭负 `fetch failed`

### 鉁?闃舵 2锛歅hase1 / Phase2 鐘舵€侊紙涓編璐告槗锛?

- 鉁?Phase1锛堜細璇?+ SearchGate锛?
  - `core-daemon status`锛氭墍鏈夋湇鍔?healthy
  - `status-v2.mjs`锛氳兘鐪嬪埌 `xiaohongshu_fresh`锛孶RL 鍦?`https://www.xiaohongshu.com/explore`
  - Phase1 琛屼负锛?
    - 鏈変細璇濇椂涓嶅啀閲嶅鍚姩娴忚鍣?
    - 鏃犳硶閫氳繃瀹瑰櫒鍙婃椂纭鐧诲綍鎬佹椂锛屼細缁欏嚭瓒呮椂鍛婅浣嗕笉浼氫腑鏂祦绋?
    - SearchGate 鑻ュ凡鍦ㄨ窇鍒欒烦杩囬噸澶嶅惎鍔?

鈥?鈿?Phase2锛圙oToSearch + CollectSearchList锛?
  - **鍏抽敭瀛?*锛歚"涓編璐告槗"`
  - GoToSearchBlock 鐜扮姸锛?
    - 鍏ュ彛閿氱偣鏀逛负鈥滃淇″彿缁勫悎鈥濓細  
      1锛塙RL 蹇呴』鍦?`xiaohongshu.com`锛? 
      2锛夐〉闈笂涓嶈兘瀛樺湪璇︽儏 overlay锛坄.note-detail-mask` / `.detail-container` / `.media-container` 绛夛級锛? 
      3锛夊鍣?`xiaohongshu_search.search_bar` 鍛戒腑锛孯ect 鈮?(x=501, y=16, w=437, h=40)銆?
    - 褰撳叆鍙ｄ负鈥滈椤?鎼滅储椤碘€濇椂锛氱郴缁熺偣鍑?+ 绯荤粺閿洏锛堝鍣?`click` + `type`锛夊彲浠ュ畬鎴愭悳绱紝`CollectSearchListBlock` 鑳藉湪鎼滅储缁撴灉椤典笂婊氬姩骞堕噰闆嗗埌 200 鏉★紙姝ゅ墠宸查獙璇侊級銆?
    - 褰撳叆鍙ｄ负鈥滆鎯呮ā鎬佲€濇椂锛歚GoToSearch` 鐩存帴杩斿洖閿欒  
      `Currently in detail overlay (note-detail-mask present), please exit detail before searching.`  
      鈫?渚濊禆鍓嶇疆鐨?`ErrorRecoveryBlock(recoveryMode='esc')` 鍏堟妸璇︽儏閫€鍥炲埌鎼滅储缁撴灉銆?
  - `phase2-search.mjs --keyword 涓編璐告槗 --target 20` 褰撳墠琛屼负锛堟渶鏂颁竴娆″疄娴嬶級锛?
    - 浠庘€滆鎯呮€佲€濆叆鍙ｏ細DetectPageState 姝ｇ‘杩斿洖 `stage=detail`锛孍rrorRecoveryBlock 浠嶇劧鏃犳硶绋冲畾閫氳繃 ESC锛屼娇 `.note-detail-mask` 鐪熸娑堝け锛堝悗缁笓闂ㄩ€氳繃 `check-current-state.mjs` + `container-op` 鎵嬪姩鍥為€€鎴愬姛锛岀‘璁?DOM 鑳藉洖鍒伴椤?鎼滅储椤碉級锛? 
    - 浠庘€滈椤?/ 鎼滅储缁撴灉椤碘€濆叆鍙ｏ細DetectPageState 杩斿洖 `stage=home` 鎴?`stage=search`锛孏oToSearch 閫氳繃涓夐噸鍏ュ彛閿氱偣锛圲RL 绔欏唴 + 鏃犲彲瑙佽鎯?overlay + search_bar 瀹瑰櫒锛夛紝绯荤粺鐐瑰嚮 + 绯荤粺閿洏锛坱ype + Enter锛夋纭Е鍙戞悳绱紱`CollectSearchListBlock` 鍦ㄦ悳绱㈢粨鏋滈〉涓€杞噰闆嗗埌 20 鏉★紝Rect 鏍￠獙閫氳繃锛孭hase2 鍦ㄢ€滀腑缇庤锤鏄撯€濆満鏅笅鍙互绋冲畾瀹屾垚銆?

### 鈿狅笍 闃舵 3锛歅hase3 鎵撳紑璇︽儏锛堜富闃诲宸蹭粠鈥滆繘鍏ヨ鎯呪€濊浆涓衡€滈€€鍑鸿鎯呪€濓級

**褰撳墠鐘舵€侊紙鍏抽敭瀛楋細涓編璐告槗锛夛細**
- 璇︽儏 DOM 涓庡鍣ㄦā鍨嬪凡瀵归綈锛?
  - URL锛歚https://www.xiaohongshu.com/explore/{noteId}?xsec_token=...&xsec_source=pc_search&source=unknown`;
  - DOM锛歚'.note-detail-mask' + '#noteContainer.note-container' + '.media-container' + '.comments-el/.comments-container/.comment-item'` 鍧囧瓨鍦紱
  - 瀹瑰櫒锛歚xiaohongshu_detail` / `xiaohongshu_detail.modal_shell` / `xiaohongshu_detail.comment_section` 鐨?selector 涓庝笂杩?DOM 涓€鑷淬€?
- OpenDetailBlock锛?
  - 浣跨敤瀹瑰櫒 bbox 鍋氱郴缁熺偣鍑伙紙Playwright mouse锛夛紝鐐瑰嚮鍚?URL 鍙樹负 `/explore/{noteId}?xsec_token=...`锛?
  - `waitForDetail` 鍏堟鏌?URL锛坄/explore` + `xsec_token`锛夛紝鍐嶇敤 DOM锛坄.note-detail-mask` / `.media-container` / `.comments-el` / `.comments-container`锛夌‘璁よ鎯呭氨缁紱
  - 鍏ュ彛/鍑哄彛閿氱偣鍩轰簬瀹瑰櫒 + Rect 楠岃瘉锛坄xiaohongshu_detail.modal_shell`锛夛紝涓嶅啀鏄箣鍓嶇殑 `detail_not_ready / detail_anchor_not_found`銆?
- 鐩墠鐨勪富闃诲宸茬粡浠庘€渟earch鈫抎etail 鎵撲笉寮€鈥濊縼绉讳负鈥渄etail鈫抯earch 鐨?ESC 鍥為€€澶辫触鈥濓紙璇﹁闃舵 2 鎻忚堪锛夈€?

**褰卞搷锛?*
- 璇︽儏椤垫湰韬彲浠ョǔ瀹氭墦寮€骞惰瘑鍒负鈥渄etail 闃舵鈥濓紝浣嗘棤娉曞彲闈犻€氳繃 ESC / 瀹瑰櫒鍏抽棴鍥炲埌鎼滅储鍒楄〃锛?
- Phase4 璇勮閲囬泦鍦ㄥ叏娴佺▼鑴氭湰閲屼粛鏈湡姝ｈЕ鍙戯紱
- `~/.webauto/download/xiaohongshu/debug/涓編璐告槗/` 鍦ㄢ€滀腑缇庤锤鏄撯€濆叏娴佺▼鍦烘櫙涓嬩粛涓虹┖锛堟湰杞墠宸叉竻鐞嗭級銆?

### 鈴?闃舵 4锛歅hase4 璇勮閲囬泦 + 钀界洏锛堜腑缇庤锤鏄擄級

- 鐩爣锛堝皻鏈揪鎴愶級锛?
  - 瀵规瘡涓垚鍔熻繘鍏ヨ鎯呯殑 note锛?
    - WarmupComments + ExpandComments 瀹屾垚棰勭儹鍜屽睍寮€
    - CollectComments 杩斿洖闈炵┖璇勮鍒楄〃锛孯ect 楠岃瘉 comment_section / comment_item / end_marker
    - PersistXhsNote 鍦?`~/.webauto/download/xiaohongshu/debug/涓編璐告槗/<noteId>/` 涓嬭惤鐩樺唴瀹?+ 鍥剧墖 + 璇勮
- 褰撳墠杩涘害锛?
  - 鍦ㄢ€滃浗闄呮柊闂烩€濈瓑鍏抽敭瀛椾笂锛屽凡鏈夊鏉?note 瀹屾垚浜?WarmupComments + ExpandComments + 璇勮钀界洏锛堢‘璁や簡璇勮婊氬姩鑳藉姏锛?
  - 鍦ㄢ€滀腑缇庤锤鏄撯€濊繖涓€杞紝鐢变簬 Phase3 鎵撲笉寮€璇︽儏锛孭hase4 灏氭湭鐪熸瑙﹀彂

### 馃搵 涓嬩竴姝ュ伐浣滐紙鎸変紭鍏堢骇锛岄潰鍚?Phase1-4 鍏ㄦ祦绋?200 鏉★級

1. **P0锛氫慨澶嶈鎯呴〉 ESC 鍥為€€閾捐矾锛坉etail 鈫?search_result锛?*
   - [x] 鍦?ErrorRecoveryBlock 涓鍔犲熀浜?DOM 鐨勮鎯?overlay 妫€娴嬶紙`.note-detail-mask` / `.detail-container` / `.media-container` 绛夛級锛屼綔涓鸿繘鍏?ESC 妯″紡鐨勫叆鍙ｉ敋鐐癸紱
   - [x] 鏀炬澗 `xiaohongshu_detail.modal_shell` 涓衡€滄绾ч敋鐐光€濓細鍛戒腑鍒欓珮浜‘璁わ紝鏈懡涓彧鎵撴棩蹇楋紝涓嶅啀闃诲 ESC锛?
   - [ ] 妫€鏌ュ苟淇 `container:operation` 鐨?`close` / ESC 琛屼负锛屼娇 `.note-detail-mask` 瀹為檯娑堝け锛宍verifyStage('search')` 鍦ㄢ€滀腑缇庤锤鏄撯€濇牱鏈笂鑳借繑鍥?true锛堥樁娈电ǔ瀹氾級锛?
   - [ ] 鍦?`phase2-search.mjs` / `phase2-4-loop.mjs` 涓ˉ鍏?ESC 鍓嶅悗鐨勫叆鍙?鍑哄彛閿氱偣鏃ュ織锛圲RL + overlay DOM 鐘舵€?+ 瀹瑰櫒鍛戒腑鎯呭喌锛夛紝褰㈡垚瀹屾暣璇佹嵁閾撅紱
   - [ ] 鍦?ESC 鍥為€€鎴愬姛鍚庡娴?GoToSearch锛氱‘璁も€滅珯鍐?+ 闈炶鎯呮€?+ search_bar 瀹瑰櫒鈥濅笁閲嶉敋鐐瑰叏閮ㄥ懡涓紝鍐嶆墽琛屾悳绱紝骞惰 `CollectSearchListBlock` 姝ｅ父瀹屾垚 20 鏉￠噰闆嗐€?

2. **P1锛氱敤鈥滀腑缇庤锤鏄撯€濆畬鎴愪竴杞?Phase1-4 200 鏉￠噰闆?*
   - [ ] 鍓嶇疆锛氭竻绌?`~/.webauto/download/xiaohongshu/debug/`锛岀‘璁ょ洰褰曚负 0
   - [ ] 杩愯锛歚node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs --keyword 涓編璐告槗 --target 200 --env debug`
   - [ ] 杩愯鍚庢鏌ワ細
     - [ ] `CollectSearchList` 瀹為檯鏀堕泦鏉℃暟锛堟湡鏈?鈮?00锛?
     - [ ] 鎵撳紑璇︽儏鎴愬姛鐨?note 鏁伴噺
     - [ ] `~/.webauto/download/xiaohongshu/debug/涓編璐告槗/` 涓嬪疄闄?noteId 鐩綍鏁伴噺锛堝幓閲嶅悗鏁伴噺锛?

3. **P2锛氱ǔ鍥鸿瘎璁洪噰闆嗕笌钀界洏锛堝湪涓編璐告槗涓婇獙璇侊級**
   - [ ] WarmupComments 鐨勬粴鍔?灞曞紑绛栫暐鍦ㄢ€滀腑缇庤锤鏄撯€濅笂涔熻兘绋冲畾宸ヤ綔锛堝凡鏈夆€滃浗闄呮柊闂烩€濊瘉鏄庡熀纭€鑳藉姏锛?
   - [ ] CollectComments 鐨?entryAnchor/exitAnchor 鍦ㄢ€滀腑缇庤锤鏄撯€濇牱鏈笂涔熼€氳繃 Rect 楠岃瘉
   - [ ] PersistXhsNote 鐨勭鐩樼骇鍘婚噸鍦ㄤ袱娆￠噰闆嗕腑鐢熸晥锛?
     - 绗竴娆¤窇钀界洏锛?
     - 绗簩娆¤窇鏃讹紝鏃ュ織涓嚭鐜扳€滃凡澶勭悊杩囷紝鏈疆浠呭鐢ㄨ瘎璁虹粨鏋滐紝涓嶅啀鍐欑洏鈥濊€岀洰褰曚笉鏂板銆?

4. **P3锛氬洖鍐欏埌姝ｅ紡 workflow锛坈ollect-100 / collect-200锛?*
   - [ ] 鎶?Phase1-4 鐨勭ǔ瀹氶摼璺紙鎼滅储鈫掑垪琛ㄢ啋璇︽儏鈫掕瘎璁衡啋钀界洏锛夋暣鍚堝洖 workflow 灞傝剼鏈紙濡?`collect-100-workflow-v2.mjs`锛?
   - [ ] 纭 RestorePhaseBlock + PersistXhsNote 鍦?workflow 涓婁篃閬靛惊鈥滃叆鍙ｉ敋鐐?鍑哄彛閿氱偣 + 纾佺洏绾у幓閲嶁€濈殑鏍囧噯銆?

---

## 鎵ц璁板綍锛堣瘉鎹摼锛?


---

## 褰撳墠鎵ц浠诲姟锛?026-01-14锛?

### 馃幆 鏈疆鐩爣锛氭寜鈥滄湇鍔?鈫?鎼滅储 + 閾炬帴 鈫?鍒嗙粍鎺ュ姏璇勮鈥濅笁娈靛紡閲嶆瀯 Phase1-4

> 缁熶竴绾︽潫锛? 
> 1锛塒hase1 璐熻矗鍚姩/妫€娴嬫墍鏈夋湇鍔★紙unified-api / browser-service / search-gate锛夊拰鐧诲綍鎬侊紝澶辫触蹇呴』鏈夐潪 0 閫€鍑虹爜鍜屾槑纭師鍥狅紱  
> 2锛塒hase2 鍙礋璐ｂ€滄悳绱?+ 鏀堕泦鐩爣鏁伴噺鐨勫畨鍏ㄩ摼鎺?+ 涓嬭浇姝ｆ枃/鍥剧墖鈥濓紝涓嶅啀鍦?Phase3/4 閲岀偣鎼滅储缁撴灉鍗＄墖锛? 
> 3锛塒hase3/4 瀹屽叏鍩轰簬 Phase2 浜у嚭鐨勫畨鍏ㄩ摼鎺ュ垪琛紝鎸?4 甯栦竴缁勩€佹瘡杞瘡甯栨渶澶?100 鏉¤瘎璁虹殑鑺傚鎺ュ姏鐖彇璇勮锛屽苟鏀寔鏂偣缁紶銆?

### 鉁?宸插畬鎴愶紙鏈疆鐩稿叧锛?

- [x] 寮曞叆 `.collect-state.json` 涓?`CollectStateManager`锛屽湪 `phase1-4-full-collect.mjs` 涓惤鍦板垪琛ㄧ骇 state锛坮esumeToken銆乧urrentStep=list 绛夛級銆? 
- [x] 鍦?`CollectCommentsBlock` / `ExpandCommentsBlock` 涓寮鸿瘎璁哄尯閿氱偣瀹归敊锛? 
  - `comment_section` 鏀寔瀹瑰櫒閿氱偣澶辫触鏃跺洖閫€鍒?DOM selector 鑾峰彇 Rect锛? 
  - `sample comment` / `end_marker` 鍦ㄥ鍣ㄩ敋鐐瑰け璐ユ椂灏濊瘯 DOM fallback锛屼笉鍐嶇洿鎺ュ鑷存暣鍧楀け璐ワ紱  
  - Phase1-4 鍏ㄦ祦绋嬪湪 keyword="娴嬭瘯" 鍦烘櫙涓嬪畬鎴?1 鏉?note 鐨勮瘎璁洪噰闆?+ 钀界洏锛屽苟杈撳嚭 entry/exit anchors銆?

### 馃敡 姝ｅ湪璁捐 / 寰呭疄鐜帮細鎸変笁娈靛紡鏀归€?Phase1-4

1. **Phase1锛氭湇鍔″惎鍔ㄥ畧闂ㄤ汉锛圫ervice 鈫?Session 鈫?Login 鈫?Gate锛?*
   - [x] 鎶?Phase1 鏄庣‘瀹氫箟涓衡€滄湇鍔″眰 ready 瀹堥棬浜衡€濓細  
     - 椤哄簭锛氬厛妫€鏌?鍚姩 `unified-api`锛屽啀妫€鏌?鍚姩 `browser-service`锛屾渶鍚庢鏌?鍚姩 `search-gate`锛坄ensureBaseServices` + `ensureSearchGate` 宸茶惤鍦帮級锛? 
     - 鑻ユ湇鍔″惎鍔ㄦ垨 health 妫€娴嬪け璐ワ紝閫氳繃鎶涘嚭閿欒骞跺湪 `main().catch` 涓缃?`process.exitCode = 1` 閫€鍑猴紝骞舵墦鍗版槑纭師鍥犮€? 
   - [x] 鍦?Phase1 鍐呭畬鎴愪細璇濆拰鐧诲綍鎬佹牎楠岋細  
     - 濡?`xiaohongshu_fresh` 浼氳瘽涓嶅瓨鍦紝鍒欓€氳繃 `start-headful` 鍚姩娴忚鍣ㄥ苟绛夊緟浼氳瘽 ready锛坄ensureSessionPresence` + `startSession` + `waitForSessionReady`锛夛紱  
     - 浣跨敤瀹瑰櫒閿氱偣 + URL 鍚彂寮忔娴嬬櫥褰曠姸鎬侊紙`detectLoginStateWithRetry`锛夛紝鏈櫥褰曟垨椋庢帶锛坙ogin_guard / qrcode_guard锛夋椂锛屽悓鏍蜂互闈?0 閫€鍑虹爜 + 鏄庣‘ reason 閫€鍑恒€? 
   - [x] 鍚庣画 Phase2/3/4 涓€寰嬩緷璧?Phase1锛屼笉鍐嶅悇鑷噸澶嶅惎鍔?妫€娴嬫湇鍔★紙褰撳墠 `phase1-4-full-collect.mjs` 涓?Phase2/3/4 鍧囧亣瀹氭湇鍔″拰浼氳瘽宸茬粡鐢?Phase1 鍑嗗瀹屾垚锛夈€?

2. **Phase2锛氭悳绱?+ 鏀堕泦鐩爣鏁伴噺閾炬帴 + 姝ｆ枃/鍥剧墖钀界洏**
   - [x] Phase2 鐨勫敮涓€鑱岃矗锛氬湪宸茬櫥褰曚細璇濅腑锛岄€氳繃鍏抽敭瀛楁悳绱㈠苟鏀堕泦鈥滆嚦灏?target 鏉♀€濈洰鏍囧笘瀛愶細  
     - 浣跨敤瀹瑰櫒椹卞姩鐨?`GoToSearchBlock` 杩涘叆鎼滅储缁撴灉椤碉紱  
     - 鍦ㄦ悳绱㈢粨鏋滈〉婊氬姩瑙嗗彛锛屾敹闆?noteId 鍒楄〃锛岀洿鍒板€欓€夋暟 鈮?target 鎴栫‘璁ゆ病鏈夋洿澶氱粨鏋滐紙`runPhase2ListOnly` + `CollectSearchListBlock` + `scrollSearchPage`锛夈€? 
   - [x] 瀵规瘡涓€涓€欓€夊笘瀛愶細  
     - 閫氳繃褰撳墠绋冲畾鏂瑰紡鎵撳紑璇︽儏椤碉紙浠呭湪 Phase2 涓€氳繃绯荤粺鐐瑰嚮鎼滅储缁撴灉鍗＄墖锛孭hase3/4 绂佹鍐嶇偣鍗＄墖锛夛紱  
     - 鑾峰彇甯?`xsec_token` 鐨勫畨鍏ㄨ鎯?URL锛堝鏃?token 渚濈劧璁板綍鍘熷 URL锛屼互渚垮悗缁偣鍑讳慨姝ｏ級锛? 
     - 鍚屾椂鎶撳彇姝ｆ枃 + 鍥剧墖 + 浣滆€呬俊鎭紝骞跺湪 Phase3/4 涓€氳繃 `PersistXhsNoteBlock` 钀界洏鍒? 
       `~/.webauto/download/xiaohongshu/<env>/<keyword>/<noteId>/content.md` + `images/`銆? 
   - [x] Phase2 缁撴潫鏃讹細  
     - 鍐欏嚭瀹屾暣鐨?`safe-detail-urls.jsonl` 绱㈠紩锛岃嚦灏戝寘鍚?`noteId`銆乣title`銆乣safeDetailUrl`銆乣hasToken`銆佷綔鑰?澶撮儴淇℃伅绛夛紱  
     - 鑻?`safe-detail-urls` 鏁伴噺 `< target`锛屾姏鍑?`phase2_safe_detail_target_not_reached`锛岀敱鍏ュ彛鑴氭湰浠ラ潪 0 閫€鍑虹爜缁堟锛屽苟鍦ㄦ棩蹇椾腑鏄庣‘鎵撳嵃鈥滅洰鏍囨潯鏁版湭杈炬垚 + 瀹為檯鏁伴噺鈥濓紱  
     - 鏇存柊 `.collect-state.json`锛歚currentStep.phase = 'list'`锛岃褰?`safeDetailIndexSize`銆乣target`銆乣resumeToken` 绛夊厓淇℃伅锛屾敮鎸佸悗缁画浼犮€?

2. **涓烘瘡涓?note 璁捐璇勮杩涘害 `commentState`锛堜袱鏉¤繛缁瘎璁轰綔涓洪敋鐐癸級**
   - [x] 鍦?`.collect-state.json` 涓璁″苟钀藉湴 per-note `commentState` 缁撴瀯锛屽寘鍚細  
     - `noteId`銆乣totalSeen`锛堝凡閲囬泦璇勮鏁帮級銆乣lastPair`锛堜袱鏉¤繛缁瘎璁虹殑鐗瑰緛 key + 璋冭瘯鐢ㄦ枃鏈墖娈碉級銆乣updatedAt`銆? 
   - [x] 鍦?Phase3/4 涓瘡杞鐞嗗畬鏌愪釜 note 鐨勮瘎璁哄悗锛? 
     - 閫夊彇涓€瀵光€滅浉瀵圭ǔ瀹氣€濈殑杩炵画璇勮锛堜緥濡傚綋鍓嶆壒娆′腑闂寸殑涓ゆ潯锛変綔涓洪敋鐐癸紝鍐欏叆 `commentState.lastPair`锛? 
     - 鏇存柊 `totalSeen`锛屼负涓嬩竴杞閲忛噰闆嗘彁渚涜捣鐐广€? 
   - [ ] 璁捐 DOM 渚ч敋鐐规煡鎵鹃€昏緫锛氬熀浜?`lastPair` 鍦?`.comments-el/.comment-list/.comments-container` 涓嬮噸寤哄綋鍓?index锛屽苟浠庤浣嶇疆涔嬪悗缁х画鎻愬彇鏂拌瘎璁猴紙鐩墠宸查€氳繃 `computeNewCommentsForRound` 鍦ㄦ彁鍙栫粨鏋滃眰鍒╃敤 `lastPair` 鍋氬閲忓幓閲嶏紝鍚庣画鍙鎯呭喌琛ュ厖 DOM 瀹氫綅浼樺寲锛夈€?

3. **Phase3/4锛氬熀浜庡畨鍏ㄩ摼鎺ワ紝鎸夌粍鎺ュ姏璇勮閲囬泦锛? 甯栦竴缁勶紝姣忚疆姣忓笘鏈€澶?100 鏉★級**
   - [x] Phase3/4 瀹屽叏鍩轰簬 Phase2 鐢熸垚鐨?`safe-detail-urls.jsonl`锛? 
     - 绂佹鍐嶅湪鎼滅储缁撴灉椤电偣鍗＄墖鎵撳紑璇︽儏锛? 
     - 缁熶竴浣跨敤 `browser-service.goto(safeDetailUrl)` 鎵撳紑璇︽儏椤碉紙甯?`xsec_token`锛夛紝骞剁瓑寰呰鎯呴敋鐐?ready銆? 
   - [x] 缁勮皟搴︾瓥鐣ワ細  
     - 浠庣储寮曚腑鎸夐『搴忛€夊彇 note 闃熷垪锛屾寜缁勫垝鍒嗭細姣忕粍鏈€澶?4 涓?note锛? 
     - 绗竴杞細瀵圭粍鍐?4 涓笘瀛愪緷娆℃墽琛屼竴娆?`CollectCommentsBlock`锛岄檺鍒?`maxNewCommentsPerRound = 100`锛? 
     - 鍚庣画杞锛氭牴鎹悇鑷?`commentState.totalSeen` 涓?`reachedEnd` 鍐冲畾鏄惁缁х画瀵硅 note 鍋氫笅涓€杞?100 鏉★紱  
     - 杞鐩村埌璇ョ粍鎵€鏈?note 閮?`reachedEnd` 鎴栬揪鍒颁笟鍔￠槇鍊硷紝鐒跺悗杩涘叆涓嬩竴缁勩€? 
   - [x] 鍦ㄥ綋鍓嶆祻瑙堝櫒鑳藉姏绾︽潫涓嬶紝鍏堢敤鈥滃悓涓€绐楀彛椤哄簭鎵撳紑璇︽儏椤碘€濈殑鏈€灏忎镜鍏ユ柟妗堥獙璇佽妭濂忥細  
     - 姣忔鍙墦寮€涓€涓?safeDetailUrl锛學armup + 閲囬泦褰撳墠杞瘎璁猴紱  
     - 缁撴潫鍚庣洿鎺?`goto` 涓嬩竴涓?safeDetailUrl锛? 
     - 涓嶅仛澶?tab 澶嶆潅鎺у埗锛屽厛淇濊瘉鑺傚姝ｇ‘銆佺姸鎬佸彲缁紶銆? 
   - [x] 鏃ュ織瑕佹眰锛? 
     - 鎵撳嵃缁勫彿銆佽疆娆＄紪鍙枫€佺粍鍐呮瘡涓笘瀛愮殑 `noteId`锛? 
     - 姣忚疆杈撳嚭姣忎釜甯栧瓙鏈疆鏂板璇勮鏁般€佹湰杞粨鏉熷悗鐨?`commentState.totalSeen`锛? 
     - 褰撴煇杞墍鏈夊笘瀛?`roundNewComments = 0` 鏃讹紝鏄庣‘鎵撳嵃鈥滄湰杞棤鏂板璇勮锛屾彁鍓嶇粓姝㈠杞互閬垮厤姝诲惊鐜€濄€?

4. **涓柇缁紶锛堝垪琛?+ 璇勮鍙屽眰绾э級**
   - [x] 鍒楄〃绾х画浼狅細  
     - 鑻?`safe-detail-urls.jsonl` 鍜?`currentStep.phase='list'` 宸插瓨鍦ㄤ笖瀹屾暣锛岄噸鏂拌繍琛岃剼鏈椂浼氳烦杩?Phase2锛屼粎鎵撳嵃鎻愮ず骞剁洿鎺ヨ繘鍏?Phase3/4锛堝綋鍓?`phase1-4-full-collect.mjs` 宸叉寜姝よ涓鸿繍琛岋級銆? 
   - [x] 璇勮绾х画浼狅細  
     - 閲嶅惎鑴氭湰鏃讹紝浠?`.collect-state.json` 涓鍙栨瘡涓?note 鐨?`commentState`锛? 
     - 鍦ㄤ笅涓€杞皟鐢?Phase3/4 鏃讹紝閫氳繃 `lastPair` 涓?`computeNewCommentsForRound` 鍦ㄦ彁鍙栫粨鏋滃眰鍋氬閲忓幓閲嶏紝浠庨€昏緫涓婂疄鐜扳€滀粠鏂偣涔嬪悗缁х画閲囬泦鈥濓紱  
     - 淇濊瘉鐩綍绾у幓閲嶄粛鐒剁敓鏁堬細宸茬粡钀界洏鐨?note 涓嶄細閲嶅鍐欏叆锛堢洰褰曞瓨鍦ㄦ椂鐩存帴璺宠繃锛岃 Phase3/4 涓 `seenNoteIds` 鐨勫鐞嗭級銆?

> 娉細澶?tab 骞惰锛堜竴娆℃墦寮€ 4 涓?tab锛屽悇鑷繚鎸佹粴鍔ㄤ綅缃笉鍙橈級浣滀负鍚庣画澧炲己閫夐」锛涘綋鍓嶈凯浠ｅ厛鍦ㄢ€滃崟绐楀彛鎸夌粍杞 + 鍒嗘壒璇勮閲囬泦 + commentState 缁紶鈥濇ā寮忎笅鎵撶ǔ鍩虹锛屽啀璇勪及娴忚鍣ㄦ湇鍔″澶?tab 鐨勬敮鎸佽兘鍔涖€?

### 2026-01-12 12:48 PM锛歅hase 2 鎼滅储楠岃瘉閫氳繃
```bash
$ node scripts/xiaohongshu/tests/phase2-search-v3.mjs
馃攳 Phase 2 v3: 鎼滅储楠岃瘉锛堝寮虹増锛?

1锔忊儯 杩涘叆鍓嶆鏌?..
   URL: https://www.xiaohongshu.com/explore
   鏍瑰鍣? xiaohongshu_home
   鉁?椤甸潰鐘舵€佹鏌ラ€氳繃

2锔忊儯 楠岃瘉鎼滅储妗嗛敋鐐?..
馃攳 楠岃瘉閿氱偣: 鎼滅储妗?(#search-input, input[type="search"])
   鉁?鎵惧埌鍏冪礌
      Rect: x=501.3, y=16.0, w=437.3, h=40.0

3锔忊儯 鎵ц鎼滅储: "鍗庝负"...
   鉁?鎼滅储宸茶Е鍙?

4锔忊儯 閫€鍑哄悗妫€鏌?..
   URL: https://www.xiaohongshu.com/explore
   鈿狅笍  URL 鏈寘鍚?search_result锛屽彲鑳藉鑸け璐?

5锔忊儯 楠岃瘉鎼滅储缁撴灉鍒楄〃閿氱偣...
馃攳 楠岃瘉閿氱偣: 鎼滅储缁撴灉鍒楄〃 (.feeds-container)
   鉁?鎵惧埌鍏冪礌
      Rect: x=266.7, y=144.0, w=1141.3, h=1885.0

馃搵 閲囬泦鎼滅储缁撴灉锛堢洰鏍囷細鑷冲皯 5 鏉★級...
   鍘熷鏁伴噺: 24
   鍘婚噸鍚庢暟閲? 24
   鉁?宸查噰闆嗚冻澶熺粨鏋?

鉁?Phase 2 瀹屾垚 - 鎼滅储鍔熻兘姝ｅ父
```

### 2026-01-12 12:45 AM锛歝ore-daemon 鐘舵€佹鏌?
```bash
$ node scripts/core-daemon.mjs status
Service Status:
鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
Service              Port     Status       PID        Health
鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
unified-api          7701     healthy      -          鉁?OK
browser-service      7704     healthy      -          鉁?OK
search-gate          7790     healthy      -          鉁?OK
鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
鉁?All services are healthy
```

### 2026-01-12 12:43 AM锛欱rowser Service 浼氳瘽妫€鏌?
```bash
$ curl -s http://127.0.0.1:7704/command -X POST -d '{"action":"getStatus"}' | jq
{
  "ok": true,
  "sessions": [
    {
      "profileId": "xiaohongshu_fresh",
      "session_id": "xiaohongshu_fresh",
      "current_url": "https://www.xiaohongshu.com/explore",
      "mode": "dev"
    }
  ]
}
```

---

