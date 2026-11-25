#!/usr/bin/env node
/**
 * Utilitário CLI para compilar, gravar e testar o Arduino UNO R3 do Bento 3D no Linux/Windows/macOS.
 *
 * Uso:
 *   node scripts/arduino-helper.mjs compile
 *   node scripts/arduino-helper.mjs upload
 *   node scripts/arduino-helper.mjs test [gesto]   # ex: nod_gentle, wave_farewell, serious, care, talk, idle
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectArduinoPort, sendArduinoGesture, closeArduinoBridge } from '../src/arduinoBridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKETCH_DIR = path.resolve(__dirname, '..', 'hardware_3d', 'arduino', 'bento_uno_r3');
const FQBN = process.env.ARDUINO_FQBN || 'arduino:avr:uno';

const action = (process.argv[2] || 'test').toLowerCase();

function runArduinoCli(args) {
  const res = spawnSync('arduino-cli', args, { stdio: 'inherit' });
  if (res.error) {
    console.error('Erro ao executar "arduino-cli". Verifique se está instalado no PATH (~/.local/bin/arduino-cli).');
    process.exit(1);
  }
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

if (action === 'compile') {
  console.log(`[Arduino] Compilando firmware para ${FQBN}...`);
  runArduinoCli(['compile', '--fqbn', FQBN, SKETCH_DIR]);
  process.exit(0);
}

if (action === 'upload') {
  const port = await detectArduinoPort({ openWorker: false });
  if (!port) {
    console.error('[Arduino] Nenhuma porta USB encontrada (/dev/ttyACM*, /dev/ttyUSB* ou COM*).');
    console.error('Conecte o Arduino UNO R3 via USB ou defina ARDUINO_PORT=/dev/ttyACM0.');
    process.exit(1);
  }
  console.log(`[Arduino] Compilando e gravando firmware em ${port} (${FQBN})...`);
  runArduinoCli(['compile', '--upload', '--fqbn', FQBN, '-p', port, SKETCH_DIR]);
  console.log('[Arduino] Upload concluído com sucesso!');
  process.exit(0);
}

if (action === 'test') {
  const gesture = process.argv[3] || 'nod_gentle';
  const port = await detectArduinoPort();
  if (!port) {
    console.error('[Arduino] Nenhuma porta USB encontrada (/dev/ttyACM*, /dev/ttyUSB* ou COM*).');
    console.error('Conecte o Arduino UNO R3 via USB ou defina ARDUINO_PORT=/dev/ttyACM0.');
    process.exit(1);
  }
  console.log(`[Arduino] Porta detectada: ${port}. Enviando gesto "${gesture}"...`);
  const ok = await sendArduinoGesture(gesture);
  // Aguarda o tempo de estabilizacao inicial do worker (1.8s) + execucao do gesto
  await new Promise((r) => setTimeout(r, 2600));
  closeArduinoBridge();
  if (!ok) {
    console.error('[Arduino] Falha ao enviar gesto.');
    process.exit(1);
  }
  console.log('[Arduino] Comando enviado!');
  process.exit(0);
}

console.error(`Ação desconhecida: "${action}". Use: compile | upload | test [gesto]`);
process.exit(1);
