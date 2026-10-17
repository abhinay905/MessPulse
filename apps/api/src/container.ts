/**
 * container.ts — composition root.
 * ALL concrete class construction and wiring happens here.
 * Services receive ports via constructor injection; no DI framework.
 * DOC3 §3.1: only container.ts constructs concrete classes.
 */

import Redis from 'ioredis';
import { config } from './config';
import { SwitchableClock } from './infra/clock';
import { EventBus } from './infra/event-bus';
import { MongoUserRepository } from './infra/mongo/user.repository';
import { MongoMealRepository } from './infra/mongo/meal.repository';
import { MongoSettingsRepository } from './infra/mongo/mess-settings.repository';
import { MongoSnapshotRepository } from './infra/mongo/snapshot.repository';
import { RedisOtpStore } from './infra/redis/otp-store.redis';
import { InMemoryOtpStore } from './infra/memory/otp-store.memory';
import { RedisCameraReadingStore } from './infra/redis/camera-reading-store.redis';
import { InMemoryCameraReadingStore } from './infra/memory/camera-reading-store.memory';
import { RedisEntryVelocityStore } from './infra/redis/entry-velocity-store.redis';
import { InMemoryEntryVelocityStore } from './infra/memory/entry-velocity-store.memory';
import { RedisSessionStore } from './infra/redis/session-store.redis';
import { InMemorySessionStore } from './infra/memory/session-store.memory';
import { ConsoleMailer } from './infra/mail/console.mailer';
import { ResendMailer } from './infra/mail/resend.mailer';
import type { Mailer } from './infra/mail/mailer.port';
import type {
  UserRepository,
  OtpStore,
  CameraReadingStore,
  EntryVelocityStore,
  SessionStore,
  MealRepository,
  SettingsRepository,
  SnapshotRepository,
  CheckInRepository,
  AlertRepository,
} from './core/ports';
import { TokenService } from './modules/auth/token.service';
import { AuthService } from './modules/auth/auth.service';
import { createAuthMiddleware } from './modules/auth/auth.middleware';
import { IngestService } from './modules/ingest/ingest.service';
import { OccupancyService } from './modules/occupancy/occupancy.service';
import { SessionService } from './modules/sessions/sessions.service';
import { MongoCheckInRepository } from './infra/mongo/check-in.repository';
import { MongoAlertRepository } from './infra/mongo/alert.repository';
import { AlertEngine } from './modules/alerts/alert-engine';
import { TrayDepletionRule } from './modules/alerts/rules/tray-depletion.rule';
import { AlertService } from './modules/alerts/alerts.service';
import { SimulatorService } from './modules/simulator/simulator.service';

export interface Container {
  clock: SwitchableClock;
  eventBus: EventBus;
  userRepo: UserRepository;
  mealRepo: MealRepository;
  settingsRepo: SettingsRepository;
  snapshotRepo: SnapshotRepository;
  checkInRepo: CheckInRepository;
  alertRepo: AlertRepository;
  alertEngine: AlertEngine;
  alertsService: AlertService;
  otpStore: OtpStore;
  cameraStore: CameraReadingStore;
  velocityStore: EntryVelocityStore;
  sessionStore: SessionStore;
  mailer: Mailer;
  tokenService: TokenService;
  authService: AuthService;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
  ingestService: IngestService;
  occupancyService: OccupancyService;
  sessionsService: SessionService;
  simulatorService: SimulatorService;
  redis?: Redis | undefined;
}

export interface ContainerOverrides {
  clock?: SwitchableClock | undefined;
  eventBus?: EventBus | undefined;
  userRepo?: UserRepository | undefined;
  mealRepo?: MealRepository | undefined;
  settingsRepo?: SettingsRepository | undefined;
  snapshotRepo?: SnapshotRepository | undefined;
  checkInRepo?: CheckInRepository | undefined;
  alertRepo?: AlertRepository | undefined;
  alertEngine?: AlertEngine | undefined;
  alertsService?: AlertService | undefined;
  otpStore?: OtpStore | undefined;
  cameraStore?: CameraReadingStore | undefined;
  velocityStore?: EntryVelocityStore | undefined;
  sessionStore?: SessionStore | undefined;
  mailer?: Mailer | undefined;
  tokenService?: TokenService | undefined;
  authService?: AuthService | undefined;
  ingestService?: IngestService | undefined;
  occupancyService?: OccupancyService | undefined;
  sessionsService?: SessionService | undefined;
  simulatorService?: SimulatorService | undefined;
  allowSimulator?: boolean | undefined;
  redis?: Redis | undefined;
}

