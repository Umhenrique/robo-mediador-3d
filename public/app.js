import { MediatorRobot3DScene } from './robot3d.js';

const state = {
  history: [],
  turnCount: 0,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  currentAudio: null,
  analysis: null,
  selectedOptionKey: 'requesting_support_direct',
  lastDelivery: null,
};

const el = {
  canvas3dContainer: document.getElementById('canvas3dContainer'),
  statusDot: document.getElementById('statusDot'),
  robotStateText: document.getElementById('robotStateText'),
  waveformBars: document.getElementById('waveformBars'),
  btnHoldToTalk: document.getElementById('btnHoldToTalk'),
  micBtnText: document.getElementById('micBtnText'),
  inputChatText: document.getElementById('inputChatText'),
  btnSendText: document.getElementById('btnSendText'),

  // Views da Folha Principal (Conceito 2)
  viewConversation: document.getElementById('viewConversation'),
  viewSummary: document.getElementById('viewSummary'),
  viewDelivered: document.getElementById('viewDelivered'),

  convEyebrow: document.getElementById('convEyebrow'),
  btnReplaySpeech: document.getElementById('btnReplaySpeech'),
  btnFinishTalk: document.getElementById('btnFinishTalk'),
  liveTranscriptText: document.getElementById('liveTranscriptText'),
  elderLastSpoken: document.getElementById('elderLastSpoken'),

  textareaFinalMessage: document.getElementById('textareaFinalMessage'),
  reportTopicBadge: document.getElementById('reportTopicBadge'),
  reportSupportBadge: document.getElementById('reportSupportBadge'),
  reportExecutiveText: document.getElementById('reportExecutiveText'),
  reportPainPointsList: document.getElementById('reportPainPointsList'),
  btnListenDraft: document.getElementById('btnListenDraft'),
  btnToggleTone: document.getElementById('btnToggleTone'),
  toneDrawer: document.getElementById('toneDrawer'),
  inputToneFeedback: document.getElementById('inputToneFeedback'),
  btnVoiceTone: document.getElementById('btnVoiceTone'),
  btnApplyTone: document.getElementById('btnApplyTone'),
  btnApproveAndSend: document.getElementById('btnApproveAndSend'),

  deliveredMessageText: document.getElementById('deliveredMessageText'),
  btnBackToEdit: document.getElementById('btnBackToEdit'),
  btnSimulateDelivery: document.getElementById('btnSimulateDelivery'),
  btnNewConversation: document.getElementById('btnNewConversation'),

  // Modal de Configurações & Cenários
  btnConnectArduinoWeb: document.getElementById('btnConnectArduinoWeb'),
  btnOpenSettings: document.getElementById('btnOpenSettings'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  settingsModal: document.getElementById('settingsModal'),
  inputElderName: document.getElementById('inputElderName'),
  inputRecipientName: document.getElementById('inputRecipientName'),
  selectElderGender: document.getElementById('selectElderGender'),
  selectNeuroticism: document.getElementById('selectNeuroticism'),
  selectRecipientRelation: document.getElementById('selectRecipientRelation'),
  llmModalStatus: document.getElementById('llmModalStatus'),
};

const robot3D = new MediatorRobot3DScene(el.canvas3dContainer);

function getProfile() {
  const rel = el.selectRecipientRelation.value;
  return {
    elderName: el.inputElderName.value.trim(),
    elderGender: el.selectElderGender.value,
    neuroticismLevel: el.selectNeuroticism.value,
    recipientName: el.inputRecipientName.value.trim(),
    recipientRelation: rel,
    recipientType: rel.includes('amigo') ? 'amigo' : 'familia',
  };
}

function syncNamesInUI() {
  const p = getProfile();
  el.convEyebrow.textContent = p.elderName ? `Conversa com ${p.elderName}` : 'Conversa com o Bento';
  document.querySelectorAll('.lblRecipientName').forEach((node) => {
    node.textContent = p.recipientName || 'a Família';
  });
}

el.inputElderName.addEventListener('input', syncNamesInUI);
el.inputRecipientName.addEventListener('input', syncNamesInUI);

function showSheetView(viewName) {
  el.viewConversation.classList.toggle('active', viewName === 'conversation');
  el.viewSummary.classList.toggle('active', viewName === 'summary');
  el.viewDelivered.classList.toggle('active', viewName === 'delivered');
}

// ============================================================================
// PONTE WEB SERIAL API DIRETA NO NAVEGADOR (PERMITE O GOOGLE COLAB CONTROLAR O ARDUINO LOCAL!)
// ============================================================================
// Quando o projeto está rodando na nuvem do Google Colab (link https://xxxx.trycloudflare.com),
// o servidor lá nos EUA não enxerga a porta USB do seu computador no laboratório.
// Usando a Web Serial API (navigator.serial) no Chrome/Edge, o próprio navegador conversa
// diretamente com a porta USB COM local do Arduino UNO R3 em tempo real!
let webSerialPort = null;
let webSerialWriter = null;

const GESTURE_TO_ARDUINO_CMD = {
  nod_gentle: 'G:nod',
  tilt_curious: 'G:care',
  lean_serious: 'G:serious',
  open_arms: 'G:care',
  wave_farewell: 'G:wave',
  bow_respect: 'G:serious',
  talk: 'G:talk',
  idle: 'G:idle',
};

async function openGrantedWebSerialPort(port, sendInitialNod = false) {
  try {
    if (!port.readable || !port.writable) {
      await port.open({ baudRate: 9600 });
    }
    const textEncoder = new TextEncoderStream();
    textEncoder.readable.pipeTo(port.writable).catch(() => {});
    webSerialWriter = textEncoder.writable.getWriter();
    webSerialPort = port;

    listenToArduinoSerialEvents(port);

    if (el.btnConnectArduinoWeb) {
      el.btnConnectArduinoWeb.classList.add('connected');
      el.btnConnectArduinoWeb.textContent = 'Arduino USB Conectado';
    }

    if (sendInitialNod) {
      setTimeout(() => {
        sendGestureToArduino('idle');
      }, 2200);
    }
    return true;
  } catch (err) {
    console.warn('[WebSerial] Falha ao abrir porta:', err.message);
    webSerialWriter = null;
    webSerialPort = null;
    return false;
  }
}

async function tryAutoReconnectWebSerial() {
  if (!('serial' in navigator) || webSerialWriter) return false;
  try {
    const grantedPorts = await navigator.serial.getPorts();
    if (grantedPorts && grantedPorts.length > 0) {
      return await openGrantedWebSerialPort(grantedPorts[0], false);
    }
  } catch {}
  return false;
}

async function connectWebSerialArduino() {
  if (!('serial' in navigator)) {
    alert('Seu navegador não suporta Web Serial API. Use o Google Chrome ou Microsoft Edge no PC onde o Arduino está plugado.');
    return;
  }

  // Se já estiver conectado, envia um aceno de teste
  if (webSerialWriter) {
    await sendGestureToArduino('nod_gentle');
    return;
  }

  try {
    const port = await navigator.serial.requestPort();
    await openGrantedWebSerialPort(port, true);

    port.addEventListener('disconnect', () => {
      webSerialWriter = null;
      webSerialPort = null;
      if (el.btnConnectArduinoWeb) {
        el.btnConnectArduinoWeb.classList.remove('connected');
        el.btnConnectArduinoWeb.textContent = 'Conectar Arduino USB';
      }
      // Tenta reconectar automaticamente caso tenha sido apenas oscilação rápida da USB
      setTimeout(() => {
        tryAutoReconnectWebSerial();
      }, 900);
    });
  } catch (err) {
    console.warn('[WebSerial] Conexão cancelada ou falhou:', err.message);
  }
}

async function listenToArduinoSerialEvents(port) {
  try {
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable).catch(() => {});
    const reader = textDecoder.readable.getReader();
    let lineBuffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      lineBuffer += value;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const raw of lines) {
        const evt = raw.trim();
        if (evt === 'BTN:TALK') {
          // Botão físico no Pino 2 do Arduino UNO foi pressionado: inicia/para gravação de voz!
          el.btnHoldToTalk.click();
        } else if (evt === 'BTN:TONE') {
          // Botão físico no Pino 3 do Arduino UNO foi pressionado: alterna entre os 4 tons do recado!
          el.btnToggleTone.click();
        } else if (evt === 'EVT:PRESENCE') {
          // Sensor Ultrassônico HC-SR04 detectou o idoso se aproximando (< 50cm)
          if (state.turnCount === 0 && !state.isRecording) {
            speakWithRobot(
              'Olá! Percebi que você chegou perto. Eu sou o Bento! Quando quiser conversar, é só apertar o botão de falar.',
              { emotion: 'warm', gesture: 'nod_gentle', statusLabel: 'Presença detectada' }
            );
          }
        }
      }
    }
  } catch (err) {
    console.warn('[WebSerial Reader] Encerrado:', err.message);
  }
}

