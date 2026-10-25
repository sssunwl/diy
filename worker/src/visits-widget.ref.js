// 登入紀錄面板:頁面放 <section id="visit-log" data-api="/api/visits"></section> 再載入呢個檔。
// API 回 403(唔係 SS)就成個 section 收埋。樣式只用 currentColor,跟住各站主題。
// 正本:Knowledge/30_方法與SOP/登入紀錄/visits-widget.js(改正本再抄去各站)
(function () {
  var box = document.getElementById('visit-log');
  if (!box) return;
  var api = box.getAttribute('data-api') || '/api/visits';
  var fmt = function (iso) {
    try {
      return new Date(iso).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) { return iso; }
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };
  var css = '#visit-log{margin:40px 0 24px;font-size:13px;line-height:1.5}' +
    '#visit-log h2,#visit-log h3{margin:0 0 6px}#visit-log .vl-note{opacity:.65;margin:0 0 14px;font-size:12px}' +
    '#visit-log .vl-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:18px}' +
    '#visit-log table{border-collapse:collapse;width:100%;min-width:440px}' +
    '#visit-log th,#visit-log td{text-align:left;padding:7px 10px;border-bottom:1px solid currentColor;border-bottom-color:rgba(127,127,127,.25);white-space:nowrap}' +
    '#visit-log th{font-weight:600;opacity:.7;font-size:12px}#visit-log td.vl-path{white-space:normal;word-break:break-all}' +
    '#visit-log select{font:inherit;padding:4px 8px;margin:0 0 10px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit}' +
    '#visit-log .vl-num{font-variant-numeric:tabular-nums}';
  fetch(api, { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      var people = d.summary || [], rows = d.recent || [];
      var h = '<style>' + css + '</style><h2>登入紀錄</h2>' +
        '<p class="vl-note">誰喺幾時睇咗邊頁(香港時間)。只有你睇到;紀錄保留 ' + (d.keepDays || 365) + ' 日。</p>';
      if (!people.length) { box.innerHTML = h + '<p>暫時未有紀錄。</p>'; return; }
      h += '<h3>每個人</h3><div class="vl-scroll"><table><tr><th>Email</th><th>頁數</th><th>第一次</th><th>最近一次</th></tr>' +
        people.map(function (p) {
          return '<tr><td>' + esc(p.email) + '</td><td class="vl-num">' + p.views + '</td><td>' + fmt(p.first) + '</td><td>' + fmt(p.last) + '</td></tr>';
        }).join('') + '</table></div>';
      h += '<h3>最近 ' + rows.length + ' 次</h3><select id="vl-filter"><option value="">全部人</option>' +
        people.map(function (p) { return '<option>' + esc(p.email) + '</option>'; }).join('') +
        '</select><div class="vl-scroll"><table id="vl-recent"></table></div>';
      box.innerHTML = h;
      var draw = function (who) {
        document.getElementById('vl-recent').innerHTML = '<tr><th>時間</th><th>Email</th><th>頁面</th><th>地區</th></tr>' +
          rows.filter(function (r) { return !who || r.email === who; }).map(function (r) {
            return '<tr><td>' + fmt(r.ts) + '</td><td>' + esc(r.email) + '</td><td class="vl-path">' + esc(r.path) + '</td><td>' + esc(r.country) + '</td></tr>';
          }).join('');
      };
      document.getElementById('vl-filter').onchange = function () { draw(this.value); };
      draw('');
    })
    .catch(function () { box.remove(); });
})();
