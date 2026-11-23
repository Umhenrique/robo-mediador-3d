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

function setRobotStatus(label, emotion = 'warm', gesture = 'nod_gentle', activeWave = false) {
  el.robotStateText.textContent = label;
  el.waveformBars.classList.toggle('active', activeWave);
  el.statusDot.classList.toggle('listening', activeWave);
  robot3D.setEmotionAndGesture(emotion, gesture);

  // Aciona também o Arduino UNO R3 físico na porta USB (se estiver conectado)
  fetch('/api/arduino-gesture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gesture }),
  }).catch(() => {});
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

async function speakWithRobot(text, { emotion = 'warm', gesture = 'nod_gentle', statusLabel = 'Falando com você' } = {}) {
  if (!text) return;
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }

  setRobotStatus(statusLabel, emotion, gesture, true);
  robot3D.setSpeakingState(true);

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('TTS erro');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    state.currentAudio = audio;

    await new Promise((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  } catch {
    if ('speechSynthesis' in window) {
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        u.onend = resolve;
        u.onerror = resolve;
        window.speechSynthesis.speak(u);
      });
    }
  } finally {
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
// CAPTURA DE VOZ -> WAV 16kHz -> KOBOLDCPP WHISPER LOCAL
// ============================================================================
async function encodeAudioBlobToWav16kBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const channelData = audioBuffer.getChannelData(0);

  const wavBuffer = encodeWAV(channelData, audioBuffer.sampleRate);
  await audioCtx.close();

  let binary = '';
  const bytes = new Uint8Array(wavBuffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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
  if (state.isRecording && state.mediaRecorder) {
    state.mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    const recorder = new MediaRecorder(stream);
    state.mediaRecorder = recorder;
    state.isRecording = true;

    el.btnHoldToTalk.classList.add('recording');
    el.micBtnText.textContent = 'Ouvindo você...';
    setRobotStatus('Ouvindo você...', 'listening', 'nod_gentle', true);
    robot3D.setUserListeningState(true);

    // Detecção Automática de Silêncio (VAD) para parar naturalmente quando o usuário terminar de falar
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    let hasSpoken = false;
    let lastSpeechTime = performance.now();
    const recordStartTime = performance.now();
    const SILENCE_THRESHOLD = 14; // Nível RMS mínimo para considerar fala ativa
    const SILENCE_DURATION_MS = 1350; // Para naturalmente após ~1.35s de silêncio depois de falar
    const MAX_INITIAL_WAIT_MS = 7000; // Cancela se ninguém falar nada por 7s

    const vadInterval = setInterval(() => {
      if (!state.isRecording) {
        clearInterval(vadInterval);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avgVolume = sum / dataArray.length;
      const now = performance.now();

      if (avgVolume > SILENCE_THRESHOLD) {
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
      if (e.data.size > 0) state.audioChunks.push(e.data);
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
        const blob = new Blob(state.audioChunks, { type: recorder.mimeType || 'audio/webm' });
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

    recorder.start();
  } catch (err) {
    alert(`Microfone não disponível: ${err.message}`);
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

el.btnSendText.addEventListener('click', () => sendElderMessage(el.inputChatText.value));
el.inputChatText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendElderMessage(el.inputChatText.value);
});

el.btnFinishTalk.addEventListener('click', runFullConversationAnalysis);

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
  setRobotStatus('Pronto para ouvir', 'warm', 'nod_gentle', false);
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
