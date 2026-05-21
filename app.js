/* ================================================================
   EDUPORTAL — app.js
   1. Theme switcher
   2. JSONBin.io cloud database for notices
   3. Login / Logout
   4. Notice store (cloud-first, localStorage fallback)
   5. Student detail modal
   6. Attendance bar chart
   7. AI Assistant (Anthropic Claude API)
================================================================ */


/* ── 0. THEME ───────────────────────────────────────────────── */

var THEMES = ['dark', 'light', 'ocean', 'forest'];

function setTheme(theme) {
  // Remove all theme classes
  THEMES.forEach(function(t) { document.body.classList.remove('theme-' + t); });
  // Apply chosen theme (dark is base :root, others need a class)
  if (theme !== 'dark') { document.body.classList.add('theme-' + theme); }
  // Persist to localStorage
  localStorage.setItem('ep-theme', theme);
  // Update all active indicators
  document.querySelectorAll('.theme-btn').forEach(function(btn) {
    btn.classList.remove('active');
    if (btn.classList.contains('t-' + theme)) { btn.classList.add('active'); }
  });
}

// Apply saved theme on page load
(function() {
  var saved = localStorage.getItem('ep-theme') || 'dark';
  setTheme(saved);
})();


/* ── 1. JSONBIN DATABASE ────────────────────────────────────── */
/*
   JSONBin.io — free REST JSON database.
   Each "bin" is a JSON document reachable by its ID.
   We store { notices: [...] } in one shared bin.
   Sign up free at jsonbin.io → My Bins → Create Bin to get your own BIN_ID + API_KEY.
   The values below are a shared demo bin — replace with your own for production.
*/
var DB = {
  BIN_ID  : '6849a9b18a456b79667b2898',       // replace with your JSONBin bin ID
  API_KEY : '$2a$10$j3P7nLg0BnQPX1M2vZqOuOrYL8HrAXP5k1VMidoVMiSjVfXWt3tRS', // replace with your JSONBin master key
  BASE    : 'https://api.jsonbin.io/v3/b',
  _syncing: false,

  setStatus: function(state, text) {
    var dot   = document.getElementById('db-dot');
    var badge = document.getElementById('db-status-badge');
    if (!dot) return;
    dot.className = state;
    if (badge) {
      var span = badge.querySelector('span') || badge.appendChild(document.createElement('span'));
      span.textContent = text;
    }
  },

  read: async function() {
    DB.setStatus('syncing', 'Syncing…');
    try {
      var res = await fetch(DB.BASE + '/' + DB.BIN_ID + '/latest', {
        headers: { 'X-Master-Key': DB.API_KEY }
      });
      if (!res.ok) throw new Error('read failed ' + res.status);
      var json = await res.json();
      DB.setStatus('connected', 'Cloud DB ✓');
      return json.record && json.record.notices ? json.record.notices : null;
    } catch(e) {
      DB.setStatus('error', 'Cloud offline');
      console.warn('JSONBin read error:', e);
      return null;
    }
  },

  write: async function(notices) {
    if (DB._syncing) return;
    DB._syncing = true;
    DB.setStatus('syncing', 'Saving…');
    try {
      var res = await fetch(DB.BASE + '/' + DB.BIN_ID, {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': DB.API_KEY },
        body   : JSON.stringify({ notices: notices })
      });
      if (!res.ok) throw new Error('write failed ' + res.status);
      DB.setStatus('connected', 'Cloud DB ✓');
    } catch(e) {
      DB.setStatus('error', 'Save failed — local only');
      console.warn('JSONBin write error:', e);
    } finally {
      DB._syncing = false;
    }
  }
};


/* ── 2. LOGIN ──────────────────────────────────────────────── */

function handleLogin() {
  var username = document.getElementById("login-username").value.trim().toLowerCase();
  var password = document.getElementById("login-password").value.trim();
  var errorEl  = document.getElementById("login-error");

  errorEl.classList.remove("visible");
  errorEl.textContent = "";

  if (username === "student" && password === "stu123") {
    document.body.className = "logged-student";
    applyThemeClass();
    initNotices();
    initSharedPortalData();
    setTimeout(drawAttChart, 100);

  } else if (username === "parent" && password === "par123") {
    document.body.className = "logged-parent";
    applyThemeClass();
    initNotices();
    initSharedPortalData();

  } else if (username === "teacher" && password === "tea123") {
    document.body.className = "logged-teacher";
    applyThemeClass();
    initNotices();
    initTeacherTools();

  } else {
    errorEl.textContent = "! Wrong username or password. Check the demo credentials below.";
    errorEl.classList.add("visible");
  }
}

function applyThemeClass() {
  // Re-apply theme class after body.className is overwritten by login
  var saved = localStorage.getItem('ep-theme') || 'dark';
  if (saved !== 'dark') { document.body.classList.add('theme-' + saved); }
}

