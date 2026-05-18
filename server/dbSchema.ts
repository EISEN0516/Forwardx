import type Database from "better-sqlite3";

export function ensureDatabaseSchema(sqlite: Database.Database) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        name TEXT,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        canAddRules INTEGER NOT NULL DEFAULT 0,
        trafficLimit INTEGER NOT NULL DEFAULT 0,
        trafficUsed INTEGER NOT NULL DEFAULT 0,
        allowForwardXTunnel INTEGER NOT NULL DEFAULT 0,
        gostRateLimitIn INTEGER NOT NULL DEFAULT 0,
        gostRateLimitOut INTEGER NOT NULL DEFAULT 0,
        maxConnections INTEGER NOT NULL DEFAULT 0,
        maxIPs INTEGER NOT NULL DEFAULT 0,
        balanceCents INTEGER NOT NULL DEFAULT 0,
        expiresAt INTEGER,
        trafficAutoReset INTEGER NOT NULL DEFAULT 0,
        trafficResetDay INTEGER NOT NULL DEFAULT 1,
        lastTrafficReset INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
        lastSignedIn INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS hosts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ip TEXT NOT NULL,
        ipv4 TEXT,
        ipv6 TEXT,
        hostType TEXT NOT NULL DEFAULT 'slave',
        agentToken TEXT,
        osInfo TEXT,
        cpuInfo TEXT,
        memoryTotal INTEGER,
        agentVersion TEXT,
        agentUpgradeRequested INTEGER NOT NULL DEFAULT 0,
        agentUpgradeTargetVersion TEXT,
        agentUpgradeRequestedAt INTEGER,
        networkInterface TEXT,
        portRangeStart INTEGER,
        portRangeEnd INTEGER,
        isOnline INTEGER NOT NULL DEFAULT 0,
        lastHeartbeat INTEGER,
        userId INTEGER NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_hosts_user ON hosts(userId);
      CREATE INDEX IF NOT EXISTS idx_hosts_token ON hosts(agentToken);

      CREATE TABLE IF NOT EXISTS forward_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hostId INTEGER NOT NULL,
        name TEXT NOT NULL,
        forwardType TEXT NOT NULL DEFAULT 'iptables',
        protocol TEXT NOT NULL DEFAULT 'both',
        gostMode TEXT NOT NULL DEFAULT 'direct',
        gostRelayHost TEXT,
        gostRelayPort INTEGER,
        tunnelId INTEGER,
        tunnelExitPort INTEGER,
        sourcePort INTEGER NOT NULL,
        targetIp TEXT NOT NULL,
        targetPort INTEGER NOT NULL,
        isEnabled INTEGER NOT NULL DEFAULT 1,
        disabledByTunnel INTEGER NOT NULL DEFAULT 0,
        disabledByUser INTEGER NOT NULL DEFAULT 0,
        isRunning INTEGER NOT NULL DEFAULT 0,
        pendingDelete INTEGER NOT NULL DEFAULT 0,
        userId INTEGER NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_rules_host ON forward_rules(hostId);
      CREATE INDEX IF NOT EXISTS idx_rules_user ON forward_rules(userId);

      CREATE TABLE IF NOT EXISTS tunnels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        entryHostId INTEGER NOT NULL,
        exitHostId INTEGER NOT NULL,
        mode TEXT NOT NULL DEFAULT 'tls',
        secret TEXT,
        listenPort INTEGER NOT NULL,
        portRangeStart INTEGER,
        portRangeEnd INTEGER,
        isEnabled INTEGER NOT NULL DEFAULT 1,
        isRunning INTEGER NOT NULL DEFAULT 0,
        lastLatencyMs INTEGER,
        lastTestStatus TEXT,
        lastTestMessage TEXT,
        lastTestAt INTEGER,
        userId INTEGER NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_tunnels_entry_host ON tunnels(entryHostId);
      CREATE INDEX IF NOT EXISTS idx_tunnels_exit_host ON tunnels(exitHostId);
      CREATE INDEX IF NOT EXISTS idx_tunnels_user ON tunnels(userId);

      CREATE TABLE IF NOT EXISTS host_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hostId INTEGER NOT NULL,
        cpuUsage INTEGER,
        memoryUsage INTEGER,
        memoryUsed INTEGER,
        networkIn INTEGER,
        networkOut INTEGER,
        diskUsage INTEGER,
        diskUsed INTEGER,
        diskTotal INTEGER,
        uptime INTEGER,
        recordedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_host_metrics_host_time ON host_metrics(hostId, recordedAt DESC);

      CREATE TABLE IF NOT EXISTS traffic_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ruleId INTEGER NOT NULL,
        hostId INTEGER NOT NULL,
        bytesIn INTEGER NOT NULL DEFAULT 0,
        bytesOut INTEGER NOT NULL DEFAULT 0,
        connections INTEGER NOT NULL DEFAULT 0,
        recordedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_traffic_rule_time ON traffic_stats(ruleId, recordedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_traffic_host_time ON traffic_stats(hostId, recordedAt DESC);

      CREATE TABLE IF NOT EXISTS tunnel_latency_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tunnelId INTEGER NOT NULL,
        latencyMs INTEGER,
        isTimeout INTEGER NOT NULL DEFAULT 0,
        recordedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_tunnel_latency_time ON tunnel_latency_stats(tunnelId, recordedAt DESC);

      CREATE TABLE IF NOT EXISTS agent_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        hostId INTEGER,
        description TEXT,
        isUsed INTEGER NOT NULL DEFAULT 0,
        userId INTEGER NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_agent_tokens_user ON agent_tokens(userId);

      CREATE TABLE IF NOT EXISTS tcping_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ruleId INTEGER NOT NULL,
        hostId INTEGER NOT NULL,
        latencyMs INTEGER,
        isTimeout INTEGER NOT NULL DEFAULT 0,
        recordedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_tcping_rule_time ON tcping_stats(ruleId, recordedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_tcping_host_time ON tcping_stats(hostId, recordedAt DESC);

      CREATE TABLE IF NOT EXISTS forward_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ruleId INTEGER NOT NULL,
        hostId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        listenOk INTEGER NOT NULL DEFAULT 0,
        targetReachable INTEGER NOT NULL DEFAULT 0,
        forwardOk INTEGER NOT NULL DEFAULT 0,
        latencyMs INTEGER,
        message TEXT,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_forward_tests_rule ON forward_tests(ruleId, createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_forward_tests_host_status ON forward_tests(hostId, status);
    `);

    // 数据库迁移：为旧数据库添加新列（ALTER TABLE ADD COLUMN 在列已存在时会报错，忽略即可）
    const migrations = [
      `ALTER TABLE hosts ADD COLUMN networkInterface TEXT`,
      `ALTER TABLE hosts ADD COLUMN portRangeStart INTEGER`,
      `ALTER TABLE hosts ADD COLUMN portRangeEnd INTEGER`,
      `ALTER TABLE hosts ADD COLUMN ipv4 TEXT`,
      `ALTER TABLE hosts ADD COLUMN ipv6 TEXT`,
      `ALTER TABLE hosts ADD COLUMN agentVersion TEXT`,
      `ALTER TABLE hosts ADD COLUMN agentUpgradeRequested INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE hosts ADD COLUMN agentUpgradeTargetVersion TEXT`,
      `ALTER TABLE hosts ADD COLUMN agentUpgradeRequestedAt INTEGER`,
      `ALTER TABLE host_metrics ADD COLUMN diskUsed INTEGER`,
      `ALTER TABLE host_metrics ADD COLUMN diskTotal INTEGER`,
      `ALTER TABLE users ADD COLUMN canAddRules INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN trafficLimit INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN trafficUsed INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN gostRateLimitIn INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN gostRateLimitOut INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN expiresAt INTEGER`,
      `ALTER TABLE users ADD COLUMN trafficAutoReset INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN trafficResetDay INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE users ADD COLUMN lastTrafficReset INTEGER`,
      `ALTER TABLE users ADD COLUMN maxRules INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN maxPorts INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE hosts ADD COLUMN entryIp TEXT`,
      `ALTER TABLE users ADD COLUMN allowedForwardTypes TEXT`,
      `ALTER TABLE users ADD COLUMN allowForwardXTunnel INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN maxConnections INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN maxIPs INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE forward_rules ADD COLUMN gostMode TEXT NOT NULL DEFAULT 'direct'`,
      `ALTER TABLE forward_rules ADD COLUMN gostRelayHost TEXT`,
      `ALTER TABLE forward_rules ADD COLUMN gostRelayPort INTEGER`,
      `ALTER TABLE forward_rules ADD COLUMN tunnelId INTEGER`,
      `ALTER TABLE forward_rules ADD COLUMN tunnelExitPort INTEGER`,
      `ALTER TABLE forward_rules ADD COLUMN pendingDelete INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE forward_rules ADD COLUMN disabledByTunnel INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE forward_rules ADD COLUMN disabledByUser INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE tunnels ADD COLUMN secret TEXT`,
      `ALTER TABLE tunnels ADD COLUMN portRangeStart INTEGER`,
      `ALTER TABLE tunnels ADD COLUMN portRangeEnd INTEGER`,
    ];

    // 创建用户-主机权限表
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS user_host_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        hostId INTEGER NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(userId, hostId)
      );
      CREATE INDEX IF NOT EXISTS idx_uhp_user ON user_host_permissions(userId);
      CREATE INDEX IF NOT EXISTS idx_uhp_host ON user_host_permissions(hostId);

      CREATE TABLE IF NOT EXISTS user_tunnel_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        tunnelId INTEGER NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(userId, tunnelId)
      );
      CREATE INDEX IF NOT EXISTS idx_utp_user ON user_tunnel_permissions(userId);
      CREATE INDEX IF NOT EXISTS idx_utp_tunnel ON user_tunnel_permissions(tunnelId);
    `);

    // 创建系统设置表（k-v）
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS payment_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outTradeNo TEXT NOT NULL UNIQUE,
        userId INTEGER NOT NULL,
        provider TEXT NOT NULL,
        paymentType TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        subject TEXT NOT NULL,
        amountCents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CNY',
        tradeNo TEXT,
        payUrl TEXT,
        qrCode TEXT,
        orderType TEXT NOT NULL DEFAULT 'balance',
        planId INTEGER,
        subscriptionId INTEGER,
        discountCodeId INTEGER,
        discountAmountCents INTEGER NOT NULL DEFAULT 0,
        clientIp TEXT,
        rawNotify TEXT,
        expiresAt INTEGER,
        paidAt INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(userId, createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status, createdAt DESC);

      CREATE TABLE IF NOT EXISTS subscription_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        priceCents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'CNY',
        durationDays INTEGER NOT NULL DEFAULT 30,
        portCount INTEGER NOT NULL DEFAULT 20,
        trafficLimit INTEGER NOT NULL DEFAULT 0,
        rateLimitMbps INTEGER NOT NULL DEFAULT 0,
        maxRules INTEGER NOT NULL DEFAULT 20,
        maxConnections INTEGER NOT NULL DEFAULT 2000,
        maxIPs INTEGER NOT NULL DEFAULT 10,
        isActive INTEGER NOT NULL DEFAULT 1,
        isStoreVisible INTEGER NOT NULL DEFAULT 1,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS subscription_plan_hosts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        planId INTEGER NOT NULL,
        hostId INTEGER NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plan_hosts_unique ON subscription_plan_hosts(planId, hostId);
      CREATE TABLE IF NOT EXISTS subscription_plan_tunnels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        planId INTEGER NOT NULL,
        tunnelId INTEGER NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plan_tunnels_unique ON subscription_plan_tunnels(planId, tunnelId);
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        planId INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        source TEXT NOT NULL DEFAULT 'admin',
        paymentOrderNo TEXT,
        portRangeStart INTEGER,
        portRangeEnd INTEGER,
        nextTrafficResetAt INTEGER,
        lastTrafficResetAt INTEGER,
        startedAt INTEGER NOT NULL DEFAULT (unixepoch()),
        expiresAt INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(userId, status, expiresAt);
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan ON user_subscriptions(planId);

      CREATE TABLE IF NOT EXISTS balance_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        type TEXT NOT NULL,
        amountCents INTEGER NOT NULL,
        balanceAfterCents INTEGER NOT NULL,
        description TEXT,
        operatorUserId INTEGER,
        paymentOrderNo TEXT,
        redemptionCodeId INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_balance_transactions_user ON balance_transactions(userId, createdAt DESC);

      CREATE TABLE IF NOT EXISTS redemption_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        planId INTEGER,
        durationDays INTEGER,
        amountCents INTEGER NOT NULL DEFAULT 0,
        startsAt INTEGER,
        expiresAt INTEGER,
        isActive INTEGER NOT NULL DEFAULT 1,
        usedByUserId INTEGER,
        usedAt INTEGER,
        createdByUserId INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_redemption_codes_status ON redemption_codes(isActive, startsAt, expiresAt, usedAt);

      CREATE TABLE IF NOT EXISTS discount_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        discountType TEXT NOT NULL,
        discountValue INTEGER NOT NULL,
        maxUses INTEGER NOT NULL DEFAULT 0,
        usedCount INTEGER NOT NULL DEFAULT 0,
        startsAt INTEGER,
        expiresAt INTEGER,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdByUserId INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_discount_codes_status ON discount_codes(isActive, startsAt, expiresAt, usedCount);

      CREATE TABLE IF NOT EXISTS discount_code_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discountCodeId INTEGER NOT NULL,
        planId INTEGER NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(discountCodeId, planId)
      );
      CREATE INDEX IF NOT EXISTS idx_discount_code_plans_code ON discount_code_plans(discountCodeId);
      CREATE INDEX IF NOT EXISTS idx_discount_code_plans_plan ON discount_code_plans(planId);

      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'normal',
        isActive INTEGER NOT NULL DEFAULT 1,
        startsAt INTEGER,
        expiresAt INTEGER,
        createdByUserId INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
        updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(type, isActive, startsAt, expiresAt, updatedAt DESC);

      CREATE TABLE IF NOT EXISTS announcement_reads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        announcementId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        dismissedAt INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(announcementId, userId)
      );
      CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON announcement_reads(userId, announcementId);
    `);
    for (const stmt of [
      `ALTER TABLE users ADD COLUMN balanceCents INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE payment_orders ADD COLUMN planId INTEGER`,
      `ALTER TABLE payment_orders ADD COLUMN subscriptionId INTEGER`,
      `ALTER TABLE payment_orders ADD COLUMN orderType TEXT NOT NULL DEFAULT 'balance'`,
      `ALTER TABLE payment_orders ADD COLUMN discountCodeId INTEGER`,
      `ALTER TABLE payment_orders ADD COLUMN discountAmountCents INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE subscription_plans ADD COLUMN maxConnections INTEGER NOT NULL DEFAULT 2000`,
      `ALTER TABLE subscription_plans ADD COLUMN maxIPs INTEGER NOT NULL DEFAULT 10`,
      `ALTER TABLE user_subscriptions ADD COLUMN nextTrafficResetAt INTEGER`,
      `ALTER TABLE user_subscriptions ADD COLUMN lastTrafficResetAt INTEGER`,
    ]) {
      try { sqlite.exec(stmt); } catch { /* column already exists */ }
    }
    for (const m of migrations) {
      try { sqlite.exec(m); } catch { /* column already exists */ }
    }
    sqlite.prepare(
      `INSERT OR IGNORE INTO system_settings (key, value, updatedAt) VALUES ('storeEnabled', 'false', unixepoch())`
    ).run();
    sqlite.prepare(
      `INSERT OR IGNORE INTO system_settings (key, value, updatedAt) VALUES ('redemptionEnabled', 'true', unixepoch())`
    ).run();
    sqlite.prepare(
      `INSERT OR IGNORE INTO system_settings (key, value, updatedAt) VALUES ('discountEnabled', 'true', unixepoch())`
    ).run();
}
