// Search page: looks for every word of the query in the page text held in search-index.js.
(function () {
  var q = (new URLSearchParams(location.search).get('q') || '').trim();
  var box = document.getElementById('results');
  var head = document.getElementById('results-head');
  var inputs = document.querySelectorAll('input[name="q"]');
  for (var i = 0; i < inputs.length; i++) inputs[i].value = q;
  if (!q) { head.textContent = 'Type a word or phrase into the search box.'; return; }

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  var words = q.toLowerCase().split(/\s+/).filter(Boolean);
  var found = [];
  SEARCH_INDEX.forEach(function (p) {
    var text = p.x.toLowerCase(), title = p.t.toLowerCase(), score = 0;
    for (var i = 0; i < words.length; i++) {
      var n = text.split(words[i]).length - 1;
      var inTitle = title.indexOf(words[i]) >= 0;
      if (!n && !inTitle) return;
      score += n + (inTitle ? 10 : 0);
    }
    found.push({ p: p, score: score });
  });
  found.sort(function (a, b) { return b.score - a.score; });

  head.textContent = found.length
    ? found.length + (found.length === 1 ? ' page matches' : ' pages match') + ' ‘' + q + '’.'
    : 'No pages match ‘' + q + '’. Try fewer or different words.';

  var mark = new RegExp('(' + words.map(reEsc).join('|') + ')', 'gi');
  found.forEach(function (r) {
    var x = r.p.x, at = x.toLowerCase().indexOf(words[0]);
    if (at < 0) at = 0;
    var from = Math.max(0, at - 90), to = Math.min(x.length, at + 200);
    var snip = (from ? '… ' : '') + x.slice(from, to) + (to < x.length ? ' …' : '');
    var li = document.createElement('li');
    li.innerHTML = '<h3><a href="' + esc(r.p.u) + '">' + esc(r.p.t) + '</a></h3>'
      + '<p>' + esc(snip).replace(mark, '<mark>$1</mark>') + '</p>'
      + '<p class="where">' + esc(r.p.u) + '</p>';
    box.appendChild(li);
  });
})();
