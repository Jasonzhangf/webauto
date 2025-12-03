                (function() {
                  try {
                    if (window.__webautoDomSelect) return;
                    const state = { active: false, box: null, lastTarget: null };

                    function ensureBox() {
                      if (state.box) return state.box;
                      const box = document.createElement('div');
                      box.id = '__webauto_dom_highlight__';
                      box.style.position = 'absolute';
                      box.style.zIndex = '2147483646';
                      box.style.pointerEvents = 'none';
                      box.style.border = '2px solid #3b82f6';
                      box.style.borderRadius = '4px';
                      box.style.boxShadow = '0 0 0 1px rgba(15,23,42,0.8)';
                      box.style.background = 'rgba(37,99,235,0.08)';
                      box.style.transition = 'all 0.06s ease-out';
                      document.documentElement.appendChild(box);
                      state.box = box;
                      return box;
                    }

                    function isOverlayElement(el) {
                      try {
                        if (!el) return false;
                        if (el.id === '__webauto_overlay_root__' || el.id === '__webauto_overlay_root_v2__') return true;
                        if (el.closest) {
                          return !!(el.closest('#__webauto_overlay_root__') || el.closest('#__webauto_overlay_root_v2__'));
                        }
                        return false;
                      } catch (e) {
                        return false;
                      }
                    }

                    function updateBoxFor(el) {
                      if (!el) return;
                      const box = ensureBox();
                      const rect = el.getBoundingClientRect();
                      const scrollX = window.scrollX || window.pageXOffset || 0;
                      const scrollY = window.scrollY || window.pageYOffset || 0;
                      box.style.left = (rect.left + scrollX - 2) + 'px';
                      box.style.top = (rect.top + scrollY - 2) + 'px';
                      box.style.width = Math.max(rect.width + 4, 4) + 'px';
                      box.style.height = Math.max(rect.height + 4, 4) + 'px';
                      box.style.display = 'block';
                    }

                    function hideBox() {
                      if (state.box) {
                        state.box.style.display = 'none';
                      }
                    }

                    function buildSelector(el) {
                      try {
                        if (!el || el.nodeType !== 1) return '';
                        if (el.id && document.getElementById(el.id) === el) {
                          var rawId = el.id;
                          var escId = (window.CSS && CSS.escape)
                            ? CSS.escape(rawId)
                            : rawId.replace(/([^a-zA-Z0-9_-])/g, '\\\\$1');
                          return '#' + escId;
                        }
                        const parts = [];
                        let cur = el;
                        while (cur && cur.nodeType === 1 && parts.length < 4) {
                          let part = cur.nodeName.toLowerCase();
                          if (cur.classList && cur.classList.length) {
                            const candidate = Array.from(cur.classList).find(function(c) {
                              return !/^(active|selected|hover|focus|current|on|off)$/i.test(c);
                            });
                            if (candidate) {
                              var escClass = (window.CSS && CSS.escape)
                                ? CSS.escape(candidate)
                                : candidate.replace(/([^a-zA-Z0-9_-])/g, '\\\\$1');
                              part += '.' + escClass;
                            }
                          }
                          const parent = cur.parentElement;
                          if (parent) {
                            const sameTag = Array.prototype.filter.call(parent.children, function(c) {
                              return c.tagName === cur.tagName;
                            });
                            if (sameTag.length > 1) {
                              const idx = sameTag.indexOf(cur) + 1;
                              part += ':nth-of-type(' + idx + ')';
                            }
                          }
                          parts.unshift(part);
                          cur = cur.parentElement;
                        }
                        return parts.join(' > ');
                      } catch (e) {
                        return '';
                      }
                    }

                    function onMove(ev) {
                      if (!state.active) return;
                      const path = ev.composedPath ? ev.composedPath() : null;
                      const target = path && path.length ? path[0] : ev.target;
                      if (!target || isOverlayElement(target)) {
                        hideBox();
                        return;
                      }
                      state.lastTarget = target;
                      updateBoxFor(target);
                    }

                    function onClick(ev) {
                      if (!state.active) return;
                      const path = ev.composedPath ? ev.composedPath() : null;
                      const target = path && path.length ? path[0] : ev.target;
                      if (!target || isOverlayElement(target)) return;
                      try {
                        ev.preventDefault();
                        ev.stopPropagation();
                      } catch (e) {}
                      const selector = buildSelector(target);
                      const rect = target.getBoundingClientRect();
                      const detail = {
                        selector: selector,
                        tagName: target.tagName,
                        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                      };
                      try {
                        window.dispatchEvent(new CustomEvent('__webauto_dom_picked', { detail: detail }));
                      } catch (e) {}
                    }

                    function enable() {
                      if (state.active) return;
                      state.active = true;
                      document.addEventListener('mousemove', onMove, true);
                      document.addEventListener('click', onClick, true);
                      ensureBox();
                    }

                    function disable() {
                      if (!state.active) return;
                      state.active = false;
                      document.removeEventListener('mousemove', onMove, true);
                      document.removeEventListener('click', onClick, true);
                      hideBox();
                    }

                    window.__webautoDomSelect = {
                      enable: enable,
                      disable: disable,
                      get isActive() { return state.active; }
                    };

                    window.addEventListener('keydown', function(ev) {
                      try {
                        if (ev.key === 'F2') {
                          ev.preventDefault();
                          if (state.active) {
                            disable();
                          } else {
                            enable();
                          }
                        } else if (ev.key === 'Escape') {
                          if (state.active) {
                            ev.preventDefault();
                            disable();
                          }
                        }
                      } catch (e) {}
                    }, true);
                  } catch (e) {}
                })();
