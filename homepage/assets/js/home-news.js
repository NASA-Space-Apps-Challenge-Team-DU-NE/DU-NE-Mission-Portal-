(() => {
  const panel = document.querySelector('.sidebar .news');
  if (!panel || !panel.querySelector('.entry')) return;

  const korean = document.documentElement.lang.startsWith('ko');
  const formatDate = new Intl.DateTimeFormat(korean ? 'ko-KR' : 'en-GB', {
    year: 'numeric', month: korean ? 'long' : 'short', day: 'numeric', timeZone: 'UTC'
  });
  const excluded = /\b(?:chin(?:a|ese)|north[\s_-]*korea(?:n)?|dprk|pyongyang|chang[’' _-]*e|cnsa|shenzhou|tiangong|yutu|queqiao)\b|중국|中國|中国|북한|평양|창어|朝鲜|朝鮮|北朝鮮|民主朝鮮/i;
  const lunar = /\b(?:moon|lunar|artemis|clps)\b/i;
  const maxEntries = 3;
  const feed = new URL('https://api.spaceflightnewsapi.net/v4/articles/');
  feed.search = new URLSearchParams({search: 'lunar', ordering: '-published_at', limit: '50'});

  async function updateNews() {
    try {
      const response = await fetch(feed, {credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(6000)});
      if (!response.ok) return;
      const {results} = await response.json();
      if (!Array.isArray(results)) return;
      const seen = new Set();
      const cards = [];
      for (const article of results) {
        const {title, url, summary, news_site: source, published_at: date} = article;
        if (!title || !source || excluded.test([title, summary, url, source].join(' '))) continue;
        if (!lunar.test(title + ' ' + (summary || ''))) continue;
        let link;
        try { link = new URL(url); } catch { continue; }
        if (link.protocol !== 'https:' || link.hostname.endsWith('.cn') || link.hostname.endsWith('.kp')) continue;
        const published = new Date(date);
        if (!date || !Number.isFinite(published.getTime()) || published.getTime() > Date.now()) continue;
        const key = title.trim().toLowerCase();
        if (seen.has(key) || seen.has(link.href)) continue;
        seen.add(key);
        seen.add(link.href);

        const card = document.createElement('div');
        card.className = 'entry';
        const heading = document.createElement('h3');
        const anchor = document.createElement('a');
        anchor.href = link.href;
        anchor.lang = 'en';
        anchor.textContent = title;
        heading.append(anchor);
        const metadata = document.createElement('p');
        metadata.className = 'date';
        metadata.textContent = formatDate.format(published) + ' · ' + source;
        card.append(heading, metadata);
        cards.push(card);
        if (cards.length === maxEntries) break;
      }
      if (cards.length < maxEntries) return;
      panel.querySelectorAll('.entry, .checked').forEach(node => node.remove());
      panel.append(...cards);
    } catch {
      // The three on-page articles remain visible when the feed is unavailable.
    }
  }

  updateNews();
})();