async function sendGestureToArduino(gestureName) {
  const cmd = GESTURE_TO_ARDUINO_CMD[gestureName] || 'G:nod';

  // 1. Se o usuário conectou o Arduino pelo navegador (Web Serial API — funciona mesmo no Google Colab!)
  if (!webSerialWriter && 'serial' in navigator) {
    await tryAutoReconnectWebSerial();
  }
  if (webSerialWriter) {
    try {
      await webSerialWriter.write(`${cmd}\n`);
      return;
    } catch {
      webSerialWriter = null;
      webSerialPort = null;
      if (await tryAutoReconnectWebSerial() && webSerialWriter) {
        try {
          await webSerialWriter.write(`${cmd}\n`);
          return;
        } catch {}
      }
    }
  }

  // 2. Fallback: Se estiver rodando o servidor localmente no mesmo PC do Arduino
  fetch('/api/arduino-gesture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gesture: gestureName }),
  }).catch(() => {});
}

if (el.btnConnectArduinoWeb) {
  el.btnConnectArduinoWeb.addEventListener('click', connectWebSerialArduino);
}

function setRobotStatus(label, emotion = 'warm', gesture = 'nod_gentle', activeWave = false) {
  el.robotStateText.textContent = label;
  el.waveformBars.classList.toggle('active', activeWave);
  el.statusDot.classList.toggle('listening', activeWave);
  robot3D.setEmotionAndGesture(emotion, gesture);

  // Aciona o Arduino UNO R3 físico (via Web Serial no navegador se estiver no Colab, ou via backend local)
  sendGestureToArduino(gesture);
}

