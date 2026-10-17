/**
 * scripts/simulate.ts — CLI launcher for the demo lunch rush simulator.
 * DOC3 §3.9, DOC4 Step 10.
 *
 * Usage:
 *   npm run simulate -- --speed 6 --peak 220 --duration-min 18
 */

import path from 'path';
import jwt from 'jsonwebtoken';

if (typeof process.loadEnvFile === 'function') {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const envPath of candidates) {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // ignore
    }
  }
}

interface CliArgs {
  speed: number;
  peak: number;
  durationMin: number;
  appAdoption: number;
  seed: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let speed = 6;
  let peak = 220;
  let durationMin = 18;
  let appAdoption = 0.7;
  let seed = 42;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--speed' && args[i + 1]) {
      speed = Number(args[++i]);
    } else if ((arg === '--peak' || arg === '--peak-people') && args[i + 1]) {
      peak = Number(args[++i]);
    } else if (arg === '--duration-min' && args[i + 1]) {
      durationMin = Number(args[++i]);
    } else if (arg === '--app-adoption' && args[i + 1]) {
      appAdoption = Number(args[++i]);
    } else if (arg === '--seed' && args[i + 1]) {
      seed = Number(args[++i]);
    }
  }

  return { speed, peak, durationMin, appAdoption, seed };
}

async function isServerRunning(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/healthz`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function runViaHttp(serverUrl: string, args: CliArgs): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-min-16-characters-long';
  const adminToken = jwt.sign(
    { sub: 'admin-cli-sim', role: 'admin' },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  console.log(`Connecting to MessPulse API server at ${serverUrl}...`);

  const startRes = await fetch(`${serverUrl}/api/v1/admin/simulator/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      speed: args.speed,
      peakPeople: args.peak,
      durationMin: args.durationMin,
      appAdoption: args.appAdoption,
      seed: args.seed,
    }),
  });

  if (!startRes.ok) {
    const errBody = (await startRes.json().catch(() => ({}))) as Record<string, unknown>;
    console.error('Failed to start simulation on server:', errBody);
    process.exit(1);
  }

  const startData = (await startRes.json()) as { runId: string };
  console.log(`Simulation started! Run ID: ${startData.runId}`);
  console.log(`Speed: ${args.speed}x | Peak: ${args.peak} | Duration: ${args.durationMin}m (runs in ~${(args.durationMin / args.speed).toFixed(1)} real minutes)`);
  console.log('Press Ctrl+C to stop simulation early.\n');

  let active = true;

  async function stopRemote() {
    if (!active) return;
    active = false;
    console.log('\nStopping simulation...');
    try {
      await fetch(`${serverUrl}/api/v1/admin/simulator/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      console.log('Simulation stopped.');
    } catch (err) {
      console.error('Error stopping simulation:', err);
    }
    process.exit(0);
  }

  process.on('SIGINT', () => void stopRemote());
  process.on('SIGTERM', () => void stopRemote());

  while (active) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const statusRes = await fetch(`${serverUrl}/api/v1/admin/simulator/status`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!statusRes.ok) break;
      const status = (await statusRes.json()) as {
        running: boolean;
        simulatedElapsedMin: number | null;
        eventsRemaining: number | null;
      };

      if (!status.running) {
        console.log('\nSimulation completed on server.');
        break;
      }

      process.stdout.write(
        `\r[Simulation] Elapsed: ${status.simulatedElapsedMin ?? 0}m / ${args.durationMin}m | Events remaining: ${status.eventsRemaining ?? 0}   `
      );
    } catch {
      break;
    }
  }

  process.exit(0);
}

async function runInProcess(args: CliArgs): Promise<void> {
  // Fallback if HTTP server is not running: load container directly
  const { connectMongo, disconnectMongo } = await import('../src/infra/mongo/connection');
  const { buildContainer } = await import('../src/container');

  const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/messpulse';
  await connectMongo(mongoUrl);

  const container = buildContainer();
  console.log(`Starting standalone in-process simulation (${args.speed}x)...`);

  const { runId } = await container.simulatorService.start({
    speed: args.speed,
    peakPeople: args.peak,
    durationMin: args.durationMin,
    appAdoption: args.appAdoption,
    seed: args.seed,
  });

  console.log(`Simulation runId: ${runId}`);
  console.log('Press Ctrl+C to exit.\n');

  let running = true;
  async function cleanup() {
    if (!running) return;
    running = false;
    console.log('\nStopping simulator...');
    await container.simulatorService.stop();
    await disconnectMongo();
    process.exit(0);
  }

  process.on('SIGINT', () => void cleanup());
  process.on('SIGTERM', () => void cleanup());

  while (running) {
    await new Promise((r) => setTimeout(r, 1000));
    // Tick occupancy service in standalone mode
    await container.occupancyService.tick(container.clock.now());

    const status = container.simulatorService.status();
    if (!status.running) {
      console.log('\nSimulation finished.');
      break;
    }

    process.stdout.write(
      `\r[Standalone] Elapsed: ${status.simulatedElapsedMin ?? 0}m / ${args.durationMin}m | Events remaining: ${status.eventsRemaining ?? 0}   `
    );
  }

  await cleanup();
}

async function main() {
  const args = parseArgs();
  const serverUrl = process.env.API_URL || 'http://localhost:3000';

  if (await isServerRunning(serverUrl)) {
    await runViaHttp(serverUrl, args);
  } else {
    await runInProcess(args);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Simulator error:', err);
    process.exit(1);
  });
}
