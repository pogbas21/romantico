/* ===========================
   CORAÇÕES FLUTUANTES
=========================== */
const heartsBg = document.getElementById('heartsBg');
const heartEmojis = ['❤️','💕','💖','💗','💓','🌸','✨','💝','🥰'];

function spawnHeart() {
  const el = document.createElement('span');
  el.className = 'heart';
  el.textContent = heartEmojis[Math.floor(Math.random() * heartEmojis.length)];
  el.style.left = Math.random() * 100 + 'vw';
  el.style.fontSize = (Math.random() * 1.2 + 0.8) + 'rem';
  const dur = Math.random() * 8 + 7;
  el.style.animationDuration = dur + 's';
  el.style.animationDelay = Math.random() * 3 + 's';
  heartsBg.appendChild(el);
  setTimeout(() => el.remove(), (dur + 3) * 1000);
}

// Gera corações continuamente
setInterval(spawnHeart, 800);
for (let i = 0; i < 8; i++) spawnHeart();


/* ===========================
   NAVEGAÇÃO ENTRE PÁGINAS
=========================== */
function goTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const next = document.getElementById(pageId);
  if (next) {
    next.classList.add('active');
    if (pageId === 'page4') initPrank();
  }
}

/* ===========================
   MÚSICA
   Busca: YouTube Data API v3
   Toca:  YouTube IFrame (música completa)
=========================== */

const YT_API_KEY = 'AIzaSyB-JDSckXZCbbQjwIXsQW2hZvNyEKeffIc';

/* ---- Salva resposta localmente + envia email via Formsubmit ---- */
const ADMIN_EMAIL = 'jrodriguessilvaoliveira081@gmail.com';

function logResposta(campo, valor) {
  // 1) Salva no localStorage
  const atual = JSON.parse(localStorage.getItem('respostas') || '{}');
  atual[campo] = valor;
  atual.timestamp = new Date().toISOString();
  localStorage.setItem('respostas', JSON.stringify(atual));

  // 2) Envia email via Formsubmit (sem token, sem backend)
  const corpo = campo === 'musica'
    ? `🎵 Música: ${valor.titulo} — ${valor.artista}\n🔗 ${valor.url}`
    : `💋 Resposta sobre o beijo:\n"${valor}"`;

  fetch('https://formsubmit.co/ajax/' + ADMIN_EMAIL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      _subject: campo === 'musica' ? '🎵 Andressa escolheu uma música!' : '💋 Andressa respondeu sobre o beijo!',
      _template: 'box',
      mensagem: corpo,
    })
  }).catch(() => {});
}

let debounceTimer  = null;
let ytPlayer       = null;
let ytPlayerReady  = false;

// Detecta iOS/Android — no mobile não mutamos (setTimeout unmute é bloqueado pelo iOS)
const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);

/* Pré-cria o player SEM videoId assim que a API carrega.
   Com o player já pronto, loadVideoById() no clique é síncrono
   → iOS aceita a reprodução. */
function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('yt-player', {
    height: '1', width: '1',
    playerVars: { controls: 0, fs: 0, rel: 0, playsinline: 1, origin: location.origin },
    events: {
      onReady: () => { ytPlayerReady = true; },
    }
  });
}

/* ---- Busca ---- */
function debounceSearch() {
  clearTimeout(debounceTimer);
  const q = document.getElementById('music-input').value.trim();
  document.getElementById('search-results').classList.add('hidden');
  if (q.length < 2) return;
  document.getElementById('search-spinner').classList.remove('hidden');
  debounceTimer = setTimeout(() => doSearch(q), 600);
}