async function checkLLMHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.online) {
      el.llmModalStatus.textContent = `Online · ${data.model.split('/').pop()} (<= 6GB VRAM)`;
    } else {
      el.llmModalStatus.textContent = 'Offline (Verifique KoboldCpp na porta 5001)';
    }
  } catch {
    el.llmModalStatus.textContent = 'Servidor desconectado';
  }
}

// ============================================================================
// MOTOR DE ÁUDIO MOBILE-SAFE (Web Audio API Persistente + HTML5 Audio Unlocked)
// ============================================================================
// No Android e iOS, quando o VAD termina por silêncio (setInterval) + fetch(/api/stt) + fetch(/api/chat),
// a chamada final de TTS ocorre fora de um evento de toque ("user gesture").
// Um <audio> HTML5 que nunca deu .play() durante o toque é bloqueado com NotAllowedError.
// Já um AudioContext único que deu .resume() no toque do botão permanece "running" para sempre
// e toca qualquer Buffer MP3 assíncrono via decodeAudioData() com 100% de garantia no celular!
let ttsAudioCtx = null;
let currentBufferSource = null;
let sharedAudioPlayer = null;
let isHtmlAudioUnlocked = false;

const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function getOrCreateTtsAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ttsAudioCtx || ttsAudioCtx.state === 'closed') {
    ttsAudioCtx = new AudioCtx();
  }
  return ttsAudioCtx;
}

function unlockMobileAudio() {
  // 1. Destrava e mantém vivo o Web Audio Context principal
  try {
    const ctx = getOrCreateTtsAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {}

  // 2. Destrava também o elemento <audio> HTML5 dando .play() num WAV silencioso dentro do toque
  try {
    if (!sharedAudioPlayer) {
      sharedAudioPlayer = new Audio();
      sharedAudioPlayer.playsInline = true;
      sharedAudioPlayer.setAttribute('playsinline', '');
      sharedAudioPlayer.setAttribute('webkit-playsinline', '');
    }
    if (!isHtmlAudioUnlocked) {
      sharedAudioPlayer.src = SILENT_WAV_DATA_URI;
      sharedAudioPlayer.volume = 0.01;
      const p = sharedAudioPlayer.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          sharedAudioPlayer.pause();
          sharedAudioPlayer.volume = 1.0;
          isHtmlAudioUnlocked = true;
        }).catch(() => {});
      }
    }
  } catch {}
}