// Allow pressing Enter in password field to submit
document.getElementById("login-password").addEventListener("keydown", function(e) {
  if (e.key === "Enter") { handleLogin(); }
});

document.getElementById("login-username").addEventListener("keydown", function(e) {
  if (e.key === "Enter") { handleLogin(); }
});


/* ── 3. LOGOUT ─────────────────────────────────────────────── */

function handleLogout() {
  document.body.className = "";
}


/* ── 4. NOTICE STORE — cloud DB first, localStorage fallback ── */

var SEED_NOTICES = [
  { id: 'seed1', title: 'Mid-Term Examinations Schedule',       type: 'exam',    date: '2024-11-25', body: 'Mid-term exams commence December 2nd. Download hall tickets from the examination portal. Students must carry valid ID.' },
  { id: 'seed2', title: 'Annual Tech Fest — INNOVATE 2024',     type: 'event',   date: '2024-11-20', body: 'Register your teams for hackathons, robotics, coding contests and more. Last date: November 28.' },
  { id: 'seed3', title: 'Diwali Break Announcement',            type: 'holiday', date: '2024-11-05', body: 'College closed November 1–3 for Diwali. Classes resume November 4th.' },
  { id: 'seed4', title: 'Library Extended Hours',               type: 'general', date: '2024-11-18', body: 'Central Library open until 10:00 PM on weekdays till December 15.' },
  { id: 'seed5', title: 'Practical Examinations — Batch Allotment', type: 'exam', date: '2024-11-15', body: 'Batch allotments uploaded on the notice board. Report 15 minutes early.' }
];

function lsLoadNotices()  { try { var r=localStorage.getItem('ep-notices'); return r?JSON.parse(r):null; } catch(e){return null;} }
function lsSaveNotices(n) { localStorage.setItem('ep-notices', JSON.stringify(n)); }

async function initNotices() {
  // Try cloud first
  var cloud = await DB.read();
  if (cloud && cloud.length) {
    lsSaveNotices(cloud);
    refreshAllNoticeViews();
    return;
  }
  // Fall back to localStorage
  var local = lsLoadNotices();
  if (!local) {
    lsSaveNotices(SEED_NOTICES);
    // Write seed to cloud too
    DB.write(SEED_NOTICES);
  }
  refreshAllNoticeViews();
}

var EVENT_TYPES  = ['event', 'holiday'];
var NOTICE_TYPES = ['exam', 'general', 'urgent'];
function isEvent(n)  { return EVENT_TYPES.indexOf(n.type) !== -1; }
function isNotice(n) { return NOTICE_TYPES.indexOf(n.type) !== -1; }
function emptyMsg()  { return '<p style="color:var(--text-muted);font-size:.8rem;padding:.5rem 0;">Nothing posted yet.</p>'; }

function buildNoticeHTML(notice) {
  var label = notice.type === 'urgent' ? '🚨 ' + notice.type : notice.type;
  return '<div class="notice-item ' + notice.type + '">' +
    '<span class="notice-tag ' + notice.type + '">' + label + '</span>' +
    '<div class="notice-title">' + notice.title + '</div>' +
    '<div class="notice-date">' + notice.date + '</div>' +
    '<div class="notice-body">' + notice.body + '</div>' +
    '</div>';
}

function refreshAllNoticeViews() {
  var all     = lsLoadNotices() || [];
  var notices = all.filter(isNotice);
  var events  = all.filter(isEvent);
  function render(items) { return items.length ? items.map(buildNoticeHTML).join('') : emptyMsg(); }
  // Notices
  ['posted-notices','student-notices-list','parent-notices-list'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.innerHTML = render(notices);
  });
  // Events
  ['posted-events','student-events-list','parent-events-list'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.innerHTML = render(events);
  });
  // Dashboard mini-list (notices only, top 3)
  var miniEl = document.getElementById('dash-recent-notices');
  if (miniEl) {
    var top = notices.slice(0, 3);
    miniEl.innerHTML = top.length ? top.map(function(n) {
      return '<div class="notice-item ' + n.type + '">' +
        '<span class="notice-tag ' + n.type + '">' + n.type + '</span>' +
        '<div class="notice-title">' + n.title + '</div>' +
        '<div class="notice-date">' + n.date + '</div></div>';
    }).join('') : emptyMsg();
  }
}

