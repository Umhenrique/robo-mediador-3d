/**
 * Ponte USB Serial Automática entre o Servidor Node.js (Bento 3D) e o Arduino UNO R3
 * - Funciona no Windows (COM3, COM4, etc.) sem precisar instalar compiladores C++ nativos!
 * - Se você definir ARDUINO_PORT=COM3 (ou se ele detectar automaticamente uma porta USB Serial),
 *   toda vez que o Bento 3D fizer um gesto na tela ou falar, o Arduino UNO R3 mexe o servo SG90
 *   e acende os LEDs da bancada física em tempo real!
 */
import { execFile } from 'node:child_process';

let detectedComPort = process.env.ARDUINO_PORT || null;
let lastDetectAttempt = 0;

export function detectArduinoPort() {
  if (process.env.ARDUINO_PORT) {
    detectedComPort = process.env.ARDUINO_PORT;
    return Promise.resolve(detectedComPort);
  }

  const now = Date.now();
  if (detectedComPort || now - lastDetectAttempt < 15000) {
    return Promise.resolve(detectedComPort);
  }
  lastDetectAttempt = now;

  if (process.platform !== 'win32') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const psScript = `
      $port = Get-CimInstance Win32_SerialPort | Where-Object { $_.Description -match 'Arduino|CH340|USB|Serial' } | Select-Object -First 1 -ExpandProperty DeviceID
      if (-not $port) {
        $port = [System.IO.Ports.SerialPort]::GetPortNames() | Select-Object -First 1
      }
      if ($port) { Write-Output $port }
    `;
    execFile('powershell.exe', ['-NoProfile', '-Command', psScript], { timeout: 2500 }, (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        detectedComPort = stdout.trim();
        console.log(`[Arduino UNO R3] Porta Serial detectada automaticamente: ${detectedComPort}`);
      }
      resolve(detectedComPort);
    });
  });
}

/**
 * Envia um comando de gesto ("G:nod", "G:serious", "G:care", "G:talk", "G:wave", "G:idle")
 * para o Arduino UNO R3 conectado via USB.
 */
export async function sendArduinoGesture(gestureName) {
  const port = await detectArduinoPort();
  if (!port || process.platform !== 'win32') return false;

  const map = {
    nod_gentle: 'G:nod',
    tilt_curious: 'G:care',
    lean_serious: 'G:serious',
    open_arms: 'G:care',
    wave_farewell: 'G:wave',
    bow_respect: 'G:serious',
    talk: 'G:talk',
    idle: 'G:idle',
  };

  const cmd = map[gestureName] || 'G:nod';

  const psSend = `
    try {
      $sp = New-Object System.IO.Ports.SerialPort '${port}', 9600, 'None', 8, 'One'
      $sp.Open()
      $sp.WriteLine('${cmd}')
      $sp.Close()
    } catch {}
  `;

  execFile('powershell.exe', ['-NoProfile', '-Command', psSend], { timeout: 1500 }, () => {});
  return true;
}