// Destrava automaticamente no primeiro toque ou clique em qualquer lugar da tela do celular
['touchstart', 'touchend', 'click', 'keydown'].forEach((evtName) => {
  window.addEventListener(evtName, unlockMobileAudio, { once: true, passive: true });
});

function stopCurrentRobotAudio() {
  if (currentBufferSource) {
    try {
      currentBufferSource.stop(0);
      currentBufferSource.disconnect();
    } catch {}
    currentBufferSource = null;
  }
  if (state.currentAudio) {
    try {
      state.currentAudio.pause();
    } catch {}
    state.currentAudio = null;
  }
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

async function speakWithRobot(text, { emotion = 'warm', gesture = 'nod_gentle', statusLabel = 'Falando com você' } = {}) {
  if (!text) return;
  stopCurrentRobotAudio();

  el.robotStateText.textContent = statusLabel;
  el.waveformBars.classList.add('active');
  el.statusDot.classList.add('listening');
  robot3D.setEmotionAndGesture(emotion, gesture);
  robot3D.setSpeakingState(true);

  let talkGestureTimer = null;
  const startPhysicalTalkSync = () => {
    sendGestureToArduino(gesture === 'wave_farewell' ? 'wave_farewell' : 'talk');
    if (talkGestureTimer) clearInterval(talkGestureTimer);
    talkGestureTimer = setInterval(() => {
      if (robot3D.isSpeaking) {
        sendGestureToArduino('talk');
      }
    }, 2600);
  };

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('TTS backend indisponivel');

    const arrayBuffer = await res.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength < 100) {
      throw new Error('Audio TTS vazio');
    }

    // CAMINHO 1 (PRIORITÁRIO PARA CELULAR E PC): Reproduz via Web Audio API (ttsAudioCtx)
    // Como ttsAudioCtx foi resumido no toque do usuário, ele NUNCA sofre bloqueio de autoplay após o VAD/fetch!
    const ctx = getOrCreateTtsAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      // Faz uma cópia do buffer caso precise de fallback para HTML5 Audio
      const bufferCopy = arrayBuffer.slice(0);
      const decodedBuffer = await ctx.decodeAudioData(bufferCopy);

      await new Promise((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(ctx.destination);
        currentBufferSource = source;
        source.onended = () => {
          if (currentBufferSource === source) currentBufferSource = null;
          resolve();
        };
        startPhysicalTalkSync();
        source.start(0);
      });
      return;
    }

    // CAMINHO 2 (FALLBACK HTML5 AUDIO): Caso o navegador não suporte decodeAudioData
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = sharedAudioPlayer || new Audio();
    audio.volume = 1.0;
    audio.src = url;
    audio.playsInline = true;
    state.currentAudio = audio;

    await new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      startPhysicalTalkSync();
      audio.play().catch((err) => {
        URL.revokeObjectURL(url);
        reject(err);
      });
    });
  } catch {
    // CAMINHO 3 (FALLBACK NATIVO DO CELULAR/WINDOWS): Voz sintetizada local pt-BR
    if ('speechSynthesis' in window) {
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        u.onend = resolve;
        u.onerror = resolve;
        startPhysicalTalkSync();
        window.speechSynthesis.speak(u);
      });
    }
  } finally {
    if (talkGestureTimer) clearInterval(talkGestureTimer);
    robot3D.setSpeakingState(false);
    setRobotStatus('Pronto para ouvir', emotion, 'idle', false);
  }
}

