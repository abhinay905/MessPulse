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
  OptOutRepository,
  RatingRepository,
  ComplaintRepository,
  HygieneReportRepository,
  TrayHoldRepository,
  WasteLedgerRepository,
  MealSummaryRepository,
  TimetableBreakRepository,
  DishStatRepository,
  RebateLedgerRepository,
  FastPassRepository,
  PushSubscriptionRepository,
  DeviceSightingRepository,
  AuditEventRepository,
  RatingDueStore,
  AuditCounterStore,
  ZoneReadingStore,
  ManualQueueStore,
  ObjectStorage,
  PushNotifier,
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
import { AdminService } from './modules/admin/admin.service';

import { MongoOptOutRepository } from './infra/mongo/opt-out.repository';
import { MongoRatingRepository } from './infra/mongo/rating.repository';
import { MongoComplaintRepository } from './infra/mongo/complaint.repository';
import { MongoHygieneReportRepository } from './infra/mongo/hygiene-report.repository';
import { MongoTrayHoldRepository } from './infra/mongo/tray-hold.repository';
import { MongoWasteLedgerRepository } from './infra/mongo/waste-ledger.repository';
import { MongoMealSummaryRepository } from './infra/mongo/meal-summary.repository';
import { MongoTimetableBreakRepository } from './infra/mongo/timetable-break.repository';
import { MongoDishStatRepository } from './infra/mongo/dish-stat.repository';
import { MongoRebateLedgerRepository } from './infra/mongo/rebate-ledger.repository';
import { MongoFastPassRepository } from './infra/mongo/fast-pass.repository';
import { MongoPushSubscriptionRepository } from './infra/mongo/push-subscription.repository';
import { MongoDeviceSightingRepository } from './infra/mongo/device-sighting.repository';
import { MongoAuditEventRepository } from './infra/mongo/audit-event.repository';

import { RedisRatingDueStore } from './infra/redis/rating-due-store.redis';
import { InMemoryRatingDueStore } from './infra/memory/rating-due-store.memory';
import { RedisAuditCounterStore } from './infra/redis/audit-counter-store.redis';
import { InMemoryAuditCounterStore } from './infra/memory/audit-counter-store.memory';
import { RedisZoneReadingStore } from './infra/redis/zone-reading-store.redis';
import { InMemoryZoneReadingStore } from './infra/memory/zone-reading-store.memory';
import { RedisManualQueueStore } from './infra/redis/manual-queue-store.redis';
import { InMemoryManualQueueStore } from './infra/memory/manual-queue-store.memory';

