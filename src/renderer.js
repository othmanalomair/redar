const $ = selector => document.querySelector(selector);
let data = { players: [], settings: {} };
let editing = null;

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
}

function render() {
  $('#playerCount').textContent = data.players.length;
  $('#emptyState').classList.toggle('hidden', data.players.length > 0);
  $('#playerList').innerHTML = data.players.map(player => `
    <article class="player-row">
      <i class="level-dot ${escapeHtml(player.level)}"></i>
      <div class="player-info"><b>${escapeHtml(player.riotId)}</b><small>${escapeHtml(player.note || `درجة الزبالة: ${player.level}`)}</small></div>
      <div class="row-actions"><button class="icon-button edit" data-id="${player.id}" title="تعديل">✎</button><button class="icon-button delete" data-id="${player.id}" title="حذف">×</button></div>
    </article>`).join('');
  $('#soundToggle').checked = Boolean(data.settings.sound);
  $('#overlayToggle').checked = data.settings.overlay !== false;
  $('#launchToggle').checked = Boolean(data.settings.launchAtLogin);
  $('#monitorButton').textContent = data.settings.monitoring ? 'إيقاف المراقبة' : 'تشغيل المراقبة';
}

function openDialog(player = null) {
  editing = player;
  $('#playerForm').reset();
  $('#formError').textContent = '';
  $('#playerId').value = player?.id || '';
  $('#riotId').value = player?.riotId || '';
  $('#note').value = player?.note || '';
  if (player) document.querySelector(`input[name="level"][value="${player.level}"]`).checked = true;
  $('#dialogEyebrow').textContent = player ? 'تعديل الهدف' : 'هدف جديد';
  $('#dialogTitle').textContent = player ? 'عدّل بيانات اللاعب' : 'أضف لاعب للرادار';
  $('#saveButton').textContent = player ? 'حفظ التعديل' : 'حفظ بالقائمة';
  $('#playerDialog').showModal();
  setTimeout(() => $('#riotId').focus(), 100);
}

$('#addButton').addEventListener('click', () => openDialog());
$('#emptyAdd').addEventListener('click', () => openDialog());
document.querySelectorAll('.dialog-cancel').forEach(button => {
  button.addEventListener('click', () => $('#playerDialog').close());
});
$('#playerForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    data = await window.radar.savePlayer({
      id: $('#playerId').value || undefined,
      riotId: $('#riotId').value,
      note: $('#note').value,
      level: document.querySelector('input[name="level"]:checked').value,
      createdAt: editing?.createdAt
    });
    $('#playerDialog').close(); render();
  } catch (error) { $('#formError').textContent = error.message; }
});
$('#playerList').addEventListener('click', async event => {
  const id = event.target.dataset.id;
  if (!id) return;
  if (event.target.classList.contains('edit')) openDialog(data.players.find(player => player.id === id));
  if (event.target.classList.contains('delete')) { data = await window.radar.deletePlayer(id); render(); }
});
$('#monitorButton').addEventListener('click', async () => { data = await window.radar.saveSettings({ monitoring: !data.settings.monitoring }); render(); });
$('#soundToggle').addEventListener('change', async event => { data = await window.radar.saveSettings({ sound: event.target.checked }); render(); });
$('#overlayToggle').addEventListener('change', async event => { data = await window.radar.saveSettings({ overlay: event.target.checked }); render(); });
$('#launchToggle').addEventListener('change', async event => { data = await window.radar.saveSettings({ launchAtLogin: event.target.checked }); render(); });
$('#docsButton').addEventListener('click', () => window.radar.openRiotDocs());
$('#testAlertButton').addEventListener('click', () => window.radar.testAlert());

window.radar.onLeagueStatus(status => {
  const pill = $('#statusPill');
  pill.className = 'status-pill';
  if (status.paused) {
    pill.querySelector('b').textContent = 'المراقبة متوقفة';
    $('#radarTitle').textContent = 'الرادار متوقف مؤقتًا';
    $('#radarText').textContent = 'شغّله مرة ثانية عشان نراقب القيم الجاي.';
  } else if (status.online && status.matches?.length) {
    pill.classList.add('alert');
    pill.querySelector('b').textContent = `تم اكتشاف ${status.matches.length}`;
    $('#radarTitle').textContent = `${status.matches[0].riotId} ${status.matches[0].side}!`;
    $('#radarText').textContent = status.matches[0].note || `يلعب ${status.matches[0].champion || 'الحين'}، انتبه له.`;
  } else if (status.online) {
    pill.classList.add('online');
    pill.querySelector('b').textContent = `القيم شغّال · ${status.count} لاعبين`;
    $('#radarTitle').textContent = 'القيم نظيف، ما لقينا أحد';
    $('#radarText').textContent = 'راجعنا كل الموجودين بالمباراة وما في أحد منهم بقائمتك.';
  } else {
    pill.querySelector('b').textContent = 'بانتظار League';
    $('#radarTitle').textContent = 'الرادار شغّال بالخلفية';
    $('#radarText').textContent = 'افتح League والبرنامج يتكفّل بالباقي. إذا دخل واحد من القائمة، بنقول لك فورًا.';
  }
});
window.radar.onDataChanged(next => { data = next; render(); });
window.radar.onFocusAdd(() => openDialog());

window.radar.getData().then(next => { data = next; render(); });
