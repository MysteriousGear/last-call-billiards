/* ═══════════════════════════════════════════════════════════════════════════
   LAST CALL BILLIARDS — shop.js
   THE BAR, between levels. Each item owns its price, its two description
   lines and what buying it does to the run. `repeat` items can be bought
   again on later visits; the rest disappear from the pool once owned.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var LCB = root.LCB = root.LCB || {};

  var POOL = [
    { key: "longerLook", name: "LONGER LOOK", price: 30, repeat: true,
      desc1: "aim line sees 70px", desc2: "further down the curve",
      buy: function (run) { run.aimLen += 70; } },

    { key: "bounceReader", name: "BOUNCE READER", price: 40,
      desc1: "shows where the struck", desc2: "ball will head",
      buy: function () {} },              // read directly off run.items

    { key: "soberSip", name: "SOBER SIP", price: 25, repeat: true,
      desc1: "next level: space is", desc2: "30% less drunk",
      buy: function (run) { run.soberSips++; } },

    { key: "wideMouth", name: "WIDE MOUTH", price: 45,
      desc1: "pockets +2px wide", desc2: "for the whole run",
      buy: function (run) { run.pocketBonus += 2; } },

    { key: "oneMoreRound", name: "ONE MORE ROUND", price: 35,
      desc1: "+3 shots on every", desc2: "level from now on",
      buy: function (run) { run.shotBonus += 3; } },

    { key: "tipJar", name: "TIP JAR", price: 30,
      desc1: "+$6 for every color", desc2: "you pot",
      buy: function (run) { run.potBonus += 6; } },
  ];

  var BY_KEY = {};
  POOL.forEach(function (it) { BY_KEY[it.key] = it; });

  LCB.Shop = {
    pool: POOL,

    /** Four random items the run doesn't already own. */
    stock: function (run) {
      var avail = POOL.filter(function (it) {
        return it.repeat || !run.items[it.key];
      });
      return LCB.shuffle(avail.slice()).slice(0, 4).map(function (it) {
        return { key: it.key, name: it.name, price: it.price,
                 desc1: it.desc1, desc2: it.desc2, sold: false };
      });
    },

    /** Returns true if the purchase went through. */
    buy: function (run, stockItem) {
      if (!stockItem || stockItem.sold || run.money < stockItem.price) return false;
      run.money -= stockItem.price;
      stockItem.sold = true;
      run.items[stockItem.key] = (run.items[stockItem.key] || 0) + 1;
      var def = BY_KEY[stockItem.key];
      if (def && def.buy) def.buy(run);
      return true;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
