/* ============================================================
   Kanavu — premium UI pass (STREAM 4)
   ------------------------------------------------------------
   Standalone hook module. Does NOT touch kanavu-game.js or
   index.html. Load after them:
       <script src="kanavu-ui.js?v=20251009a"></script>

   What it does:
     1. Injects a premium dreamy-pastel stylesheet that upgrades
        every screen (title, auth, HUD, wardrobe, settings,
        modals, toasts, chat, theatre, draw, deco...).
     2. Adds an elegant loading overlay ("Kanavu — Connecting
        Dreams") shown on Begin tap, hidden on screen change.
     3. Adds a circular live minimap (top-right) with terrain
        silhouette, player + partner dots, north indicator.
     4. Organizes settings / wardrobe / home panels into
        labelled sections (DOM moves only — all game listeners
        are preserved).

   Safety: everything is additive and guarded. If an element is
   missing, that enhancement is silently skipped. No existing
   control is hidden, disabled, or re-wired.
   ============================================================ */
!function(){
"use strict";

/* ---------------- 1. premium stylesheet ---------------- */
var CSS = ""
+ "/* Kanavu premium UI — dreamy pastel identity */\n"
+ ":root{\n"
+ "  --bd:rgba(246,241,255,.24);\n"
+ "  --pn:rgba(30,24,66,.82);\n"
+ "  --pk:rgba(255,217,166,.42);\n"
+ "  --kv-gold:rgba(255,233,184,.8);\n"
+ "  --kv-ice:#ffd9a6;\n"
+ "  --kv-rose:#ffd9ec;\n"
+ "  --kv-lilac:#b9a7ff;\n"
+ "  --kv-mint:#b8f0d0;\n"
+ "  --kv-ease:cubic-bezier(.22,.9,.26,1);\n"
+ "  --kv-shadow:0 18px 50px rgba(5,3,18,.55);\n"
+ "}\n"
+ "body.kv-ui{ -webkit-font-smoothing:antialiased; }\n"
+ "body.kv-ui :focus-visible{ outline:2px solid var(--kv-ice); outline-offset:2px; border-radius:12px; }\n"
+ "\n"
+ "/* ---------- keyframes ---------- */\n"
+ "@keyframes kvPanelIn{ from{ opacity:0; transform:translate(-50%,16px) scale(.97); } to{ opacity:1; transform:translate(-50%,0) scale(1); } }\n"
+ "@keyframes kvPanelInB{ from{ opacity:0; transform:translateY(16px) scale(.97); } to{ opacity:1; transform:none; scale(1); } }\n"
+ "@keyframes kvModalIn{ from{ opacity:0; transform:translate(-50%,-46%) scale(.92); } to{ opacity:1; transform:translate(-50%,-50%) scale(1); } }\n"
+ "@keyframes kvVeilIn{ from{ opacity:0; } to{ opacity:1; } }\n"
+ "@keyframes kvFadeUp{ from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:none; } }\n"
+ "@keyframes kvSheen{ from{ transform:translateX(-120%) skewX(-18deg); } to{ transform:translateX(240%) skewX(-18deg); } }\n"
+ "@keyframes kvBarShimmer{ from{ transform:translateX(-100%); } to{ transform:translateX(250%); } }\n"
+ "@keyframes kvMoonFloat{ 0%,100%{ transform:translateY(0) scale(1); } 50%{ transform:translateY(-10px) scale(1.03); } }\n"
+ "@keyframes kvPing{ 0%{ transform:scale(1); opacity:.7; } 100%{ transform:scale(1.9); opacity:0; } }\n"
+ "\n"
+ "/* ---------- primary buttons ---------- */\n"
+ "body.kv-ui .btn{\n"
+ "  position:relative; overflow:hidden; isolation:isolate;\n"
+ "  background:linear-gradient(180deg,#fffafc 0%,#ffe4f1 55%,#f7c6e2 100%);\n"
+ "  box-shadow:0 0 34px rgba(255,217,236,.45), 0 8px 22px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.9), inset 0 -2px 6px rgba(190,120,170,.25);\n"
+ "  transition:transform .22s var(--kv-ease), box-shadow .22s ease, filter .22s ease;\n"
+ "}\n"
+ "body.kv-ui .btn::after{\n"
+ "  content:''; position:absolute; top:0; bottom:0; width:45%; left:0;\n"
+ "  background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);\n"
+ "  transform:translateX(-120%) skewX(-18deg); pointer-events:none;\n"
+ "}\n"
+ "body.kv-ui .btn:hover::after{ animation:kvSheen .9s ease; }\n"
+ "body.kv-ui .btn:hover{ transform:translateY(-2px) scale(1.03); filter:brightness(1.04);\n"
+ "  box-shadow:0 0 54px rgba(255,217,236,.7), 0 10px 26px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.9); }\n"
+ "body.kv-ui .btn:active{ transform:scale(.96); }\n"
+ "body.kv-ui .btn:disabled{ opacity:.6; filter:saturate(.6); }\n"
+ "\n"
+ "/* ---------- pills ---------- */\n"
+ "body.kv-ui .pill{\n"
+ "  min-height:48px; padding:12px 20px;\n"
+ "  background:linear-gradient(180deg, rgba(42,34,88,.72), rgba(22,17,52,.72));\n"
+ "  border:1px solid var(--bd);\n"
+ "  box-shadow:0 6px 18px rgba(5,3,18,.4), inset 0 1px 0 rgba(255,255,255,.08);\n"
+ "  transition:transform .18s var(--kv-ease), background .2s ease, border-color .2s ease, box-shadow .2s ease;\n"
+ "}\n"
+ "body.kv-ui .pill:hover{ background:linear-gradient(180deg, rgba(64,52,120,.78), rgba(30,24,66,.78)); border-color:rgba(255,217,166,.45); transform:translateY(-1px);\n"
+ "  box-shadow:0 8px 22px rgba(5,3,18,.5), 0 0 16px rgba(255,217,166,.18); }\n"
+ "body.kv-ui .pill:active{ transform:scale(.95); }\n"
+ "body.kv-ui .pill.static{ cursor:default; }\n"
+ "\n"
+ "/* ---------- mini buttons ---------- */\n"
+ "body.kv-ui .mini-btn{\n"
+ "  min-height:48px;\n"
+ "  background:linear-gradient(180deg, rgba(46,38,96,.9), rgba(26,20,60,.9));\n"
+ "  border:1px solid var(--bd); border-radius:14px;\n"
+ "  box-shadow:0 4px 14px rgba(5,3,18,.35), inset 0 1px 0 rgba(255,255,255,.07);\n"
+ "  transition:transform .15s var(--kv-ease), border-color .2s ease, background .2s ease;\n"
+ "}\n"
+ "body.kv-ui .mini-btn:hover{ border-color:rgba(255,217,166,.5); }\n"
+ "body.kv-ui .mini-btn:active{ transform:scale(.93); }\n"
+ "body.kv-ui .mini-btn.danger{ border-color:rgba(255,150,170,.45); color:#ffc9d6;\n"
+ "  background:linear-gradient(180deg, rgba(96,32,56,.85), rgba(52,18,34,.85)); }\n"
+ "body.kv-ui .mini-btn.danger:hover{ border-color:rgba(255,150,170,.8); box-shadow:0 0 16px rgba(255,120,150,.25); }\n"
+ "\n"
+ "/* ---------- icon / round buttons (unified) ---------- */\n"
+ "body.kv-ui .icon-btn{ width:48px; height:48px; }\n"
+ "body.kv-ui .icon-btn, body.kv-ui .side-btn, body.kv-ui #fab-btn, body.kv-ui #jump-btn, body.kv-ui #flap-btn{\n"
+ "  background:linear-gradient(180deg, rgba(44,36,92,.94), rgba(24,18,56,.94));\n"
+ "  border:1px solid rgba(246,241,255,.3);\n"
+ "  box-shadow:0 6px 20px rgba(5,3,18,.5), 0 0 18px rgba(255,217,166,.14), inset 0 1px 0 rgba(255,255,255,.1);\n"
+ "  transition:transform .16s var(--kv-ease), border-color .2s ease, box-shadow .2s ease;\n"
+ "}\n"
+ "body.kv-ui .icon-btn:hover, body.kv-ui .side-btn:hover, body.kv-ui #fab-btn:hover, body.kv-ui #jump-btn:hover, body.kv-ui #flap-btn:hover{\n"
+ "  border-color:rgba(255,217,166,.65); box-shadow:0 6px 20px rgba(5,3,18,.5), 0 0 26px rgba(255,217,166,.35), inset 0 1px 0 rgba(255,255,255,.12);\n"
+ "}\n"
+ "body.kv-ui .icon-btn:active, body.kv-ui .side-btn:active, body.kv-ui #fab-btn:active, body.kv-ui #jump-btn:active, body.kv-ui #flap-btn:active{ transform:scale(.9); }\n"
+ "body.kv-ui #chat-badge{ animation:kvPing 1.6s ease-out infinite; }\n"
+ "body.kv-ui #chat-btn.has-unread #chat-badge, body.kv-ui .side-btn #chat-badge{ animation:none; }\n"
+ "\n"
+ "/* ---------- HUD top ---------- */\n"
+ "body.kv-ui .hud-top{\n"
+ "  position:relative; z-index:5; align-items:flex-start;\n"
+ "  background:linear-gradient(180deg, rgba(8,6,24,.55), rgba(8,6,24,0));\n"
+ "  padding:14px 14px 18px;\n"
+ "}\n"
+ "body.kv-ui .hud-top > div:first-child{ flex:1 1 auto; min-width:0; text-align:left; padding-left:4px; }\n"
+ "body.kv-ui .hud-title{ font-size:19px; letter-spacing:.28em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n"
+ "body.kv-ui .hud-sub{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n"
+ "body.kv-ui .kv-hud-right{ display:flex; gap:8px; align-items:center; justify-content:flex-end; flex-wrap:wrap; max-width:62%; pointer-events:none; }\n"
+ "body.kv-ui .kv-hud-right > *{ pointer-events:auto; flex-shrink:0; }\n"
+ "body.kv-ui #back-btn{ max-width:100%; }\n"
+ "\n"
+ "/* ---------- joystick ---------- */\n"
+ "body.kv-ui #joy-base{\n"
+ "  border:1.5px solid rgba(246,241,255,.35);\n"
+ "  background:radial-gradient(circle at 50% 42%, rgba(60,48,110,.5), rgba(20,16,48,.42) 70%);\n"
+ "  box-shadow:0 8px 26px rgba(5,3,18,.45), inset 0 2px 14px rgba(255,217,166,.12), inset 0 -2px 10px rgba(0,0,0,.3);\n"
+ "}\n"
+ "body.kv-ui #joy-knob{\n"
+ "  width:56px; height:56px;\n"
+ "  background:radial-gradient(circle at 34% 30%, #ffffff 0%, #ffedcb 34%, #f5c878 68%, #d9a05a 100%);\n"
+ "  border:1px solid rgba(255,255,255,.7);\n"
+ "  box-shadow:0 0 22px rgba(255,217,166,.65), 0 4px 12px rgba(5,3,18,.5);\n"
+ "}\n"
+ "\n"
+ "/* ---------- hint pill ---------- */\n"
+ "body.kv-ui .hint{\n"
+ "  left:50%; transform:translateX(-50%); width:max-content; max-width:calc(100% - 40px);\n"
+ "  background:rgba(10,8,28,.42); border:1px solid rgba(246,241,255,.12);\n"
+ "  border-radius:999px; padding:8px 20px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;\n"
+ "  backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);\n"
+ "}\n"
+ "\n"
+ "/* ---------- HUD bottom menu ---------- */\n"
+ "body.kv-ui .hud-bottom{\n"
+ "  background:linear-gradient(180deg, rgba(26,20,60,.97), rgba(16,12,40,.97));\n"
+ "  border:1.5px solid rgba(255,217,166,.45);\n"
+ "  border-radius:22px; box-shadow:var(--kv-shadow), 0 0 30px rgba(255,217,166,.1);\n"
+ "}\n"
+ "body.kv-ui .hud-bottom.open{ animation:kvPanelInB .34s var(--kv-ease); }\n"
+ "body.kv-ui .hud-bottom .pill{ border-radius:16px; }\n"
+ "\n"
+ "/* ---------- cards (auth / profile / pair / reset) ---------- */\n"
+ "body.kv-ui .card{\n"
+ "  position:relative; overflow:hidden;\n"
+ "  background:linear-gradient(180deg, rgba(30,24,68,.9), rgba(17,13,42,.94));\n"
+ "  border:1.5px solid rgba(246,241,255,.3); border-radius:24px;\n"
+ "  box-shadow:var(--kv-shadow), 0 0 44px rgba(255,217,166,.09), inset 0 1px 0 rgba(255,255,255,.09);\n"
+ "}\n"
+ "body.kv-ui .card::before{\n"
+ "  content:''; position:absolute; top:0; left:8%; right:8%; height:1px;\n"
+ "  background:linear-gradient(90deg, transparent, rgba(255,217,236,.55), rgba(255,217,166,.55), transparent);\n"
+ "}\n"
+ "body.kv-ui .card h2{ text-shadow:0 2px 18px rgba(185,167,255,.4); }\n"
+ "body.kv-ui .screen:not(.hidden) .card .field{ animation:kvFadeUp .5s var(--kv-ease) backwards; }\n"
+ "body.kv-ui .screen:not(.hidden) .card .field:nth-of-type(2){ animation-delay:.06s; }\n"
+ "body.kv-ui .screen:not(.hidden) .card .field:nth-of-type(3){ animation-delay:.12s; }\n"
+ "body.kv-ui .screen:not(.hidden) .card .field:nth-of-type(4){ animation-delay:.18s; }\n"
+ "body.kv-ui .screen:not(.hidden) .card .field:nth-of-type(5){ animation-delay:.24s; }\n"
+ "body.kv-ui .screen:not(.hidden) .card .field:nth-of-type(6){ animation-delay:.3s; }\n"
+ "\n"
+ "/* ---------- inputs ---------- */\n"
+ "body.kv-ui .field input, body.kv-ui .set-input, body.kv-ui #chat-input, body.kv-ui #th-input,\n"
+ "body.kv-ui #bottle-text, body.kv-ui #gift-note-text, body.kv-ui #gift-when, body.kv-ui #cp-petname{\n"
+ "  background:rgba(246,241,255,.07);\n"
+ "  border:1px solid var(--bd);\n"
+ "  box-shadow:inset 0 2px 8px rgba(5,3,18,.35);\n"
+ "  transition:border-color .2s ease, box-shadow .2s ease, background .2s ease;\n"
+ "}\n"
+ "body.kv-ui .field input::placeholder, body.kv-ui .set-input::placeholder,\n"
+ "body.kv-ui #chat-input::placeholder, body.kv-ui #th-input::placeholder,\n"
+ "body.kv-ui textarea::placeholder{ color:rgba(246,241,255,.38); font-style:italic; }\n"
+ "body.kv-ui .field input:focus, body.kv-ui .set-input:focus, body.kv-ui #chat-input:focus, body.kv-ui #th-input:focus,\n"
+ "body.kv-ui #bottle-text:focus, body.kv-ui #gift-note-text:focus{\n"
+ "  border-color:var(--kv-ice);\n"
+ "  box-shadow:inset 0 2px 8px rgba(5,3,18,.35), 0 0 0 3px rgba(255,217,166,.16), 0 0 18px rgba(255,217,166,.2);\n"
+ "  background:rgba(246,241,255,.1);\n"
+ "}\n"
+ "body.kv-ui input[type=date], body.kv-ui input[type=datetime-local]{ color-scheme:dark; }\n"
+ "body.kv-ui input[type=checkbox]{ width:22px; height:22px; accent-color:#ffd9a6; cursor:pointer; }\n"
+ "\n"
+ "/* ---------- modal veil (dim + blur backdrop) ---------- */\n"
+ "body.kv-ui #modal-veil{\n"
+ "  background:rgba(9,6,24,.62);\n"
+ "  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);\n"
+ "  animation:kvVeilIn .35s ease;\n"
+ "}\n"
+ "\n"
+ "/* ---------- modals ---------- */\n"
+ "body.kv-ui #bottle-modal, body.kv-ui #unpair-modal, body.kv-ui #anniv-modal,\n"
+ "body.kv-ui #today-modal, body.kv-ui #gift-modal, body.kv-ui #delacct-modal{\n"
+ "  background:linear-gradient(180deg, rgba(30,24,68,.98), rgba(17,13,42,.98));\n"
+ "  border:1.5px solid rgba(255,217,166,.45);\n"
+ "  border-radius:24px;\n"
+ "  box-shadow:var(--kv-shadow), 0 0 44px rgba(255,217,166,.12), inset 0 1px 0 rgba(255,255,255,.09);\n"
+ "  animation:kvModalIn .42s var(--kv-ease);\n"
+ "  padding:24px 22px;\n"
+ "}\n"
+ "body.kv-ui #bottle-modal h3, body.kv-ui #unpair-modal h3, body.kv-ui #anniv-modal h3,\n"
+ "body.kv-ui #today-modal h3, body.kv-ui #gift-modal h3, body.kv-ui #delacct-modal h3{\n"
+ "  font-size:21px; letter-spacing:.14em; text-shadow:0 2px 16px rgba(185,167,255,.4);\n"
+ "}\n"
+ "body.kv-ui #bottle-modal h3::after, body.kv-ui #unpair-modal h3::after, body.kv-ui #anniv-modal h3::after,\n"
+ "body.kv-ui #today-modal h3::after, body.kv-ui #gift-modal h3::after, body.kv-ui #delacct-modal h3::after{\n"
+ "  content:''; display:block; width:56px; height:2px; margin:12px auto 4px; border-radius:2px;\n"
+ "  background:linear-gradient(90deg, transparent, var(--kv-rose), var(--kv-ice), transparent);\n"
+ "}\n"
+ "body.kv-ui #gift-read{ font-size:16px; line-height:1.6; }\n"
+ "body.kv-ui .gift-big{ filter:drop-shadow(0 6px 18px rgba(255,217,236,.4)); }\n"
+ "\n"
+ "/* ---------- panels (home / wardrobe / settings / credits) ---------- */\n"
+ "body.kv-ui #home-panel, body.kv-ui #char-panel, body.kv-ui #settings-panel, body.kv-ui #credits-panel{\n"
+ "  background:linear-gradient(180deg, rgba(28,22,64,.97), rgba(16,12,40,.97));\n"
+ "  border:1.5px solid rgba(255,217,166,.42);\n"
+ "  border-radius:24px;\n"
+ "  box-shadow:var(--kv-shadow), 0 0 36px rgba(255,217,166,.1), inset 0 1px 0 rgba(255,255,255,.08);\n"
+ "  animation:kvPanelIn .38s var(--kv-ease);\n"
+ "  padding:20px 18px;\n"
+ "}\n"
+ "body.kv-ui #home-panel h3, body.kv-ui #char-panel h3, body.kv-ui #settings-panel h3, body.kv-ui #credits-panel h3{\n"
+ "  font-size:20px; letter-spacing:.16em; text-shadow:0 2px 16px rgba(185,167,255,.4); margin-bottom:14px;\n"
+ "}\n"
+ "body.kv-ui #home-panel h3::after, body.kv-ui #char-panel h3::after,\n"
+ "body.kv-ui #settings-panel h3::after, body.kv-ui #credits-panel h3::after{\n"
+ "  content:''; display:block; width:56px; height:2px; margin:10px auto 0; border-radius:2px;\n"
+ "  background:linear-gradient(90deg, transparent, var(--kv-rose), var(--kv-ice), transparent);\n"
+ "}\n"
+ "\n"
+ "/* ---------- premium section grouping (built by JS) ---------- */\n"
+ "body.kv-ui .kv-section{\n"
+ "  margin:12px 0; padding:13px 12px 14px;\n"
+ "  background:rgba(246,241,255,.045);\n"
+ "  border:1px solid rgba(246,241,255,.1);\n"
+ "  border-radius:18px;\n"
+ "}\n"
+ "body.kv-ui .kv-section-title{\n"
+ "  font-weight:400; font-size:11px; letter-spacing:.32em; text-transform:uppercase;\n"
+ "  color:var(--kv-gold); margin:0 0 10px 2px; text-align:left;\n"
+ "  text-shadow:0 1px 10px rgba(255,233,184,.3);\n"
+ "}\n"
+ "body.kv-ui .kv-section-title::before{ content:'\\2726  '; }\n"
+ "body.kv-ui .kv-section .hp-row:last-child, body.kv-ui .kv-section .set-row:last-child{ margin-bottom:2px; }\n"
+ "\n"
+ "/* ---------- settings specifics ---------- */\n"
+ "body.kv-ui #settings-panel .set-row{ padding:8px 8px; border-radius:14px; margin-bottom:6px; }\n"
+ "body.kv-ui #settings-panel .set-row.btns{\n"
+ "  border-top:1px solid rgba(246,241,255,.1); border-radius:0;\n"
+ "  padding-top:16px; margin-top:10px; justify-content:center;\n"
+ "}\n"
+ "body.kv-ui #invite-code{\n"
+ "  font-size:26px; letter-spacing:.3em; text-indent:.3em; text-align:center;\n"
+ "  color:#fff; text-shadow:0 0 24px rgba(255,217,166,.65);\n"
+ "  background:rgba(255,217,166,.06);\n"
+ "  border:1px dashed rgba(255,217,166,.5); border-radius:16px;\n"
+ "  padding:14px 8px; margin:8px 0;\n"
+ "}\n"
+ "body.kv-ui #invite-hint{ margin:6px 0 12px; }\n"
+ "body.kv-ui #set-danger, body.kv-ui #set-accdanger{\n"
+ "  border:1px solid rgba(255,150,170,.35); border-radius:16px;\n"
+ "  background:rgba(120,30,50,.14);\n"
+ "  padding:12px; margin-top:12px;\n"
+ "}\n"
+ "body.kv-ui #set-accdanger .set-lbl{ color:#ffc9d6; width:auto; }\n"
+ "body.kv-ui #settings-panel .set-note{ margin:10px 4px 4px; line-height:1.6; }\n"
+ "\n"
+ "/* ---------- toggle ---------- */\n"
+ "body.kv-ui .toggle{\n"
+ "  width:64px; height:38px; border:1px solid rgba(246,241,255,.3);\n"
+ "  background:rgba(20,16,44,.9);\n"
+ "  box-shadow:inset 0 2px 8px rgba(5,3,18,.5);\n"
+ "  transition:background .25s ease, border-color .25s ease, box-shadow .25s ease;\n"
+ "}\n"
+ "body.kv-ui .toggle.on{\n"
+ "  background:linear-gradient(180deg, #e8a84c, #c07f2e);\n"
+ "  border-color:rgba(255,217,166,.6);\n"
+ "  box-shadow:inset 0 2px 6px rgba(5,3,18,.3), 0 0 16px rgba(255,217,166,.35);\n"
+ "}\n"
+ "body.kv-ui .toggle::after{\n"
+ "  top:4px; left:5px; width:28px; height:28px;\n"
+ "  box-shadow:0 2px 8px rgba(0,0,0,.45);\n"
+ "  transition:left .22s var(--kv-ease);\n"
+ "}\n"
+ "body.kv-ui .toggle.on::after{ left:29px; }\n"
+ "\n"
+ "/* ---------- range sliders ---------- */\n"
+ "body.kv-ui .vol-slider{ -webkit-appearance:none; appearance:none; background:transparent; }\n"
+ "body.kv-ui .vol-slider::-webkit-slider-runnable-track{\n"
+ "  height:8px; border-radius:99px;\n"
+ "  background:linear-gradient(90deg, rgba(255,217,166,.75), rgba(255,217,166,.18));\n"
+ "  box-shadow:inset 0 1px 4px rgba(5,3,18,.5);\n"
+ "}\n"
+ "body.kv-ui .vol-slider::-webkit-slider-thumb{\n"
+ "  -webkit-appearance:none; appearance:none; width:24px; height:24px; margin-top:-8px;\n"
+ "  border-radius:50%; border:1px solid rgba(255,255,255,.75);\n"
+ "  background:radial-gradient(circle at 34% 30%, #fff, #ffedcb 55%, #f5c878 100%);\n"
+ "  box-shadow:0 0 14px rgba(255,217,166,.6), 0 3px 8px rgba(5,3,18,.5);\n"
+ "  cursor:pointer;\n"
+ "}\n"
+ "body.kv-ui .vol-slider::-moz-range-track{\n"
+ "  height:8px; border-radius:99px;\n"
+ "  background:linear-gradient(90deg, rgba(255,217,166,.75), rgba(255,217,166,.18));\n"
+ "}\n"
+ "body.kv-ui .vol-slider::-moz-range-thumb{\n"
+ "  width:22px; height:22px; border-radius:50%; border:1px solid rgba(255,255,255,.75);\n"
+ "  background:radial-gradient(circle at 34% 30%, #fff, #ffedcb 55%, #f5c878 100%);\n"
+ "  box-shadow:0 0 14px rgba(255,217,166,.6);\n"
+ "}\n"
+ "\n"
+ "/* ---------- chips & swatches ---------- */\n"
+ "body.kv-ui .chip, body.kv-ui .hp-chip{\n"
+ "  min-height:48px;\n"
+ "  background:linear-gradient(180deg, rgba(48,40,100,.88), rgba(28,22,64,.88));\n"
+ "  border:1px solid var(--bd); border-radius:14px;\n"
+ "  box-shadow:0 3px 10px rgba(5,3,18,.3), inset 0 1px 0 rgba(255,255,255,.07);\n"
+ "  transition:border-color .2s ease, box-shadow .2s ease, transform .14s var(--kv-ease), background .2s ease;\n"
+ "}\n"
+ "body.kv-ui .chip:hover, body.kv-ui .hp-chip:hover{ border-color:rgba(255,217,166,.5); }\n"
+ "body.kv-ui .chip.active, body.kv-ui .hp-chip.active, body.kv-ui .gift-chip.sel{\n"
+ "  border-color:var(--kv-ice);\n"
+ "  background:linear-gradient(180deg, rgba(72,60,134,.94), rgba(40,32,88,.94));\n"
+ "  box-shadow:0 0 20px rgba(255,217,166,.35), inset 0 1px 0 rgba(255,255,255,.12);\n"
+ "}\n"
+ "body.kv-ui .chip:active, body.kv-ui .hp-chip:active{ transform:scale(.94); }\n"
+ "body.kv-ui .hp-chip.active::after{ content:' \\2713'; color:var(--kv-ice); }\n"
+ "body.kv-ui .hp-dot, body.kv-ui .dot{\n"
+ "  width:40px; height:40px;\n"
+ "  border:2px solid rgba(255,255,255,.28);\n"
+ "  box-shadow:0 3px 10px rgba(5,3,18,.4), inset 0 1px 3px rgba(255,255,255,.25);\n"
+ "  transition:transform .16s var(--kv-ease), border-color .16s ease, box-shadow .16s ease;\n"
+ "}\n"
+ "body.kv-ui .hp-dot:hover, body.kv-ui .dot:hover{ transform:scale(1.12); }\n"
+ "body.kv-ui .hp-dot.active, body.kv-ui .dot.active{\n"
+ "  border-color:#fff; transform:scale(1.14);\n"
+ "  box-shadow:0 0 14px rgba(255,255,255,.5), 0 3px 10px rgba(5,3,18,.4);\n"
+ "}\n"
+ "body.kv-ui .hp-row{ align-items:center; margin-bottom:10px; }\n"
+ "body.kv-ui .hp-lbl{ color:rgba(246,241,255,.72); }\n"
+ "body.kv-ui #cp-petname-row{ margin-top:6px; }\n"
+ "\n"
+ "/* ---------- toast ---------- */\n"
+ "body.kv-ui .toast{\n"
+ "  z-index:8;\n"
+ "  bottom:118px;\n"
+ "  max-width:min(480px, calc(100% - 48px));\n"
+ "  white-space:normal; text-align:center; line-height:1.5;\n"
+ "  background:linear-gradient(180deg, rgba(36,28,76,.96), rgba(20,16,48,.96));\n"
+ "  border:1px solid rgba(255,217,166,.42);\n"
+ "  border-radius:18px; padding:14px 24px;\n"
+ "  box-shadow:var(--kv-shadow), 0 0 30px rgba(255,217,166,.22);\n"
+ "  backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);\n"
+ "}\n"
+ "body.kv-ui #prompt-pill{\n"
+ "  background:linear-gradient(180deg, rgba(36,28,76,.97), rgba(20,16,48,.97));\n"
+ "  border:1px solid rgba(255,217,236,.5);\n"
+ "  box-shadow:var(--kv-shadow), 0 0 26px rgba(255,217,236,.2);\n"
+ "  padding:12px 12px 12px 20px;\n"
+ "}\n"
+ "\n"
+ "/* ---------- chat & theatre ---------- */\n"
+ "body.kv-ui #chat-panel, body.kv-ui #theatre-ui{\n"
+ "  background:linear-gradient(180deg, rgba(28,22,64,.97), rgba(16,12,40,.97));\n"
+ "  border:1.5px solid rgba(255,217,166,.42);\n"
+ "  border-radius:24px;\n"
+ "  box-shadow:var(--kv-shadow), 0 0 36px rgba(255,217,166,.1);\n"
+ "  animation:kvPanelIn .38s var(--kv-ease);\n"
+ "}\n"
+ "body.kv-ui .chat-msg{\n"
+ "  background:linear-gradient(180deg, rgba(72,60,134,.85), rgba(52,44,100,.85));\n"
+ "  border:1px solid rgba(246,241,255,.1);\n"
+ "  border-radius:16px 16px 16px 5px;\n"
+ "  box-shadow:0 3px 10px rgba(5,3,18,.3);\n"
+ "}\n"
+ "body.kv-ui .chat-msg.me{\n"
+ "  background:linear-gradient(180deg, rgba(255,196,120,.45), rgba(230,150,70,.45));\n"
+ "  border:1.5px solid rgba(255,217,166,.42);\n"
+ "  border-radius:16px 16px 5px 16px;\n"
+ "}\n"
+ "body.kv-ui #chat-head, body.kv-ui #th-head{ color:rgba(246,241,255,.75); }\n"
+ "body.kv-ui .th-ans{\n"
+ "  background:linear-gradient(180deg, rgba(72,60,134,.8), rgba(52,44,100,.8));\n"
+ "  border:1px solid rgba(246,241,255,.1); border-radius:14px;\n"
+ "}\n"
+ "body.kv-ui .th-ans.me{ border-color:rgba(255,217,166,.45); box-shadow:0 0 14px rgba(255,217,166,.15); }\n"
+ "body.kv-ui #th-screen{\n"
+ "  background:linear-gradient(180deg, #181838, #12122c);\n"
+ "  box-shadow:inset 0 0 34px rgba(255,217,166,.14), 0 4px 18px rgba(5,3,18,.4);\n"
+ "}\n"
+ "\n"
+ "/* ---------- deco bar / popup ---------- */\n"
+ "body.kv-ui #deco-popup{\n"
+ "  background:linear-gradient(180deg, rgba(28,22,64,.97), rgba(16,12,40,.97));\n"
+ "  border:1.5px solid rgba(255,217,166,.45); border-radius:20px;\n"
+ "  box-shadow:var(--kv-shadow);\n"
+ "  animation:kvPanelIn .32s var(--kv-ease);\n"
+ "}\n"
+ "body.kv-ui #deco-bar{ animation:kvPanelInB .34s var(--kv-ease); }\n"
+ "\n"
+ "/* ---------- weather popup ---------- */\n"
+ "body.kv-ui #weather-pop{\n"
+ "  top:212px;\n"
+ "  background:linear-gradient(180deg, rgba(28,22,64,.97), rgba(16,12,40,.97));\n"
+ "  border:1.5px solid rgba(255,217,166,.45); border-radius:20px;\n"
+ "  box-shadow:var(--kv-shadow), 0 0 26px rgba(255,217,166,.12);\n"
+ "  animation:kvPanelInB .32s var(--kv-ease);\n"
+ "}\n"
+ "body.kv-ui #weather-pop .chip{ min-width:150px; text-align:left; }\n"
+ "\n"
+ "/* ---------- draw screen ---------- */\n"
+ "body.kv-ui #draw-screen{ background:rgba(10,8,28,.97); }\n"
+ "body.kv-ui #draw-screen h2{ text-shadow:0 2px 18px rgba(185,167,255,.4); }\n"
+ "body.kv-ui #draw-canvas-wrap{\n"
+ "  border:1px solid rgba(255,217,166,.45);\n"
+ "  box-shadow:0 0 34px rgba(255,217,166,.14), inset 0 0 40px rgba(20,16,48,.4);\n"
+ "  border-radius:20px;\n"
+ "}\n"
+ "body.kv-ui .size-btn.active{ border-color:var(--kv-ice); box-shadow:0 0 16px rgba(255,217,166,.45); }\n"
+ "\n"
+ "/* ---------- misc ---------- */\n"
+ "body.kv-ui .task-row{\n"
+ "  background:linear-gradient(180deg, rgba(72,60,134,.7), rgba(52,44,100,.7));\n"
+ "  border:1px solid var(--bd); border-radius:14px;\n"
+ "  box-shadow:0 3px 10px rgba(5,3,18,.3);\n"
+ "}\n"
+ "body.kv-ui .task-row.done{\n"
+ "  border-color:rgba(184,240,208,.55);\n"
+ "  box-shadow:0 0 16px rgba(184,240,208,.18), 0 3px 10px rgba(5,3,18,.3);\n"
+ "}\n"
+ "body.kv-ui .code-big{\n"
+ "  background:rgba(255,217,166,.06);\n"
+ "  border:1px dashed rgba(255,217,166,.55);\n"
+ "  border-radius:18px;\n"
+ "  box-shadow:0 0 30px rgba(255,217,166,.16), inset 0 0 24px rgba(255,217,166,.05);\n"
+ "}\n"
+ "body.kv-ui #exit-seat{\n"
+ "  background:linear-gradient(180deg, rgba(64,52,120,.85), rgba(30,24,66,.85));\n"
+ "  border:1px solid rgba(255,217,236,.5);\n"
+ "  box-shadow:0 0 28px rgba(255,217,236,.3), 0 8px 22px rgba(5,3,18,.5);\n"
+ "}\n"
+ "body.kv-ui #wish-btn{\n"
+ "  background:linear-gradient(180deg, rgba(64,52,120,.9), rgba(30,24,66,.9));\n"
+ "  border:1px solid rgba(255,217,236,.5);\n"
+ "  box-shadow:0 0 30px rgba(255,217,236,.3), 0 8px 22px rgba(5,3,18,.5);\n"
+ "}\n"
+ "body.kv-ui #travel-fade.show{ transition:opacity 1.1s ease; }\n"
+ "\n"
+ "/* ---------- scrollbars ---------- */\n"
+ "body.kv-ui #settings-panel::-webkit-scrollbar, body.kv-ui #char-panel::-webkit-scrollbar,\n"
+ "body.kv-ui #chat-list::-webkit-scrollbar, body.kv-ui #th-answers::-webkit-scrollbar{ width:6px; }\n"
+ "body.kv-ui #settings-panel::-webkit-scrollbar-thumb, body.kv-ui #char-panel::-webkit-scrollbar-thumb,\n"
+ "body.kv-ui #chat-list::-webkit-scrollbar-thumb, body.kv-ui #th-answers::-webkit-scrollbar-thumb{\n"
+ "  background:rgba(255,217,166,.3); border-radius:99px;\n"
+ "}\n"
+ "\n"
+ "/* ---------- title screen polish ---------- */\n"
+ "body.kv-ui #begin-btn{ letter-spacing:.3em; }\n"
+ "body.kv-ui .foot{ color:rgba(246,241,255,.5); }\n"
+ "body.kv-ui .tagline{ color:rgba(246,241,255,.78); }\n"
+ "\n"
+ "/* ---------- premium loading overlay ---------- */\n"
+ "#kv-loader{\n"
+ "  position:fixed; inset:0; z-index:80;\n"
+ "  display:flex; align-items:center; justify-content:center;\n"
+ "  background:\n"
+ "    radial-gradient(ellipse at 50% 30%, rgba(185,167,255,.16), transparent 60%),\n"
+ "    linear-gradient(180deg,#0b1035 0%,#1b1b4d 34%,#3b2a63 62%,#6b3f7a 82%,#a86a8b 100%);\n"
+ "  opacity:1; transition:opacity .6s ease;\n"
+ "  font-family:Georgia,'Times New Roman',serif; color:#f4efff;\n"
+ "  user-select:none; -webkit-user-select:none;\n"
+ "}\n"
+ "#kv-loader.kv-hide{ opacity:0; pointer-events:none; }\n"
+ "#kv-loader.hidden-el{ display:none !important; }\n"
+ ".kv-loader-inner{ display:flex; flex-direction:column; align-items:center; text-align:center; padding:0 32px; max-width:420px; }\n"
+ ".kv-loader-moon{\n"
+ "  width:92px; height:92px; border-radius:50%; margin-bottom:30px;\n"
+ "  background:radial-gradient(circle,#fffbe8 0%,#fdf3cf 45%,rgba(253,243,207,0) 72%);\n"
+ "  box-shadow:0 0 70px 26px rgba(255,251,232,.22);\n"
+ "  animation:kvMoonFloat 5s ease-in-out infinite;\n"
+ "}\n"
+ ".kv-loader-word{\n"
+ "  font-size:clamp(44px,11vw,64px); letter-spacing:.22em; text-indent:.22em; line-height:1.1;\n"
+ "  background:linear-gradient(180deg,#ffffff 20%,#ffe9f4 55%,#b9a7ff 100%);\n"
+ "  -webkit-background-clip:text; background-clip:text; color:transparent;\n"
+ "  text-shadow:0 0 60px rgba(185,167,255,.35);\n"
+ "}\n"
+ ".kv-loader-tag{\n"
+ "  margin-top:12px; font-size:15px; font-style:italic; letter-spacing:.42em; text-indent:.42em;\n"
+ "  color:rgba(244,239,255,.75); text-shadow:0 0 18px rgba(255,217,236,.3);\n"
+ "}\n"
+ ".kv-loader-bar{\n"
+ "  position:relative; overflow:hidden;\n"
+ "  width:min(280px,70vw); height:6px; margin-top:38px; border-radius:99px;\n"
+ "  background:rgba(244,239,255,.12);\n"
+ "  box-shadow:inset 0 1px 4px rgba(5,3,18,.5);\n"
+ "}\n"
+ ".kv-loader-fill{\n"
+ "  position:absolute; left:0; top:0; bottom:0; width:4%; border-radius:99px;\n"
+ "  background:linear-gradient(90deg,#ffd9ec,#ffd9a6,#f5b95e);\n"
+ "  box-shadow:0 0 16px rgba(255,217,236,.7);\n"
+ "  transition:width .18s linear;\n"
+ "}\n"
+ ".kv-loader-fill::after{\n"
+ "  content:''; position:absolute; top:0; bottom:0; width:40%;\n"
+ "  background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent);\n"
+ "  animation:kvBarShimmer 1.6s ease-in-out infinite;\n"
+ "}\n"
+ ".kv-loader-status{\n"
+ "  margin-top:18px; font-size:14px; font-style:italic; letter-spacing:.14em;\n"
+ "  color:rgba(244,239,255,.6); min-height:22px;\n"
+ "  transition:opacity .4s ease;\n"
+ "}\n"
+ "\n"
+ "/* ---------- circular minimap ---------- */\n"
+ "#kv-minimap{\n"
+ "  position:absolute; top:84px; right:14px; z-index:4;\n"
+ "  width:120px; height:120px; border-radius:50%; overflow:hidden;\n"
+ "  border:1.5px solid rgba(255,233,184,.6);\n"
+ "  background:rgba(10,8,28,.6);\n"
+ "  box-shadow:0 10px 30px rgba(5,3,18,.55), 0 0 20px rgba(255,233,184,.14), inset 0 0 24px rgba(5,3,18,.5);\n"
+ "  backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);\n"
+ "  pointer-events:none;\n"
+ "  animation:kvFadeUp .6s var(--kv-ease) backwards;\n"
+ "}\n"
+ "#kv-minimap canvas{ width:100%; height:100%; display:block; border-radius:50%; }\n"
+ ".kv-mm-north{\n"
+ "  position:absolute; top:6px; left:50%; transform:translateX(-50%);\n"
+ "  font-size:10px; letter-spacing:.12em; font-style:normal;\n"
+ "  color:rgba(255,233,184,.95); text-shadow:0 1px 6px rgba(0,0,0,.9);\n"
+ "  font-family:Georgia,serif; pointer-events:none;\n"
+ "}\n"
+ "\n"
+ "/* ---------- reduced motion ---------- */\n"
+ "@media (prefers-reduced-motion:reduce){\n"
+ "  body.kv-ui *, body.kv-ui *::before, body.kv-ui *::after{ animation-duration:.01ms !important; transition-duration:.01ms !important; }\n"
+ "  #kv-loader .kv-loader-fill::after{ animation:none !important; }\n"
+ "}\n"
+ "\n"
+ "/* ---------- desktop / laptop (min-width:1024px) ---------- */\n"
+ "@media (min-width:1024px){\n"
+ "  body.kv-ui .card{ width:min(520px,92vw); padding:38px 40px; border-radius:28px; }\n"
+ "  body.kv-ui .card h2{ font-size:29px; }\n"
+ "  body.kv-ui .field input{ font-size:18px; padding:15px 17px; }\n"
+ "  body.kv-ui .btn.small{ padding:15px 44px; font-size:16px; }\n"
+ "  body.kv-ui #bottle-modal, body.kv-ui #unpair-modal, body.kv-ui #anniv-modal,\n"
+ "  body.kv-ui #today-modal, body.kv-ui #gift-modal, body.kv-ui #delacct-modal{\n"
+ "    width:min(540px,92vw); padding:30px 32px; border-radius:26px;\n"
+ "  }\n"
+ "  body.kv-ui #home-panel, body.kv-ui #char-panel, body.kv-ui #settings-panel, body.kv-ui #credits-panel{\n"
+ "    width:min(620px,92vw); max-height:calc(100vh - 150px); padding:26px 28px; border-radius:26px;\n"
+ "  }\n"
+ "  body.kv-ui .kv-section{ padding:16px 18px 18px; border-radius:20px; }\n"
+ "  body.kv-ui .kv-section-title{ font-size:12px; }\n"
+ "  body.kv-ui #chat-panel, body.kv-ui #theatre-ui{ width:min(600px,92vw); padding:20px 22px; }\n"
+ "  body.kv-ui #chat-list{ max-height:340px; }\n"
+ "  body.kv-ui .hud-top{ padding:18px 26px 24px; }\n"
+ "  body.kv-ui .hud-title{ font-size:22px; }\n"
+ "  body.kv-ui .hud-sub{ font-size:13px; }\n"
+ "  body.kv-ui .toast{ bottom:150px; font-size:16px; padding:16px 30px; }\n"
+ "  body.kv-ui #prompt-pill{ bottom:150px; }\n"
+ "  body.kv-ui #draw-canvas-wrap, body.kv-ui #draw-tools{ width:min(820px,94vw); }\n"
+ "  body.kv-ui .kv-loader-inner{ max-width:520px; }\n"
+ "  body.kv-ui .kv-loader-bar{ width:min(360px,70vw); }\n"
+ "  body.kv-ui .kv-loader-word{ font-size:clamp(52px,7vw,76px); }\n"
+ "  body.kv-ui .code-big{ font-size:64px; }\n"
+ "}\n"
+ "@media (min-width:1024px){\n"
+ "  #kv-minimap{ width:150px; height:150px; top:92px; right:20px; }\n"
+ "  body.kv-ui #weather-pop{ top:262px; right:20px; }\n"
+ "  body.kv-ui #weather-pop .chip{ min-width:170px; }\n"
+ "  body.kv-ui .hud-bottom{ width:300px; }\n"
+ "}\n"
+ "/* touch-only affordances off on true desktop pointers (game hides the stick there too) */\n"
+ "@media (hover:hover) and (pointer:fine){\n"
+ "  body.kv-ui .hint{ display:none; }\n"
+ "  body.kv-ui .pill:hover, body.kv-ui .mini-btn:hover,\n"
+ "  body.kv-ui .chip:hover, body.kv-ui .hp-chip:hover{ transform:translateY(-2px); }\n"
+ "  body.kv-ui #kv-minimap{ cursor:default; }\n"
+ "}\n"
+ "/* ---------- graphics quality segmented control ---------- */\n"
+ "body.kv-ui .kv-seg{\n"
+ "  display:flex; gap:6px; padding:6px; border-radius:18px;\n"
+ "  background:rgba(10,8,26,.55); border:1px solid rgba(246,241,255,.12);\n"
+ "  box-shadow:inset 0 2px 10px rgba(5,3,18,.5);\n"
+ "}\n"
+ "body.kv-ui .kv-seg button{\n"
+ "  flex:1 1 0; min-width:0; min-height:48px; border:none; border-radius:13px;\n"
+ "  background:transparent; color:rgba(246,241,255,.62);\n"
+ "  font-family:Georgia,'Times New Roman',serif; font-size:13px; letter-spacing:.05em;\n"
+ "  cursor:pointer; padding:6px 2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;\n"
+ "  transition:color .2s ease, background .2s ease, box-shadow .2s ease, transform .14s var(--kv-ease);\n"
+ "}\n"
+ "body.kv-ui .kv-seg button:hover:not(:disabled){ color:#fff; background:rgba(246,241,255,.08); }\n"
+ "body.kv-ui .kv-seg button.active{\n"
+ "  color:#241b3f;\n"
+ "  background:linear-gradient(180deg,#fff7fb,#ffd9ec);\n"
+ "  box-shadow:0 0 18px rgba(255,217,236,.45), 0 4px 12px rgba(5,3,18,.4), inset 0 1px 0 rgba(255,255,255,.9);\n"
+ "}\n"
+ "body.kv-ui .kv-seg button:active:not(:disabled){ transform:scale(.95); }\n"
+ "body.kv-ui .kv-seg.kv-disabled{ opacity:.6; }\n"
+ "body.kv-ui .kv-seg.kv-disabled button{ cursor:wait; }\n"
+ "body.kv-ui .kv-quality-cap{\n"
+ "  margin-top:10px; font-size:12.5px; font-style:italic; letter-spacing:.08em;\n"
+ "  color:rgba(246,241,255,.62); text-align:center; min-height:20px; line-height:1.5;\n"
+ "}\n"
+ "body.kv-ui .kv-quality-cap b{ color:var(--kv-gold); font-style:normal; font-weight:400; letter-spacing:.14em; }\n"
+ "body.kv-ui .kv-quality-cap .kv-fps60{ color:#b8f0d0; font-style:normal; }\n"
+ "body.kv-ui .kv-quality-cap .kv-fps30{ color:#ffd9a8; font-style:normal; }\n"
+ "body.kv-ui .vol-slider:disabled{ opacity:.4; }\n"
+ "body.kv-ui .kv-audio-note{ margin-top:8px; }\n"
+ "body.kv-ui .set-row .toggle{ margin-left:auto; }\n"
+ "body.kv-ui #kv-audio-sec .set-lbl{ width:86px; }\n"
+ "body.kv-ui .kv-seg button{ font-size:12px; letter-spacing:.02em; }\n"
+ "@media (min-width:1024px){ body.kv-ui .kv-seg button{ font-size:13px; letter-spacing:.05em; } }\n"
+ "\n";
/* ---------------- 2. helpers ---------------- */
function $(id){ return document.getElementById(id); }

function injectCSS(){
  if($("kv-ui-style")) return;
  var st = document.createElement("style");
  st.id = "kv-ui-style";
  st.setAttribute("data-kv", "premium-ui");
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

function directChild(panel, el){
  while(el && el.parentElement && el.parentElement !== panel) el = el.parentElement;
  return (el && el.parentElement === panel) ? el : null;
}
function moveRowWith(panel, box, childId){
  var el = $(childId);
  if(!el) return false;
  var row = directChild(panel, el);
  if(!row || row === box) return false;
  box.appendChild(row);
  return true;
}
function firstBtnsRow(panel){
  var kids = panel.children;
  for(var i=0;i<kids.length;i++){
    if(kids[i].classList && kids[i].classList.contains("btns")) return kids[i];
  }
  return null;
}
/* Organize a panel's direct-child rows into labelled premium sections.
   Rows are MOVED (never cloned), so every game listener keeps working. */
function sectionize(panelId, sections){
  var panel = $(panelId);
  if(!panel || !sections || !sections.length) return;
  sections.forEach(function(sec){
    var box = document.createElement("div");
    box.className = "kv-section";
    var h = document.createElement("h4");
    h.className = "kv-section-title";
    h.textContent = sec.title;
    box.appendChild(h);
    (sec.ids || []).forEach(function(id){ moveRowWith(panel, box, id); });
    try{ if(sec.extra) sec.extra(panel, box, h); }catch(e){}
    if(box.children.length > 1){
      var at = firstBtnsRow(panel);
      if(at) panel.insertBefore(box, at);
      else panel.appendChild(box);
    }
  });
}

function groupPanels(){
  /* settings: invite / profile / sound / pairing */
  sectionize("settings-panel", [
    { title:"Invite", ids:["invite-code","invite-hint"],
      extra:function(panel, box, h){
        var kids = panel.children, lbl = null, i, c;
        for(i=0;i<kids.length;i++){
          c = kids[i];
          if(c.tagName==="DIV" && c.classList.contains("set-lbl") && /invite/i.test(c.textContent || "")){ lbl = c; break; }
        }
        if(lbl) box.insertBefore(lbl, h.nextSibling);
        moveRowWith(panel, box, "invite-copy");
      }},
    { title:"Profile", ids:["set-name","set-island","set-anniv","set-age"],
      extra:function(panel, box){ moveRowWith(panel, box, "set-char"); } },
    { title:"Sound", ids:["sound-toggle","vol-music","vol-steps","vol-nature"] },
    { title:"Pairing", ids:["pair-status"] }
  ]);
  /* wardrobe */
  sectionize("char-panel", [
    { title:"Spirit",   ids:["cp-style","cp-skin","cp-glow","cp-mask"] },
    { title:"Hair",     ids:["cp-hair","cp-haircolor"] },
    { title:"Outfit",   ids:["cp-outfit","cp-bottom","cp-outfitcolor","cp-footwear"] },
    { title:"Extras",   ids:["cp-glasses","cp-hat","cp-acc"] },
    { title:"Companion",ids:["cp-pet","cp-petname-row"] }
  ]);
  /* home customizer */
  sectionize("home-panel", [
    { title:"Walls", ids:["hp-wallmat","hp-wallcolor"] },
    { title:"Roof",  ids:["hp-roofstyle","hp-roofcolor"] },
    { title:"Door",  ids:["hp-doorcolor"] }
  ]);
}

/* ---------------- graphics quality section ----------------
   UI surface only: the tier logic lives in kanavu-quality.js
   (window.__kvQuality). This builds a premium segmented control
   inside Settings, calls setTier on change, and reflects the
   active tier whenever Settings opens. Graceful when the
   quality module hasn't loaded yet. */
var QUALITY_TIERS = [
  { id:"auto",   label:"Auto",   fps:60, note:"adapts to this device" },
  { id:"low",    label:"Low",    fps:30, note:"best battery life" },
  { id:"medium", label:"Medium", fps:60, note:"balanced" },
  { id:"high",   label:"High",   fps:60, note:"crisp detail" },
  { id:"ultra",  label:"Ultra",  fps:60, note:"maximum fidelity" }
];
var Q = { sec:null, seg:null, cap:null, btns:[], poller:null };

function qualityReady(){
  try{ return !!(window.__kvQuality && typeof window.__kvQuality.setTier === "function"); }catch(e){ return false; }
}
function qualityTier(){
  try{
    if(window.__kvQuality && typeof window.__kvQuality.getTier === "function")
      return window.__kvQuality.getTier();
  }catch(e){}
  return null;
}
function syncQualityUI(){
  if(!Q.seg || !Q.cap) return;
  var ready = qualityReady();
  var cur = qualityTier();
  Q.seg.classList.toggle("kv-disabled", !ready);
  for(var i=0;i<Q.btns.length;i++){
    (function(b, t){
      b.classList.toggle("active", !!(ready && cur === t.id));
      b.disabled = !ready;
    })(Q.btns[i], QUALITY_TIERS[i]);
  }
  if(!ready){
    Q.cap.textContent = "preparing graphics engine\u2026";
    return;
  }
  var t = null, j;
  for(j=0;j<QUALITY_TIERS.length;j++){ if(QUALITY_TIERS[j].id === cur){ t = QUALITY_TIERS[j]; break; } }
  if(t){
    Q.cap.innerHTML = "<b>" + t.label + "</b> &middot; targets " +
      "<span class=\"kv-fps" + t.fps + "\">" + t.fps + "fps</span> &middot; " + t.note;
  }else{
    Q.cap.textContent = "choose a quality level";
  }
}
function buildQualitySection(){
  var panel = $("settings-panel");
  if(!panel || $("kv-quality-sec")) return;
  var sec = document.createElement("div");
  sec.className = "kv-section kv-quality-sec";
  sec.id = "kv-quality-sec";
  var h = document.createElement("h4");
  h.className = "kv-section-title";
  h.textContent = "Graphics";
  sec.appendChild(h);
  var seg = document.createElement("div");
  seg.className = "kv-seg kv-disabled";
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", "Graphics quality");
  Q.btns = [];
  QUALITY_TIERS.forEach(function(t){
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = t.label;
    b.title = t.label + " \u2014 targets " + t.fps + "fps";
    b.disabled = true;
    b.addEventListener("click", function(){
      if(!qualityReady()) return;
      try{ window.__kvQuality.setTier(t.id); }catch(e){}
      try{ syncQualityUI(); }catch(e){}
    });
    seg.appendChild(b);
    Q.btns.push(b);
  });
  sec.appendChild(seg);
  var cap = document.createElement("div");
  cap.className = "kv-quality-cap";
  cap.textContent = "preparing graphics engine\u2026";
  sec.appendChild(cap);
  Q.sec = sec; Q.seg = seg; Q.cap = cap;
  /* place right after the Sound section (both are about device experience) */
  var inserted = false, i, tt;
  var kids = panel.querySelectorAll(".kv-section");
  for(i=0;i<kids.length;i++){
    tt = kids[i].querySelector(".kv-section-title");
    if(tt && /sound/i.test(tt.textContent || "")){
      panel.insertBefore(sec, kids[i].nextSibling);
      inserted = true;
      break;
    }
  }
  if(!inserted){
    var at = firstBtnsRow(panel);
    if(at) panel.insertBefore(sec, at); else panel.appendChild(sec);
  }
  /* re-sync whenever Settings opens */
  try{
    new MutationObserver(function(){
      try{
        var p = $("settings-panel");
        if(p && !p.classList.contains("hidden-el")) syncQualityUI();
      }catch(e){}
    }).observe(panel, { attributes:true, attributeFilter:["class"] });
  }catch(e){}
  /* the quality module may load after this file — pick it up when it arrives */
  try{ clearInterval(Q.poller); }catch(e){}
  var n = 0;
  Q.poller = setInterval(function(){
    try{ syncQualityUI(); }catch(e){}
    if(qualityReady() || ++n > 120){ try{ clearInterval(Q.poller); }catch(e){} }
  }, 500);
  try{ syncQualityUI(); }catch(e){}
}

/* ---------------- audio section ----------------
   Adi: keep the 3 tracks exactly as they are — this is only a
   mix surface. Drives the GAME'S OWN sliders (vol-music /
   vol-steps) via dispatched input events, so the real, tested
   audio path (bus gains, persistence keys) does the work.
   Persists to localStorage "kanavu.audio".
   - Music toggle/volume -> musicBus (Theera/Meet/bridge tracks)
   - SFX toggle/volume   -> stepsBus (tap blips, UI samples) */
var AU = { sec:null, musicT:null, musicV:null, sfxT:null, sfxV:null,
           st:{ musicOn:true, musicVol:80, sfxOn:true, sfxVol:80 } };

function audioClampVol(v, fb){
  v = parseInt(v, 10);
  return isNaN(v) ? fb : Math.min(100, Math.max(0, v));
}
function audioLoad(){
  var d = { musicOn:true, musicVol:80, sfxOn:true, sfxVol:80 };
  try{
    var raw = localStorage.getItem("kanavu.audio");
    if(raw){
      var s = JSON.parse(raw);
      if(s && typeof s === "object"){
        if(typeof s.musicOn === "boolean") d.musicOn = s.musicOn;
        if(typeof s.sfxOn === "boolean") d.sfxOn = s.sfxOn;
        d.musicVol = audioClampVol(s.musicVol, d.musicVol);
        d.sfxVol = audioClampVol(s.sfxVol, d.sfxVol);
        return d;
      }
    }
    /* first run: adopt the volumes the game already knows */
    d.musicVol = audioClampVol(localStorage.getItem("kanavu_vol_music"), 80);
    d.sfxVol = audioClampVol(localStorage.getItem("kanavu_vol_steps"), 80);
  }catch(e){}
  return d;
}
function audioSave(){
  try{ localStorage.setItem("kanavu.audio", JSON.stringify(AU.st)); }catch(e){}
}
/* push a value through the game's own slider so its handler updates
   the live bus gain (guarded before the AudioContext exists) and its
   own persistence key. */
function audioPushBus(gameSliderId, value){
  var el = $(gameSliderId);
  if(!el) return;
  try{ el.value = value; }catch(e){}
  try{ el.dispatchEvent(new Event("input", { bubbles:true })); }catch(e){}
}
function audioApply(){
  audioPushBus("vol-music", AU.st.musicOn ? AU.st.musicVol : 0);
  audioPushBus("vol-steps", AU.st.sfxOn ? AU.st.sfxVol : 0);
}
function audioSyncUI(){
  if(!AU.sec) return;
  try{
    AU.musicT.classList.toggle("on", !!AU.st.musicOn);
    AU.musicT.setAttribute("aria-checked", AU.st.musicOn ? "true" : "false");
    AU.sfxT.classList.toggle("on", !!AU.st.sfxOn);
    AU.sfxT.setAttribute("aria-checked", AU.st.sfxOn ? "true" : "false");
    AU.musicV.value = AU.st.musicVol;
    AU.sfxV.value = AU.st.sfxVol;
    AU.musicV.disabled = !AU.st.musicOn;
    AU.sfxV.disabled = !AU.st.sfxOn;
  }catch(e){}
}
function audioRow(labelText, control){
  var row = document.createElement("div");
  row.className = "set-row";
  var lbl = document.createElement("span");
  lbl.className = "set-lbl";
  lbl.textContent = labelText;
  row.appendChild(lbl);
  row.appendChild(control);
  return row;
}
function buildAudioSection(){
  var panel = $("settings-panel");
  if(!panel || $("kv-audio-sec")) return;
  AU.st = audioLoad();
  var sec = document.createElement("div");
  sec.className = "kv-section";
  sec.id = "kv-audio-sec";
  var h = document.createElement("h4");
  h.className = "kv-section-title";
  h.textContent = "Audio";
  sec.appendChild(h);

  var musicT = document.createElement("div");
  musicT.className = "toggle";
  musicT.setAttribute("role", "switch");
  musicT.setAttribute("aria-label", "Music on/off");
  musicT.id = "kv-music-toggle";
  var musicV = document.createElement("input");
  musicV.type = "range"; musicV.min = "0"; musicV.max = "100"; musicV.value = "80";
  musicV.className = "vol-slider";
  musicV.id = "kv-music-vol";
  musicV.setAttribute("aria-label", "Music volume");
  var sfxT = document.createElement("div");
  sfxT.className = "toggle";
  sfxT.setAttribute("role", "switch");
  sfxT.setAttribute("aria-label", "Sound effects on/off");
  sfxT.id = "kv-sfx-toggle";
  var sfxV = document.createElement("input");
  sfxV.type = "range"; sfxV.min = "0"; sfxV.max = "100"; sfxV.value = "80";
  sfxV.className = "vol-slider";
  sfxV.id = "kv-sfx-vol";
  sfxV.setAttribute("aria-label", "Sound effects volume");

  AU.musicT = musicT; AU.musicV = musicV; AU.sfxT = sfxT; AU.sfxV = sfxV;

  musicT.addEventListener("click", function(){
    AU.st.musicOn = !AU.st.musicOn;
    audioSave(); audioSyncUI(); audioApply();
  });
  sfxT.addEventListener("click", function(){
    AU.st.sfxOn = !AU.st.sfxOn;
    audioSave(); audioSyncUI(); audioApply();
  });
  musicV.addEventListener("input", function(){
    AU.st.musicVol = audioClampVol(musicV.value, AU.st.musicVol);
    if(AU.st.musicVol > 0 && !AU.st.musicOn) AU.st.musicOn = true;
    audioSave(); audioSyncUI(); audioApply();
  });
  sfxV.addEventListener("input", function(){
    AU.st.sfxVol = audioClampVol(sfxV.value, AU.st.sfxVol);
    if(AU.st.sfxVol > 0 && !AU.st.sfxOn) AU.st.sfxOn = true;
    audioSave(); audioSyncUI(); audioApply();
  });

  sec.appendChild(audioRow("Music", musicT));
  sec.appendChild(audioRow("Music vol", musicV));
  sec.appendChild(audioRow("SFX", sfxT));
  sec.appendChild(audioRow("SFX vol", sfxV));
  var note = document.createElement("div");
  note.className = "set-note kv-audio-note";
  note.textContent = "your mix \u2014 the island\u2019s tunes stay exactly as they are";
  sec.appendChild(note);

  AU.sec = sec;
  /* place right after the Sound section */
  var inserted = false, i, tt;
  var kids = panel.querySelectorAll(".kv-section");
  for(i=0;i<kids.length;i++){
    tt = kids[i].querySelector(".kv-section-title");
    if(tt && /sound/i.test(tt.textContent || "")){
      panel.insertBefore(sec, kids[i].nextSibling);
      inserted = true;
      break;
    }
  }
  if(!inserted){
    var at = firstBtnsRow(panel);
    if(at) panel.insertBefore(sec, at); else panel.appendChild(sec);
  }
  audioSyncUI();
  audioApply();
  audioSave();
  /* re-sync whenever Settings opens */
  try{
    new MutationObserver(function(){
      try{
        var p = $("settings-panel");
        if(p && !p.classList.contains("hidden-el")) audioSyncUI();
      }catch(e){}
    }).observe(panel, { attributes:true, attributeFilter:["class"] });
  }catch(e){}
}

/* Keep the top-right HUD controls in a tidy wrapping cluster so the
   title block never collides with the buttons. */
function wrapHudRight(){
  var top = document.querySelector("#game-screen .hud-top");
  if(!top || top.querySelector(".kv-hud-right")) return;
  var wrap = document.createElement("div");
  wrap.className = "kv-hud-right";
  ["pair-pill","star-pill","voice-btn","weather-btn","settings-btn","back-btn"].forEach(function(id){
    var el = $(id);
    if(el && el.parentElement === top) wrap.appendChild(el);
  });
  if(wrap.children.length) top.appendChild(wrap);
}

/* ---------------- 3. premium loading overlay ---------------- */
var loader = { el:null, fill:null, status:null, timer:null, statusTimer:null, fallback:null, prog:0, shown:false };
var STATUS_LINES = ["waking the island\u2026","gathering starlight\u2026","tuning the waves\u2026","finding your love\u2026"];

function buildLoader(){
  if($("kv-loader")) { loader.el = $("kv-loader"); return; }
  var l = document.createElement("div");
  l.id = "kv-loader";
  l.className = "hidden-el";
  l.setAttribute("aria-hidden","true");
  l.innerHTML =
      '<div class="kv-loader-inner">'
    + '<div class="kv-loader-moon"></div>'
    + '<div class="kv-loader-word">Kanavu</div>'
    + '<div class="kv-loader-tag">Connecting Dreams</div>'
    + '<div class="kv-loader-bar"><div class="kv-loader-fill"></div></div>'
    + '<div class="kv-loader-status">waking the island\u2026</div>'
    + "</div>";
  document.body.appendChild(l);
  loader.el = l;
  loader.fill = l.querySelector(".kv-loader-fill");
  loader.status = l.querySelector(".kv-loader-status");
}
function paintProg(){
  if(loader.fill) loader.fill.style.width = loader.prog.toFixed(1) + "%";
}
function pastTitle(){
  try{
    var ss = document.querySelectorAll(".screen");
    for(var i=0;i<ss.length;i++){
      if(ss[i].id && ss[i].id !== "title-screen" && ss[i].classList && !ss[i].classList.contains("hidden")) return true;
    }
  }catch(e){}
  return false;
}
function showLoader(){
  if(!loader.el || loader.shown) return;
  if(pastTitle()) return;   /* never cover an already-visible game screen */
  loader.shown = true;
  loader.prog = 4;
  loader.el.classList.remove("hidden-el");
  loader.el.classList.remove("kv-hide");
  paintProg();
  var si = 0;
  clearInterval(loader.statusTimer);
  loader.statusTimer = setInterval(function(){
    if(!loader.shown) return;
    si = (si + 1) % STATUS_LINES.length;
    if(loader.status){
      loader.status.style.opacity = "0";
      setTimeout(function(){
        if(!loader.shown || !loader.status) return;
        loader.status.textContent = STATUS_LINES[si];
        loader.status.style.opacity = "1";
      }, 380);
    }
  }, 2600);
  clearInterval(loader.timer);
  loader.timer = setInterval(function(){
    if(!loader.shown) return;
    loader.prog += (88 - loader.prog) * 0.045 + 0.12;
    if(loader.prog > 88) loader.prog = 88;
    paintProg();
  }, 120);
  clearTimeout(loader.fallback);
  loader.fallback = setTimeout(hideLoader, 90000);
}
function hideLoader(){
  if(!loader.el || !loader.shown) return;
  loader.shown = false;
  clearInterval(loader.timer);
  clearInterval(loader.statusTimer);
  clearTimeout(loader.fallback);
  loader.prog = 100;
  paintProg();
  setTimeout(function(){
    if(!loader.el) return;
    loader.el.classList.add("kv-hide");
    setTimeout(function(){
      if(!loader.el) return;
      loader.el.classList.add("hidden-el");
      loader.el.classList.remove("kv-hide");
    }, 650);
  }, 380);
}
/* Hide the loader as soon as the game moves past the title screen. */
function watchScreens(){
  var obs;
  try{
    obs = new MutationObserver(function(muts){
      for(var i=0;i<muts.length;i++){
        var el = muts[i].target;
        if(el.id && el.id !== "title-screen" && el.classList && !el.classList.contains("hidden")){
          hideLoader();
          break;
        }
      }
    });
  }catch(e){ return; }
  var screens = document.querySelectorAll(".screen");
  for(var i=0;i<screens.length;i++){
    try{ obs.observe(screens[i], { attributes:true, attributeFilter:["class"] }); }catch(e){}
  }
}

/* ---------------- 4. circular live minimap ---------------- */
var MM = { W:null, groundY:null, wrap:null, ctx:null, base:null, rigs:[], rescan:0, timer:null, HALF:130, SIZE:240 };

function snapTerrain(){
  try{
    var N = 96, H = MM.HALF;
    var off = document.createElement("canvas");
    off.width = N; off.height = N;
    var c = off.getContext("2d");
    var img = c.createImageData(N, N);
    var d = img.data, i, j, k, x, z, y, r, g, b;
    for(j=0;j<N;j++){
      for(i=0;i<N;i++){
        x = -H + (2*H)*(i/(N-1));
        z = -H + (2*H)*(j/(N-1));
        y = -10;
        try{ y = MM.groundY(x, z); }catch(e){}
        if(y <= -0.4){ r=47;  g=65;  b=118; }  /* water */
        else if(y < 0.7){ r=230; g=207; b=159; } /* sand */
        else if(y < 4){ r=147; g=196; b=155; }   /* grass */
        else if(y < 9){ r=106; g=164; b=131; }   /* forest */
        else { r=168; g=155; b=212; }            /* highlands */
        k = (j*N+i)*4;
        d[k]=r; d[k+1]=g; d[k+2]=b; d[k+3]=255;
      }
    }
    c.putImageData(img, 0, 0);
    MM.base = off;
  }catch(e){ MM.base = null; }
}

function findRigs(){
  var out = [];
  try{
    var W = MM.W;
    if(!W || !W.scene) return out;
    MM.rigs = (MM.rigs || []).filter(function(o){
      try{ return !!(o && o.parent); }catch(e){ return false; }
    });
    if(!MM.rigs.length || (++MM.rescan % 8 === 0)){
      var found = [];
      W.scene.traverse(function(o){
        if(o && o.userData && o.userData.rig) found.push(o.userData.rig);
      });
      if(found.length) MM.rigs = found;
    }
    var V = (window.THREE && THREE.Vector3) ? new THREE.Vector3() : null;
    for(var i=0;i<MM.rigs.length;i++){
      if(V){ MM.rigs[i].getWorldPosition(V); out.push({ x:V.x, z:V.z }); }
      else out.push({ x:MM.rigs[i].position.x || 0, z:MM.rigs[i].position.z || 0 });
    }
  }catch(e){}
  return out;
}

function drawMinimap(){
  try{
    if(!MM.ctx || document.hidden) return;
    var S = MM.SIZE, ctx = MM.ctx, H = MM.HALF;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S/2, S/2, S/2-2, 0, Math.PI*2); ctx.clip();
    if(MM.base) ctx.drawImage(MM.base, 0, 0, S, S);
    else { ctx.fillStyle = "rgba(30,40,80,.9)"; ctx.fillRect(0, 0, S, S); }
    var rigs = findRigs();
    var cam = MM.W && MM.W.camera;
    var cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0;
    var pi = 0, bd = Infinity, i, dx, dz, dd;
    for(i=0;i<rigs.length;i++){
      dx = rigs[i].x - cx; dz = rigs[i].z - cz; dd = dx*dx + dz*dz;
      if(dd < bd){ bd = dd; pi = i; }
    }
    var k;
    var dot = function(px, pz, color, glow){
      var mx = (px + H)/(2*H)*S, mz = (pz + H)/(2*H)*S;
      if(mx < 5 || mx > S-5 || mz < 5 || mz > S-5) return;
      ctx.save();
      ctx.shadowColor = glow; ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, mz, 6, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(mx, mz, 2.4, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    };
    for(k=0;k<rigs.length;k++){
      if(k !== pi) dot(rigs[k].x, rigs[k].z, "#ffd9a6", "rgba(255,217,166,.9)");
    }
    if(rigs.length) dot(rigs[pi].x, rigs[pi].z, "#ffd9ec", "rgba(255,217,236,.95)");
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(255,233,184,.35)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S/2, S/2, S/2-3, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }catch(e){}
}

function initMinimap(){
  try{
    var W = window.__kvWorld;
    if(!W || !W.scene || !W.camera || typeof W.groundY !== "function") return;
    if($("kv-minimap")) return;
    var gs = $("game-screen");
    if(!gs) return;
    MM.W = W;
    MM.groundY = W.groundY;
    var wrap = document.createElement("div");
    wrap.id = "kv-minimap";
    wrap.setAttribute("aria-hidden", "true");
    var cv = document.createElement("canvas");
    cv.width = MM.SIZE; cv.height = MM.SIZE;
    wrap.appendChild(cv);
    var n = document.createElement("div");
    n.className = "kv-mm-north";
    n.textContent = "N";
    wrap.appendChild(n);
    gs.appendChild(wrap);
    MM.wrap = wrap;
    MM.ctx = cv.getContext("2d");
    snapTerrain();
    drawMinimap();
    clearInterval(MM.timer);
    MM.timer = setInterval(drawMinimap, 400);
  }catch(e){ /* silent: minimap is decorative */ }
}

function waitWorld(){
  var tries = 0;
  var t = setInterval(function(){
    var W = null;
    try{ W = window.__kvWorld; }catch(e){}
    if(W && W.scene && W.camera){
      clearInterval(t);
      try{ initMinimap(); }catch(e){}
      try{ document.body.classList.add("kv-world"); }catch(e){}
    }else if(++tries > 120){
      clearInterval(t);
    }
  }, 500);
}

/* ---------------- 5. boot ---------------- */
function boot(){
  if(!document.body) return false;
  try{ injectCSS(); }catch(e){}
  try{ document.body.classList.add("kv-ui"); }catch(e){}
  try{ buildLoader(); }catch(e){}
  try{
    var b = $("begin-btn");
    if(b) b.addEventListener("click", function(){ showLoader(); });
  }catch(e){}
  try{ watchScreens(); }catch(e){}
  /* Safety sweeper: if the loader is up but we're past the title (any
     ordering — e.g. a synthetic event that arrives late), hide it. */
  try{
    setInterval(function(){
      try{ if(loader.shown && pastTitle()) hideLoader(); }catch(e){}
    }, 1000);
  }catch(e){}
  try{ wrapHudRight(); }catch(e){}
  try{ groupPanels(); }catch(e){}
  try{ buildQualitySection(); }catch(e){}
  try{ buildAudioSection(); }catch(e){}
  waitWorld();
  try{
    window.__kvUI = {
      version: "20251009a",
      resnapMinimap: function(){ MM.base = null; if(MM.W){ snapTerrain(); drawMinimap(); } }
    };
  }catch(e){}
  return true;
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", function(){ boot(); });
}else{
  boot();
}

}();
