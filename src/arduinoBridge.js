/**
 * Ponte USB Serial Persistente entre o Servidor Node.js (Bento 3D) e o Arduino UNO R3
 *
 * POR QUE ESTA ARQUITETURA É CRÍTICA PARA O ARDUINO UNO R3:
 * - No Arduino UNO R3, toda vez que um programa abre a porta Serial (Open) e fecha (Close),
 *   o chip USB-Serial puxa a linha DTR e RESETA o microcontrolador (levando 2 segundos no bootloader
 *   e descartando o comando enviado!).
 * - Por isso, este módulo mantém UM ÚNICO worker PowerShell persistente com a porta COM aberta
 *   continuamente (`DtrEnable = $false`), lendo comandos via `stdin` e enviando instantaneamente
 *   para o Arduino UNO R3 com latência < 5ms e ZERO resets!
 * - Se o Arduino não estiver plugado no USB, o sistema roda 100% normal sem travar nem lançar erros.
 */
import { spawn, execFile } from 'node:child_process';

let detectedComPort = process.env.ARDUINO_PORT || null;
let serialWorker = null;
let workerPort = null;
let isScanning = false;
let lastScanTime = 0;

export function detectArduinoPort() {
  if (process.env.ARDUINO_PORT) {
    detectedComPort = process.env.ARDUINO_PORT;
    return Promise.resolve(detectedComPort);
  }

  if (process.platform !== 'win32') {
    return Promise.resolve(null);
  }

  const now = Date.now();
  if (detectedComPort || isScanning || now - lastScanTime < 8000) {
    return Promise.resolve(detectedComPort);
  }

  isScanning = true;
  lastScanTime = now;

  return new Promise((resolve) => {
    const psDetect = `
      $p = Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue |
           Where-Object { $_.Description -match 'Arduino|CH340|USB|Serial' } |
           Select-Object -First 1 -ExpandProperty DeviceID
      if (-not $p) {
        $p = [System.IO.Ports.SerialPort]::GetPortNames() | Select-Object -First 1
      }
      if ($p) { Write-Output $p.Trim() }
    `;

    execFile('powershell.exe', ['-NoProfile', '-Command', psDetect], { timeout: 2500 }, (err, stdout) => {
      isScanning = false;
      const candidate = (stdout || '').trim();
      if (!err && candidate && /^COM\d+$/i.test(candidate)) {
        if (detectedComPort !== candidate) {
          detectedComPort = candidate;
          console.log(`[Arduino UNO R3] Porta USB detectada: ${detectedComPort}`);
          ensureSerialWorker(detectedComPort);
        }
      }
      resolve(detectedComPort);
    });
  });
}

function ensureSerialWorker(portName) {
  if (!portName || process.platform !== 'win32') return;
  if (serialWorker && workerPort === portName) return;

  if (serialWorker) {
    try {
      serialWorker.kill();
    } catch {}
    serialWorker = null;
  }

  workerPort = portName;

  // Script PowerShell persistente que abre a porta COM uma única vez sem resetar o Arduino
  const psLoop = `
    $ErrorActionPreference = 'SilentlyContinue'
    $sp = New-Object System.IO.Ports.SerialPort '${portName}', 9600, 'None', 8, 'One'
    $sp.DtrEnable = $false
    $sp.RtsEnable = $false
    $sp.Open()
    if (-not $sp.IsOpen) { exit 1 }
    Start-Sleep -Milliseconds 1800
    while ($true) {
      $line = [Console]::In.ReadLine()
      if ($null -eq $line) { break }
      if ($sp.IsOpen -and $line.Trim().Length -gt 0) {
        $sp.WriteLine($line.Trim())
      }
    }
    if ($sp.IsOpen) { $sp.Close() }
  `;

  try {
    serialWorker = spawn('powershell.exe', ['-NoProfile', '-Command', psLoop], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    serialWorker.on('exit', () => {
      serialWorker = null;
      workerPort = null;
    });

    serialWorker.on('error', () => {
      serialWorker = null;
      workerPort = null;
    });
  } catch {
    serialWorker = null;
    workerPort = null;
  }
}

/**
 * Envia um gesto ("G:nod", "G:serious", "G:care", "G:talk", "G:wave", "G:idle")
 * instantaneamente para o Arduino UNO R3 através da conexão serial persistente.
 */
export async function sendArduinoGesture(gestureName) {
  const port = await detectArduinoPort();
  if (!port || process.platform !== 'win32') return false;

  ensureSerialWorker(port);
  if (!serialWorker || !serialWorker.stdin.writable) return false;

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
  try {
    serialWorker.stdin.write(`${cmd}\n`);
    return true;
  } catch {
    return false;
  }
}
