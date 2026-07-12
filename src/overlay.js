window.overlay.onShowAlert(match => {
  document.querySelector('#side').textContent = match.side || 'بالقيم';
  document.querySelector('#riotId').textContent = match.riotId || 'لاعب من القائمة';
  document.querySelector('#champion').textContent = match.champion || 'League of Legends';
  document.querySelector('#note').textContent = match.note || 'هذا اللاعب موجود في قائمتك';
  const alert = document.querySelector('#alert');
  alert.classList.remove('show');
  void alert.offsetWidth;
  alert.classList.add('show');
});