async function sendElderMessage(text) {
  const clean = (text || '').trim();
  if (!clean) return;

  el.inputChatText.value = '';
  const profile = getProfile();
  showSheetView('conversation');

  robot3D.triggerPauseNod();

  state.history.push({ role: 'user', content: clean });
  state.turnCount += 1;

  el.elderLastSpoken.style.display = 'block';
  el.elderLastSpoken.textContent = `Você disse: "${clean}"`;
  el.btnFinishTalk.style.display = 'inline-block';

  setRobotStatus('Compreendendo...', 'listening', 'nod_gentle', true);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: state.history.slice(0, -1),
        userMessage: clean,
        profile,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    state.history.push({ role: 'assistant', content: data.reply });
    el.liveTranscriptText.textContent = data.reply;

    await speakWithRobot(data.reply, {
      emotion: data.emotion || 'empathetic',
      gesture: data.gesture || 'nod_gentle',
    });

    if (data.shouldEndConversation) {
      await runFullConversationAnalysis();
    }
  } catch (err) {
    el.liveTranscriptText.textContent = `Não consegui processar agora: ${err.message}`;
    setRobotStatus('Pronto para ouvir', 'warm', 'idle', false);
  }
}

async function runFullConversationAnalysis() {
  if (state.history.length === 0) return;
  const profile = getProfile();

  showSheetView('summary');
  el.reportTopicBadge.textContent = 'Analisando conversa...';
  el.reportSupportBadge.textContent = 'Aguarde';
  el.reportExecutiveText.textContent = 'O Bento está organizando os pontos principais do que você conversou...';
  el.reportPainPointsList.innerHTML = '';
  el.textareaFinalMessage.value = 'Gerando opções de mensagem para a família...';
  autoResizeTextarea();
  setRobotStatus('Criando relatório e recado...', 'serious', 'lean_serious', true);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: state.history,
        profile,
      }),
    });

    const analysis = await res.json();
    if (analysis.error) throw new Error(analysis.error);

    state.analysis = analysis;

    // Preenche o Relatório Estruturado da Conversa
    el.reportTopicBadge.textContent = analysis.topicLabel || 'Resumo da Conversa';
    el.reportSupportBadge.textContent = analysis.aversionAnalysis?.supportNeeded || 'Apoio Familiar';
    el.reportExecutiveText.textContent = analysis.executiveSummary || '';

    el.reportPainPointsList.innerHTML = '';
    (analysis.painPoints || []).forEach((pt) => {
      const li = document.createElement('li');
      li.textContent = pt;
      el.reportPainPointsList.appendChild(li);
    });

    const optionsObj = analysis.messageOptions || {};
    const recKey = analysis.recommendedCategory && optionsObj[analysis.recommendedCategory]
      ? analysis.recommendedCategory
      : 'requesting_support_direct';

    selectMessageOption(recKey);

    const elderVocative = profile.elderName ? `${profile.elderName}, preparei` : 'Preparei';
    const recipientTarget = profile.recipientName || 'a sua família';
    await speakWithRobot(
      `${elderVocative} o resumo e o recado para ${recipientTarget}. Você pode escolher qualquer um dos 4 tons ali embaixo ou me pedir para mudar como preferir.`,
      { emotion: 'warm', gesture: 'open_arms' }
    );
  } catch (err) {
    el.textareaFinalMessage.value = `Erro ao gerar resumo: ${err.message}`;
    setRobotStatus('Pronto para ouvir', 'warm', 'idle', false);
  }
}

function autoResizeTextarea() {
  el.textareaFinalMessage.style.height = 'auto';
  el.textareaFinalMessage.style.height = `${el.textareaFinalMessage.scrollHeight}px`;
}

el.textareaFinalMessage.addEventListener('input', autoResizeTextarea);

function selectMessageOption(optionKey) {
  if (!state.analysis?.messageOptions) return;
  const opt = state.analysis.messageOptions[optionKey];
  if (!opt) return;

  state.selectedOptionKey = optionKey;
  el.textareaFinalMessage.value = opt.text;
  autoResizeTextarea();

  document.querySelectorAll('.tone-pill').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.optionKey === optionKey);
  });

  const gestureByAttitude = {
    serious: { emotion: 'serious', gesture: 'lean_serious' },
    anxious_care: { emotion: 'anxious_care', gesture: 'open_arms' },
    calm: { emotion: 'listening', gesture: 'tilt_curious' },
    optimistic: { emotion: 'optimistic', gesture: 'nod_gentle' },
    warm: { emotion: 'warm', gesture: 'nod_gentle' },
  };
  const g = gestureByAttitude[opt.robotAttitude] || gestureByAttitude.warm;
  robot3D.setEmotionAndGesture(g.emotion, g.gesture);
  sendGestureToArduino(g.gesture);
}

