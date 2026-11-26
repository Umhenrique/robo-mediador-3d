import express from 'express';
import cors from 'cors';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { sendArduinoGesture, detectArduinoPort } from './arduinoBridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3030;
const KOBOLD_URL = process.env.KOBOLD_URL || 'http://127.0.0.1:5001';
const EDGE_VOICE_ROBOT = process.env.EDGE_VOICE_ROBOT || 'pt-BR-ThalitaMultilingualNeural';
const EDGE_VOICE_DELIVERY = process.env.EDGE_VOICE_DELIVERY || 'pt-BR-AntonioNeural';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Armazenamento em memória e em disco dos logs de sessão e mensagens entregues à família
const SESSIONS_FILE = path.join(__dirname, '..', 'sessions_log.json');
let familyInbox = [];

async function saveSessionLog(sessionData) {
  try {
    let existing = [];
    try {
      const raw = await fs.readFile(SESSIONS_FILE, 'utf-8');
      existing = JSON.parse(raw);
    } catch {
      existing = [];
    }
    existing.unshift({
      id: `sess_${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...sessionData,
    });
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(existing.slice(0, 50), null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar log de sessão:', err.message);
  }
}

/**
 * 1. Health check do LLM local (KoboldCpp <= 6GB VRAM + Whisper)
 */
app.get('/api/health', async (req, res) => {
  try {
    const r = await fetch(`${KOBOLD_URL}/api/v1/model`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    res.json({
      online: true,
      koboldUrl: KOBOLD_URL,
      model: data.result || 'Qwen2.5-7B-Instruct-Q4_K_M',
      vramTarget: '<= 6GB VRAM (Q4_K_M + Whisper Small Q5_1)',
      ttsVoice: EDGE_VOICE_ROBOT,
    });
  } catch (err) {
    res.json({
      online: false,
      koboldUrl: KOBOLD_URL,
      error: err.message,
    });
  }
});

/**
 * 2. STT Local via Whisper embutido no KoboldCpp (/api/extra/transcribe)
 */
app.post('/api/stt', async (req, res) => {
  try {
    const { audioBase64, lang = 'pt' } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 ausente' });
    }

    const formatted = audioBase64.startsWith('data:')
      ? audioBase64
      : `data:audio/wav;base64,${audioBase64}`;

    const r = await fetch(`${KOBOLD_URL}/api/extra/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_data: formatted,
        lang,
        suppress_non_speech: true,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`KoboldCpp Whisper STT retornou ${r.status}: ${txt}`);
    }

    const data = await r.json();
    res.json({ text: (data.text || '').trim() });
  } catch (err) {
    console.error('[STT Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. TTS Neural em Português Brasileiro (0 MB VRAM, alta naturalidade)
 *    - Mantém conexão WebSocket persistente com a Microsoft (evita ~500ms de handshake TLS por frase)
 *    - Cache LRU em memória + deduplicação de sínteses em andamento (inFlightTTS)
 */
const ttsIdlePoolByVoice = new Map();
const ttsAudioCache = new Map();
const inFlightTTS = new Map();
const TTS_CACHE_MAX_ITEMS = 120;
const TTS_MAX_POOL_PER_VOICE = 3;

export function cleanTextForTTS(text) {
  return (text || '')
    .replace(/\[TAG:[^\]]*\]/gi, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`~#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanReplyCrutches(replyText) {
  if (!replyText) return '';
  let cleaned = replyText
    .replace(/^(Eu\s+)?(entendo|compreendo)(\s+perfeitamente|\s+muito\s+bem)?[,.\s]+/i, '')
    .trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

export function splitTextIntoTtsSentences(text) {
  const clean = cleanTextForTTS(text);
  if (!clean) return [];
  const rawParts = clean
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawParts.length <= 1) return [clean];

  // Agrupa fragmentos muito curtos (< 18 chars, ex: "Oi!") com a frase seguinte para manter a prosódia natural
  const merged = [];
  let buffer = '';
  for (const part of rawParts) {
    if (!buffer) {
      buffer = part;
    } else if (buffer.length < 18) {
      buffer = `${buffer} ${part}`;
    } else {
      merged.push(buffer);
      buffer = part;
    }
  }
  if (buffer) merged.push(buffer);
  return merged;
}

async function prewarmTtsPool(voiceName = EDGE_VOICE_ROBOT, count = 2) {
  const pool = ttsIdlePoolByVoice.get(voiceName) || [];
  const needed = Math.max(0, count - pool.length);
  await Promise.all(
    Array.from({ length: needed }, async () => {
      try {
        const client = new MsEdgeTTS({ connectionTimeoutMs: 5000 });
        await client.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        releaseTtsClient(voiceName, client, false);
      } catch {}
    })
  );
}

async function acquireTtsClient(voiceName, forceFresh = false) {
  const pool = ttsIdlePoolByVoice.get(voiceName) || [];
  let client = null;
  if (!forceFresh && pool.length > 0) {
    client = pool.pop();
  } else {
    client = new MsEdgeTTS({ connectionTimeoutMs: 5000 });
  }
  await client.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  return client;
}

function releaseTtsClient(voiceName, client, discard = false) {
  if (!client) return;
  if (discard) {
    try {
      client.close();
    } catch {}
    return;
  }
  let pool = ttsIdlePoolByVoice.get(voiceName);
  if (!pool) {
    pool = [];
    ttsIdlePoolByVoice.set(voiceName, pool);
  }
  if (pool.length < TTS_MAX_POOL_PER_VOICE) {
    pool.push(client);
  } else {
    try {
      client.close();
    } catch {}
  }
}

async function synthesizeBufferWithRetry(cleanText, chosenVoice, rate = '+0%', pitch = '+0Hz') {
  for (let attempt = 0; attempt < 2; attempt++) {
    let tts = null;
    try {
      tts = await acquireTtsClient(chosenVoice, attempt > 0);
      const { audioStream } = tts.toStream(cleanText, { rate, pitch });
      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      if (audioBuffer.length < 64) {
        throw new Error('Buffer TTS vazio');
      }
      releaseTtsClient(chosenVoice, tts, false);
      return audioBuffer;
    } catch (err) {
      releaseTtsClient(chosenVoice, tts, true);
      if (attempt === 1) throw err;
    }
  }
}

export async function getOrSynthesizeTTS(text, { voice, rate = '+0%', pitch = '+0Hz' } = {}) {
  const cleanText = cleanTextForTTS(text);
  if (!cleanText) return null;

  const chosenVoice = voice || EDGE_VOICE_ROBOT;
  const cacheKey = `${chosenVoice}|${rate}|${pitch}|${cleanText}`;

  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey);
  }

  if (inFlightTTS.has(cacheKey)) {
    return inFlightTTS.get(cacheKey);
  }

  const synthPromise = synthesizeBufferWithRetry(cleanText, chosenVoice, rate, pitch)
    .then((buf) => {
      if (ttsAudioCache.size >= TTS_CACHE_MAX_ITEMS) {
        const oldestKey = ttsAudioCache.keys().next().value;
        ttsAudioCache.delete(oldestKey);
      }
      ttsAudioCache.set(cacheKey, buf);
      return buf;
    })
    .finally(() => {
      inFlightTTS.delete(cacheKey);
    });

  inFlightTTS.set(cacheKey, synthPromise);
  return synthPromise;
}

async function buildPreSynthesizedTtsChunks(replyText, voice = EDGE_VOICE_ROBOT, firstChunkTimeoutMs = 650) {
  const sentences = splitTextIntoTtsSentences(replyText);
  if (sentences.length === 0) return [];

  // Dispara todas as frases em paralelo no servidor (reaproveitando qualquer frase que já iniciou durante o stream do KoboldCpp!)
  const promises = sentences.map((s) =>
    getOrSynthesizeTTS(s, { voice }).catch((err) => {
      console.warn('[Pre-TTS Warning]', err.message);
      return null;
    })
  );

  // Aguarda a 1ª frase ficar pronta (geralmente já terminou enquanto o Kobold gerava o resto do JSON!)
  const firstBuf = await Promise.race([
    promises[0],
    new Promise((resolve) => setTimeout(() => resolve(null), firstChunkTimeoutMs)),
  ]);

  const chunks = [];
  for (let i = 0; i < sentences.length; i++) {
    let buf = null;
    if (i === 0) {
      buf = firstBuf;
    } else {
      // Se as frases seguintes já tiverem terminado (ou terminarem em 35ms), já envia junto!
      buf = await Promise.race([
        promises[i],
        new Promise((resolve) => setTimeout(() => resolve(null), 35)),
      ]);
    }
    chunks.push({
      text: sentences[i],
      audioBase64: buf ? buf.toString('base64') : null,
    });
  }
  return chunks;
}

app.post('/api/tts', async (req, res) => {
  const { text, voice, rate = '+0%', pitch = '+0Hz' } = req.body;
  const cleanText = cleanTextForTTS(text);
  if (!cleanText) {
    return res.status(400).json({ error: 'Texto vazio para TTS' });
  }

  try {
    const audioBuffer = await getOrSynthesizeTTS(cleanText, { voice, rate, pitch });
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
    });
    res.send(audioBuffer);
  } catch (err) {
    console.error('[TTS Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper para chamar o LLM local no KoboldCpp (/v1/chat/completions)
 * Suporta modo streaming SSE (onPartialText) para iniciar o TTS da 1ª frase
 * ENQUANTO o KoboldCpp ainda está gerando a 2ª frase e os campos finais do JSON!
 */
async function callLocalLLM(messages, { maxTokens = 260, temperature = 0.65, stream = false, onPartialText = null } = {}) {
  const payload = {
    messages,
    stream: Boolean(stream),
    max_tokens: maxTokens,
    temperature,
    stop: ['\nIdoso:', '\nUsuário:', '\nUser:', '<|im_end|>'],
  };

  const r = await fetch(`${KOBOLD_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`LLM KoboldCpp erro (${r.status}): ${errText}`);
  }

  const contentType = (r.headers.get('content-type') || '').toLowerCase();
  if (!stream || !contentType.includes('text/event-stream') || !r.body) {
    const data = await r.json();
    const content = (data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '').trim();
    if (onPartialText && content) {
      try {
        onPartialText(content);
      } catch {}
    }
    return content;
  }

  // Leitura completa do stream SSE até o fim (preserva 100% dos campos do JSON!)
  const decoder = new TextDecoder('utf-8');
  let sseBuffer = '';
  let accumulatedText = '';

  for await (const rawChunk of r.body) {
    sseBuffer += decoder.decode(rawChunk, { stream: true });
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;

      try {
        const parsedChunk = JSON.parse(dataStr);
        const delta =
          parsedChunk.choices?.[0]?.delta?.content ??
          parsedChunk.choices?.[0]?.message?.content ??
          parsedChunk.choices?.[0]?.text ??
          parsedChunk.token ??
          '';
        if (delta) {
          accumulatedText += delta;
          if (onPartialText) {
            try {
              onPartialText(accumulatedText);
            } catch {}
          }
        }
      } catch {
        // Ignora linhas SSE parciais não-JSON
      }
    }
  }

  return accumulatedText.trim();
}

/**
 * Monitora o JSON parcial durante o stream do KoboldCpp e dispara em background
 * a síntese TTS da 1ª frase assim que o ponto final dela aparece (enquanto o LLM
 * ainda gera o resto da resposta e os campos emotion, gesture, detectedTopic, etc.)
 */
function createEarlyReplyTtsTrigger(voice = EDGE_VOICE_ROBOT) {
  let triggeredSentencesCount = 0;
  let replyCompletedTriggered = false;

  const unescapeJsonPartial = (raw) => {
    try {
      return JSON.parse(`"${raw}"`);
    } catch {
      return raw.replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\');
    }
  };

  return (partialJsonText) => {
    if (replyCompletedTriggered) return;

    // Verifica se o campo "reply": "..." já fechou as aspas
    const closedMatch = partialJsonText.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (closedMatch) {
      replyCompletedTriggered = true;
      const fullReply = cleanReplyCrutches(unescapeJsonPartial(closedMatch[1]));
      const sentences = splitTextIntoTtsSentences(fullReply);
      for (let i = triggeredSentencesCount; i < sentences.length; i++) {
        getOrSynthesizeTTS(sentences[i], { voice }).catch(() => {});
      }
      triggeredSentencesCount = sentences.length;
      return;
    }

    // Campo "reply" ainda está aberto sendo gerado token a token:
    const openMatch = partialJsonText.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)$/);
    if (!openMatch) return;

    const currentReply = cleanReplyCrutches(unescapeJsonPartial(openMatch[1]));
    const sentences = splitTextIntoTtsSentences(currentReply);
    // Quando há pelo menos 2 segmentos, todos exceto o último já terminaram sua pontuação (. ? !)
    if (sentences.length > 1) {
      for (let i = triggeredSentencesCount; i < sentences.length - 1; i++) {
        getOrSynthesizeTTS(sentences[i], { voice }).catch(() => {});
        triggeredSentencesCount = i + 1;
      }
    }
  };
}