export function buildContainer(overrides: ContainerOverrides = {}): Container {
  const clock = overrides.clock ?? new SwitchableClock();
  const eventBus = overrides.eventBus ?? new EventBus();

  let redis: Redis | undefined = overrides.redis;

  // OtpStore
  let otpStore: OtpStore;
  if (overrides.otpStore) {
    otpStore = overrides.otpStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    otpStore = new InMemoryOtpStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    otpStore = new RedisOtpStore(redis);
  }

  // CameraReadingStore
  let cameraStore: CameraReadingStore;
  if (overrides.cameraStore) {
    cameraStore = overrides.cameraStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    cameraStore = new InMemoryCameraReadingStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    cameraStore = new RedisCameraReadingStore(redis);
  }

  // EntryVelocityStore
  let velocityStore: EntryVelocityStore;
  if (overrides.velocityStore) {
    velocityStore = overrides.velocityStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    velocityStore = new InMemoryEntryVelocityStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    velocityStore = new RedisEntryVelocityStore(redis);
  }

  // SessionStore
  let sessionStore: SessionStore;
  if (overrides.sessionStore) {
    sessionStore = overrides.sessionStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    sessionStore = new InMemorySessionStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    sessionStore = new RedisSessionStore(redis);
  }

  const userRepo = overrides.userRepo ?? new MongoUserRepository();
  const mealRepo = overrides.mealRepo ?? new MongoMealRepository();
  const settingsRepo = overrides.settingsRepo ?? new MongoSettingsRepository();
  const snapshotRepo = overrides.snapshotRepo ?? new MongoSnapshotRepository();
  const checkInRepo = overrides.checkInRepo ?? new MongoCheckInRepository();
  const alertRepo = overrides.alertRepo ?? new MongoAlertRepository();

  let alertEngine: AlertEngine;
  if (overrides.alertEngine) {
    alertEngine = overrides.alertEngine;
  } else {
    alertEngine = new AlertEngine();
    alertEngine.register(new TrayDepletionRule());
  }

  let mailer: Mailer;
  if (overrides.mailer) {
    mailer = overrides.mailer;
  } else if (config.MAILER_PROVIDER === 'resend' && config.RESEND_API_KEY) {
    mailer = new ResendMailer(config.RESEND_API_KEY);
  } else {
    mailer = new ConsoleMailer();
  }

  const tokenService = overrides.tokenService ?? new TokenService(config.JWT_SECRET);

  const allowedDomains = config.OTP_ALLOWED_DOMAINS
    ? config.OTP_ALLOWED_DOMAINS.split(',').map((d) => d.trim()).filter((d) => d.length > 0)
    : [];

  const authService =
    overrides.authService ??
    new AuthService(otpStore, userRepo, mailer, tokenService, {
      otpSecret: config.JWT_SECRET,
      allowedDomains,
    });

  const authMiddleware = createAuthMiddleware(tokenService, config.INGEST_KEY);

  const ingestService =
    overrides.ingestService ??
    new IngestService(cameraStore, velocityStore, mealRepo, eventBus);

  const alertsService =
    overrides.alertsService ??
    new AlertService(
      alertEngine,
      alertRepo,
      mealRepo,
      velocityStore,
      cameraStore,
      settingsRepo,
      eventBus,
      clock,
      config.DEFAULT_MESS_ID
    );

  const occupancyService =
    overrides.occupancyService ??
    new OccupancyService(
      cameraStore,
      sessionStore,
      mealRepo,
      settingsRepo,
      snapshotRepo,
      eventBus,
      config.DEFAULT_MESS_ID
    );

  const sessionsService =
    overrides.sessionsService ??
    new SessionService(
      sessionStore,
      checkInRepo,
      mealRepo,
      settingsRepo,
      occupancyService,
      eventBus,
      clock,
      config.JWT_SECRET,
      config.DEFAULT_MESS_ID
    );

  const simulatorService =
    overrides.simulatorService ??
    new SimulatorService({
      clock,
      ingestService,
      sessionService: sessionsService,
      sessionStore,
      mealRepo,
      alertsService,
      allowSimulator:
        overrides.allowSimulator ??
        (process.env.ALLOW_SIMULATOR !== undefined
          ? process.env.ALLOW_SIMULATOR === 'true'
          : config.ALLOW_SIMULATOR),
      defaultMessId: config.DEFAULT_MESS_ID,
    });

  return {
    clock,
    eventBus,
    userRepo,
    mealRepo,
    settingsRepo,
    snapshotRepo,
    checkInRepo,
    alertRepo,
    alertEngine,
    alertsService,
    otpStore,
    cameraStore,
    velocityStore,
    sessionStore,
    mailer,
    tokenService,
    authService,
    authMiddleware,
    ingestService,
    occupancyService,
    sessionsService,
    simulatorService,
    redis,
  };
}