function postNotice() {
  var titleEl = document.getElementById("n-title");
  var typeEl  = document.getElementById("n-type");
  var bodyEl  = document.getElementById("n-body");

  var title = titleEl.value.trim();
  var type  = typeEl.value;
  var body  = bodyEl.value.trim();

  if (!title || !body) { alert("Please fill in both the title and details."); return; }

  var today = new Date();
  var dd = today.getDate() < 10 ? "0"+today.getDate() : today.getDate();
  var mm = (today.getMonth()+1) < 10 ? "0"+(today.getMonth()+1) : (today.getMonth()+1);
  var date = today.getFullYear() + "-" + mm + "-" + dd;

  var notices = lsLoadNotices() || [];
  var newNotice = { id: 'n'+Date.now(), title:title, type:type, date:date, body:body };
  notices.unshift(newNotice);
  lsSaveNotices(notices);

  // Push to cloud DB
  DB.write(notices);

  titleEl.value = ""; bodyEl.value = "";
  refreshAllNoticeViews();

  // Flash newest item in the right containers
  var flashIds = isEvent(newNotice)
    ? ['posted-events','student-events-list','parent-events-list']
    : ['posted-notices','student-notices-list','parent-notices-list'];
  setTimeout(function() {
    flashIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (el && el.firstElementChild) {
        el.firstElementChild.classList.add('new-flash');
        setTimeout(function() { el.firstElementChild && el.firstElementChild.classList.remove('new-flash'); }, 1000);
      }
    });
  }, 50);

  // Confirm button
  var btn = document.querySelector('#page-t-notices .notice-form button');
  if (btn) {
    var orig = btn.textContent;
    btn.textContent = '✓ Posted to all portals!';
    btn.style.background = 'var(--accent3)';
    setTimeout(function() { btn.textContent = orig; btn.style.background = ''; }, 2200);
  }
}


/* ── 5. STUDENT DETAIL MODAL (teacher) ────────────────────── */

var STUDENT_DATA = {
  STU001: {
    name: 'Arjun Sharma', roll: 'STU001', branch: 'Computer Science', year: 2,
    score: '76%', grade: 'A', attendance: '85%', attBadge: 'ok',
    totalDays: 240, present: 204, absent: 36,
    absentDates: ['2024-10-10','2024-10-18','2024-11-02','2024-11-03'],
    parents: [
      {
        relation: 'Father', avatar: '👨',
        name: 'Rajesh Sharma',
        phone: '98765-43210', altPhone: '98765-00001',
        email: 'rajesh.sharma@email.com',
        occupation: 'Civil Engineer', employer: 'NHAI, Patiala',
        address: '14-B, Rose Garden Colony, Sector 7, Patiala, Punjab — 147001'
      },
      {
        relation: 'Mother', avatar: '👩',
        name: 'Sunita Sharma',
        phone: '98100-22334', altPhone: '—',
        email: 'sunita.sharma@email.com',
        occupation: 'School Teacher', employer: 'Govt. Senior Secondary School, Patiala',
        address: '14-B, Rose Garden Colony, Sector 7, Patiala, Punjab — 147001'
      }
    ]
  },
  STU002: {
    name: 'Priya Kapoor', roll: 'STU002', branch: 'Electronics & Comm.', year: 3,
    score: '89%', grade: 'A+', attendance: '94%', attBadge: 'ok',
    totalDays: 240, present: 226, absent: 14,
    absentDates: ['2024-09-15','2024-10-03'],
    parents: [
      {
        relation: 'Father', avatar: '👨',
        name: 'Mohan Kapoor',
        phone: '91234-56789', altPhone: '91234-00000',
        email: 'mohan.kapoor@gmail.com',
        occupation: 'Business Owner', employer: 'Kapoor Textiles Pvt. Ltd., Ludhiana',
        address: '22, Model Town, Near Bus Stand, Ludhiana, Punjab — 141002'
      },
      {
        relation: 'Mother', avatar: '👩',
        name: 'Sunita Kapoor',
        phone: '91234-99988', altPhone: '—',
        email: 'sunita.kapoor@gmail.com',
        occupation: 'Homemaker', employer: '—',
        address: '22, Model Town, Near Bus Stand, Ludhiana, Punjab — 141002'
      }
    ]
  },
  STU003: {
    name: 'Vikram Singh', roll: 'STU003', branch: 'Mechanical Engg.', year: 1,
    score: '58%', grade: 'C', attendance: '67%', attBadge: 'bad',
    totalDays: 240, present: 161, absent: 79,
    absentDates: ['2024-08-05','2024-08-06','2024-08-12','2024-09-01','2024-09-02','2024-09-20','2024-10-07','2024-10-08','2024-10-09','2024-11-11'],
    parents: [
      {
        relation: 'Father', avatar: '👨',
        name: 'Harjeet Singh',
        phone: '87654-32109', altPhone: '87654-00099',
        email: 'harjeet.singh@yahoo.com',
        occupation: 'Farmer', employer: 'Self-employed, Sangrur District',
        address: 'Village Bhikhi, Tehsil Sunam, Sangrur, Punjab — 148028'
      },
      {
        relation: 'Mother', avatar: '👩',
        name: 'Gurpreet Kaur',
        phone: '87600-11223', altPhone: '—',
        email: '—',
        occupation: 'Homemaker', employer: '—',
        address: 'Village Bhikhi, Tehsil Sunam, Sangrur, Punjab — 148028'
      }
    ]
  },
  STU004: {
    name: 'Neha Patel', roll: 'STU004', branch: 'Civil Engg.', year: 4,
    score: '84%', grade: 'A', attendance: '87%', attBadge: 'ok',
    totalDays: 240, present: 209, absent: 31,
    absentDates: ['2024-09-10','2024-10-22','2024-11-01'],
    parents: [
      {
        relation: 'Father', avatar: '👨',
        name: 'Dinesh Patel',
        phone: '99443-11223', altPhone: '99443-00001',
        email: 'dinesh.patel@rediffmail.com',
        occupation: 'Contractor', employer: 'Patel Construction Works, Amritsar',
        address: '7, Green Avenue, Majitha Road, Amritsar, Punjab — 143001'
      },
      {
        relation: 'Mother', avatar: '👩',
        name: 'Rekha Patel',
        phone: '99400-55678', altPhone: '—',
        email: 'rekha.patel@gmail.com',
        occupation: 'Nurse', employer: 'Fortis Hospital, Amritsar',
        address: '7, Green Avenue, Majitha Road, Amritsar, Punjab — 143001'
      }
    ]
  },
  STU005: {
    name: 'Rahul Gupta', roll: 'STU005', branch: 'Computer Science', year: 2,
    score: '65%', grade: 'B', attendance: '78%', attBadge: 'warn',
    totalDays: 240, present: 187, absent: 53,
    absentDates: ['2024-08-20','2024-08-21','2024-09-05','2024-09-06','2024-09-07','2024-10-14','2024-10-15','2024-11-08'],
    parents: [
      {
        relation: 'Father', avatar: '👨',
        name: 'Anil Gupta',
        phone: '88001-44321', altPhone: '88001-00001',
        email: 'anil.gupta@gmail.com',
        occupation: 'Accountant', employer: 'Punjab State Cooperative Bank, Chandigarh',
        address: '33-C, Sector 22-B, Chandigarh — 160022'
      },
      {
        relation: 'Mother', avatar: '👩',
        name: 'Meena Gupta',
        phone: '88002-55432', altPhone: '—',
        email: 'meena.gupta@gmail.com',
        occupation: 'LIC Agent', employer: 'Life Insurance Corporation of India',
        address: '33-C, Sector 22-B, Chandigarh — 160022'
      }
    ]
  }
};