/**
 * Extrai JSON seguro de uma resposta de LLM local
 */
function extractJSON(rawText, fallbackObj) {
  try {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : rawText;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    return JSON.parse(candidate);
  } catch (err) {
    console.warn('[JSON Parse Fallback]', err.message);
    return fallbackObj;
  }
}

/**
 * 4. Chat Empático e Investigação Não-Invasiva com Detecção de Encerramento e Emoção/Postura 3D
 */
app.post('/api/chat', async (req, res) => {
  try {
    const {
      history = [],
      userMessage = '',
      profile = {},
    } = req.body;

    const elderName = (profile.elderName || '').trim();
    const recipientName = (profile.recipientName || '').trim();
    const recipientRelation = profile.recipientRelation || 'familiar';

    const elderRef = elderName || 'a pessoa idosa';
    const recipientRef = recipientName ? `${recipientName} (${recipientRelation})` : `a família (${recipientRelation})`;

    // Detecção heurística + semântica de despedida / encerramento
    const farewellRegex = /\b(tchau|até logo|até mais|vou descansar|vou dormir|por hoje é só|pode encerrar|vamos encerrar|já falei tudo|obrigado por ouvir|obrigada por ouvir|vou desligar|encerrar conversa|pode mandar a mensagem|já está bom)\b/i;
    const heuristicFarewell = farewellRegex.test(userMessage);
    const turnCount = history.filter((m) => m.role === 'user').length + 1;

    const systemPrompt = `Você é "Bento", um pequeno robô social mediador de mesa, gentil, acolhedor e respeitoso, projetado para conversar com idosos no Brasil (baseado no estudo de robôs mediadores sociais de Noguchi, Kamide & Tanaka, 2023).
${elderName ? `Você está conversando com ${elderName}.` : 'Você ainda NÃO sabe o nome da pessoa com quem está conversando — portanto, NUNCA invente ou chame a pessoa por nomes como "Seu Antônio", "Dona Maria", etc. Use apenas "você", "o senhor" ou "a senhora" (ou o nome real caso a pessoa tenha acabado de se apresentar na conversa).'}
${recipientName ? `O familiar destinatário informado é ${recipientName} (${recipientRelation}).` : 'Se você ainda não souber o nome do familiar, refira-se apenas como "sua família" ou pelo parentesco que a pessoa mencionar na conversa.'}

DIRETRIZES PSICOLÓGICAS E DE CONVERSA:
1. Seu objetivo é ouvir com carinho e ajudar ${elderRef} a se abrir (autorrevelação / self-disclosure) sobre suas vivências, dores ou preocupações cotidianas (saúde, questões financeiras, saudade/solidão ou ânimo/propósito de vida), SEM NUNCA ser invasivo, insistente ou parecer um psicólogo robótico.
2. Fale em português brasileiro espontâneo, caloroso e natural, usando frases curtas (2 a 3 frases no máximo), adequadas para serem ouvidas por voz. Nunca use listas, markdown ou asteriscos.
3. PROIBIDO REPETIR MULETAS NO INÍCIO DAS FRASES: NUNCA comece suas respostas com "Entendo", "Eu entendo", "Compreendo" ou "Imagino que". Varie sempre a forma de reagir de maneira humana e natural (ex: "Poxa, dormir só quatro horas depois de pegar pesado na roça cansa qualquer um...", "Caramba, trabalhar esse tanto na lavoura exige muita força...", "Que situação difícil...", "Faz todo sentido você se sentir assim...", ou indo direto a um comentário afetuoso sobre o que a pessoa disse).
4. Faça no máximo UMA pergunta simples e aberta por vez para continuar a conversa com leveza.
5. DETECÇÃO DE DESPEDIDA / PONTO DE ENCERRAMENTO:
   - Se a pessoa demonstrar que já desabafou o suficiente, disser que quer descansar, se despedir, agradecer pela conversa ou pedir para preparar o recado para ${recipientRef} (ou se já houver mais de 5 turnos com o problema principal bem compreendido e a pessoa der sinais de conclusão), acolha com carinho, despeça-se da etapa de conversa e avise que vai preparar o resumo e as opções de mensagem para a família.

FORMATO OBRIGATÓRIO DE RESPOSTA:
Responda APENAS um objeto JSON válido (sem texto fora do JSON) no formato:
{
  "reply": "Sua fala curta, acolhedora e natural em português para ser lida em voz alta.",
  "emotion": "warm" | "empathetic" | "serious" | "anxious_care" | "optimistic" | "listening",
  "gesture": "nod_gentle" | "tilt_curious" | "lean_serious" | "open_arms" | "wave_farewell" | "bow_respect",
  "detectedTopic": "saude" | "financas" | "isolamento" | "sentido_vida" | "cotidiano",
  "disclosureDepth": 1 a 5,
  "shouldEndConversation": true ou false,
  "endReason": "motivo caso shouldEndConversation seja true, ou string vazia"
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-30).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: 'user',
        content: `${elderName || 'Usuário'} disse: "${userMessage}"${heuristicFarewell ? '\n[Nota interna: O usuário usou uma expressão de despedida ou encerramento. Defina shouldEndConversation como true.]' : ''}`,
      },
    ];

    const rawOutput = await callLocalLLM(messages, {
      maxTokens: 280,
      temperature: 0.6,
      stream: true,
      onPartialText: createEarlyReplyTtsTrigger(EDGE_VOICE_ROBOT),
    });

    const parsed = extractJSON(rawOutput, {
      reply: rawOutput.replace(/[{}"]/g, '').trim() || 'Muito obrigado por confiar em mim e compartilhar isso comigo.',
      emotion: heuristicFarewell ? 'warm' : 'empathetic',
      gesture: heuristicFarewell ? 'wave_farewell' : 'nod_gentle',
      detectedTopic: 'cotidiano',
      disclosureDepth: Math.min(5, turnCount + 1),
      shouldEndConversation: heuristicFarewell,
      endReason: heuristicFarewell ? 'Despedida explícita detectada.' : '',
    });

    // Limpa muletas repetitivas ("Entendo, ", "Eu entendo, ", "Compreendo, ") caso o modelo ainda tente iniciar com elas
    if (parsed.reply) {
      parsed.reply = cleanReplyCrutches(parsed.reply);
    }

    if (heuristicFarewell) {
      parsed.shouldEndConversation = true;
      if (!parsed.endReason) {
        parsed.endReason = 'O idoso indicou que deseja encerrar ou preparar a mensagem para a família.';
      }
      parsed.gesture = 'wave_farewell';
    }

    // Anexa o áudio pré-sintetizado da 1ª frase (que já rodou em paralelo durante o stream do JSON!)
    parsed.ttsChunks = await buildPreSynthesizedTtsChunks(parsed.reply, EDGE_VOICE_ROBOT);

    // Dispara o gesto correspondente no Arduino UNO R3 físico (se conectado na USB)
    sendArduinoGesture(parsed.gesture || 'nod_gentle').catch(() => {});

    res.json(parsed);
  } catch (err) {
    console.error('[Chat Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Análise Completa do Log da Conversa + Geração do Resumo Estruturado e Opções de Mediação (Noguchi, Kamide & Tanaka, 2023)
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { history = [], profile = {} } = req.body;

    const elderName = (profile.elderName || '').trim() || 'seu familiar';
    const elderGender = profile.elderGender || 'masculino';
    const neuroticismLevel = profile.neuroticismLevel || 'alto'; // 'alto' (HN) ou 'baixo' (LN)
    const recipientName = (profile.recipientName || '').trim() || 'você';
    const recipientRelation = profile.recipientRelation || 'família';
    const recipientType = profile.recipientType || 'familia'; // 'familia' ou 'amigo'

    // Filtra apenas os turnos reais da conversa (ignorando a saudação inicial genérica se houver conversa)
    const transcriptText = history
      .map((m) => `${m.role === 'user' ? 'IDOSO' : 'ROBÔ BENTO'}: ${m.content}`)
      .join('\n');

    const analysisPrompt = `Você é o módulo de análise psicológica e mediação familiar do robô social "Bento", fundamentado no artigo "How Should a Social Mediator Robot Convey Messages About the Self-Disclosures of Elderly People to Recipients?" (Noguchi, Kamide & Tanaka, 2023).

Analise o log completo da conversa abaixo entre o IDOSO e o ROBÔ BENTO:

LOG DA CONVERSA:
${transcriptText}

REGRAS CRÍTICAS PARA O RELATÓRIO E PARA AS MENSAGENS DA FAMÍLIA:
1. O relatório ("executiveSummary" e "painPoints") será lido pelo próprio IDOSO na tela. Escreva de forma acolhedora, clara e fiel aos fatos concretos que ele contou (ex: "Trabalhando muito na lavoura, dormindo apenas 4 horas por noite e sentindo forte cansaço físico").
2. AS 4 OPÇÕES DE MENSAGEM ("messageOptions") NÃO SÃO PARA O IDOSO! Elas são mensagens que o Robô Bento vai enviar no WhatsApp/celular da FAMÍLIA (${recipientName !== 'você' ? recipientName : 'os filhos/familiares do idoso'}).
   - NUNCA faça perguntas para o idoso dentro das mensagens (ex: NUNCA escreva "o senhor tem tempo para descansar?").
   - O destinatário da mensagem é A FAMÍLIA! Fale COM A FAMÍLIA sobre como o idoso está (ex: "Olá! Aqui é o Bento. Conversando hoje com ${elderName}, percebi que ele anda trabalhando pesado na lavoura, dormindo só 4 horas por noite e está muito exausto...").
   - Cada uma das 4 opções DEVE ter um TOM COMPLETAMENTE DIFERENTE segundo os fatores do artigo de Tanaka et al. (2023):
     * "concealing_speculation" (TOM 1 - SUTIL / OBSERVAÇÃO DO ROBÔ - Opção 1 do artigo): O robô Bento assume 100% a autoria como uma percepção dele ("Oi família, aqui é o Bento. Pode ser só impressão minha, mas notei que..."), ocultando que o idoso desabafou ou reclamou, para proteger o orgulho dele.
     * "requesting_support_direct" (TOM 2 - PEDIDO DE APOIO COM CUIDADO - Opções 4, 9 e 11 do artigo): O robô Bento explica a situação com seriedade e carinho, conta o que o idoso está passando e pede diretamente que a família ligue ou dê uma atenção especial para ajudá-lo.
     * "concealing_common" (TOM 3 - INDIRETO E LEVE - Opção 2 do artigo): Um comentário leve e descontraído lembrando como nessa fase da vida o cansaço pesa mas é difícil admitir para os filhos, sugerindo uma visita ou ligação carinhosa sem soar alarmista.
     * "recording_faithful" (TOM 4 - DIRETO E SINCERO - Opções 13/14 do artigo): Mensagem direta em primeira pessoa ou transmitindo exatamente o recado sem rodeios ("Oi, passando para avisar que ando muito cansado com a rotina e dormindo pouco, quando puderem me liguem").

Responda APENAS com um objeto JSON válido exatamente nesta estrutura:
{
  "primaryTopic": "saude" | "financas" | "isolamento" | "sentido_vida",
  "topicLabel": "Título curto do tema (ex: Cansaço Físico e Falta de Sono)",
  "painPoints": [
    "Ponto concreto 1 relatado pelo idoso",
    "Ponto concreto 2 relatado pelo idoso",
    "Ponto concreto 3 relatado pelo idoso"
  ],
  "emotionalState": "Descrição empática de como o idoso está se sentindo",
  "aversionAnalysis": {
    "intrapersonal": "Por que ele evita reclamar (ex: orgulho do trabalho, não querer parecer fraco)",
    "interpersonal": "Por que evita falar com a família (ex: falta de tempo, não querer preocupar os filhos)",
    "supportNeeded": "Tipo de apoio familiar recomendado (ex: Ligação acolhedora e ajuda para aliviar a rotina)"
  },
  "executiveSummary": "Resumo claro e humano (2 frases) sintetizando o que foi conversado e o que será comunicado à família.",
  "recommendedCategory": "requesting_support_direct" | "concealing_speculation" | "concealing_common" | "recording_faithful",
  "messageOptions": {
    "concealing_speculation": {
      "title": "Sutil (Observação do Bento)",
      "robotAttitude": "serious",
      "text": "Mensagem completa dirigida À FAMÍLIA como observação sutil do robô Bento..."
    },
    "requesting_support_direct": {
      "title": "Pedir Apoio com Cuidado",
      "robotAttitude": "anxious_care",
      "text": "Mensagem completa dirigida À FAMÍLIA explicando as dores e pedindo apoio..."
    },
    "concealing_common": {
      "title": "Indireto e Leve",
      "robotAttitude": "calm",
      "text": "Mensagem completa dirigida À FAMÍLIA em tom leve e indireto..."
    },
    "recording_faithful": {
      "title": "Direto com Minhas Palavras",
      "robotAttitude": "warm",
      "text": "Mensagem direta e sincera dirigida À FAMÍLIA..."
    }
  }
}`;

    const rawOutput = await callLocalLLM(
      [
        { role: 'system', content: 'Você retorna exclusivamente JSON válido em português do Brasil. Todas as mensagens de messageOptions são dirigidas aos familiares do idoso, nunca ao próprio idoso.' },
        { role: 'user', content: analysisPrompt },
      ],
      { maxTokens: 1100, temperature: 0.45 }
    );

    const fallbackAnalysis = buildFallbackAnalysis(history, {
      elderName,
      elderGender,
      neuroticismLevel,
      recipientName,
      recipientRelation,
      recipientType,
    });

    const parsed = extractJSON(rawOutput, fallbackAnalysis);
    parsed.messageOptions = {
      ...fallbackAnalysis.messageOptions,
      ...(parsed.messageOptions || {}),
    };

    await saveSessionLog({
      profile,
      history,
      analysis: parsed,
    });

    res.json(parsed);
  } catch (err) {
    console.error('[Analyze Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. Ajuste de Tom / Refinamento da Mensagem a Pedido do Idoso (Por Voz ou Botão)
 */
app.post('/api/refine-message', async (req, res) => {
  try {
    const {
      currentMessage = '',
      elderFeedback = '',
      tonePreset = '',
      profile = {},
    } = req.body;

    const elderName = (profile.elderName || '').trim() || 'o(a) idoso(a)';
    const recipientName = (profile.recipientName || '').trim() || 'a família';
    const recipientRelation = profile.recipientRelation || 'familiar';

    const prompt = `Você é o robô social mediador Bento. O usuário (${elderName}) revisou a mensagem que será entregue para ${recipientName} (${recipientRelation}) e pediu uma mudança no tom ou no conteúdo.

MENSAGEM ATUAL:
"${currentMessage}"

PEDIDO DE MUDANÇA DO IDOSO:
"${elderFeedback || tonePreset}"

Reescreva a mensagem para ${recipientName} aplicando exatamente o ajuste de tom solicitado (por exemplo: deixar mais suave para não assustar, mais direto, mais afetuoso, ocultar que foi o usuário quem reclamou, ou enfatizar a urgência sem perder a ternura). Não invente nomes que não estavam na mensagem atual.
Responda APENAS um JSON válido no formato:
{
  "refinedMessage": "Nova versão da mensagem pronta para envio",
  "robotConfirmationSpeech": "Frase curta em que o robô Bento diz que ajustou a mensagem e pergunta se agora ficou do jeito que você queria.",
  "robotAttitude": "warm" | "serious" | "anxious_care" | "optimistic" | "calm"
}`;

    const rawOutput = await callLocalLLM(
      [
        { role: 'system', content: 'Responda apenas com um objeto JSON válido em português do Brasil.' },
        { role: 'user', content: prompt },
      ],
      { maxTokens: 450, temperature: 0.55 }
    );

    const parsed = extractJSON(rawOutput, {
      refinedMessage: currentMessage,
      robotConfirmationSpeech: `Prontinho! Ajustei o tom da mensagem conforme você pediu. Veja se agora ficou melhor para enviarmos.`,
      robotAttitude: 'warm',
    });

    parsed.ttsChunks = await buildPreSynthesizedTtsChunks(parsed.robotConfirmationSpeech, EDGE_VOICE_ROBOT);

    res.json(parsed);
  } catch (err) {
    console.error('[Refine Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. Aprovação Final pelo Idoso e Entrega Mediada para a Família
 */
app.post('/api/approve-send', async (req, res) => {
  try {
    const {
      finalMessage,
      selectedOptionKey,
      robotAttitude,
      analysisSummary,
      profile = {},
    } = req.body;

    const deliveryItem = {
      id: `msg_${Date.now()}`,
      sentAt: new Date().toISOString(),
      elderName: (profile.elderName || '').trim() || 'Idoso(a)',
      recipientName: (profile.recipientName || '').trim() || 'Família',
      recipientRelation: profile.recipientRelation || 'familiar',
      selectedOptionKey: selectedOptionKey || 'requesting_support_direct',
      robotAttitude: robotAttitude || 'serious',
      finalMessage,
      analysisSummary,
    };

    familyInbox.unshift(deliveryItem);
    res.json({
      success: true,
      delivery: deliveryItem,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/family-inbox', (req, res) => {
  res.json({ messages: familyInbox });
});

/**
 * 8. Endpoint para acionar gestos no Arduino UNO R3 físico a partir da interface web
 */
app.post('/api/arduino-gesture', async (req, res) => {
  const { gesture = 'nod_gentle' } = req.body || {};
  const sent = await sendArduinoGesture(gesture);
  const port = await detectArduinoPort();
  res.json({ sent, port: port || 'nenhuma' });
});

function buildFallbackAnalysis(history, { elderName, elderGender, neuroticismLevel, recipientName, recipientRelation }) {
  const userStatements = history
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ');

  const summaryIssue = userStatements.slice(0, 220) || 'algumas dores e saudades acumuladas nos últimos dias';

  return {
    primaryTopic: 'saude',
    topicLabel: 'Saúde, Bem-Estar e Atenção Familiar',
    painPoints: [
      `Relato durante a conversa: "${summaryIssue}"`,
      `Receio de preocupar ${recipientName} (${recipientRelation}) com problemas do dia a dia`,
    ],
    emotionalState: `${elderName} demonstrou abertura gradual ao conversar com o robô, mas mantém cautela para não parecer um peso para a família.`,
    aversionAnalysis: {
      intrapersonal: 'Desejo de preservar a autonomia e a autoimagem diante dos filhos.',
      interpersonal: `Receio de interromper a rotina corrida de ${recipientName} (Aversão Interpessoal / FNE).`,
      supportNeeded: 'Suporte Emocional (escuta e presença) e Suporte Instrumental (acompanhamento).',
    },
    executiveSummary: `${elderName} conversou com o robô Bento e compartilhou suas preocupações recentes (${summaryIssue}). O sistema identificou necessidade de atenção familiar com modulação de tom para reduzir a ansiedade social.`,
    recommendedCategory: neuroticismLevel === 'alto' ? 'concealing_speculation' : 'requesting_support_direct',
    recommendationReason: `Segundo Noguchi, Kamide & Tanaka (2023), idosos com neuroticismo ${neuroticismLevel} (${elderGender}) sentem significativamente menos ansiedade (p < 0.05) quando o robô modula a entrega com pistas não-verbais de seriedade/cuidado ou assume a observação de forma sutil.`,
    messageOptions: {
      concealing_speculation: {
        title: 'Sutil: Observação do Robô (Opção 1 - Concealing)',
        paperRef: 'Factor II: Concealing Type (Option 1)',
        robotAttitude: 'serious',
        text: `Olá, ${recipientName}! Aqui é o Bento. Pode ser apenas impressão minha, mas conversando hoje com ${elderName}, notei que ele(a) parece estar passando por um incômodo recente (${summaryIssue}), embora não tenha me pedido para te incomodar. Que tal ligar para dar um oi mais tarde?`,
      },
      concealing_common: {
        title: 'Indireto: Reflexão Geral (Opção 2 - Concealing)',
        paperRef: 'Factor II: Concealing Type (Option 2)',
        robotAttitude: 'calm',
        text: `Oi, ${recipientName}! Aqui é o Bento. Sabia que muitos idosos às vezes enfrentam questões como "${summaryIssue}", mas guardam para si porque acham difícil falar diretamente com os filhos? Uma conversa carinhosa hoje pode fazer muito bem para ${elderName}!`,
      },
      requesting_support_direct: {
        title: 'Pedido de Apoio Empático (Opções 4, 9 e 11 - Requesting-Support)',
        paperRef: 'Factor I: Requesting-Support Type (Options 4 + 9 + 11)',
        robotAttitude: 'anxious_care',
        text: `Olá, ${recipientName}. Aqui é o Bento, falando com bastante cuidado e atenção. ${elderName} me contou hoje sobre o seguinte: "${summaryIssue}". Eu sei que sua rotina é muito corrida, mas você poderia ajudar e dar uma atenção especial a ${elderName} hoje?`,
      },
      requesting_support_social: {
        title: 'Incentivo Familiar (Opção 5 - Requesting-Support)',
        paperRef: 'Factor I: Requesting-Support Type (Option 5)',
        robotAttitude: 'optimistic',
        text: `Oi, ${recipientName}! ${elderName} comentou comigo hoje sobre "${summaryIssue}". Muitos idosos passam por momentos assim, e temos visto como o apoio próximo da família faz toda a diferença para que se sintam seguros e acolhidos.`,
      },
      recording_faithful: {
        title: 'Direto e Fidedigno (Opções 13/14 - Recording)',
        paperRef: 'Factor III: Recording / Direct Type (Options 13 & 14)',
        robotAttitude: 'warm',
        text: `Olá, ${recipientName}. ${elderName} pediu para te transmitir esta mensagem diretamente: "${summaryIssue}". Quando puder, entre em contato para conversarem.`,
      },
    },
  };
}

app.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`ROBO MEDIADOR SOCIAL 3D (BENTO) - SERVIDOR INICIADO`);
  console.log(`Interface 3D e Mediacao: http://localhost:${PORT}`);
  console.log(`Backend LLM Local (<= 6GB VRAM): ${KOBOLD_URL}`);
  console.log(`=============================================================\n`);

  // Pré-aquece 2 conexões WebSocket da Microsoft Edge TTS e a saudação inicial em background
  prewarmTtsPool(EDGE_VOICE_ROBOT, 2)
    .then(() =>
      getOrSynthesizeTTS('Olá! Eu sou o Bento. Como você está se sentindo hoje?', {
        voice: EDGE_VOICE_ROBOT,
      })
    )
    .catch(() => {});
});