async function doSearch(query) {
  try {
    const url  = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=6&key=${YT_API_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (!data.items) { renderResults([]); return; }

    const videos = data.items.map(item => ({
      videoId:   item.id.videoId,
      title:     item.snippet.title,
      thumbnail: (item.snippet.thumbnails.medium || item.snippet.thumbnails.default).url,
      author:    item.snippet.channelTitle,
    }));
    renderResults(videos);
  } catch {
    renderResults([]);
  } finally {
    document.getElementById('search-spinner').classList.add('hidden');
  }
}

function renderResults(videos) {
  const container = document.getElementById('search-results');

  if (!videos.length) {
    container.innerHTML = '<p class="no-results">Nenhuma música encontrada 😕</p>';
    container.classList.remove('hidden');
    return;
  }

  container.innerHTML = videos.map(v => {
    const safe = s => (s||'').replace(/\\/g,'\\\\').replace(/`/g,"'").replace(/"/g,'&quot;');
    return `
      <div class="track-item" onclick='selectTrack(${JSON.stringify(v.videoId)}, ${JSON.stringify(v.thumbnail)}, ${JSON.stringify(v.title)}, ${JSON.stringify(v.author)})'>
        <img src="${v.thumbnail}" alt="" class="track-art" onerror="this.style.display='none'" />
        <div class="track-info">
          <span class="track-name">${v.title}</span>
          <span class="track-artist">${v.author}</span>
        </div>
        <span class="track-play">▶</span>
      </div>`;
  }).join('');

  container.classList.remove('hidden');
}

/* ---- Seleção ---- */
function selectTrack(videoId, thumb, title, author) {
  document.getElementById('music-form').style.display = 'none';

  document.getElementById('selected-track-info').innerHTML = `
    <img src="${thumb}" alt="" class="selected-art" onerror="this.style.display='none'" />
    <div class="selected-details">
      <span class="track-name">${title}</span>
      <span class="track-artist">${author}</span>
      <span class="preview-badge">🎵 música completa</span>
    </div>
  `;
  document.getElementById('music-selected').classList.remove('hidden');

  // Tenta servidor local primeiro; fallback pro YouTube IFrame
  selectTrackPlay(videoId, title, thumb);

  createMusicBar(title, author);
  logResposta('musica', { titulo: title, artista: author, videoId, url: `https://youtu.be/${videoId}` });
}

/* ===========================
   REPRODUÇÃO — YouTube IFrame
   Detecção de anúncio:
   - Começa mudo sempre
   - getDuration() > 45s → é a música real → desmuta
   - getDuration() ≤ 45s → é propaganda → mantém mudo e aguarda próxima mudança
=========================== */

let audioEl        = null;
let currentVideoId = null;
let adEnforcer     = null;

function selectTrackPlay(videoId, title, art) {
  currentVideoId = videoId;

  if (ytPlayerReady && ytPlayer) {
    _carregarVideo(ytPlayer, videoId);
  } else {
    /* API ainda não terminou de carregar — aguarda e tenta de novo */
    const tentarIniciar = setInterval(() => {
      if (ytPlayerReady && ytPlayer) {
        clearInterval(tentarIniciar);
        _carregarVideo(ytPlayer, videoId);
      }
    }, 200);
    /* Desiste após 5s para não travar */
    setTimeout(() => clearInterval(tentarIniciar), 5000);
  }
}

function _carregarVideo(player, videoId) {
  /* Muta antes de carregar — cobre anúncio pré-roll em qualquer plataforma */
  player.mute();
  player.loadVideoById({ videoId, startSeconds: 0 });
  player.playVideo();

  /* Desmuta após 10s. No iOS o player já foi ativado pelo gesto do usuário,
     então operações de volume em setTimeout são permitidas. */
  setTimeout(() => {
    try { player.unMute(); player.setVolume(55); } catch(e) {}
  }, 14000);
}

/* ---- Barra flutuante ---- */
function createMusicBar(name, artist) {
  if (document.getElementById('music-bar-global')) return;
  const bar = document.createElement('div');
  bar.className = 'music-bar';
  bar.id = 'music-bar-global';
  bar.innerHTML = `<span class="music-bar-note">🎵</span><span><strong>${name}</strong> — ${artist}</span>`;
  document.body.appendChild(bar);
}


/* ===========================
   QUIZ 1 — Academia
=========================== */
function answer1(btn, isCorrect) {
  const opts = document.querySelectorAll('#quiz1-options .option-btn');
  opts.forEach(b => b.disabled = true);

  if (isCorrect) {
    btn.classList.add('correct');
    document.getElementById('quiz1-wrong').classList.add('hidden');
    setTimeout(() => {
      document.getElementById('quiz1-result').classList.remove('hidden');
    }, 400);
  } else {
    btn.classList.add('wrong');
    const wrongMsg = document.getElementById('quiz1-wrong');
    wrongMsg.classList.remove('hidden');
    // Habilita de novo após 1.2s para tentar outra vez
    setTimeout(() => {
      opts.forEach(b => { b.disabled = false; b.classList.remove('wrong', 'correct'); });
      wrongMsg.classList.add('hidden');
    }, 1200);
  }
}


/* ===========================
   QUIZ 2 — Primeiro Beijo (texto livre)
   Contexto: voltaram a pé da academia,
   caminharam até perto da casa da vó dela,
   se beijaram na despedida em frente a uma farmácia.
=========================== */

// Grupos de palavras-chave: basta acertar 2+ grupos para validar
const beijo_grupos = [
  ['academia', 'musculação', 'treino', 'gym'],
  ['farmácia', 'farmacia', 'farmac'],
  ['vó', 'vo ', 'vovó', 'avó', 'avo', 'avó', 'vó '],
  ['a pé', 'apé', 'caminhando', 'andando', 'caminhamos', 'andamos'],
  ['despedida', 'despedir', 'tchau', 'ir embora', 'foi embora'],
  ['beij', 'beijamos', 'beijou', 'beijo'],
];

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acentos
    .replace(/[^a-z\s]/g, ' ');
}

function checkAnswer2() {
  const input   = document.getElementById('quiz2-input');
  const wrongEl = document.getElementById('quiz2-wrong');
  const wrongTx = document.getElementById('quiz2-wrong-text');
  const raw     = input.value.trim();

  if (raw.length < 10) {
    wrongEl.classList.remove('hidden');
    wrongTx.textContent = 'Escreve um pouquinho mais... 😅';
    return;
  }

  const texto = normalize(raw);
  let gruposAcertados = 0;

  beijo_grupos.forEach(grupo => {
    if (grupo.some(palavra => texto.includes(normalize(palavra)))) {
      gruposAcertados++;
    }
  });

  if (gruposAcertados >= 2) {
    // Acertou!
    wrongEl.classList.add('hidden');
    input.disabled = true;
    document.getElementById('quiz2-form').querySelector('button').disabled = true;

    const textEl = document.getElementById('quiz2-text');
    textEl.innerHTML =
      'Pensei que não ia lembrar kkk 😂<br/>' +
      'Fui embora todo bobo pra casa esse dia. 🥹';

    logResposta('beijo', raw);

    setTimeout(() => {
      document.getElementById('quiz2-result').classList.remove('hidden');
    }, 400);

  } else if (gruposAcertados === 1) {
    // Quase lá
    wrongEl.classList.remove('hidden');
    wrongTx.textContent = 'Quase! Tenta lembrar um pouco mais dos detalhes... 🤔';
  } else {
    // Longe
    wrongEl.classList.remove('hidden');
    wrongTx.textContent = 'Hmm... não parece certo. Pensa melhor 😏';
  }
}


/* ===========================
   PEGADINHA DO BOTÃO
=========================== */
let prankCount  = 0;
let prankMax    = 5;   // Quantas vezes o botão foge antes de deixar clicar
let prankInited = false;
const hints = [
  "ei... 😏",
  "tenta pegar 🏃",
  "kkkkkkk não consigo parar",
  "tá quase...",
  "ok, dessa vez deixo você clicar 🤍"
];

function initPrank() {
  if (prankInited) return;
  prankInited = true;
  const btn = document.getElementById('prankBtn');
  // Posição inicial centralizada
  btn.style.left = '50%';
  btn.style.top  = '50%';
  btn.style.transform = 'translate(-50%, -50%)';
}

function moveButton() {
  if (prankCount >= prankMax) return; // Já deixa clicar

  const area = document.getElementById('prankArea');
  const btn  = document.getElementById('prankBtn');
  const hint = document.getElementById('prankHint');

  const aW = area.offsetWidth;
  const aH = area.offsetHeight;
  const bW = btn.offsetWidth;
  const bH = btn.offsetHeight;

  // Posição aleatória dentro da área, evitando bordas
  const maxX = aW - bW - 10;
  const maxY = aH - bH - 10;
  const newX = Math.max(10, Math.floor(Math.random() * maxX));
  const newY = Math.max(10, Math.floor(Math.random() * maxY));

  btn.style.transform = 'none';
  btn.style.left = newX + 'px';
  btn.style.top  = newY + 'px';

  prankCount++;
  hint.textContent = hints[Math.min(prankCount - 1, hints.length - 1)];

  if (prankCount >= prankMax) {
    // Últimas instruções: parar de fugir e deixar clicar
    setTimeout(() => {
      btn.style.left = '50%';
      btn.style.top  = '50%';
      btn.style.transform = 'translate(-50%, -50%)';
      btn.onmouseenter = null;
      btn.ontouchstart = null;
      btn.onclick = revelarFinal;
      hint.textContent = '😊 agora pode clicar!';
    }, 600);
  }
}


/* ===========================
   REVELAR PÁGINA FINAL
=========================== */
function revelarFinal() {
  // Sparkles na tela
  for (let i = 0; i < 20; i++) {
    setTimeout(() => launchSparkle(), i * 80);
  }
  setTimeout(() => goTo('page5'), 600);
}

function launchSparkle() {
  const s = document.createElement('span');
  s.className = 'sparkle';
  s.textContent = ['✨','💖','🌸','💕','⭐'][Math.floor(Math.random() * 5)];
  s.style.left = Math.random() * 100 + 'vw';
  s.style.top  = Math.random() * 100 + 'vh';
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 1400);
}
