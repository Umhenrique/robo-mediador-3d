/**
 * Ponte USB Serial Persistente entre o Servidor Node.js (Bento 3D) e o Arduino UNO R3
 * Compatível com Windows (PowerShell/.NET SerialPort) e Linux/macOS (Python3 + pyserial/termios).
 *
 * POR QUE ESTA ARQUITETURA É CRÍTICA PARA O ARDUINO UNO R3:
 * - No Arduino UNO R3, toda vez que um programa abre a porta Serial (Open) e fecha (Close),
 *   o chip USB-Serial puxa a linha DTR e RESETA o microcontrolador (levando ~2 segundos no bootloader
 *   e descartando o comando enviado!).
 * - Por isso, este módulo mantém UM ÚNICO worker persistente com a porta serial aberta
 *   continuamente (DTR desabilitado), lendo comandos via `stdin` e enviando instantaneamente
 *   para o Arduino UNO R3 com latência < 5ms e ZERO resets!
 * - Se o Arduino não estiver plugado no USB, o sistema roda 100% normal sem travar nem lançar erros.
 */
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

let detectedComPort = process.env.ARDUINO_PORT || null;
let serialWorker = null;
let workerPort = null;
let isScanning = false;
let lastScanTime = 0;

const SUPPORTED_PLATFORMS = new Set(['win32', 'linux', 'darwin']);

const ARDUINO_USB_REGEX = /arduino|ch340|ch341|cp210|ftdi|usb.*serial|2341|1a86|0403|10c4/i;

const GESTURE_MAP = {
  nod_gentle: 'G:nod',
  tilt_curious: 'G:care',
  lean_serious: 'G:serious',
  open_arms: 'G:care',
  wave_farewell: 'G:wave',
  bow_respect: 'G:serious',
  talk: 'G:talk',
  idle: 'G:idle',
};

const PYTHON_SERIAL_WORKER = `
import os
import sys
import time
import threading

port = sys.argv[1]

def open_serial(port_path):
    try:
        import serial
        ser = serial.Serial()
        ser.port = port_path
        ser.baudrate = 9600
        ser.bytesize = serial.EIGHTBITS
        ser.parity = serial.PARITY_NONE
        ser.stopbits = serial.STOPBITS_ONE
        ser.timeout = 0.2
        ser.dtr = False
        ser.rts = False
        ser.open()
        return ('pyserial', ser)
    except ImportError:
        import termios
        fd = os.open(port_path, os.O_RDWR | os.O_NOCTTY)
        attrs = termios.tcgetattr(fd)
        attrs[0] = 0
        attrs[1] = 0
        attrs[2] = (termios.CS8 | termios.CREAD | termios.CLOCAL) & ~termios.HUPCL
        attrs[3] = 0
        attrs[4] = termios.B9600
        attrs[5] = termios.B9600
        attrs[6][termios.VMIN] = 0
        attrs[6][termios.VTIME] = 2
        termios.tcsetattr(fd, termios.TCSANOW, attrs)
        return ('termios', fd)

try:
    mode, handle = open_serial(port)
except Exception as exc:
    sys.stderr.write(f"[Arduino UNO R3] Falha ao abrir {port}: {exc}\\n")
    sys.stderr.flush()
    sys.exit(1)

stop_event = threading.Event()
ready_event = threading.Event()

def reader_loop():
    buf = b""
    while not stop_event.is_set():
        try:
            if mode == 'pyserial':
                raw = handle.readline()
                if raw:
                    line = raw.decode('utf-8', errors='ignore').strip()
                    if line:
                        if 'BENTO_ARDUINO_READY' in line:
                            ready_event.set()
                        sys.stdout.write(line + "\\n")
                        sys.stdout.flush()
            else:
                chunk = os.read(handle, 128)
                if chunk:
                    buf += chunk
                    while b"\\n" in buf:
                        part, buf = buf.split(b"\\n", 1)
                        line = part.decode('utf-8', errors='ignore').strip()
                        if line:
                            if 'BENTO_ARDUINO_READY' in line:
                                ready_event.set()
                            sys.stdout.write(line + "\\n")
                            sys.stdout.flush()
        except Exception:
            time.sleep(0.15)
            continue

t = threading.Thread(target=reader_loop, daemon=True)
t.start()

# Aguarda BENTO_ARDUINO_READY (ou ate 2.4s) caso a placa tenha resetado ao abrir a porta pela 1a vez
ready_event.wait(timeout=2.4)
time.sleep(0.1)

try:
    for line in sys.stdin:
        cmd = line.strip()
        if not cmd:
            continue
        payload = (cmd + "\\n").encode('utf-8')
        if mode == 'pyserial':
            handle.write(payload)
            handle.flush()
        else:
            os.write(handle, payload)
except Exception as exc:
    sys.stderr.write(f"[Arduino UNO R3] Erro ao escrever em {port}: {exc}\\n")
    sys.stderr.flush()
finally:
    stop_event.set()
    try:
        if mode == 'pyserial':
            handle.close()
        else:
            os.close(handle)
    except Exception:
        pass
`;

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function detectUnixArduinoPort() {
  if (process.platform === 'linux') {
    // 1. Preferencia: /dev/serial/by-id (identifica explicitamente Arduino/CH340/FTDI/CP210x)
    const byIdDir = '/dev/serial/by-id';
    try {
      const entries = await fs.readdir(byIdDir);
      const preferred = entries.filter((name) => ARDUINO_USB_REGEX.test(name));
      const ordered = [...preferred, ...entries.filter((name) => !ARDUINO_USB_REGEX.test(name))];
      for (const name of ordered) {
        try {
          const resolved = await fs.realpath(path.join(byIdDir, name));
          if (await pathExists(resolved)) {
            return resolved;
          }
        } catch {}
      }
    } catch {}

    // 2. Fallback: /dev/ttyACM* (Arduino UNO R3 original) e /dev/ttyUSB* (CH340/CP2102/FTDI)
    try {
      const devEntries = await fs.readdir('/dev');
      const acm = devEntries.filter((n) => /^ttyACM\d+$/.test(n)).sort();
      const usb = devEntries.filter((n) => /^ttyUSB\d+$/.test(n)).sort();
      const first = acm[0] || usb[0];
      if (first) {
        return `/dev/${first}`;
      }
    } catch {}

    return null;
  }

  if (process.platform === 'darwin') {
    try {
      const devEntries = await fs.readdir('/dev');
      const modem = devEntries.filter((n) => /^cu\.usbmodem/.test(n)).sort();
      const serial = devEntries.filter((n) => /^cu\.usbserial/.test(n)).sort();
      const first = modem[0] || serial[0];
      if (first) {
        return `/dev/${first}`;
      }
    } catch {}
  }

  return null;
}

