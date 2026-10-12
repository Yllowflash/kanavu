/* ============================================================================
 * Kanavu — customize.js  (thin integration: avatar-builder <-> world2d)
 * ----------------------------------------------------------------------------
 * - Opens the KeeperBuilder UI as an overlay (from avatar-builder.js)
 * - Wraps KeeperLook.applyToGame so every live change also refreshes the
 *   2D world sprite tints via KanavuWorld2D.refreshLook()
 * - Customize button is a DOM element (added by index.html)
 * Vanilla JS, no dependencies.
 * ========================================================================== */
(function () {
'use strict';

function ready(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}

ready(function () {
  /* hook: whenever the builder applies a change, refresh the 2D world too */
  try {
    if (window.KeeperLook && typeof window.KeeperLook.applyToGame === 'function') {
      var orig = window.KeeperLook.applyToGame;
      window.KeeperLook.applyToGame = function () {
        try { orig(); } catch (e) {}
        try {
          if (window.Kanavu2D && typeof window.Kanavu2D.refreshLook === 'function') {
            window.Kanavu2D.refreshLook();
          } else if (window.KanavuWorld2D && typeof window.KanavuWorld2D.refreshLook === 'function') {
            window.KanavuWorld2D.refreshLook();
          }
        } catch (e) {}
      };
    }
  } catch (e) {}

  /* customize button */
  var btn = document.getElementById('customize-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      try {
        if (window.KeeperBuilder && typeof window.KeeperBuilder.open === 'function') {
          window.KeeperBuilder.open();
        } else {
          alert('Customization is loading… try again in a moment.');
        }
      } catch (e) {}
    });
  }

  /* also refresh once shortly after world init (late KeeperLook load) */
  setTimeout(function () {
    try {
      if (window.Kanavu2D && typeof window.Kanavu2D.refreshLook === 'function') window.Kanavu2D.refreshLook();
    } catch (e) {}
  }, 2500);
});
})();