var DEFAULT_MARKS = {
  STU001: { mid: 42, end: 72 },
  STU002: { mid: 46, end: 88 },
  STU003: { mid: 29, end: 58 },
  STU004: { mid: 43, end: 83 },
  STU005: { mid: 34, end: 64 }
};

var BASELINE_ATTENDANCE = {};
Object.keys(STUDENT_DATA).forEach(function(roll) {
  BASELINE_ATTENDANCE[roll] = {
    totalDays: STUDENT_DATA[roll].totalDays,
    present: STUDENT_DATA[roll].present,
    absent: STUDENT_DATA[roll].absent,
    absentDates: STUDENT_DATA[roll].absentDates.slice()
  };
});

function lsLoadMarks() {
  try {
    var raw = localStorage.getItem('ep-teacher-marks');
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

function lsSaveMarks(marks) {
  localStorage.setItem('ep-teacher-marks', JSON.stringify(marks));
}

function lsLoadAttendance() {
  try {
    var raw = localStorage.getItem('ep-teacher-attendance');
    return raw ? JSON.parse(raw) : {};
  } catch(e) {
    return {};
  }
}

function lsSaveAttendance(attendance) {
  localStorage.setItem('ep-teacher-attendance', JSON.stringify(attendance));
}

function getTeacherMarks() {
  var saved = lsLoadMarks() || {};
  var merged = {};
  Object.keys(STUDENT_DATA).forEach(function(roll) {
    merged[roll] = {
      mid: Number(saved[roll] && saved[roll].mid != null ? saved[roll].mid : DEFAULT_MARKS[roll].mid),
      end: Number(saved[roll] && saved[roll].end != null ? saved[roll].end : DEFAULT_MARKS[roll].end)
    };
  });
  return merged;
}

function getGrade(percent) {
  if (percent >= 85) return 'A+';
  if (percent >= 75) return 'A';
  if (percent >= 65) return 'B';
  if (percent >= 50) return 'C';
  if (percent >= 40) return 'D';
  return 'F';
}

function getGradeClass(grade) {
  return grade === 'A+' ? 'A' : grade;
}

function getScoreClass(percent) {
  if (percent >= 75) return 'good';
  if (percent >= 60) return 'average';
  return 'low';
}

function getAttendanceBadgeClass(percent) {
  if (percent >= 85) return 'ok';
  if (percent >= 75) return 'warn';
  return 'bad';
}

function syncStudentAcademicData() {
  var marks = getTeacherMarks();
  Object.keys(STUDENT_DATA).forEach(function(roll) {
    var s = STUDENT_DATA[roll];
    var total = marks[roll].mid + marks[roll].end;
    var percent = Math.round(total / 150 * 100);
    var grade = getGrade(percent);
    s.score = percent + '%';
    s.grade = grade;
  });
}

function syncStudentAttendanceData() {
  var records = lsLoadAttendance();
  Object.keys(STUDENT_DATA).forEach(function(roll) {
    var base = BASELINE_ATTENDANCE[roll];
    var s = STUDENT_DATA[roll];
    s.totalDays = base.totalDays;
    s.present = base.present;
    s.absent = base.absent;
    s.absentDates = base.absentDates.slice();
  });
  Object.keys(records).sort().forEach(function(date) {
    var day = records[date];
    Object.keys(day).forEach(function(roll) {
      var s = STUDENT_DATA[roll];
      if (!s) return;
      var status = day[roll];
      if (status === 'absent' && s.absentDates.indexOf(date) === -1) {
        s.absentDates.push(date);
        s.absent += 1;
        s.present = Math.max(0, s.present - 1);
      } else if (status === 'present' && s.absentDates.indexOf(date) !== -1) {
        s.absentDates = s.absentDates.filter(function(d) { return d !== date; });
        s.absent = Math.max(0, s.absent - 1);
        s.present += 1;
      }
    });
  });
  Object.keys(STUDENT_DATA).forEach(function(roll) {
    var s = STUDENT_DATA[roll];
    s.absentDates = s.absentDates.filter(function(date, index, all) {
      return all.indexOf(date) === index;
    }).sort();
    var pct = s.totalDays ? Math.round(s.present / s.totalDays * 100) : 0;
    s.attendance = pct + '%';
    s.attBadge = getAttendanceBadgeClass(pct);
  });
}

function renderTeacherStudentList() {
  var body = document.getElementById('teacher-student-list-body');
  if (!body) return;
  body.innerHTML = Object.keys(STUDENT_DATA).map(function(roll) {
    var s = STUDENT_DATA[roll];
    return '<tr class="student-row" data-id="' + roll + '" onclick="openStudentDetail(\'' + roll + '\')">' +
      '<td>' + roll + '</td>' +
      '<td><strong>' + s.name + '</strong></td>' +
      '<td>' + s.year + '</td>' +
      '<td>' + s.branch + '</td>' +
      '<td>' + s.score + '</td>' +
      '<td><span class="badge ' + s.attBadge + '">' + s.attendance + '</span></td>' +
      '<td><span class="grade ' + getGradeClass(s.grade) + '">' + s.grade + '</span></td>' +
      '<td><span class="row-expand-hint">View ›</span></td>' +
    '</tr>';
  }).join('');
}

function renderTeacherPerformance() {
  var body = document.getElementById('teacher-performance-body');
  if (!body) return;
  body.innerHTML = Object.keys(STUDENT_DATA).map(function(roll) {
    var s = STUDENT_DATA[roll];
    var score = parseInt(s.score, 10);
    var att = parseInt(s.attendance, 10);
    return '<tr>' +
      '<td>' + s.name + '</td>' +
      '<td>' + roll + '</td>' +
      '<td>' + s.branch + '</td>' +
      '<td>' + s.score + '<div class="progress-bar"><div class="progress-fill ' + getScoreClass(score) + '" style="width:' + score + '%"></div></div></td>' +
      '<td>' + s.attendance + ' <span class="badge ' + getAttendanceBadgeClass(att) + '">' + (att >= 85 ? 'Good' : att >= 75 ? 'Average' : 'Low') + '</span></td>' +
      '<td><span class="grade ' + getGradeClass(s.grade) + '">' + s.grade + '</span></td>' +
    '</tr>';
  }).join('');
}

function renderTeacherMarks() {
  var body = document.getElementById('teacher-marks-body');
  if (!body) return;
  var marks = getTeacherMarks();
  body.innerHTML = Object.keys(STUDENT_DATA).map(function(roll) {
    var s = STUDENT_DATA[roll];
    var mid = marks[roll].mid;
    var end = marks[roll].end;
    var total = mid + end;
    var pct = Math.round(total / 150 * 100);
    var grade = getGrade(pct);
    return '<tr>' +
      '<td>' + roll + '</td>' +
      '<td><strong>' + s.name + '</strong></td>' +
      '<td><input class="marks-input" type="number" min="0" max="50" value="' + mid + '" onchange="saveStudentMarks(\'' + roll + '\', \'mid\', this.value)" /></td>' +
      '<td><input class="marks-input" type="number" min="0" max="100" value="' + end + '" onchange="saveStudentMarks(\'' + roll + '\', \'end\', this.value)" /></td>' +
      '<td><strong>' + total + '</strong>/150</td>' +
      '<td>' + pct + '%</td>' +
      '<td><span class="grade ' + getGradeClass(grade) + '">' + grade + '</span></td>' +
    '</tr>';
  }).join('');
}

function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHTML(id, html) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function buildStudentMarksRows(roll) {
  var marks = getTeacherMarks();
  var item = marks[roll];
  if (!item) return '';
  var total = item.mid + item.end;
  var pct = Math.round(total / 150 * 100);
  var grade = getGrade(pct);
  return '<tr>' +
    '<td>Teacher Assessment</td>' +
    '<td>' + item.mid + '</td>' +
    '<td>' + item.end + '</td>' +
    '<td><strong>' + total + '</strong>/150</td>' +
    '<td>' + pct + '%</td>' +
    '<td><span class="grade ' + getGradeClass(grade) + '">' + grade + '</span></td>' +
    '<td><div class="progress-bar"><div class="progress-fill ' + getScoreClass(pct) + '" style="width:' + pct + '%"></div></div></td>' +
  '</tr>';
}

function buildStudentDashboardMarksRows(roll) {
  var marks = getTeacherMarks();
  var item = marks[roll];
  if (!item) return '';
  var total = item.mid + item.end;
  var pct = Math.round(total / 150 * 100);
  var grade = getGrade(pct);
  return '<tr><td>Teacher Assessment</td><td>' + total + '/150</td><td><span class="grade ' + getGradeClass(grade) + '">' + grade + '</span></td></tr>';
}

function getAttendanceStatusHTML(percent) {
  var badge = getAttendanceBadgeClass(percent);
  var label = percent >= 85 ? 'Good' : percent >= 75 ? 'Average' : 'Low';
  return '<span class="badge ' + badge + '">' + label + '</span>';
}

function renderStudentParentViews() {
  syncStudentAcademicData();
  syncStudentAttendanceData();

  var roll = 'STU001';
  var s = STUDENT_DATA[roll];
  var marks = getTeacherMarks()[roll];
  var score = parseInt(s.score, 10);
  var att = parseInt(s.attendance, 10);

  setText('student-dashboard-score', s.score);
  setHTML('student-dashboard-grade', 'Grade: <strong>' + s.grade + '</strong>');
  setText('student-dashboard-attendance', s.attendance);
  setText('student-dashboard-attendance-status', att >= 85 ? 'Good standing' : att >= 75 ? 'Needs regularity' : 'Needs attention');
  setHTML('student-dashboard-marks-body', buildStudentDashboardMarksRows(roll));

  setText('student-marks-overall', s.score);
  setText('student-marks-grade', 'Grade: ' + s.grade);
  setText('student-marks-mid', marks.mid);
  setText('student-marks-end', marks.end);
  setHTML('student-marks-body', buildStudentMarksRows(roll));
  setText('student-attendance-average', s.attendance);
  setHTML('student-attendance-badge', getAttendanceStatusHTML(att));

  setText('parent-overview-score', s.score);
  setText('parent-overview-grade', 'Grade: ' + s.grade);
  setText('parent-overview-attendance', s.attendance);
  setHTML('parent-overview-attendance-status', getAttendanceStatusHTML(att));

  setText('parent-marks-overall', s.score);
  setText('parent-marks-grade', 'Grade: ' + s.grade);
  setText('parent-marks-mid', marks.mid);
  setText('parent-marks-end', marks.end);
  setHTML('parent-marks-body', buildStudentMarksRows(roll));

  setText('parent-attendance-average', s.attendance);
  setHTML('parent-attendance-badge', getAttendanceStatusHTML(att));
  setText('parent-attendance-present', s.present);
  setText('parent-attendance-absent', s.absent);
}

function saveStudentMarks(roll, field, value) {
  var marks = getTeacherMarks();
  var max = field === 'mid' ? 50 : 100;
  var next = Math.max(0, Math.min(max, Number(value) || 0));
  marks[roll][field] = next;
  lsSaveMarks(marks);
  syncStudentAcademicData();
  renderStudentParentViews();
  renderTeacherStudentList();
  renderTeacherPerformance();
  renderTeacherMarks();
  showEditStatus('marks-save-status', 'Marks saved');
}

function getTodayString() {
  var today = new Date();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  return today.getFullYear() + '-' + mm + '-' + dd;
}

function renderTeacherAttendance() {
  var dateEl = document.getElementById('attendance-date');
  var body = document.getElementById('teacher-attendance-body');
  if (!dateEl || !body) return;
  if (!dateEl.value) dateEl.value = getTodayString();
  var date = dateEl.value;
  var saved = lsLoadAttendance();
  var day = saved[date] || {};
  body.innerHTML = Object.keys(STUDENT_DATA).map(function(roll) {
    var s = STUDENT_DATA[roll];
    var status = day[roll] || 'present';
    return '<tr>' +
      '<td>' + roll + '</td>' +
      '<td><strong>' + s.name + '</strong></td>' +
      '<td><select class="attendance-select" data-roll="' + roll + '">' +
        '<option value="present"' + (status === 'present' ? ' selected' : '') + '>Present</option>' +
        '<option value="absent"' + (status === 'absent' ? ' selected' : '') + '>Absent</option>' +
        '<option value="holiday"' + (status === 'holiday' ? ' selected' : '') + '>Holiday</option>' +
      '</select></td>' +
      '<td>' + date + '</td>' +
    '</tr>';
  }).join('');
}

function applyAttendanceQuickAction() {
  var actionEl = document.getElementById('attendance-quick-action');
  if (!actionEl || !actionEl.value) return;
  document.querySelectorAll('.attendance-select').forEach(function(select) {
    select.value = actionEl.value;
  });
  actionEl.value = '';
}

function saveTeacherAttendance() {
  var dateEl = document.getElementById('attendance-date');
  if (!dateEl || !dateEl.value) return;
  var date = dateEl.value;
  var records = lsLoadAttendance();
  records[date] = {};
  document.querySelectorAll('.attendance-select').forEach(function(select) {
    records[date][select.getAttribute('data-roll')] = select.value;
  });
  lsSaveAttendance(records);
  syncStudentAttendanceData();
  renderStudentParentViews();
  renderTeacherStudentList();
  renderTeacherPerformance();
  renderTeacherAttendanceHistory();
  showEditStatus('attendance-save-status', 'Attendance saved');
}

function renderTeacherAttendanceHistory() {
  var body = document.getElementById('teacher-attendance-history');
  if (!body) return;
  var records = lsLoadAttendance();
  var dates = Object.keys(records).sort().reverse();
  if (!dates.length) {
    body.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);">No attendance saved yet.</td></tr>';
    return;
  }
  body.innerHTML = dates.map(function(date) {
    var day = records[date];
    var statuses = Object.keys(day).map(function(roll) { return day[roll]; });
    var present = statuses.filter(function(v) { return v === 'present'; }).length;
    var absent = statuses.filter(function(v) { return v === 'absent'; }).length;
    var holiday = statuses.filter(function(v) { return v === 'holiday'; }).length;
    var working = present + absent;
    var pct = working ? Math.round(present / working * 100) : 0;
    return '<tr onclick="loadAttendanceDate(\'' + date + '\')" style="cursor:pointer;">' +
      '<td><strong>' + date + '</strong></td>' +
      '<td>' + present + '</td>' +
      '<td>' + absent + '</td>' +
      '<td>' + holiday + '</td>' +
      '<td>' + (working ? pct + '%' : 'Holiday') + '</td>' +
    '</tr>';
  }).join('');
}

function loadAttendanceDate(date) {
  var dateEl = document.getElementById('attendance-date');
  if (dateEl) {
    dateEl.value = date;
    renderTeacherAttendance();
  }
}

function showEditStatus(id, text) {
  var el = document.getElementById(id);
  if (!el) return;
  el.className = 'edit-status';
  el.textContent = text;
  setTimeout(function() {
    el.textContent = '';
  }, 1600);
}

function initTeacherTools() {
  syncStudentAcademicData();
  syncStudentAttendanceData();
  renderStudentParentViews();
  renderTeacherStudentList();
  renderTeacherPerformance();
  renderTeacherMarks();
  renderTeacherAttendance();
  renderTeacherAttendanceHistory();
}

function initSharedPortalData() {
  renderStudentParentViews();
}

function openStudentDetail(rollNo) {
  var s = STUDENT_DATA[rollNo];
  if (!s) return;

  // Highlight active row
  document.querySelectorAll('.student-row').forEach(function(r) { r.classList.remove('active'); });
  var row = document.querySelector('.student-row[data-id="' + rollNo + '"]');
  if (row) row.classList.add('active');

  var attPct = parseInt(s.attendance);
  var attClass = attPct >= 85 ? 'ok' : attPct >= 75 ? 'warn' : 'danger';
  var absentClass = s.absent > 50 ? 'danger' : s.absent > 25 ? 'warn' : 'ok';

  var parentsHTML = s.parents.map(function(p) {
    var emailVal = p.email !== '—'
      ? '<a href="mailto:' + p.email + '">' + p.email + '</a>'
      : '—';
    return '<div class="parent-detail-card">' +
      '<div class="avatar">' + p.avatar + '</div>' +
      '<div>' +
        '<div class="parent-detail-name">' + p.name +
          '<span class="parent-relation-badge">' + p.relation + '</span>' +
        '</div>' +
        '<div class="parent-detail-grid">' +
          '<div class="parent-detail-row"><span class="parent-detail-label">📞 Primary Phone</span><span class="parent-detail-value"><a href="tel:' + p.phone + '">' + p.phone + '</a></span></div>' +
          '<div class="parent-detail-row"><span class="parent-detail-label">📞 Alt. Phone</span><span class="parent-detail-value">' + p.altPhone + '</span></div>' +
          '<div class="parent-detail-row"><span class="parent-detail-label">✉ Email</span><span class="parent-detail-value">' + emailVal + '</span></div>' +
          '<div class="parent-detail-row"><span class="parent-detail-label">💼 Occupation</span><span class="parent-detail-value">' + p.occupation + '</span></div>' +
          '<div class="parent-detail-row" style="grid-column:1/-1"><span class="parent-detail-label">🏢 Employer / Organisation</span><span class="parent-detail-value">' + p.employer + '</span></div>' +
          '<div class="parent-detail-row" style="grid-column:1/-1"><span class="parent-detail-label">🏠 Home Address</span><span class="parent-detail-value">' + p.address + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  var recentAbsences = s.absentDates.slice(-5).reverse().map(function(d) {
    return '<span style="display:inline-block;background:rgba(255,107,107,.12);color:var(--accent2);padding:.15rem .5rem;border-radius:2px;font-size:.72rem;margin:.15rem;">' + d + '</span>';
  }).join(' ');

  document.getElementById('student-detail-content').innerHTML =
    '<div class="modal-header">' +
      '<div class="modal-student-name">' + s.name + '</div>' +
      '<div class="modal-student-meta">' +
        '<span>🎓 ' + s.roll + '</span>' +
        '<span>📚 ' + s.branch + '</span>' +
        '<span>📅 Year ' + s.year + '</span>' +
        '<span>📊 Score: <strong>' + s.score + '</strong> &nbsp; Grade: <strong>' + s.grade + '</strong></span>' +
      '</div>' +
    '</div>' +
    '<div class="modal-body">' +

      '<div class="modal-section-title">Attendance Overview</div>' +
      '<div class="absence-strip">' +
        '<div class="absence-tile ok"><div class="at-val">' + s.present + '</div><div class="at-lbl">Days Present</div></div>' +
        '<div class="absence-tile ' + absentClass + '"><div class="at-val">' + s.absent + '</div><div class="at-lbl">Days Absent</div></div>' +
        '<div class="absence-tile ' + attClass + '"><div class="at-val">' + s.attendance + '</div><div class="at-lbl">Attendance %</div></div>' +
      '</div>' +
      (s.absentDates.length > 0
        ? '<div style="margin-bottom:1.5rem;"><span style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.1em;">Recent Absent Dates &nbsp;</span><br/><br/>' + recentAbsences + '</div>'
        : '') +

      '<div class="modal-section-title">Parent / Guardian Details</div>' +
      parentsHTML +

    '</div>';

  document.getElementById('student-detail-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeStudentDetail() {
  document.getElementById('student-detail-overlay').classList.remove('open');
  document.body.style.overflow = '';
  document.querySelectorAll('.student-row').forEach(function(r) { r.classList.remove('active'); });
}

// Close on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeStudentDetail(); }
});


/* ── 6. ATTENDANCE BAR CHART ───────────────────────────────── */

var monthlyAttendance = {
  Jan: 92, Feb: 88, Mar: 76, Apr: 95, May: 85, Jun: 90,
  Jul: 78, Aug: 82, Sep: 89, Oct: 93, Nov: 87, Dec: 84
};

function drawAttChart() {
  var container = document.getElementById("att-chart");
  if (!container) return;

  var labels  = Object.keys(monthlyAttendance);
  var data    = labels.map(function(k) { return monthlyAttendance[k]; });
  var max     = Math.max.apply(null, data);
  var w       = container.clientWidth || 500;
  var h       = 160;
  var bw      = Math.floor((w - 40) / data.length) - 4;
  var svg     = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:' + h + 'px">';
  var i, y, barH, x, opacity;

  for (i = 0; i <= 4; i++) {
    y    = 10 + (h - 40) * i / 4;
    svg += '<line x1="30" y1="' + y + '" x2="' + (w - 10) + '" y2="' + y + '" stroke="#2a2a3a" stroke-width="1"/>';
    svg += '<text x="26" y="' + (y + 4) + '" fill="#7070a0" font-size="8" text-anchor="end">' + Math.round(max * (4 - i) / 4) + '%</text>';
  }

  for (i = 0; i < data.length; i++) {
    barH    = (h - 50) * data[i] / max;
    x       = 30 + i * (bw + 4);
    y       = h - 30 - barH;
    opacity = 0.5 + 0.5 * (data[i] / max);
    svg += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + barH + '" fill="#43e97b" opacity="' + opacity + '" rx="1"/>';
    svg += '<text x="' + (x + bw / 2) + '" y="' + (h - 14) + '" fill="#7070a0" font-size="7" text-anchor="middle">' + labels[i] + '</text>';
    svg += '<text x="' + (x + bw / 2) + '" y="' + (y - 4)  + '" fill="#e8e8f0" font-size="8" text-anchor="middle" font-weight="bold">' + data[i] + '</text>';
  }

  svg += '</svg>';
  container.innerHTML = svg;
}

// Redraw chart when yearly tab is selected
document.getElementById("s-att-yearly").addEventListener("change", function() {
  setTimeout(drawAttChart, 50);
});