async function applyCustomTone(feedbackText) {
  const currentMessage = el.textareaFinalMessage.value.trim();
  if (!currentMessage || !feedbackText) return;

  const profile = getProfile();
  el.btnApplyTone.disabled = true;
  el.btnApplyTone.textContent = '...';
  setRobotStatus('Ajustando o tom...', 'empathetic', 'tilt_curious', true);

  try {
    const res = await fetch('/api/refine-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentMessage,
        elderFeedback: feedbackText,
        profile,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    el.textareaFinalMessage.value = data.refinedMessage;
    autoResizeTextarea();
    el.inputToneFeedback.value = '';

    await speakWithRobot(data.robotConfirmationSpeech, {
      emotion: data.robotAttitude || 'warm',
      gesture: 'nod_gentle',
    });
  } catch (err) {
    alert(`Erro ao ajustar tom: ${err.message}`);
  } finally {
    el.btnApplyTone.disabled = false;
    el.btnApplyTone.textContent = 'Ajustar';
    setRobotStatus('Pronto para ouvir', 'warm', 'idle', false);
  }
}

async function approveAndSend() {
  const finalMessage = el.textareaFinalMessage.value.trim();
  if (!finalMessage) return;

  const profile = getProfile();
  const opt = state.analysis?.messageOptions?.[state.selectedOptionKey] || {};

  try {
    const res = await fetch('/api/approve-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        finalMessage,
        selectedOptionKey: state.selectedOptionKey,
        robotAttitude: opt.robotAttitude || 'serious',
        analysisSummary: state.analysis?.executiveSummary || '',
        profile,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    state.lastDelivery = data.delivery;
    el.deliveredMessageText.textContent = finalMessage;
    showSheetView('delivered');

    const elderVocative = profile.elderName ? `Pronto, ${profile.elderName}.` : 'Pronto!';
    const recipientTarget = profile.recipientName || 'a sua família';
    await speakWithRobot(
      `${elderVocative} Enviei o recado para ${recipientTarget}.`,
      { emotion: 'optimistic', gesture: 'bow_respect', statusLabel: 'Recado enviado' }
    );
  } catch (err) {
    alert(`Erro ao enviar: ${err.message}`);
  }
}

// ============================================================================
// CAPTURA DE VOZ (COMPATÍVEL COM CELULAR ANDROID/iOS E DESKTOP) -> WAV 16kHz -> WHISPER
// ============================================================================
function resampleFloat32To16k(inputSamples, inputSampleRate) {
  if (inputSampleRate === 16000) return inputSamples;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(inputSamples.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = inputSamples[idx] || 0;
    const s1 = inputSamples[Math.min(idx + 1, inputSamples.length - 1)] || 0;
    result[i] = s0 + frac * (s1 - s0);
  }
  return result;
}

async function encodeAudioBlobToWav16kBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  // No celular (iOS/Android), criar AudioContext sem forçar sampleRate evita DOMException
  const audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume().catch(() => {});
  }
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const rawChannelData = audioBuffer.getChannelData(0);
  const resampled16k = resampleFloat32To16k(rawChannelData, audioBuffer.sampleRate);

  const wavBuffer = encodeWAV(resampled16k, 16000);
  await audioCtx.close().catch(() => {});

  let binary = '';
  const bytes = new Uint8Array(wavBuffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function getSupportedRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/aac',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

async function toggleVoiceRecording(onTranscribedCallback) {
  unlockMobileAudio();

  if (state.isRecording && state.mediaRecorder) {
    try {
      state.mediaRecorder.stop();
    } catch {}
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    state.audioChunks = [];
    const chosenMime = getSupportedRecorderMimeType();
    const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
    state.mediaRecorder = recorder;
    state.isRecording = true;

    el.btnHoldToTalk.classList.add('recording');
    el.micBtnText.textContent = 'Ouvindo você...';
    setRobotStatus('Ouvindo você...', 'listening', 'nod_gentle', true);
    robot3D.setUserListeningState(true);

    // Detecção Automática de Silêncio (VAD) usando TimeDomain RMS (funciona em Android, iOS e Desktop)
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const timeData = new Uint8Array(analyser.fftSize);

    let hasSpoken = false;
    let lastSpeechTime = performance.now();
    const recordStartTime = performance.now();
    const RMS_SPEECH_THRESHOLD = 0.022; // Sensibilidade calibrada para microfone de celular e PC
    const SILENCE_DURATION_MS = 1450; // Para naturalmente após ~1.45s de silêncio depois de falar
    const MAX_INITIAL_WAIT_MS = 8000; // Cancela se ninguém falar nada por 8s

    const vadInterval = setInterval(() => {
      if (!state.isRecording) {
        clearInterval(vadInterval);
        return;
      }
      analyser.getByteTimeDomainData(timeData);
      let sumSquares = 0;
      for (let i = 0; i < timeData.length; i++) {
        const normalized = (timeData[i] - 128) / 128.0;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / timeData.length);
      const now = performance.now();

      if (rms > RMS_SPEECH_THRESHOLD) {
        hasSpoken = true;
        lastSpeechTime = now;
      } else if (hasSpoken && now - lastSpeechTime > SILENCE_DURATION_MS) {
        clearInterval(vadInterval);
        if (recorder.state === 'recording') recorder.stop();
      } else if (!hasSpoken && now - recordStartTime > MAX_INITIAL_WAIT_MS) {
        clearInterval(vadInterval);
        if (recorder.state === 'recording') recorder.stop();
      }
    }, 90);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) state.audioChunks.push(e.data);
    };

    recorder.onstop = async () => {
      clearInterval(vadInterval);
      audioCtx.close().catch(() => {});
      stream.getTracks().forEach((t) => t.stop());
      state.isRecording = false;
      el.btnHoldToTalk.classList.remove('recording');
      el.micBtnText.textContent = 'Compreendendo...';
      robot3D.setUserListeningState(false);

      try {
        const actualMime = recorder.mimeType || chosenMime || 'audio/webm';
        const blob = new Blob(state.audioChunks, { type: actualMime });
        if (blob.size < 400) {
          return;
        }
        const wavBase64 = await encodeAudioBlobToWav16kBase64(blob);

        const res = await fetch('/api/stt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: wavBase64, lang: 'pt' }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (data.text) {
          await onTranscribedCallback(data.text);
        }
      } catch (err) {
        alert(`Erro no microfone/STT: ${err.message}`);
      } finally {
        el.micBtnText.textContent = 'Falar com o Bento';
        setRobotStatus('Pronto para ouvir', 'warm', 'idle', false);
      }
    };

    // Passar timeslice (250ms) garante que chunks sejam coletados continuamente no iOS e Android
    recorder.start(250);
  } catch (err) {
    alert(`Microfone não disponível (use o link HTTPS no celular): ${err.message}`);
  }
}

