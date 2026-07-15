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

    measure();
    applyTransform(baseTranslateForPos(trackPos), false);
    renderActiveStates();
  }

  document.querySelectorAll('[data-carousel]').forEach(initCarousel);

  // ==========================================================================
  // Overlay dos slides de vídeo (Panda Video) — iframes têm contexto de
  // eventos próprio e "engolem" o gesto de arrastar do carrossel, e não dá
  // pra "vazar" um clique pra dentro de um iframe cross-origin depois que o
  // gesto já começou (o roteamento do clique real é decidido no mousedown,
  // não pode ser redirecionado via pointer-events depois). Por isso: o
  // overlay sempre captura o toque (permitindo o arrasto do carrossel
  // funcionar normalmente), e quando o gesto é um TAP (sem movimento),
  // chamamos o método play() do player diretamente pela API do Panda, em
  // vez de tentar repassar o clique pro iframe.
  // ==========================================================================
  function initVideoOverlay(overlay) {
    var TAP_THRESHOLD = 6;
    var playerId = overlay.getAttribute('data-video-overlay');
    var startX = 0;
    var startY = 0;
    var pressed = false;
    var moved = false;

    function onStart(x, y) {
      pressed = true;
      moved = false;
      startX = x;
      startY = y;
    }

    function onMove(x, y) {
      if (!pressed) return;
      if (Math.abs(x - startX) > TAP_THRESHOLD || Math.abs(y - startY) > TAP_THRESHOLD) {
        moved = true;
      }
    }

    function onEnd() {
      if (!pressed) return;
      pressed = false;
      if (!moved) {
        var player = window.pandaPlayers && window.pandaPlayers[playerId];
        if (!player) return;
        // toggle: se estiver pausado, dá play; se estiver tocando, pausa
        if (typeof player.isPaused === 'function' && !player.isPaused()) {
          if (typeof player.pause === 'function') player.pause();
        } else if (typeof player.play === 'function') {
          player.play();
        }
      }
    }

    overlay.addEventListener('touchstart', function (e) {
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    overlay.addEventListener('touchmove', function (e) {
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    overlay.addEventListener('touchend', onEnd);
    overlay.addEventListener('touchcancel', onEnd);

    overlay.addEventListener('mousedown', function (e) {
      onStart(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', function (e) {
      onMove(e.clientX, e.clientY);
    });
    document.addEventListener('mouseup', onEnd);
  }

  document.querySelectorAll('[data-video-overlay]').forEach(initVideoOverlay);

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
  // CTAs que rolam suavemente até a seção de preço (em vez de ir direto pro
  // checkout). Usa o Lenis (já usado na página) quando disponível, pra manter
  // a mesma suavidade do resto do scroll; cai pro scrollIntoView nativo como
  // fallback caso o Lenis não tenha carregado por algum motivo.
  // ==========================================================================
  document.querySelectorAll('[data-scroll-to]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var target = document.querySelector(link.getAttribute('data-scroll-to'));
      if (!target) return;
      event.preventDefault();
      if (window.lenis && typeof window.lenis.scrollTo === 'function') {
        window.lenis.scrollTo(target, { offset: 0 });
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
})();
