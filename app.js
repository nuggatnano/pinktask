/* PinkTask — UI dan interaksi. */
(function () {
  'use strict';
  var S = window.PT, st = S.state;
  var $ = function (id) { return document.getElementById(id); };
  var ico = function (n) { return '<svg aria-hidden="true"><use href="#' + n + '" xlink:href="#' + n + '"/></svg>'; };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function openSheet(html) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('overlay').classList.add('open'); }
  function closeSheet() { $('overlay').classList.remove('open'); }

  /* ---------- kartu tugas ---------- */
  function taskCard(t) {
    var status = S.status(t);
    var subs = t.subtasks || [];
    var doneSubs = subs.filter(function (s) { return s.done; }).length;
    var late = status === 'terlambat';
    var reminderCount = (t.reminders || []).filter(function (r) { return r.at > Date.now(); }).length;
    var cat = S.CATEGORIES.filter(function (c) { return c.id === t.category; })[0];
    var html = '<div class="task' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">' +
      '<button class="check" data-act="toggle" aria-label="Centang tugas">' + ico('i-check') + '</button>' +
      '<div class="task-main"><div class="task-title">' + (t.pinned ? ico('i-star') : '') + esc(t.title) + '</div>';
    if (t.desc) html += '<div class="task-desc">' + esc(t.desc) + '</div>';
    html += '<div class="task-meta"><span>' + ico('i-clock') + esc(S.shortDate(t.date)) + ' · ' + esc(t.time) + '</span>';
    html += '<span class="tag ' + esc(t.priority) + '">' + esc((S.PRIORITIES.filter(function (p) { return p.id === t.priority; })[0] || S.PRIORITIES[1]).label) + '</span>';
    if (cat) html += '<span class="tag">' + esc(cat.label) + '</span>';
    if (reminderCount) html += '<span>' + ico('i-bell') + reminderCount + '</span>';
    if (late) html += '<span class="late">' + ico('i-info') + 'Terlambat</span>';
    html += '</div>';
    if (subs.length) html += '<div class="sub-progress"><span>' + doneSubs + '/' + subs.length + ' subtask</span><div class="bar"><span style="width:' + (doneSubs / subs.length * 100) + '%"></span></div></div>';
    html += '</div><div class="task-actions">' +
      '<button class="mini" data-act="edit" aria-label="Ubah">' + ico('i-edit') + '</button>' +
      '<button class="mini" data-act="delete" aria-label="Hapus">' + ico('i-trash') + '</button></div></div>';
    return html;
  }

  function bindTaskList(container) {
    container.addEventListener('click', function (e) {
      var card = e.target.closest('.task[data-id]');
      if (!card) return;
      var id = Number(card.getAttribute('data-id'));
      var t = st.tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return;
      var btn = e.target.closest('[data-act]');
      if (!btn) { openTaskModal(t); return; }
      var act = btn.getAttribute('data-act');
      if (act === 'toggle') toggleDone(t);
      else if (act === 'edit') openTaskModal(t);
      else if (act === 'delete') {
        if (!confirm('Hapus tugas "' + t.title + '"?')) return;
        S.cancelTask(t);
        st.tasks = st.tasks.filter(function (x) { return x.id !== id; });
        st.notes.forEach(function (n) { if (n.taskId === id) n.taskId = null; });
        S.save(); renderAll(); toast('Tugas dihapus.');
      }
    });
  }

  function toggleDone(t) {
    t.done = !t.done;
    if (t.done) {
      t.doneAt = new Date().toISOString();
      S.cancelTask(t);
      if (t.recurrence && t.recurrence !== 'none') createNext(t);
      toast('Tugas selesai. Kerja bagus!');
    } else {
      t.doneAt = null; S.scheduleTask(t); toast('Tugas dibuka lagi.');
    }
    S.save(); renderAll();
  }

  function createNext(t) {
    var d = new Date(t.date + 'T00:00:00');
    if (t.recurrence === 'daily') d.setDate(d.getDate() + 1);
    else if (t.recurrence === 'weekly') d.setDate(d.getDate() + 7);
    else if (t.recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (t.recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1);
    var keys = (t.reminders || []).map(function (r) { return r.key; });
    var next = {
      id: S.uid(), title: t.title, desc: t.desc, category: t.category, priority: t.priority,
      createdAt: new Date().toISOString(), date: S.ymd(d), time: t.time, done: false, doneAt: null,
      reminders: S.buildReminders(new Date(S.ymd(d) + 'T' + t.time + ':00').getTime(), keys),
      subtasks: (t.subtasks || []).map(function (s) { return { id: S.uid(), title: s.title, done: false }; }),
      recurrence: t.recurrence, pinned: t.pinned, note: t.note
    };
    st.tasks.push(next);
    S.scheduleTask(next);
  }

  function emptyState(title, desc) {
    return '<div class="empty">' + ico('i-empty') + '<b>' + esc(title) + '</b><p>' + esc(desc) + '</p></div>';
  }

  /* ---------- modal tugas ---------- */
  function openTaskModal(task, presetDate) {
    var editing = task || null;
    var subs = editing ? (task.subtasks || []).map(function (s) { return { id: s.id, title: s.title, done: s.done }; }) : [];
    var cat = editing ? task.category : 'kerja';
    var prio = editing ? task.priority : 'medium';
    var rec = editing ? (task.recurrence || 'none') : 'none';
    var rem = editing ? (task.reminders || []).map(function (r) { return r.key; }) : ['ontime'];
    var date = editing ? task.date : (presetDate || S.ymd(new Date()));
    var time = editing ? task.time : '09:00';

    function choiceRow(items, selected, attr) {
      return items.map(function (i) {
        return '<button class="choice' + (selected === i.id ? ' active' : '') + '" data-' + attr + '="' + i.id + '">' + esc(i.label) + '</button>';
      }).join('');
    }
    function renderSubs() {
      $('subtask-list').innerHTML = subs.map(function (s) {
        return '<div class="subtask-row' + (s.done ? ' done' : '') + '" data-id="' + s.id + '">' +
          '<input type="checkbox" ' + (s.done ? 'checked' : '') + '><span>' + esc(s.title) + '</span>' +
          '<button data-remove="' + s.id + '" aria-label="Hapus subtask">' + ico('i-close') + '</button></div>';
      }).join('');
    }
    function remRow() {
      return S.REMINDERS.map(function (r) {
        return '<button class="choice' + (rem.indexOf(r.id) >= 0 ? ' active' : '') + '" data-rem="' + r.id + '">' + esc(r.label) + '</button>';
      }).join('');
    }

    openSheet(
      '<h2>' + (editing ? 'Ubah Tugas' : 'Tugas Baru') + '</h2>' +
      '<input class="field" id="f-title" placeholder="Judul tugas" maxlength="120" value="' + esc(editing ? task.title : '') + '">' +
      '<label class="lbl">Deskripsi</label><textarea class="field" id="f-desc" placeholder="Detail pekerjaan (opsional)">' + esc(editing ? task.desc : '') + '</textarea>' +
      '<div class="two" style="margin-top:12px"><div><label class="lbl">Tanggal</label><input class="field" id="f-date" type="date" value="' + date + '"></div>' +
      '<div><label class="lbl">Jam</label><input class="field" id="f-time" type="time" value="' + time + '"></div></div>' +
      '<label class="lbl">Kategori</label><div class="choice-row" id="cat-row">' + choiceRow(S.CATEGORIES, cat, 'cat') + '</div>' +
      '<label class="lbl">Prioritas</label><div class="choice-row" id="prio-row">' + choiceRow(S.PRIORITIES, prio, 'prio') + '</div>' +
      '<label class="lbl">Pengingat (bisa lebih dari satu)</label><div class="choice-row" id="rem-row">' + remRow() + '</div>' +
      '<label class="lbl">Subtask</label><div id="subtask-list"></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px"><input class="field" id="sub-input" placeholder="Tambah subtask"><button class="btn ghost" id="sub-add" style="flex:0 0 74px">Tambah</button></div>' +
      '<label class="lbl">Pengulangan</label><select class="field" id="f-rec">' +
      [['none', 'Tidak berulang'], ['daily', 'Harian'], ['weekly', 'Mingguan'], ['monthly', 'Bulanan'], ['yearly', 'Tahunan']]
        .map(function (o) { return '<option value="' + o[0] + '"' + (rec === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<div class="sheet-actions">' +
      (editing ? '<button class="btn danger" id="f-delete" style="flex:0 0 84px">Hapus</button>' : '') +
      '<button class="btn ghost" id="f-cancel">Batal</button><button class="btn primary" id="f-save">Simpan</button></div>'
    );
    renderSubs();
    $('f-title').focus();

    function bindChoices(id, attr, set) {
      $(id).addEventListener('click', function (e) {
        var b = e.target.closest('[data-' + attr + ']');
        if (!b) return;
        Array.prototype.forEach.call($(id).children, function (c) { c.classList.remove('active'); });
        b.classList.add('active'); set(b.getAttribute('data-' + attr));
      });
    }
    bindChoices('cat-row', 'cat', function (v) { cat = v; });
    bindChoices('prio-row', 'prio', function (v) { prio = v; });
    $('rem-row').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rem]'); if (!b) return;
      var v = b.getAttribute('data-rem');
      if (rem.indexOf(v) >= 0) { rem = rem.filter(function (x) { return x !== v; }); b.classList.remove('active'); }
      else { rem.push(v); b.classList.add('active'); }
    });
    $('subtask-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-remove]'); if (!b) return;
      subs = subs.filter(function (s) { return s.id !== Number(b.getAttribute('data-remove')); });
      renderSubs();
    });
    $('subtask-list').addEventListener('change', function (e) {
      var row = e.target.closest('.subtask-row'); if (!row) return;
      var s = subs.filter(function (x) { return x.id === Number(row.getAttribute('data-id')); })[0];
      if (s) { s.done = e.target.checked; row.classList.toggle('done', s.done); }
    });
    $('sub-add').addEventListener('click', function () {
      var input = $('sub-input'), v = input.value.trim(); if (!v) return;
      subs.push({ id: S.uid(), title: v, done: false }); input.value = ''; renderSubs();
    });
    $('sub-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('sub-add').click(); });
    $('f-cancel').addEventListener('click', closeSheet);

    $('f-save').addEventListener('click', function () {
      var title = $('f-title').value.trim();
      if (!title) { toast('Isi judul tugas dulu.'); $('f-title').focus(); return; }
      var dateV = $('f-date').value || S.ymd(new Date());
      var timeV = $('f-time').value || '09:00';
      var deadline = new Date(dateV + 'T' + timeV + ':00').getTime();
      var past = rem.filter(function (k) {
        var p = S.REMINDERS.filter(function (r) { return r.id === k; })[0];
        return deadline + p.offset * 60000 <= Date.now();
      });
      if (past.length) { toast('Sebagian pengingat sudah lewat, tetap disimpan.'); }
      if (editing) S.cancelTask(editing);
      var reminders = S.buildReminders(deadline, rem);
      if (editing) {
        editing.title = title; editing.desc = $('f-desc').value.trim(); editing.date = dateV; editing.time = timeV;
        editing.category = cat; editing.priority = prio; editing.recurrence = $('f-rec').value;
        editing.reminders = reminders; editing.subtasks = subs;
      } else {
        st.tasks.push({
          id: S.uid(), title: title, desc: $('f-desc').value.trim(), category: cat, priority: prio,
          createdAt: new Date().toISOString(), date: dateV, time: timeV, done: false, doneAt: null,
          reminders: reminders, subtasks: subs, recurrence: $('f-rec').value, pinned: false
        });
      }
      var t = editing || st.tasks[st.tasks.length - 1];
      S.scheduleTask(t); S.save(); closeSheet(); renderAll();
      toast(editing ? 'Tugas diperbarui.' : 'Tugas ditambahkan.');
    });

    if (editing) $('f-delete').addEventListener('click', function () {
      if (!confirm('Hapus tugas "' + editing.title + '"?')) return;
      S.cancelTask(editing);
      st.tasks = st.tasks.filter(function (x) { return x.id !== editing.id; });
      S.save(); closeSheet(); renderAll(); toast('Tugas dihapus.');
    });
  }

  /* ---------- halaman beranda ---------- */
  function renderHome() {
    var today = S.ymd(new Date());
    var total = st.tasks.length;
    var done = st.tasks.filter(function (t) { return t.done; }).length;
    var late = st.tasks.filter(S.isLate).length;
    var pending = total - done - late;
    var pct = total ? Math.round(done / total * 100) : 0;
    var name = st.settings.displayName || 'Admin';
    var hour = new Date().getHours();
    $('hello').textContent = 'Halo, ' + name + (hour < 11 ? ' ☀️' : hour < 18 ? ' ✨' : ' 🌙');
    $('hero-title').textContent = S.greeting() + ', ' + name;
    $('hero-date').textContent = S.DAYS[new Date().getDay()] + ', ' + S.pretty(today);
    $('hero-percent').textContent = pct;
    $('hero-done').innerHTML = done + '<small>/' + total + '</small>';
    $('hero-bar').style.width = pct + '%';
    $('metrics').innerHTML =
      '<div class="metric"><b>' + total + '</b><span>Total tugas</span></div>' +
      '<div class="metric done"><b>' + done + '</b><span>Selesai</span></div>' +
      '<div class="metric"><b>' + pending + '</b><span>Pending</span></div>' +
      '<div class="metric late"><b>' + late + '</b><span>Terlambat</span></div>';

    var todayTasks = st.tasks.filter(function (t) { return t.date === today; })
      .sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
    $('home-today').innerHTML = todayTasks.length
      ? todayTasks.map(taskCard).join('')
      : emptyState('Tidak ada tugas hari ini', 'Tekan tombol + untuk membuat tugas pertama.');
    $('home-today-count').textContent = todayTasks.length + ' tugas';

    var soon = st.tasks.filter(function (t) {
      return !t.done && S.deadlineOf(t) >= Date.now() && S.deadlineOf(t) <= Date.now() + 7 * 86400000;
    }).sort(function (a, b) { return S.deadlineOf(a) - S.deadlineOf(b); }).slice(0, 5);
    $('home-upcoming').innerHTML = soon.length
      ? soon.map(taskCard).join('')
      : emptyState('Jadwal kosong', 'Tidak ada deadline dalam 7 hari ke depan.');
  }

  /* ---------- kalender ---------- */
  function renderCalendar() {
    var y = st.ui.viewYear, m = st.ui.viewMonth;
    $('cal-title').textContent = S.MONTHS[m] + ' ' + y;
    var monthTasks = st.tasks.filter(function (t) { return t.date.indexOf(y + '-' + S.pad(m + 1)) === 0; });
    $('cal-sub').textContent = monthTasks.length + ' tugas di bulan ini';
    var first = new Date(y, m, 1);
    var offset = (first.getDay() + 6) % 7;
    var total = new Date(y, m + 1, 0).getDate();
    var cells = Math.ceil((offset + total) / 7) * 7;
    var html = '';
    for (var i = 0; i < cells; i++) {
      var d = new Date(y, m, i - offset + 1);
      var key = S.ymd(d);
      var list = st.tasks.filter(function (t) { return t.date === key; });
      var cls = 'day';
      if (d.getMonth() !== m) cls += ' muted';
      if (key === S.ymd(new Date())) cls += ' today';
      if (key === st.ui.selectedDate) cls += ' selected';
      var dots = list.slice(0, 3).map(function (t) {
        return '<i class="' + (t.done ? '' : (t.priority || 'medium')) + '"></i>';
      }).join('');
      html += '<button class="' + cls + '" data-date="' + key + '"><span>' + d.getDate() + '</span><span class="dots">' + dots + '</span></button>';
    }
    $('cal-days').innerHTML = html;
    $('cal-caption').textContent = S.pretty(st.ui.selectedDate);
    var selected = st.tasks.filter(function (t) { return t.date === st.ui.selectedDate; })
      .sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
    $('cal-tasks').innerHTML = selected.length
      ? selected.map(taskCard).join('') + '<button class="btn ghost" id="cal-add" style="margin-top:6px">' + ico('i-plus') + ' Tambah tugas pada tanggal ini</button>'
      : emptyState('Belum ada tugas', 'Pilih tanggal lalu tambahkan tugas baru.') + '<button class="btn ghost" id="cal-add">' + ico('i-plus') + ' Tambah tugas</button>';
    var add = $('cal-add');
    if (add) add.addEventListener('click', function () { openTaskModal(null, st.ui.selectedDate); });
  }

  /* ---------- catatan ---------- */
  function renderNotes() {
    var months = {};
    st.notes.forEach(function (n) { var k = n.date.slice(0, 7); months[k] = true; });
    var keys = Object.keys(months).sort().reverse();
    var filters = [{ id: 'all', label: 'Semua' }].concat(keys.map(function (k) {
      var p = k.split('-'); return { id: k, label: S.MONTHS[Number(p[1]) - 1] + ' ' + p[0] };
    }));
    $('note-filters').innerHTML = filters.map(function (f) {
      return '<button class="chip' + (st.ui.noteFilter === f.id ? ' active' : '') + '" data-note-filter="' + f.id + '">' + esc(f.label) + '</button>';
    }).join('');
    var q = (st.ui.noteSearch || '').toLowerCase();
    var list = st.notes.filter(function (n) {
      var matchMonth = st.ui.noteFilter === 'all' || n.date.indexOf(st.ui.noteFilter) === 0;
      var matchQ = !q || (n.title + ' ' + n.body).toLowerCase().indexOf(q) >= 0;
      return matchMonth && matchQ;
    }).sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
    $('note-list').innerHTML = list.length ? list.map(function (n) {
      var linked = n.taskId ? st.tasks.filter(function (t) { return t.id === n.taskId; })[0] : null;
      return '<div class="card note" data-id="' + n.id + '"><div class="note-head"><b>' + esc(n.title) + '</b><span>' + esc(S.shortDate(n.date)) + '</span></div>' +
        '<div class="note-body">' + esc(n.body) + '</div>' +
        (linked ? '<div class="note-link">' + ico('i-link') + 'Tugas: ' + esc(linked.title) + '</div>' : '') +
        '<div class="task-actions" style="justify-content:flex-end;margin-top:6px">' +
        '<button class="mini" data-act="edit">' + ico('i-edit') + '</button>' +
        '<button class="mini" data-act="delete">' + ico('i-trash') + '</button></div></div>';
    }).join('') : emptyState('Belum ada catatan', 'Tulis jurnal harianmu lewat tombol +.');
  }

  function openNoteModal(note) {
    var editing = note || null;
    openSheet('<h2>' + (editing ? 'Ubah Catatan' : 'Catatan Baru') + '</h2>' +
      '<input class="field" id="n-title" placeholder="Judul catatan" maxlength="100" value="' + esc(editing ? note.title : '') + '">' +
      '<div style="margin-top:10px"><label class="lbl">Tanggal</label><input class="field" id="n-date" type="date" value="' + (editing ? note.date : S.ymd(new Date())) + '"></div>' +
      '<label class="lbl">Isi catatan</label><textarea class="field" id="n-body" style="min-height:130px" placeholder="Tulis sesuatu...">' + esc(editing ? note.body : '') + '</textarea>' +
      '<label class="lbl">Tautkan tugas (opsional)</label><select class="field" id="n-task"><option value="">Tidak ada</option>' +
      st.tasks.slice().sort(function (a, b) { return b.id - a.id; }).slice(0, 60).map(function (t) {
        return '<option value="' + t.id + '"' + (editing && note.taskId === t.id ? ' selected' : '') + '>' + esc(t.title) + '</option>';
      }).join('') + '</select>' +
      '<div class="sheet-actions"><button class="btn ghost" id="n-cancel">Batal</button><button class="btn primary" id="n-save">Simpan</button></div>');
    $('n-title').focus();
    $('n-cancel').addEventListener('click', closeSheet);
    $('n-save').addEventListener('click', function () {
      var title = $('n-title').value.trim();
      if (!title) { toast('Isi judul catatan dulu.'); return; }
      var body = $('n-body').value.trim();
      var date = $('n-date').value || S.ymd(new Date());
      var taskId = $('n-task').value ? Number($('n-task').value) : null;
      if (editing) {
        editing.title = title; editing.body = body; editing.date = date; editing.taskId = taskId;
      } else {
        st.notes.push({ id: S.uid(), title: title, body: body, date: date, taskId: taskId, createdAt: new Date().toISOString() });
      }
      S.save(); closeSheet(); renderAll(); toast(editing ? 'Catatan diperbarui.' : 'Catatan disimpan.');
    });
  }

  /* ---------- statistik ---------- */
  function renderStats() {
    var tasks = st.tasks;
    var done = tasks.filter(function (t) { return t.done; }).length;
    var late = tasks.filter(S.isLate).length;
    var pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    $('stat-summary').innerHTML =
      '<div style="display:flex;align-items:center;gap:16px"><div><div style="font-size:30px;font-weight:800;letter-spacing:-.04em">' + pct + '%</div><div style="font-size:11px;color:var(--muted)">tingkat penyelesaian</div></div>' +
      '<div style="flex:1"><div class="bar"><span style="width:' + pct + '%"></span></div><div style="font-size:10.5px;color:var(--muted);margin-top:7px">' + done + ' dari ' + tasks.length + ' tugas selesai</div></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">' +
      '<span class="tag">' + tasks.length + ' dibuat</span><span class="tag low">' + done + ' selesai</span>' +
      '<span class="tag medium">' + (tasks.length - done - late) + ' pending</span><span class="tag high">' + late + ' terlambat</span></div>';

    var period = st.ui.statPeriod;
    var days = period === 'week' ? 7 : 30;
    var buckets = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var key = S.ymd(d);
      buckets.push({ key: key, label: period === 'week' ? S.DAYS[d.getDay()].slice(0, 3) : String(d.getDate()),
        done: tasks.filter(function (t) { return t.doneAt && t.doneAt.slice(0, 10) === key; }).length,
        made: tasks.filter(function (t) { return t.createdAt && t.createdAt.slice(0, 10) === key; }).length });
    }
    var max = Math.max(1, buckets.reduce(function (a, b) { return Math.max(a, b.done, b.made); }, 0));
    $('stat-chart').innerHTML = buckets.map(function (b, idx) {
      return '<div class="col"><b>' + (b.done || '') + '</b><div class="pair">' +
        '<div class="fill made" style="height:' + (b.made / max * 86) + '%"></div>' +
        '<div class="fill" style="height:' + (b.done / max * 86) + '%"></div></div>' +
        '<span>' + (period === 'week' || idx % 6 === 0 ? b.label : '') + '</span></div>';
    }).join('');

    var counts = {};
    tasks.forEach(function (t) { counts[t.category || 'lainnya'] = (counts[t.category || 'lainnya'] || 0) + 1; });
    var sorted = S.CATEGORIES.map(function (c) { return { label: c.label, n: counts[c.id] || 0 }; })
      .filter(function (c) { return c.n > 0; }).sort(function (a, b) { return b.n - a.n; });
    var cmax = Math.max(1, sorted.reduce(function (a, b) { return Math.max(a, b.n); }, 0));
    $('stat-categories').innerHTML = sorted.length ? sorted.map(function (c) {
      return '<div class="bar-row"><label>' + esc(c.label) + '</label><div class="bar"><span style="width:' + (c.n / cmax * 100) + '%"></span></div><b>' + c.n + '</b></div>';
    }).join('') : emptyState('Belum ada data', 'Kategori muncul setelah tugas dibuat.');

    var mk = S.ymd(new Date()).slice(0, 7);
    var monthTasks = tasks.filter(function (t) { return t.date.indexOf(mk) === 0; });
    var mdone = monthTasks.filter(function (t) { return t.done; }).length;
    $('stat-month').innerHTML =
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0"><span>Total tugas bulan ini</span><b>' + monthTasks.length + '</b></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0"><span>Selesai</span><b>' + mdone + '</b></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0"><span>Pending</span><b>' + monthTasks.filter(function (t) { return !t.done && !S.isLate(t); }).length + '</b></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0"><span>Catatan bulan ini</span><b>' + st.notes.filter(function (n) { return n.date.indexOf(mk) === 0; }).length + '</b></div>';
  }

  /* ---------- pengaturan ---------- */
  function initials() {
    var parts = (st.settings.displayName || 'Admin').trim().split(/\s+/);
    return (parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
  }

  function renderSettings() {
    $('name-input').value = st.settings.displayName || 'Admin';
    $('theme-switch').classList.toggle('on', st.settings.theme === 'dark');
    $('notify-switch').classList.toggle('on', !!st.settings.notifyEnabled);
    $('permission-text').textContent = (window.AndroidApp ? 'Izin notifikasi perangkat' : 'Notifikasi browser');
    $('backup-info').textContent = st.settings.lastBackup
      ? 'Terakhir: ' + new Date(st.settings.lastBackup).toLocaleDateString('id-ID')
      : 'Simpan salinan ke perangkat';
  }

  /* ---------- navigasi & render ---------- */
  function renderAll() {
    renderHome(); renderCalendar(); renderNotes(); renderStats(); renderSettings();
    var page = st.ui.page || 'home';
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (p) {
      p.classList.toggle('active', p.id === 'page-' + page);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-page') === page);
    });
    $('fab').hidden = page === 'stats' || page === 'settings';
    Array.prototype.forEach.call(document.querySelectorAll('.avatar'), function (a) {
      a.textContent = initials();
    });
  }
  function navigate(page) {
    st.ui.page = page; S.save(); renderAll();
    var content = document.querySelector('.page.active .page-content');
    if (content) content.scrollTop = 0;
  }

  function bind() {
    $('bottom-nav').addEventListener('click', function (e) {
      var b = e.target.closest('[data-page]'); if (b) navigate(b.getAttribute('data-page'));
    });
    $('fab').addEventListener('click', function () {
      if (st.ui.page === 'notes') openNoteModal(null);
      else openTaskModal(null, st.ui.page === 'calendar' ? st.ui.selectedDate : S.ymd(new Date()));
    });
    $('overlay').addEventListener('click', function (e) { if (e.target === $('overlay')) closeSheet(); });
    bindTaskList($('home-today'));
    bindTaskList($('home-upcoming'));
    bindTaskList($('cal-tasks'));

    $('cal-prev').addEventListener('click', function () {
      st.ui.viewMonth--; if (st.ui.viewMonth < 0) { st.ui.viewMonth = 11; st.ui.viewYear--; }
      renderCalendar(); S.save();
    });
    $('cal-next').addEventListener('click', function () {
      st.ui.viewMonth++; if (st.ui.viewMonth > 11) { st.ui.viewMonth = 0; st.ui.viewYear++; }
      renderCalendar(); S.save();
    });
    $('cal-today').addEventListener('click', function () {
      var d = new Date(); st.ui.viewYear = d.getFullYear(); st.ui.viewMonth = d.getMonth();
      st.ui.selectedDate = S.ymd(d); renderCalendar(); S.save();
    });
    $('cal-days').addEventListener('click', function (e) {
      var b = e.target.closest('[data-date]'); if (!b) return;
      st.ui.selectedDate = b.getAttribute('data-date'); renderCalendar(); S.save();
    });
    $('note-search').addEventListener('input', function () { st.ui.noteSearch = this.value; renderNotes(); S.save(); });
    $('note-filters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-note-filter]'); if (!b) return;
      st.ui.noteFilter = b.getAttribute('data-note-filter'); renderNotes(); S.save();
    });
    $('note-list').addEventListener('click', function (e) {
      var card = e.target.closest('.note[data-id]'); if (!card) return;
      var n = st.notes.filter(function (x) { return x.id === Number(card.getAttribute('data-id')); })[0];
      if (!n) return;
      var act = e.target.closest('[data-act]');
      if (!act) { openNoteModal(n); return; }
      if (act.getAttribute('data-act') === 'edit') openNoteModal(n);
      else if (confirm('Hapus catatan "' + n.title + '"?')) {
        st.notes = st.notes.filter(function (x) { return x.id !== n.id; });
        S.save(); renderAll(); toast('Catatan dihapus.');
      }
    });
    $('stat-period').addEventListener('click', function (e) {
      var b = e.target.closest('[data-period]'); if (!b) return;
      st.ui.statPeriod = b.getAttribute('data-period');
      Array.prototype.forEach.call($('stat-period').children, function (c) { c.classList.remove('active'); });
      b.classList.add('active'); renderStats(); S.save();
    });
    function saveName() {
      var value = $('name-input').value.trim();
      if (!value) { toast('Isi nama dulu.'); $('name-input').focus(); return; }
      st.settings.displayName = value;
      S.save(); renderAll(); toast('Nama diperbarui.');
    }
    $('name-save').addEventListener('click', saveName);
    $('name-input').addEventListener('focus', function () { this.select(); });
    $('name-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveName(); });

    $('theme-switch').addEventListener('click', function () {
      S.applyTheme(st.settings.theme === 'dark' ? 'light' : 'dark');
      renderSettings(); toast('Tema diubah.');
    });
    $('notify-switch').addEventListener('click', function () {
      st.settings.notifyEnabled = !st.settings.notifyEnabled;
      this.classList.toggle('on', st.settings.notifyEnabled);
      if (st.settings.notifyEnabled) { S.requestPermission(); S.scheduleAll(); }
      else st.tasks.forEach(S.cancelTask);
      S.save(); toast(st.settings.notifyEnabled ? 'Pengingat aktif.' : 'Pengingat dimatikan.');
    });
    $('ask-permission').addEventListener('click', function () { S.requestPermission(); toast('Izin diminta.'); });
    $('backup-row').addEventListener('click', function () { S.backup(); renderSettings(); });
    $('export-row').addEventListener('click', function () { S.exportCsv(); });
    $('restore-row').addEventListener('click', function () { S.requestImport(); });
    $('clear-row').addEventListener('click', function () {
      if (!confirm('Hapus SEMUA tugas dan catatan? Tidak bisa dibatalkan.')) return;
      st.tasks.forEach(S.cancelTask);
      st.tasks = []; st.notes = []; S.save(); renderAll(); toast('Semua data dihapus.');
    });
  }

  function checkKeyboard() {
    var vv = window.visualViewport;
    var visibleHeight = vv ? vv.height : window.innerHeight;
    var open = (window.innerHeight - visibleHeight) > 120;
    document.body.classList.toggle('keyboard-open', open);
    if (!open) return;
    var el = document.activeElement;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      setTimeout(function () { el.scrollIntoView({ block: 'center' }); }, 150);
    }
  }

  S.load();
  S.applyTheme(st.settings.theme);
  bind();
  renderAll();
  S.scheduleAll();
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('pinktask:import', function (e) { S.receiveImport(e.detail); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', checkKeyboard);
    window.visualViewport.addEventListener('scroll', checkKeyboard);
  }
  window.addEventListener('resize', checkKeyboard);
  document.addEventListener('focusin', function () { setTimeout(checkKeyboard, 250); });
})();