import { LocalDiskStorage } from './infra/storage/local-disk.storage';
import { NoopNotifier } from './infra/push/noop.notifier';

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
  adminService: AdminService;
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

  // Phase 2 Repositories
  optOutRepo: OptOutRepository;
  ratingRepo: RatingRepository;
  complaintRepo: ComplaintRepository;
  hygieneRepo: HygieneReportRepository;
  trayHoldRepo: TrayHoldRepository;
  wasteLedgerRepo: WasteLedgerRepository;
  mealSummaryRepo: MealSummaryRepository;
  timetableBreakRepo: TimetableBreakRepository;
  dishStatRepo: DishStatRepository;
  rebateLedgerRepo: RebateLedgerRepository;
  fastPassRepo: FastPassRepository;
  pushSubscriptionRepo: PushSubscriptionRepository;
  deviceSightingRepo: DeviceSightingRepository;
  auditEventRepo: AuditEventRepository;

  // Phase 2 Stores & Adapters
  ratingDueStore: RatingDueStore;
  auditCounterStore: AuditCounterStore;
  zoneReadingStore: ZoneReadingStore;
  manualQueueStore: ManualQueueStore;
  objectStorage: ObjectStorage;
  pushNotifier: PushNotifier;
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
  adminService?: AdminService | undefined;
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

  // Phase 2 Repositories
  optOutRepo?: OptOutRepository | undefined;
  ratingRepo?: RatingRepository | undefined;
  complaintRepo?: ComplaintRepository | undefined;
  hygieneRepo?: HygieneReportRepository | undefined;
  trayHoldRepo?: TrayHoldRepository | undefined;
  wasteLedgerRepo?: WasteLedgerRepository | undefined;
  mealSummaryRepo?: MealSummaryRepository | undefined;
  timetableBreakRepo?: TimetableBreakRepository | undefined;
  dishStatRepo?: DishStatRepository | undefined;
  rebateLedgerRepo?: RebateLedgerRepository | undefined;
  fastPassRepo?: FastPassRepository | undefined;
  pushSubscriptionRepo?: PushSubscriptionRepository | undefined;
  deviceSightingRepo?: DeviceSightingRepository | undefined;
  auditEventRepo?: AuditEventRepository | undefined;

  // Phase 2 Stores & Adapters
  ratingDueStore?: RatingDueStore | undefined;
  auditCounterStore?: AuditCounterStore | undefined;
  zoneReadingStore?: ZoneReadingStore | undefined;
  manualQueueStore?: ManualQueueStore | undefined;
  objectStorage?: ObjectStorage | undefined;
  pushNotifier?: PushNotifier | undefined;
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

  const adminService =
    overrides.adminService ??
    new AdminService(
      snapshotRepo,
      settingsRepo,
      mealRepo,
      sessionStore,
      eventBus,
      clock,
      config.JWT_SECRET
    );

  // Phase 2 Repositories
  const optOutRepo = overrides.optOutRepo ?? new MongoOptOutRepository();
  const ratingRepo = overrides.ratingRepo ?? new MongoRatingRepository();
  const complaintRepo = overrides.complaintRepo ?? new MongoComplaintRepository();
  const hygieneRepo = overrides.hygieneRepo ?? new MongoHygieneReportRepository();
  const trayHoldRepo = overrides.trayHoldRepo ?? new MongoTrayHoldRepository();
  const wasteLedgerRepo = overrides.wasteLedgerRepo ?? new MongoWasteLedgerRepository();
  const mealSummaryRepo = overrides.mealSummaryRepo ?? new MongoMealSummaryRepository();
  const timetableBreakRepo = overrides.timetableBreakRepo ?? new MongoTimetableBreakRepository();
  const dishStatRepo = overrides.dishStatRepo ?? new MongoDishStatRepository();
  const rebateLedgerRepo = overrides.rebateLedgerRepo ?? new MongoRebateLedgerRepository();
  const fastPassRepo = overrides.fastPassRepo ?? new MongoFastPassRepository();
  const pushSubscriptionRepo = overrides.pushSubscriptionRepo ?? new MongoPushSubscriptionRepository();
  const deviceSightingRepo = overrides.deviceSightingRepo ?? new MongoDeviceSightingRepository();
  const auditEventRepo = overrides.auditEventRepo ?? new MongoAuditEventRepository();

  // Phase 2 Stores & Adapters
  let ratingDueStore: RatingDueStore;
  if (overrides.ratingDueStore) {
    ratingDueStore = overrides.ratingDueStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    ratingDueStore = new InMemoryRatingDueStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    ratingDueStore = new RedisRatingDueStore(redis);
  }

  let auditCounterStore: AuditCounterStore;
  if (overrides.auditCounterStore) {
    auditCounterStore = overrides.auditCounterStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    auditCounterStore = new InMemoryAuditCounterStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    auditCounterStore = new RedisAuditCounterStore(redis);
  }

  let zoneReadingStore: ZoneReadingStore;
  if (overrides.zoneReadingStore) {
    zoneReadingStore = overrides.zoneReadingStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    zoneReadingStore = new InMemoryZoneReadingStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    zoneReadingStore = new RedisZoneReadingStore(redis);
  }

  let manualQueueStore: ManualQueueStore;
  if (overrides.manualQueueStore) {
    manualQueueStore = overrides.manualQueueStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    manualQueueStore = new InMemoryManualQueueStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    manualQueueStore = new RedisManualQueueStore(redis);
  }

  const objectStorage = overrides.objectStorage ?? new LocalDiskStorage();
  const pushNotifier = overrides.pushNotifier ?? new NoopNotifier();

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
    adminService,
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

    // Phase 2 Repositories
    optOutRepo,
    ratingRepo,
    complaintRepo,
    hygieneRepo,
    trayHoldRepo,
    wasteLedgerRepo,
    mealSummaryRepo,
    timetableBreakRepo,
    dishStatRepo,
    rebateLedgerRepo,
    fastPassRepo,
    pushSubscriptionRepo,
    deviceSightingRepo,
    auditEventRepo,

    // Phase 2 Stores & Adapters
    ratingDueStore,
    auditCounterStore,
    zoneReadingStore,
    manualQueueStore,
    objectStorage,
    pushNotifier,
  };
}