// ============================================================================
// EVENTOS DE INTERFACE
// ============================================================================
el.btnHoldToTalk.addEventListener('click', () => {
  toggleVoiceRecording(async (text) => {
    await sendElderMessage(text);
  });
});

el.btnSendText.addEventListener('click', () => {
  unlockMobileAudio();
  sendElderMessage(el.inputChatText.value);
});
el.inputChatText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    unlockMobileAudio();
    sendElderMessage(el.inputChatText.value);
  }
});

el.btnFinishTalk.addEventListener('click', runFullConversationAnalysis);

if (el.btnReplaySpeech) {
  el.btnReplaySpeech.addEventListener('click', () => {
    unlockMobileAudio();
    const txt = el.liveTranscriptText.textContent.trim();
    if (txt) {
      speakWithRobot(txt, { emotion: 'warm', gesture: 'nod_gentle' });
    }
  });
}

const TONE_KEYS_ORDER = [
  'concealing_speculation',
  'requesting_support_direct',
  'concealing_common',
  'recording_faithful',
];

el.btnToggleTone.addEventListener('click', () => {
  if (!state.analysis?.messageOptions) return;
  const currentIdx = TONE_KEYS_ORDER.indexOf(state.selectedOptionKey);
  const nextKey = TONE_KEYS_ORDER[(currentIdx + 1) % TONE_KEYS_ORDER.length];
  selectMessageOption(nextKey);
});

