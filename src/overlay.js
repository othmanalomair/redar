function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
}

window.overlay.onShowAlert(({ matches }) => {
  const visible = matches.slice(0, 5);
  const noun = matches.length === 1 ? 'هدف موجود بالقيم' : `${matches.length} أهداف موجودين بالقيم`;
  document.querySelector('#title').textContent = noun;
  document.querySelector('#targetList').innerHTML = visible.map(match => `
    <article class="target">
      <strong dir="ltr">${escapeHtml(match.riotId || 'لاعب من القائمة')}</strong>
      <span class="side ${match.side === 'معك' ? 'ally' : ''}">${escapeHtml(match.side || 'بالقيم')}</span>
      <p>${escapeHtml(match.champion || 'League')}<i></i>${escapeHtml(match.note || 'موجود في قائمتك')}</p>
    </article>
  `).join('') + (matches.length > 5 ? `<div class="more">و${matches.length - 5} غيرهم من القائمة</div>` : '');
  const alert = document.querySelector('#alert');
  alert.classList.remove('show');
  void alert.offsetWidth;
  alert.classList.add('show');
});
