(function () {
  'use strict';

  const socket = io();
  const $ = (s) => document.querySelector(s);
  const TEAM_SIZE = 5;

  const screens = {
    lobby: $('#screen-lobby'),
    searching: $('#screen-searching'),
    auction: $('#screen-auction'),
    result: $('#screen-result')
  };

  function showScreen(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle('active', k === name));
    window.scrollTo(0, 0);
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ------------------------------ Durum ---------------------------------- */
  let me = 0;
  let clockOffset = 0;
  let roundMs = 15000;
  let rafId = null;
  let cur = null;
  let raiseAmount = 1;
  let players = [
    { name: '', budget: 20, team: [] },
    { name: '', budget: 20, team: [] }
  ];

  /* ------------------------------ Yardımcılar ---------------------------- */
  function getName() {
    return ($('#name-input').value || '').trim().slice(0, 16);
  }

  try {
    const saved = localStorage.getItem('sh-name');
    if (saved) $('#name-input').value = saved;
  } catch (e) { /* depolama kapalı olabilir */ }

  function saveName() {
    try { localStorage.setItem('sh-name', getName()); } catch (e) { /* yoksay */ }
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function showOverlay(title, text, btnText, onClick) {
    $('#overlay-title').textContent = title;
    $('#overlay-text').textContent = text || '';
    const btn = $('#overlay-btn');
    if (btnText) {
      btn.textContent = btnText;
      btn.hidden = false;
      btn.onclick = onClick;
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }
    $('#overlay').hidden = false;
  }

  function hideOverlay() {
    $('#overlay').hidden = true;
  }

  function showBanner(text, kind) {
    const b = $('#banner');
    b.textContent = text;
    b.className = 'banner ' + (kind || '');
    b.hidden = false;
  }

  function hideBanner() {
    $('#banner').hidden = true;
  }

  /* ------------------------------ Çizim ---------------------------------- */
  function renderSlots(container, team, popLast) {
    container.textContent = '';
    for (let i = 0; i < TEAM_SIZE; i++) {
      const h = team[i];
      const slot = el('div', 'slot' + (h ? ' filled' : ''));
      if (h) {
        slot.textContent = h.icon;
        slot.title = h.name + ' - ' + h.price + '$';
        slot.appendChild(el('em', '', h.price + '$'));
        if (popLast && i === team.length - 1) slot.classList.add('pop');
      }
      container.appendChild(slot);
    }
  }

  function renderPlayers(popFor) {
    const you = players[me];
    const opp = players[1 - me];
    $('#you-name').textContent = you.name;
    $('#you-budget').textContent = you.budget;
    renderSlots($('#you-slots'), you.team, popFor === me);
    $('#opp-name').textContent = opp.name;
    $('#opp-budget').textContent = opp.budget;
    renderSlots($('#opp-slots'), opp.team, popFor === 1 - me);
  }

  function renderHero(hero, round) {
    const card = $('#hero-card');
    card.style.setProperty('--hc', hero.color);
    $('#round-label').textContent = 'Tur ' + round;
    $('#hero-icon').textContent = hero.icon;
    $('#hero-name').textContent = hero.name;
    $('#hero-desc').textContent = hero.desc;
    $('#hero-power').textContent = hero.power;
    card.classList.remove('enter');
    void card.offsetWidth; // animasyonu yeniden başlat
    card.classList.add('enter');
  }

  function renderBid(flash) {
    const box = $('#bidbox');
    box.classList.remove('lead-you', 'lead-opp');
    if (cur.leader < 0) {
      $('#bid-amount').textContent = '-';
      $('#bid-leader').textContent = 'Henüz teklif yok';
    } else {
      $('#bid-amount').textContent = cur.bid + '$';
      if (cur.leader === me) {
        box.classList.add('lead-you');
        $('#bid-leader').textContent = 'En yüksek teklif sende';
      } else {
        box.classList.add('lead-opp');
        $('#bid-leader').textContent = players[cur.leader].name + ' önde';
      }
    }
    if (flash) {
      box.classList.remove('flash');
      void box.offsetWidth;
      box.classList.add('flash');
    }
  }

  function renderControls() {
    const dec = $('#dec-btn');
    const incBtn = $('#inc-btn');
    const send = $('#bid-btn');
    const pass = $('#pass-btn');

    const active = !!cur && !cur.closed;
    const budget = players[me].budget;
    const full = players[me].team.length >= TEAM_SIZE;
    const maxInc = active ? budget - cur.bid : 0;
    const blocked = !active || cur.leader === me || cur.passed[me] || full || maxInc < 1;

    if (!blocked) raiseAmount = Math.min(Math.max(1, raiseAmount), maxInc);

    $('#inc-value').textContent = raiseAmount;
    dec.disabled = blocked || raiseAmount <= 1;
    incBtn.disabled = blocked || raiseAmount >= maxInc;
    send.disabled = blocked;
    $('#bid-total').textContent = blocked ? '' : 'toplam ' + (cur.bid + raiseAmount) + '$';

    pass.disabled = !active || cur.leader === me || cur.passed[me];
    pass.textContent = active && cur.passed[me] ? 'Pas geçtin' : 'Pas Geç';
  }

  function tick() {
    if (!cur || cur.closed) { rafId = null; return; }
    const rem = Math.max(0, cur.endsAt - (Date.now() + clockOffset));
    $('#timer-bar').style.width = Math.min(100, (rem / roundMs) * 100) + '%';
    $('#timer-sec').textContent = Math.ceil(rem / 1000);
    document.querySelector('.timer').classList.toggle('urgent', rem <= 5000);
    rafId = requestAnimationFrame(tick);
  }

  function startTimer() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function resetAuctionUI() {
    stopTimer();
    cur = null;
    $('#hero-card').style.setProperty('--hc', '#7c5cff');
    $('#round-label').textContent = 'Hazırlanıyor';
    $('#hero-icon').textContent = '❔';
    $('#hero-name').textContent = 'Maç başlıyor';
    $('#hero-desc').textContent = 'İlk kahraman birazdan sahneye çıkıyor.';
    $('#hero-power').textContent = '-';
    $('#hero-opener').textContent = 'Açılış: -';
    raiseAmount = 1;
    $('#bid-amount').textContent = '-';
    $('#bid-leader').textContent = 'Henüz teklif yok';
    $('#bidbox').classList.remove('lead-you', 'lead-opp');
    $('#timer-bar').style.width = '100%';
    $('#timer-sec').textContent = '15';
    document.querySelector('.timer').classList.remove('urgent');
    hideBanner();
    renderControls();
  }

  function renderResult(data) {
    const order = [me, 1 - me];
    const compare = $('#compare');
    compare.textContent = '';

    order.forEach((idx) => {
      const p = data.players[idx];
      const isYou = idx === me;
      const col = el('div', 'col ' + (isYou ? 'you' : 'opp') + (data.winner === idx ? ' win' : ''));

      col.appendChild(el('div', 'col-name', p.name + (isYou ? ' (sen)' : '')));
      if (data.winner === idx) col.appendChild(el('span', 'crown', 'Kazanan'));

      const dl = el('dl', 'stats');
      dl.appendChild(el('dt', '', 'Toplam güç'));
      dl.appendChild(el('dd', 'big', String(p.power)));
      dl.appendChild(el('dt', '', 'Harcanan'));
      dl.appendChild(el('dd', '', p.spent + '$'));
      dl.appendChild(el('dt', '', 'Kalan bütçe'));
      dl.appendChild(el('dd', '', p.budget + '$'));
      col.appendChild(dl);

      const ul = el('ul', 'team');
      if (p.team.length === 0) {
        ul.appendChild(el('li', 'empty', 'Kimseyi alamadı'));
      }
      p.team.forEach((h) => {
        const li = el('li');
        li.appendChild(el('span', 'ico', h.icon));
        li.appendChild(el('span', 'nm', h.name));
        const meta = el('span', 'meta');
        meta.appendChild(el('b', '', h.price + '$'));
        meta.appendChild(document.createElement('br'));
        meta.appendChild(document.createTextNode('güç ' + h.power));
        li.appendChild(meta);
        ul.appendChild(li);
      });
      col.appendChild(ul);
      compare.appendChild(col);
    });

    const mine = data.players[me];
    const theirs = data.players[1 - me];
    let title;
    if (data.winner === me) title = 'Kazandın!';
    else if (data.winner === -1) title = 'Berabere';
    else title = 'Rakip kazandı';
    $('#result-title').textContent = title;

    let sub = 'Toplam güç: ' + mine.power + ' - ' + theirs.power;
    if (mine.power === theirs.power && data.winner !== -1) sub += ' (eşitlikte kalan bütçe belirleyici)';
    $('#result-sub').textContent = sub;
  }

  /* ------------------------------ Butonlar ------------------------------- */
  function findMatch() {
    saveName();
    socket.emit('findMatch', { name: getName() });
  }

  $('#find-btn').addEventListener('click', findMatch);
  $('#again-btn').addEventListener('click', findMatch);
  $('#cancel-btn').addEventListener('click', () => socket.emit('cancelSearch'));
  $('#name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') findMatch(); });

  $('#dec-btn').addEventListener('click', () => {
    raiseAmount = Math.max(1, raiseAmount - 1);
    renderControls();
  });
  $('#inc-btn').addEventListener('click', () => {
    raiseAmount += 1;
    renderControls();
  });
  $('#bid-btn').addEventListener('click', () => {
    if ($('#bid-btn').disabled) return;
    socket.emit('bid', { inc: raiseAmount });
  });

  $('#pass-btn').addEventListener('click', () => {
    if ($('#pass-btn').disabled) return;
    socket.emit('pass');
  });

  /* ------------------------------ Socket olayları ------------------------ */
  socket.on('stats', (s) => {
    $('#online-count').textContent = s.online;
  });

  socket.on('searching', () => showScreen('searching'));
  socket.on('searchCancelled', () => showScreen('lobby'));

  socket.on('matchFound', (d) => {
    me = d.you;
    players = d.players;
    resetAuctionUI();
    renderPlayers();
    showScreen('auction');
    showOverlay('Eşleşti!', players[1 - me].name + ' ile karşılaşıyorsun. Her biriniz ' + d.budget + '$ ile başlıyorsunuz.');
    setTimeout(hideOverlay, Math.max(1500, d.introMs - 300));
  });

  socket.on('roundStart', (d) => {
    hideOverlay();
    hideBanner();
    clockOffset = d.serverNow - Date.now();
    roundMs = d.roundMs;
    cur = {
      hero: d.hero,
      round: d.round,
      bid: d.bid,
      leader: d.leader,
      passed: d.passed.slice(),
      endsAt: d.endsAt,
      closed: false
    };
    raiseAmount = 1;
    renderHero(d.hero, d.round);
    $('#hero-opener').textContent = 'Açılış: ' + (d.leader === me ? 'sen' : players[d.leader].name);
    renderBid(false);
    renderControls();
    startTimer();
    if (cur.passed[me]) {
      showBanner('Bu kahraman için artırma yapamazsın (bütçe ya da kadro dolu).', 'info');
    } else if (d.leader === me) {
      showBanner('Sıra sende: ' + d.bid + '$ ile açtın. Rakip artırmazsa kahraman senin.', 'info');
    } else {
      showBanner(players[d.leader].name + ' ' + d.bid + '$ ile açtı. Artırabilir ya da pas geçebilirsin.', 'info');
    }
  });

  socket.on('bidUpdate', (d) => {
    if (!cur || cur.closed) return;
    clockOffset = d.serverNow - Date.now();
    cur.bid = d.bid;
    cur.leader = d.leader;
    cur.endsAt = d.endsAt;
    raiseAmount = 1;
    renderBid(true);
    renderControls();
  });

  socket.on('playerPassed', (d) => {
    if (!cur || cur.closed) return;
    cur.passed[d.idx] = true;
    if (d.idx !== me) showBanner(players[d.idx].name + ' pas geçti.', 'info');
    renderControls();
  });

  socket.on('roundEnd', (d) => {
    if (cur) cur.closed = true;
    stopTimer();
    $('#timer-bar').style.width = '0%';
    $('#timer-sec').textContent = '0';
    players = d.players;
    renderPlayers(d.winner);
    renderControls();

    if (d.winner === me) {
      showBanner(d.hero.name + ' kadrona katıldı. ' + d.price + '$ ödedin.', 'good');
    } else if (d.winner >= 0) {
      showBanner(d.hero.name + ' rakibe gitti (' + d.price + '$).', 'bad');
    } else {
      showBanner(d.hero.name + ' için teklif gelmedi.', 'info');
    }
  });

  socket.on('gameOver', (d) => {
    stopTimer();
    hideOverlay();
    renderResult(d);
    showScreen('result');
  });

  socket.on('opponentLeft', () => {
    stopTimer();
    showOverlay('Rakip ayrıldı', 'Maç sona erdi. Yeni bir rakip arayabilirsin.', 'Yeni Maç Ara', () => {
      hideOverlay();
      findMatch();
    });
  });

  socket.on('errorMsg', (msg) => toast(msg));

  socket.on('disconnect', () => {
    stopTimer();
    showOverlay('Bağlantı koptu', 'Sunucuyla bağlantı kesildi.', 'Lobiye dön', () => {
      hideOverlay();
      showScreen('lobby');
    });
  });

  socket.on('connect', () => {
    // Yeniden bağlanınca eski oyun yok sayılır; kullanıcı lobiden devam eder
    if (!$('#overlay').hidden && $('#overlay-title').textContent === 'Bağlantı koptu') {
      $('#overlay-text').textContent = 'Bağlantı yeniden kuruldu.';
    }
  });
})();
