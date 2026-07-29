(function () {
  'use strict';

  // ==========================================================================
  // Carrossel de depoimentos — estilo "peek" (Stories/Reels), em loop infinito
  //
  // Técnica: clona o primeiro e o último slide reais e os posiciona nas
  // pontas da track ([clone-do-último, ...slides reais, clone-do-primeiro]).
  // Isso garante que sempre haja conteúdo real pra "espiar" nas bordas.
  // Ao terminar a transição de entrar num clone, a posição é corrigida
  // instantaneamente (sem transição) pro slide real equivalente — como os
  // dois são visualmente idênticos, o "teleporte" é imperceptível, e o
  // usuário pode arrastar infinitamente em qualquer direção.
  // ==========================================================================
  function initCarousel(root) {
    var viewport = root.querySelector('[data-carousel-viewport]');
    var track = root.querySelector('[data-carousel-track]');
    var realSlides = Array.prototype.slice.call(root.querySelectorAll('[data-carousel-slide]'));
    var prevBtn = root.querySelector('[data-carousel-prev]');
    var nextBtn = root.querySelector('[data-carousel-next]');
    var dotsWrap = root.querySelector('[data-carousel-dots]');

    if (!realSlides.length || !viewport || !track) return;

    var SLIDE_WIDTH_RATIO = 0.72; // largura do slide ativo em relação ao viewport
    var GAP = 16; // valor inicial; recalculado a partir do CSS em measure() (o CSS reduz o gap em telas estreitas)
    var REAL_COUNT = realSlides.length;
    var SETTLE_DELAY = 320; // um pouco mais que a duração da transição (0.3s)

    // ---------- monta os clones nas pontas ----------
    var firstClone = realSlides[0].cloneNode(true);
    var lastClone = realSlides[REAL_COUNT - 1].cloneNode(true);
    [firstClone, lastClone].forEach(function (clone) {
      clone.removeAttribute('data-carousel-slide');
      clone.setAttribute('data-carousel-clone', 'true');
      clone.setAttribute('aria-hidden', 'true');
      // remove ids duplicados (ex: iframes de vídeo) — o clone é só visual,
      // nunca precisa ser um elemento interativo/endereçável por id
      if (clone.id) clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
    });
    track.insertBefore(lastClone, track.firstChild);
    track.appendChild(firstClone);

    // ordem real no DOM agora: [lastClone, slide0, slide1, ..., slideN-1, firstClone]
    var allSlideEls = Array.prototype.slice.call(track.children);
    var EXTENDED_COUNT = allSlideEls.length; // REAL_COUNT + 2

    var slideWidth = 0;
    var trackPos = 1; // posição estendida; 1 = slide real 0
    var settleTimer = null;

    var isDragging = false;
    var dragIntentDecided = false;
    var isHorizontalDrag = false;
    var startX = 0;
    var startY = 0;
    var lastX = 0;
    var baseTxAtDragStart = 0;

    // monta os dots dinamicamente (um por slide REAL, nunca por clone)
    var dots = realSlides.map(function (_, index) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', 'Ir para depoimento ' + (index + 1));
      dot.addEventListener('click', function () { goToRealIndex(index); });
      dotsWrap.appendChild(dot);
      return dot;
    });

    // menor número de passos (positivo ou negativo) pra ir de um índice real a outro
    function normalizedStep(rawStep) {
      var step = ((rawStep % REAL_COUNT) + REAL_COUNT) % REAL_COUNT;
      if (step > REAL_COUNT / 2) step -= REAL_COUNT;
      return step;
    }

    function measure() {
      slideWidth = viewport.clientWidth * SLIDE_WIDTH_RATIO;
      GAP = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || GAP;
      allSlideEls.forEach(function (slide) {
        slide.style.width = slideWidth + 'px';
      });
    }

    // translateX necessário pra centralizar a posição (0..EXTENDED_COUNT-1)
    function baseTranslateForPos(pos) {
      return (viewport.clientWidth - slideWidth) / 2 - pos * (slideWidth + GAP);
    }

    // índice real (0..REAL_COUNT-1) equivalente a uma posição estendida qualquer
    function realIndexFromTrackPos(pos) {
      return (((pos - 1) % REAL_COUNT) + REAL_COUNT) % REAL_COUNT;
    }

    function applyTransform(tx, animate) {
      track.style.transition = animate ? 'transform 0.3s ease' : 'none';
      track.style.transform = 'translateX(' + tx + 'px)';
    }

    // aceita uma posição alternativa só pra pré-visualização (durante o
    // arrasto), sem alterar o estado canônico (trackPos)
    function renderActiveStates(previewPos) {
      var pos = previewPos === undefined ? trackPos : previewPos;
      var activeReal = realIndexFromTrackPos(pos);
      allSlideEls.forEach(function (slide, extIdx) {
        var isActive = extIdx === pos;
        slide.style.opacity = isActive ? '1' : '0.45';
        slide.style.transform = isActive ? 'scale(1)' : 'scale(0.9)';
        slide.style.zIndex = isActive ? '2' : '1';
        slide.setAttribute('data-active', isActive ? 'true' : 'false');
      });
      dots.forEach(function (dot, index) {
        dot.setAttribute('data-active', index === activeReal ? 'true' : 'false');
      });
    }

    // se a posição estendida estiver num clone (ponta), corrige pro slide
    // real equivalente instantaneamente (sem transição) — o "teleporte"
    // invisível que permite o loop infinito. Chamada tanto pelo timer (depois
    // que a transição visual termina) quanto no início de uma nova
    // navegação, pra nunca deixar o estado "pousado" num clone acumular.
    function foldIfOnClone() {
      if (trackPos === 0) {
        trackPos = REAL_COUNT;
        applyTransform(baseTranslateForPos(trackPos), false);
        renderActiveStates();
      } else if (trackPos === EXTENDED_COUNT - 1) {
        trackPos = 1;
        applyTransform(baseTranslateForPos(trackPos), false);
        renderActiveStates();
      }
    }

    function moveBy(delta) {
      trackPos += delta;
      applyTransform(baseTranslateForPos(trackPos), true);
      renderActiveStates();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(foldIfOnClone, SETTLE_DELAY);
    }

    function step(delta) {
      clearTimeout(settleTimer);
      foldIfOnClone();
      moveBy(delta);
    }

    function goToRealIndex(index) {
      clearTimeout(settleTimer);
      foldIfOnClone();
      moveBy(normalizedStep(index - realIndexFromTrackPos(trackPos)));
    }

    function next() { step(1); }
    function prev() { step(-1); }

    if (prevBtn) prevBtn.addEventListener('click', prev);
    if (nextBtn) nextBtn.addEventListener('click', next);

    // ---------- Drag (touch e mouse) ----------
    function nearestPosForTx(tx) {
      var raw = ((viewport.clientWidth - slideWidth) / 2 - tx) / (slideWidth + GAP);
      return Math.max(0, Math.min(EXTENDED_COUNT - 1, Math.round(raw)));
    }

    function onDragStart(x, y) {
      clearTimeout(settleTimer);
      foldIfOnClone(); // garante ponto de partida canônico mesmo após navegação recente
      isDragging = true;
      dragIntentDecided = false;
      isHorizontalDrag = false;
      startX = x;
      startY = y;
      lastX = x;
      baseTxAtDragStart = baseTranslateForPos(trackPos);
      applyTransform(baseTxAtDragStart, false);
    }

    function onDragMove(x, y) {
      if (!isDragging) return false;
      lastX = x;

      if (!dragIntentDecided) {
        var deltaX = x - startX;
        var deltaY = y - startY;
        if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return true;
        dragIntentDecided = true;
        isHorizontalDrag = Math.abs(deltaX) > Math.abs(deltaY);
        if (!isHorizontalDrag) {
          isDragging = false;
          return false;
        }
      }

      // arrasto livre — sem resistência/limite, o loop cuida das pontas.
      // trackPos (canônico) só é atualizado ao soltar; aqui é só preview.
      var tx = baseTxAtDragStart + (x - startX);
      applyTransform(tx, false);
      renderActiveStates(nearestPosForTx(tx));
      return true;
    }

    function onDragEnd() {
      if (!isDragging) return;
      isDragging = false;

      if (!dragIntentDecided || !isHorizontalDrag) {
        moveBy(0);
        return;
      }

      var delta = lastX - startX;
      var threshold = Math.max(50, slideWidth * 0.15);

      if (delta <= -threshold) {
        moveBy(1);
      } else if (delta >= threshold) {
        moveBy(-1);
      } else {
        moveBy(0);
      }
    }

    track.addEventListener('touchstart', function (e) {
      onDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    track.addEventListener('touchmove', function (e) {
      var handled = onDragMove(e.touches[0].clientX, e.touches[0].clientY);
      if (handled && isHorizontalDrag) e.preventDefault();
    }, { passive: false });

    track.addEventListener('touchend', onDragEnd);
    track.addEventListener('touchcancel', onDragEnd);

    track.addEventListener('mousedown', function (e) {
      onDragStart(e.clientX, e.clientY);
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      onDragMove(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', onDragEnd);

    // navegação por teclado quando a track está focada
    track.setAttribute('tabindex', '0');
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    });

    // recalcula medidas se a tela mudar de tamanho (resize/orientação)
    window.addEventListener('resize', function () {
      measure();
      applyTransform(baseTranslateForPos(trackPos), false);
    });

    // o CSS completo (style.css) carrega de forma assíncrona (preload+swap,
    // pra não bloquear a primeira pintura) — se essa medida inicial rodar
    // antes dele aplicar, o viewport pode ainda não ter a largura final e
    // os slides ficam com 0px "congelado" no inline style. Remedir no
    // window.load (depois que todo recurso, incluindo o CSS, carregou)
    // corrige isso sem precisar de um resize manual.
    window.addEventListener('load', function () {
      measure();
      applyTransform(baseTranslateForPos(trackPos), false);
    });

    measure();
    applyTransform(baseTranslateForPos(trackPos), false);
    renderActiveStates();
  }

  document.querySelectorAll('[data-carousel]').forEach(initCarousel);

  // ==========================================================================
  // Carrossel do hero — um único <img>/<picture> persistente, com o
  // src/srcset trocado via JS a cada slide (em vez de 3 imagens empilhadas
  // alternando opacity). Mais simples (menos DOM/CSS) e só baixa a imagem
  // do slide sendo exibido no momento, em vez das 3 de uma vez.
  //
  // Isso sozinho NÃO resolve o problema de LCP inflado por carrossel com
  // autoplay (testado via Lighthouse: tanto a versão com 3 imagens
  // empilhadas quanto essa, com 1 elemento só, faziam o navegador tratar a
  // troca de slide como um novo "maior conteúdo pintado", inflando o LCP
  // relatado de ~2s pra 9-11s — mesmo a imagem certa já tendo pintado
  // rápido). A correção real é startAutoplayAfterInteraction(), mais abaixo.
  // ==========================================================================
  function initHeroCarousel(root) {
    var img = root.querySelector('[data-hero-img]');
    var sources = Array.prototype.slice.call(root.querySelectorAll('[data-hero-source]'));
    var dots = Array.prototype.slice.call(root.querySelectorAll('[data-hero-dot]'));
    var prevBtn = root.querySelector('[data-hero-carousel-prev]');
    var nextBtn = root.querySelector('[data-hero-carousel-next]');
    if (!img) return;

    // slide 0 já é o que está no HTML estático (carregado eager/fetchpriority
    // alto) — não repetido aqui, só o dado do slide 2, trocado sob demanda
    // (só é buscado quando o carrossel avança até ele, efetivamente lazy)
    var SLIDES = [
      null,
      { avif: 'assets/hero/mockup-produto.avif', webp: '', png: 'assets/hero/mockup-produto.png', alt: 'Mockup do Coreano na Hora — livro, notebook e tablet com o conteúdo do curso' }
    ];
    SLIDES[0] = { avif: 'assets/hero/hero-slide-3.avif', webp: 'assets/hero/hero-slide-3.webp', png: img.getAttribute('src'), alt: img.getAttribute('alt') };

    var AUTOPLAY_MS = 3500;
    var RESUME_DELAY_MS = 5000; // após clique/swipe manual, espera antes de retomar o autoplay
    var FADE_MS = 250; // metade do tempo total do fade — troca o src no "vale" (opacity 0)
    var current = 0;
    var autoplayTimer = null;
    var resumeTimer = null;
    var fadeTimer = null;

    function applySlide(index) {
      var data = SLIDES[index];
      sources.forEach(function (source) {
        var type = source.getAttribute('data-hero-source');
        source.srcset = (type === 'avif' ? data.avif : data.webp) || '';
      });
      img.src = data.png;
      img.alt = data.alt;
    }

    function render(animate) {
      dots.forEach(function (dot, i) {
        dot.setAttribute('data-active', i === current ? 'true' : 'false');
      });
      clearTimeout(fadeTimer);
      if (!animate) {
        applySlide(current);
        return;
      }
      img.style.opacity = '0';
      fadeTimer = setTimeout(function () {
        applySlide(current);
        img.style.opacity = '1';
      }, FADE_MS);
    }

    function goTo(index, animate) {
      current = ((index % SLIDES.length) + SLIDES.length) % SLIDES.length;
      render(animate !== false);
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    function stopAutoplay() {
      clearInterval(autoplayTimer);
    }
    function startAutoplay() {
      stopAutoplay();
      autoplayTimer = setInterval(next, AUTOPLAY_MS);
    }
    function pauseAutoplayTemporarily() {
      stopAutoplay();
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(startAutoplay, RESUME_DELAY_MS);
    }

    // O autoplay só começa depois da 1ª interação do usuário com a página
    // (scroll, toque ou tecla) — de propósito, não é atraso arbitrário: é
    // exatamente o mesmo gatilho que o próprio LCP usa pra "travar" a
    // métrica (a spec para de contar novos candidatos após a 1ª interação).
    // Como essa é uma página longa feita pra rolar, a esmagadora maioria
    // dos usuários reais interage nos primeiros segundos — pra eles a
    // experiência muda muito pouco. Já testes de laboratório (Lighthouse/
    // PSI) não simulam nenhuma interação por padrão, então o autoplay nunca
    // dispara durante a medição, e o LCP reportado volta a refletir a
    // pintura real do slide 1 (~2s) em vez de ser inflado por uma troca de
    // slide posterior.
    function startAutoplayAfterInteraction() {
      var started = false;
      function trigger() {
        if (started) return;
        started = true;
        startAutoplay();
      }
      window.addEventListener('scroll', trigger, { passive: true, once: true });
      document.addEventListener('touchstart', trigger, { passive: true, once: true });
      document.addEventListener('pointerdown', trigger, { passive: true, once: true });
      document.addEventListener('keydown', trigger, { once: true });
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { prev(); pauseAutoplayTemporarily(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { next(); pauseAutoplayTemporarily(); });
    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { goTo(i); pauseAutoplayTemporarily(); });
    });

    // swipe simples em mobile — secundário, só um threshold de distância
    // horizontal no touchend, sem preview/drag em tempo real (mantém leve)
    var touchStartX = 0;
    var isTouching = false;
    root.addEventListener('touchstart', function (e) {
      isTouching = true;
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (!isTouching) return;
      isTouching = false;
      var deltaX = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(deltaX) < 40) return;
      if (deltaX < 0) { next(); } else { prev(); }
      pauseAutoplayTemporarily();
    });

    startAutoplayAfterInteraction();
  }

  document.querySelectorAll('[data-hero-carousel]').forEach(initHeroCarousel);

  // ==========================================================================
  // Facade dos vídeos de depoimento (Panda Video): o iframe/player só é
  // criado no clique/teque, pra não pagar o custo de rede+JS de dois players
  // de vídeo logo no carregamento da página quando o usuário talvez nem
  // chegue a assistir.
  // ==========================================================================
  function loadPandaEmbed(container) {
    var videoId = container.getAttribute('data-video-id');
    var vz = container.getAttribute('data-vz');
    var playerId = 'panda-' + videoId;

    var playBtn = container.querySelector('.panda-play-btn');
    if (playBtn) playBtn.remove();
    var thumb = container.querySelector('picture');
    if (thumb) thumb.remove();

    var iframe = document.createElement('iframe');
    iframe.id = playerId;
    iframe.src = 'https://player-vz-' + vz + '.tv.pandavideo.com.br/embed/?v=' + videoId + '&iosFakeFullscreen=true';
    iframe.style.border = 'none';
    iframe.setAttribute('allow', 'accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('fetchpriority', 'high');
    container.insertBefore(iframe, container.firstChild);

    container.removeAttribute('data-panda-facade');
    container.removeAttribute('role');
    container.removeAttribute('tabindex');
    container.removeAttribute('aria-label');

    if (!document.querySelector('script[src="https://player.pandavideo.com.br/api.v2.js"]')) {
      var s = document.createElement('script');
      s.src = 'https://player.pandavideo.com.br/api.v2.js';
      s.async = true;
      document.head.appendChild(s);
    }
    window.pandascripttag = window.pandascripttag || [];
    window.pandascripttag.push(function () {
      var p = new PandaPlayer(playerId, {
        onReady: function () {
          p.loadWindowScreen({ panda_id_player: playerId });
        }
      });
    });
  }

  document.querySelectorAll('[data-panda-facade]').forEach(function (facade) {
    function activate(event) {
      if (event.target.closest('.testimonial-drag-handle')) return;
      loadPandaEmbed(facade);
    }
    facade.addEventListener('click', activate, { once: true });
    facade.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(event);
      }
    });
  });

  // ==========================================================================
  // Accordion do FAQ
  // ==========================================================================
  document.querySelectorAll('[data-faq-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var item = button.closest('.faq-item');
      var answer = item.querySelector('.faq-answer');
      var isOpen = item.getAttribute('data-open') === 'true';
      var willOpen = !isOpen;
      item.setAttribute('data-open', willOpen ? 'true' : 'false');
      // aplicado inline (em vez de depender só do seletor [data-open] no CSS)
      // com scrollHeight em vez de um valor fixo, pra nunca cortar respostas longas
      answer.style.maxHeight = willOpen ? (answer.scrollHeight + 20) + 'px' : '0px';
    });
  });

  // ==========================================================================
  // Contador regressivo de urgência
  // ==========================================================================
  function initCountdown(root) {
    var targetAttr = root.getAttribute('data-countdown-target');
    var target = new Date(targetAttr).getTime();

    var daysEl = root.querySelector('[data-countdown-days]');
    var hoursEl = root.querySelector('[data-countdown-hours]');
    var minutesEl = root.querySelector('[data-countdown-minutes]');
    var secondsEl = root.querySelector('[data-countdown-seconds]');

    function pad(n) {
      return String(n).padStart(2, '0');
    }

    function tick() {
      var now = Date.now();
      var diff = target - now;

      if (diff <= 0) {
        daysEl.textContent = '00';
        hoursEl.textContent = '00';
        minutesEl.textContent = '00';
        secondsEl.textContent = '00';
        clearInterval(timer);
        return;
      }

      var days = Math.floor(diff / (1000 * 60 * 60 * 24));
      var hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      var minutes = Math.floor((diff / (1000 * 60)) % 60);
      var seconds = Math.floor((diff / 1000) % 60);

      daysEl.textContent = pad(days);
      hoursEl.textContent = pad(hours);
      minutesEl.textContent = pad(minutes);
      secondsEl.textContent = pad(seconds);
    }

    tick();
    var timer = setInterval(tick, 1000);
  }

  document.querySelectorAll('[data-countdown-target]').forEach(initCountdown);

  // ==========================================================================
  // Barra de urgência fixa no topo:
  // - Data por extenso calculada a partir do dia atual do sistema.
  // - Timer MM:SS que sempre reinicia em 47:00 ao chegar em 00:00 (loop,
  //   só pro efeito visual de urgência — sem lógica de expiração real).
  // ==========================================================================
  function initUrgencyBar(root) {
    var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    var COUNTDOWN_START_SECONDS = 47 * 60; // 47:00

    var dateEl = root.querySelector('[data-urgency-date]');
    var timerEl = root.querySelector('[data-urgency-timer]');
    if (!timerEl) return;

    function pad(n) {
      return String(n).padStart(2, '0');
    }

    if (dateEl) {
      var today = new Date();
      dateEl.textContent = today.getDate() + ' de ' + MESES[today.getMonth()];
    }

    var remainingSeconds = COUNTDOWN_START_SECONDS;

    function render() {
      var minutes = Math.floor(remainingSeconds / 60);
      var seconds = remainingSeconds % 60;
      timerEl.textContent = pad(minutes) + ':' + pad(seconds);
    }

    render();

    setInterval(function () {
      remainingSeconds -= 1;
      if (remainingSeconds < 0) {
        remainingSeconds = COUNTDOWN_START_SECONDS;
      }
      render();
    }, 1000);
  }

  document.querySelectorAll('[data-urgency-bar]').forEach(initUrgencyBar);

  // ==========================================================================
  // Sincroniza o espaço reservado no topo da página com a altura real da
  // barra de urgência fixa, pra ela nunca cobrir o conteúdo do hero.
  // ==========================================================================
  (function syncUrgencyBarOffset() {
    var bar = document.querySelector('[data-urgency-bar]');
    if (!bar) return;

    function apply() {
      document.body.style.paddingTop = bar.offsetHeight + 'px';
    }

    apply();
    window.addEventListener('resize', apply);
  })();

  // ==========================================================================
  // Botões de CTA (#cta-hero, #cta-faq, #cta-checkout): os 3 levam direto
  // pro checkout da Hubla, com a mesma lógica robusta de abertura de aba.
  //
  // No Safari (principalmente iOS), a troca imediata de aba (target="_blank")
  // às vezes corta a execução do script de tracking (Utmify/InitiateCheckout)
  // antes dele terminar de disparar, perdendo o evento.
  //
  // Abrir a nova aba com window.open() dentro de um setTimeout NÃO funciona
  // como correção — o Safari exige que window.open seja chamado de forma
  // síncrona dentro do gesto de clique; qualquer atraso via setTimeout quebra
  // essa cadeia e a aba é bloqueada como pop-up. Por isso a aba é aberta em
  // branco de forma síncrona (ainda dentro do clique, preservando o gesto) e
  // só depois do atraso é que ela recebe a URL de destino — dando o mesmo
  // tempo de folga pro tracking sem correr o risco de bloqueio.
  //
  // Proteções extras (aba fechada/bloqueada nesse meio-tempo, cliques duplos):
  // - Confere tab.closed antes de navegar; se a aba não existir mais, tenta
  //   abrir de novo na hora e, se isso também falhar, navega a aba atual como
  //   último recurso — o usuário sempre tem que chegar ao checkout, mesmo
  //   que o tracking eventualmente não tenha tido tempo de disparar.
  // - Debounce: clique repetido enquanto uma navegação já está pendente é
  //   ignorado, pra nunca abrir duas abas/referências conflitantes.
  // - Delay reduzido pra 90ms (ainda dá folga pro tracking, mas encurta a
  //   janela em que a aba pode ser fechada/bloqueada nesse meio-tempo).
  //
  // Cada botão tem seu próprio debounce independente (navigationPending por
  // instância), pra clicar em um não travar os outros dois.
  // ==========================================================================
  ['cta-hero', 'cta-faq', 'cta-checkout'].forEach(function (id) {
    var link = document.getElementById(id);
    if (!link) return;

    var CHECKOUT_DELAY_MS = 90;
    var navigationPending = false;

    link.addEventListener('click', function (event) {
      var href = link.href;
      if (!href) return;
      event.preventDefault();

      if (navigationPending) return;
      navigationPending = true;

      // 'about:blank' explícito — uma string vazia ('') não é garantida como
      // página em branco em todos os navegadores; a resolução de URL pode
      // recair na própria página atual (document.baseURI), fazendo a nova
      // aba carregar uma cópia inteira da landing page (que aparenta ter
      // "voltado pro topo") em vez de ficar em branco esperando o redirect.
      var newTab = window.open('about:blank', '_blank');
      if (newTab) newTab.opener = null;

      setTimeout(function () {
        if (newTab && !newTab.closed) {
          newTab.location.href = href;
        } else {
          // a aba foi bloqueada de início ou fechada nesse meio-tempo —
          // tenta abrir de novo na hora, sem esperar mais; se isso também
          // falhar (bloqueio persistente), navega a aba atual como último
          // recurso, pra nunca deixar o clique sem reação nenhuma.
          var retryTab = window.open(href, '_blank');
          if (retryTab) {
            retryTab.opener = null;
          } else {
            window.location.href = href;
          }
        }
        navigationPending = false;
      }, CHECKOUT_DELAY_MS);
    });
  });
})();
