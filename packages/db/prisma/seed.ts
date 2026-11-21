import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ key: string; description: string }> = [
  { key: 'roles.manage', description: 'Create and manage roles and permissions' },
  { key: 'users.manage', description: 'Create and manage staff/admin users' },
  { key: 'settings.payment', description: 'Configure payment gateways (bKash merchant number)' },
  { key: 'settings.sms', description: 'Configure SMS gateway and templates' },
  { key: 'settings.tax', description: 'Enable/disable VAT and set rate' },
  { key: 'settings.billing', description: 'Billing engine settings' },
  { key: 'settings.branding', description: 'Manage software name and logo' },
  { key: 'upstream.manage', description: 'Manage upstream panel session and adapter' },
  { key: 'sync.trigger', description: 'Trigger upstream sync jobs' },

  { key: 'clients.view', description: 'View clients' },
  { key: 'clients.create', description: 'Create clients' },
  { key: 'clients.edit', description: 'Edit clients' },
  { key: 'clients.delete', description: 'Remove clients' },
  { key: 'clients.reveal_credentials', description: 'Reveal PPPoE credentials' },
  { key: 'clients.view_nid', description: 'View client NID number and photo' },
  { key: 'clients.export', description: 'Export client lists' },
  { key: 'clients.recharge', description: 'Recharge clients' },

  { key: 'invoices.view', description: 'View invoices' },
  { key: 'invoices.create', description: 'Create invoices' },
  { key: 'invoices.waive', description: 'Waive or discount invoices' },
  { key: 'invoices.send', description: 'Send invoices via SMS/email' },

  { key: 'payments.view', description: 'View payments' },
  { key: 'payments.collect', description: 'Record cash/manual payments' },
  { key: 'payments.verify', description: 'Verify bKash transactions' },
  { key: 'payments.reject', description: 'Reject bKash transactions' },
  { key: 'payments.reconcile', description: 'Match unmatched payments' },
  { key: 'payments.refund', description: 'Refund payments' },
  { key: 'auto_recharge.toggle', description: 'Enable/disable auto recharge globally' },

  { key: 'reports.view', description: 'View operational reports' },
  { key: 'reports.financial', description: 'View VAT and financial reports' },
  { key: 'reports.profit', description: 'View profit and margin reports' },
  { key: 'reports.recharge', description: 'View recharge history' },
  { key: 'reports.ledger', description: 'View debit and credit history' },
  { key: 'audit.view', description: 'View audit logs' },
  { key: 'logs.client_login', description: 'View client portal login history' },
  { key: 'logs.user_login', description: 'View user login history' },
  { key: 'logs.audit', description: 'View change audit log' },
  { key: 'admins.manage', description: 'Create and delete admin users' },

  { key: 'packages.view', description: 'View packages' },
  { key: 'packages.view_cost', description: 'View upstream package cost' },
  { key: 'packages.edit', description: 'Create/edit packages' },
  { key: 'areas.view', description: 'View areas' },
  { key: 'areas.edit', description: 'Create/edit areas' },
  { key: 'tickets.view', description: 'View support tickets' },
  { key: 'tickets.manage', description: 'Manage support tickets' },

  { key: 'portal.view', description: 'Client portal access' },
  { key: 'portal.invoices', description: 'View own invoices' },
  { key: 'portal.payments', description: 'View own payments' },
  { key: 'portal.pay', description: 'Submit a payment' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: PERMISSIONS.map((p) => p.key),
  admin: PERMISSIONS.filter(
    (p) =>
      ![
        'roles.manage',
        'settings.payment',
        'settings.sms',
        'settings.tax',
        'settings.billing',
        'upstream.manage',
        'sync.trigger',
        'auto_recharge.toggle',
        'admins.manage',
        'reports.profit',
        'packages.view_cost',
        'logs.client_login',
        'logs.user_login',
        'logs.audit',
        'audit.view',
      ].includes(p.key),
  ).map((p) => p.key),
  staff: [
    'clients.view',
    'clients.create',
    'clients.edit',
    'clients.recharge',
    'clients.reveal_credentials',
    'invoices.view',
    'payments.view',
    'payments.collect',
    'payments.verify',
    'payments.reject',
    'payments.reconcile',
    'reports.view',
    'packages.view',
    'areas.view',
    'tickets.view',
  ],
  client: ['portal.view', 'portal.invoices', 'portal.payments', 'portal.pay'],
};

async function main() {
  const tenantCode = process.env.SEED_TENANT_CODE || 'TRG';
  const tenantName = process.env.SEED_TENANT_NAME || 'JR COMMUNICATION';

  const tenant = await prisma.tenant.upsert({
    where: { code: tenantCode },
    update: { name: tenantName },
    create: { code: tenantCode, name: tenantName },
  });

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }

  const roleLevels: Record<string, number> = {
    super_admin: 0,
    admin: 10,
    staff: 20,
    client: 30,
  };

  for (const [name, level] of Object.entries(roleLevels)) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: { level, isSystem: true },
      create: { tenantId: tenant.id, name, level, isSystem: true },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const keys = ROLE_PERMISSIONS[name] || [];
    if (keys.length) {
      await prisma.rolePermission.createMany({
        data: keys.map((permissionKey) => ({ roleId: role.id, permissionKey })),
      });
    }
  }

  const superRole = await prisma.role.findUniqueOrThrow({
    where: { tenantId_name: { tenantId: tenant.id, name: 'super_admin' } },
  });

  const mobile = process.env.SEED_SUPER_ADMIN_MOBILE || '01700000000';
  const loginId = process.env.SEED_SUPER_ADMIN_LOGIN_ID || 'superadmin';
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.SEED_SUPER_ADMIN_NAME || 'Super Admin';
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { tenantId_mobile: { tenantId: tenant.id, mobile } },
    update: { name, loginId, passwordHash, roleId: superRole.id, status: 'active' },
    create: {
      tenantId: tenant.id,
      name,
      mobile,
      loginId,
      passwordHash,
      roleId: superRole.id,
      status: 'active',
    },
  });

  await prisma.taxSetting.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id, enabled: false, rateBps: 500, inclusive: false, label: 'VAT' },
  });

  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: 'brand_name' } },
    update: {},
    create: { tenantId: tenant.id, key: 'brand_name', value: tenantName },
  });

  const providers = [
    { type: 'bkash', label: 'bKash' },
    { type: 'nagad', label: 'Nagad' },
    { type: 'rocket', label: 'Rocket' },
  ];

  for (const provider of providers) {
    await prisma.paymentGateway.upsert({
      where: { id: `${tenant.id}-${provider.type}` },
      update: { merchantActive: true },
      create: {
        id: `${tenant.id}-${provider.type}`,
        tenantId: tenant.id,
        type: provider.type,
        label: `${provider.label} Merchant`,
        instructions: 'Send Money to this number and submit the reference.',
        merchantActive: true,
        personalActive: false,
        isActive: false,
      },
    });
  }

  // Backfill 4-digit payment codes for existing clients.
  const existingCodes = await prisma.client.findMany({
    where: { tenantId: tenant.id, paymentCode: { not: null } },
    select: { paymentCode: true },
  });
  const usedCodes = new Set(existingCodes.map((client) => client.paymentCode));
  const clientsWithoutCode = await prisma.client.findMany({
    where: { tenantId: tenant.id, paymentCode: null },
    select: { id: true },
  });

  let nextCode = 1000;
  for (const client of clientsWithoutCode) {
    while (usedCodes.has(String(nextCode)) && nextCode <= 9999) {
      nextCode += 1;
    }
    if (nextCode > 9999) break;
    const paymentCode = String(nextCode);
    usedCodes.add(paymentCode);
    await prisma.client.update({
      where: { id: client.id },
      data: { paymentCode },
    });
    nextCode += 1;
  }

  const ledgerAccounts = [
    { code: '1000', name: 'Cash / Bank', type: 'asset' },
    { code: '1100', name: 'Client Wallet', type: 'liability' },
    { code: '4000', name: 'Service Revenue', type: 'revenue' },
    { code: '5000', name: 'Upstream Cost', type: 'expense' },
    { code: '5100', name: 'Gateway Fee', type: 'expense' },
  ];

  for (const account of ledgerAccounts) {
    await prisma.ledgerAccount.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: account.code } },
      update: { name: account.name, type: account.type },
      create: { tenantId: tenant.id, ...account },
    });
  }

  console.log('Seed complete');
  console.log(`  Tenant:      ${tenant.code} (${tenant.name})`);
  console.log(`  Super admin: ${mobile}`);
  console.log(`  Login ID:    ${loginId}`);
  console.log(`  Password:    ${password}`);
  console.log(`  Payment codes backfilled: ${clientsWithoutCode.length}`);
  console.log('  Change the password immediately after first login.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
