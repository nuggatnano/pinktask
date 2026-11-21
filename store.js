/* PinkTask — data, penyimpanan, dan jembatan Android. */
window.PT = (function () {
  'use strict';

  var KEY = 'pinktask-state-v1';
  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var CATEGORIES = [
    { id: 'kerja', label: 'Kerja' }, { id: 'rapat', label: 'Rapat' },
    { id: 'pribadi', label: 'Pribadi' }, { id: 'keuangan', label: 'Keuangan' },
    { id: 'lainnya', label: 'Lainnya' }
  ];
  var PRIORITIES = [{ id: 'low', label: 'Rendah' }, { id: 'medium', label: 'Sedang' }, { id: 'high', label: 'Tinggi' }];
  var REMINDERS = [
    { id: 'ontime', label: 'Tepat waktu', offset: 0 },
    { id: 'm15', label: '15 menit sebelum', offset: -15 },
    { id: 'h1', label: '1 jam sebelum', offset: -60 },
    { id: 'd1', label: '1 hari sebelum', offset: -1440 }
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function uid() { return Date.now() * 100 + Math.floor(Math.random() * 100); }
  function deadlineOf(t) { return new Date(t.date + 'T' + (t.time || '09:00') + ':00').getTime(); }
  function isLate(t) { return !t.done && deadlineOf(t) < Date.now(); }
  function status(t) { return t.done ? 'selesai' : (isLate(t) ? 'terlambat' : 'pending'); }
  function pretty(s) { var p = s.split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
  function shortDate(s) { var p = s.split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1].slice(0, 3); }
  function greeting() {
    var h = new Date().getHours();
    return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  }

  function defaults() {
    var today = new Date();
    return {
      version: 1, tasks: [], notes: [],
      settings: { theme: 'light', notifyEnabled: true, lastBackup: null, displayName: 'Admin' },
      ui: {
        page: 'home', filter: 'all', selectedDate: ymd(today),
        viewYear: today.getFullYear(), viewMonth: today.getMonth(),
        noteFilter: 'all', noteSearch: '', statPeriod: 'week'
      }
    };
  }

  var state = defaults();

  function load() {
    var raw = '';
    try {
      raw = (window.AndroidApp && AndroidApp.loadState)
        ? (AndroidApp.loadState() || '') : (localStorage.getItem(KEY) || '');
    } catch (e) { raw = ''; }
    if (!raw) return;
    try {
      var saved = JSON.parse(raw);
      if (Array.isArray(saved.tasks)) {
        state.tasks = saved.tasks;
        state.notes = Array.isArray(saved.notes) ? saved.notes : [];
        if (saved.settings) Object.assign(state.settings, saved.settings);
        if (saved.ui) Object.assign(state.ui, saved.ui);
      }
    } catch (e) { /* abaikan data rusak */ }
  }

  function save() {
    var raw = JSON.stringify({
      version: 1, tasks: state.tasks, notes: state.notes,
      settings: state.settings, ui: state.ui
    });
    try {
      if (window.AndroidApp && AndroidApp.saveState) AndroidApp.saveState(raw);
      else localStorage.setItem(KEY, raw);
    } catch (e) { toast('Gagal menyimpan data.'); }
  }

  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function applyTheme(theme) {
    state.settings.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    if (window.AndroidApp && AndroidApp.setTheme) {
      try { AndroidApp.setTheme(state.settings.theme); } catch (e) { /* abaikan */ }
    }
    save();
  }

  function buildReminders(deadlineMs, selected) {
    return (selected || []).map(function (key) {
      var preset = REMINDERS.filter(function (r) { return r.id === key; })[0];
      if (!preset) return null;
      return { id: Math.floor(Math.random() * 900000000) + 1000, key: key, at: deadlineMs + preset.offset * 60000 };
    }).filter(Boolean);
  }

  var webTimers = {};
  function scheduleTask(t) {
    if (!state.settings.notifyEnabled || t.done || !t.reminders) return;
    t.reminders.forEach(function (r) {
      clearTimeout(webTimers[r.id]);
      if (r.at <= Date.now()) return;
      if (window.AndroidApp && AndroidApp.scheduleReminder) {
        try { AndroidApp.scheduleReminder(r.id, t.title, 'Deadline: ' + shortDate(t.date) + ' ' + t.time, r.at); }
        catch (e) { /* abaikan */ }
      } else if ('Notification' in window && Notification.permission === 'granted') {
        webTimers[r.id] = setTimeout(function () {
          try { new Notification('Pengingat PinkTask', { body: t.title }); } catch (e) { /* abaikan */ }
        }, r.at - Date.now());
      }
    });
  }

  function cancelTask(t) {
    (t.reminders || []).forEach(function (r) {
      clearTimeout(webTimers[r.id]);
      if (window.AndroidApp && AndroidApp.cancelReminder) {
        try { AndroidApp.cancelReminder(r.id); } catch (e) { /* abaikan */ }
      }
    });
  }

  function scheduleAll() { state.tasks.forEach(scheduleTask); }
  function requestPermission() {
    if (window.AndroidApp && AndroidApp.requestNotifyPermission) {
      try { AndroidApp.requestNotifyPermission(); } catch (e) { /* abaikan */ }
    } else if ('Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) { /* abaikan */ }
    }
  }

  function exportFile(name, content, mime) {
    if (window.AndroidApp && AndroidApp.exportFile) {
      try { AndroidApp.exportFile(name, content, mime || 'application/json'); } catch (e) { toast('Gagal mengekspor.'); }
      return;
    }
    var blob = new Blob([content], { type: mime || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }

  function requestImport() {
    if (window.AndroidApp && AndroidApp.importFile) {
      try { AndroidApp.importFile(); } catch (e) { toast('Gagal membuka file.'); }
      return;
    }
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = function () {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { receiveImport(String(reader.result)); };
      reader.readAsText(file);
    };
    input.click();
  }

  function receiveImport(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { toast('File backup tidak valid.'); return false; }
    if (!data || !Array.isArray(data.tasks)) { toast('Format backup tidak dikenali.'); return false; }
    if (!confirm('Timpa seluruh data dengan backup ini?')) return false;
    state.tasks = data.tasks;
    state.notes = Array.isArray(data.notes) ? data.notes : [];
    if (data.settings) Object.assign(state.settings, data.settings);
    state.tasks.forEach(function (t) { if (!Array.isArray(t.reminders)) t.reminders = []; });
    applyTheme(state.settings.theme);
    save(); scheduleAll();
    toast('Backup dipulihkan.');
    return true;
  }

  function backup() {
    state.settings.lastBackup = new Date().toISOString();
    save();
    var d = new Date();
    exportFile('pinktask-backup-' + ymd(d) + '.json',
      JSON.stringify({ version: 1, tasks: state.tasks, notes: state.notes, settings: state.settings }, null, 2),
      'application/json');
    toast('Backup disimpan.');
  }

  function csvEscape(v) { var s = String(v == null ? '' : v); return '"' + s.replace(/"/g, '""') + '"'; }
  function exportCsv() {
    var rows = [['Tanggal', 'Judul', 'Deskripsi', 'Kategori', 'Prioritas', 'Deadline', 'Status', 'Pengingat', 'Subtask']];
    state.tasks.slice().sort(function (a, b) { return deadlineOf(a) - deadlineOf(b); }).forEach(function (t) {
      rows.push([t.date, t.title, t.desc || '', t.category || 'lainnya', t.priority || 'medium',
        t.date + ' ' + t.time, status(t), (t.reminders || []).length,
        (t.subtasks || []).filter(function (s) { return s.done; }).length + '/' + (t.subtasks || []).length]);
    });
    var content = '\ufeff' + rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\r\n');
    exportFile('pinktask-tugas-' + ymd(new Date()) + '.csv', content, 'text/csv');
    toast('CSV diekspor.');
  }

  return {
    state: state, MONTHS: MONTHS, DAYS: DAYS, CATEGORIES: CATEGORIES,
    PRIORITIES: PRIORITIES, REMINDERS: REMINDERS,
    pad: pad, ymd: ymd, uid: uid, deadlineOf: deadlineOf, isLate: isLate, status: status,
    pretty: pretty, shortDate: shortDate, greeting: greeting,
    load: load, save: save, toast: toast, applyTheme: applyTheme,
    buildReminders: buildReminders, scheduleTask: scheduleTask, cancelTask: cancelTask,
    scheduleAll: scheduleAll, requestPermission: requestPermission,
    exportFile: exportFile, requestImport: requestImport, receiveImport: receiveImport,
    backup: backup, exportCsv: exportCsv
  };
})();
window.pinktask = window.PT;