document.querySelectorAll('.tone-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectMessageOption(btn.dataset.optionKey);
  });
});

el.btnApplyTone.addEventListener('click', () => {
  applyCustomTone(el.inputToneFeedback.value.trim());
});

el.inputToneFeedback.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyCustomTone(el.inputToneFeedback.value.trim());
});

el.btnVoiceTone.addEventListener('click', () => {
  toggleVoiceRecording(async (text) => {
    el.inputToneFeedback.value = text;
    await applyCustomTone(text);
  });
});

el.btnListenDraft.addEventListener('click', () => {
  speakWithRobot(el.textareaFinalMessage.value.trim(), {
    emotion: 'warm',
    gesture: 'open_arms',
    statusLabel: 'Lendo recado',
  });
});

el.btnApproveAndSend.addEventListener('click', approveAndSend);

el.btnBackToEdit.addEventListener('click', () => showSheetView('summary'));

el.btnSimulateDelivery.addEventListener('click', () => {
  const msg = el.deliveredMessageText.textContent.trim();
  const attitude = state.lastDelivery?.robotAttitude || 'serious';
  const gesture = attitude === 'serious' ? 'lean_serious' : 'open_arms';
  speakWithRobot(msg, {
    emotion: attitude,
    gesture,
    statusLabel: `Transmitindo para ${getProfile().recipientName}`,
  });
});

function resetSession() {
  state.history = [];
  state.turnCount = 0;
  state.analysis = null;
  syncNamesInUI();
  showSheetView('conversation');
  el.elderLastSpoken.style.display = 'none';
  el.btnFinishTalk.style.display = 'none';

  const p = getProfile();
  const greeting = p.elderName
    ? `Olá, ${p.elderName}! Eu sou o Bento. Como você está se sentindo hoje?`
    : 'Olá! Eu sou o Bento. Como você está se sentindo hoje?';
  state.history.push({ role: 'assistant', content: greeting });
  el.liveTranscriptText.textContent = greeting;
  setRobotStatus('Pronto para ouvir', 'warm', 'idle', false);
}

el.btnNewConversation.addEventListener('click', resetSession);

// Modal de Cenários e Configurações
el.btnOpenSettings.addEventListener('click', () => {
  checkLLMHealth();
  el.settingsModal.style.display = 'flex';
});

el.btnCloseSettings.addEventListener('click', () => {
  el.settingsModal.style.display = 'none';
});

el.settingsModal.addEventListener('click', (e) => {
  if (e.target === el.settingsModal) el.settingsModal.style.display = 'none';
});

const DEMO_SCENARIOS = {
  saude: 'Bento, ultimamente meu joelho e minhas costas estão doendo tanto para levantar da cama, e o remédio acabou ontem. Mas a Mariana anda trabalhando tanto que tenho vergonha de reclamar e dar trabalho pra ela.',
  financas: 'Olha Bento, minha aposentadoria esse mês não deu pra cobrir a conta de luz e os remédios da pressão que subiram muito. Mas fico sem jeito de falar de dinheiro com a família.',
  isolamento: 'A casa fica tão silenciosa a semana inteira, Bento... Faz quase três semanas que ninguém aparece aqui para tomar um café comigo. Eu sinto muita saudade, mas não quero parecer carente.',
  sentido_vida: 'Às vezes eu acordo e fico pensando que não tenho mais muita serventia, sabe? Tenho medo de ser apenas um peso para os meus filhos.',
  despedida: 'Muito obrigado por me escutar com tanta paciência hoje, Bento. Já desabafei tudo o que estava guardado, agora vou descansar. Pode preparar o recado para a Mariana, tchau!',
};

document.querySelectorAll('[data-scenario]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.scenario;
    el.settingsModal.style.display = 'none';
    if (DEMO_SCENARIOS[key]) {
      sendElderMessage(DEMO_SCENARIOS[key]);
    }
  });
});

document.querySelectorAll('[data-gesture]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const gesture = btn.dataset.gesture;
    const emotion = btn.dataset.emotion;
    el.settingsModal.style.display = 'none';
    setRobotStatus(`Postura: ${btn.textContent}`, emotion, gesture, false);
  });
});

resetSession();
checkLLMHealth();
