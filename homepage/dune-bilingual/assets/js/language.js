(() => {
  const page = new URL(window.location.href);
  const choice = page.searchParams.get('lang');
  const current = document.documentElement.lang === 'ko' ? 'ko' : 'en';
  let saved;
  try {
    if (choice === 'en' || choice === 'ko') {
      localStorage.setItem('dune-language', choice);
    }
    saved = localStorage.getItem('dune-language');
  } catch {
    // File URLs can restrict storage. Explicit language links still work.
  }

  const preferred = choice === 'en' || choice === 'ko' ? choice : saved;
  const target = preferred || (current === 'ko' || /^ko(?:-|$)/i.test(navigator.language) ? 'ko' : 'en');
  const name = page.pathname.split('/').pop() || 'index.html';
  if (target !== current) {
    const destination = new URL((current === 'ko' ? '../' : 'ko/') + name, page);
    destination.search = page.search;
    destination.hash = page.hash;
    window.location.replace(destination.href);
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    for (const link of document.querySelectorAll('.lang a')) {
      const destination = new URL(link.href);
      destination.search = page.search;
      destination.searchParams.set('lang', link.hreflang);
      destination.hash = page.hash;
      link.href = destination.href;
    }

    // Carry the page's language even when Safari isolates localStorage by file.
    document.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link || link.hreflang) return;
      const destination = new URL(link.href);
      const directory = new URL('.', page);
      if (destination.protocol === directory.protocol && destination.host === directory.host &&
          destination.pathname.startsWith(directory.pathname) &&
          destination.pathname.slice(directory.pathname.length).match(/^[^/]+\.html$/)) {
        destination.searchParams.set('lang', current);
        link.href = destination.href;
      }
    });
    for (const form of document.querySelectorAll('form[action="search.html"]')) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'lang';
      input.value = current;
      form.append(input);
    }
  });
})();