export async function detectArduinoPort({ openWorker = true } = {}) {
  if (process.env.ARDUINO_PORT) {
    detectedComPort = process.env.ARDUINO_PORT.trim();
    return detectedComPort;
  }

  if (!SUPPORTED_PLATFORMS.has(process.platform)) {
    return null;
  }

  // Em Linux/macOS, valida se a porta em cache ainda existe (caso o cabo tenha sido desconectado)
  if (detectedComPort && process.platform !== 'win32') {
    const stillPresent = await pathExists(detectedComPort);
    if (!stillPresent) {
      detectedComPort = null;
    }
  }

  const now = Date.now();
  if (detectedComPort || isScanning || now - lastScanTime < 8000) {
    return detectedComPort;
  }

  isScanning = true;
  lastScanTime = now;

  if (process.platform !== 'win32') {
    try {
      const candidate = await detectUnixArduinoPort();
      if (candidate && detectedComPort !== candidate) {
        detectedComPort = candidate;
        console.log(`[Arduino UNO R3] Porta USB detectada: ${detectedComPort}`);
        if (openWorker) {
          ensureSerialWorker(detectedComPort);
        }
      }
    } finally {
      isScanning = false;
    }
    return detectedComPort;
  }

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
          if (openWorker) {
            ensureSerialWorker(detectedComPort);
          }
        }
      }
      resolve(detectedComPort);
    });
  });
}

function attachWorkerLifecycle(child) {
  child.on('exit', () => {
    if (serialWorker === child) {
      serialWorker = null;
      workerPort = null;
      if (!process.env.ARDUINO_PORT) {
        detectedComPort = null;
      }
    }
  });

  child.on('error', () => {
    if (serialWorker === child) {
      serialWorker = null;
      workerPort = null;
      if (!process.env.ARDUINO_PORT) {
        detectedComPort = null;
      }
    }
  });
}

function ensureSerialWorker(portName) {
  if (!portName || !SUPPORTED_PLATFORMS.has(process.platform)) return;
  if (serialWorker && workerPort === portName) return;

  if (serialWorker) {
    try {
      serialWorker.kill();
    } catch {}
    serialWorker = null;
  }

  workerPort = portName;

  if (process.platform === 'win32') {
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
      attachWorkerLifecycle(serialWorker);
    } catch {
      serialWorker = null;
      workerPort = null;
    }
    return;
  }

  // Linux / macOS: worker Python3 persistente (usa pyserial se disponivel, ou termios nativo)
  try {
    serialWorker = spawn('python3', ['-u', '-c', PYTHON_SERIAL_WORKER, portName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serialWorker.stdout.on('data', (chunk) => {
      const lines = chunk.toString('utf-8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        console.log(`[Arduino UNO R3 <- ${portName}] ${line}`);
      }
    });

    serialWorker.stderr.on('data', (chunk) => {
      const msg = chunk.toString('utf-8').trim();
      if (msg) {
        console.warn(msg);
      }
    });

    attachWorkerLifecycle(serialWorker);
  } catch {
    serialWorker = null;
    workerPort = null;
  }
}

export function closeArduinoBridge() {
  if (serialWorker) {
    try {
      serialWorker.stdin?.end();
      serialWorker.kill();
    } catch {}
    serialWorker = null;
    workerPort = null;
  }
}

process.once('exit', closeArduinoBridge);

/**
 * Envia um gesto ("G:nod", "G:serious", "G:care", "G:talk", "G:wave", "G:idle")
 * instantaneamente para o Arduino UNO R3 através da conexão serial persistente.
 */
export async function sendArduinoGesture(gestureName) {
  const port = await detectArduinoPort();
  if (!port || !SUPPORTED_PLATFORMS.has(process.platform)) return false;

  ensureSerialWorker(port);
  if (!serialWorker || !serialWorker.stdin || !serialWorker.stdin.writable) return false;

  const cmd =
    typeof gestureName === 'string' && gestureName.startsWith('G:')
      ? gestureName.trim()
      : GESTURE_MAP[gestureName] || 'G:nod';

  try {
    serialWorker.stdin.write(`${cmd}\n`);
    return true;
  } catch {
    return false;
  }
}
