'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icon';
import { useI18n } from '@/lib/i18n';
import { useLiveAuth } from '@/lib/live-auth';
import type { ManagedRole, ManagedUser, PermissionOption } from '@/lib/live-api';
import {
  createManagedUser,
  deleteUser,
  formatDateTime,
  getPermissions,
  getRoles,
  getUsers,
  resetUserPassword,
  restoreUser,
  saveUserPermissions,
  setUserStatus,
  updateManagedUser,
} from '@/lib/live-api';

const GROUP_LABELS: Record<string, string> = {
  clients: 'Clients',
  payments: 'Payments',
  invoices: 'Invoices',
  reports: 'Reports',
  packages: 'Packages',
  areas: 'Areas',
  tickets: 'Tickets',
  users: 'Users',
  roles: 'Roles',
  settings: 'Settings',
  upstream: 'Upstream',
  auto_recharge: 'Auto-recharge',
  audit: 'Audit',
  portal: 'Client Portal',
};

const ROLE_TONE: Record<string, string> = {
  super_admin: 'orange',
  admin: 'blue',
  staff: 'green',
  client: 'gray',
};

function effectivePermissions(user: ManagedUser): Set<string> {
  const set = new Set(user.role.rolePermissions.map((item) => item.permissionKey));
  for (const override of user.permissionOverrides) {
    if (override.effect === 'allow') set.add(override.permissionKey);
    if (override.effect === 'deny') set.delete(override.permissionKey);
  }
  return set;
}

export default function LiveUsersPage() {
  const { user: actor } = useLiveAuth();
  const { t } = useI18n();
  const isSuperAdmin = actor?.role === 'super_admin';

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    loginId: '',
    mobile: '',
    password: '',
  });
  const [addError, setAddError] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState({ name: '', loginId: '', mobile: '' });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [permUser, setPermUser] = useState<ManagedUser | null>(null);
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({});
  const [permSaving, setPermSaving] = useState(false);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRoleFilter(params.get('role') ?? '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      getUsers(roleFilter || undefined, showArchived),
      getRoles(),
      getPermissions(),
    ]);
    if (results[0].status === 'fulfilled') setUsers(results[0].value);
    if (results[1].status === 'fulfilled') setRoles(results[1].value);
    if (results[2].status === 'fulfilled') setPermissions(results[2].value);
    if (results.some((result) => result.status === 'rejected')) {
      setError('ইউজার ডেটা লোড করতে সমস্যা হয়েছে');
    }
    setLoading(false);
  }, [reloadKey, roleFilter, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const availableRoles = useMemo(() => {
    if (!actor) return [];
    return roles.filter((role) =>
      actor.role === 'super_admin' ? true : role.level > actor.roleLevel,
    );
  }, [roles, actor]);

  // Role is no longer selected by hand — it comes from the section (tab).
  const creationRole = useMemo(() => {
    if (roleFilter && availableRoles.some((role) => role.name === roleFilter)) {
      return roleFilter;
    }
    return availableRoles.find((role) => role.name === 'staff')?.name ?? availableRoles[0]?.name ?? 'staff';
  }, [roleFilter, availableRoles]);

  // Real-time search by User ID / phone / login ID / name
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.userCode, user.mobile, user.loginId, user.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [users, search]);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    for (const permission of permissions) {
      const group = permission.key.split('.')[0];
      const list = map.get(group) ?? [];
      list.push(permission);
      map.set(group, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  function canManage(target: ManagedUser) {
    if (!actor) return false;
    if (target.id === actor.id) return false;
    if (actor.role === 'super_admin') return true;
    if (target.role.name === 'super_admin') return false;
    return target.role.level > actor.roleLevel;
  }

  async function onAddUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddError('');
    setAddSubmitting(true);

    try {
      const created = await createManagedUser({
        name: addForm.name.trim(),
        loginId: addForm.loginId.trim(),
        mobile: addForm.mobile.trim(),
        password: addForm.password,
        roleName: creationRole,
      });
      setToast({ message: `ইউজার তৈরি হয়েছে — ${created.name} (ID: ${created.userCode ?? '—'})` });
      setAddOpen(false);
      setAddForm({ name: '', loginId: '', mobile: '', password: '' });
      setReloadKey((key) => key + 1);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'ইউজার তৈরি করা যায়নি');
    } finally {
      setAddSubmitting(false);
    }
  }

  function openEdit(target: ManagedUser) {
    setEditUser(target);
    setEditForm({
      name: target.name,
      loginId: target.loginId ?? '',
      mobile: target.mobile,
    });
    setEditError('');
  }

  async function onSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editUser) return;
    setEditError('');
    setEditSaving(true);
    try {
      await updateManagedUser(editUser.id, {
        name: editForm.name.trim(),
        loginId: editForm.loginId.trim(),
        mobile: editForm.mobile.trim(),
      });
      setToast({ message: 'ইউজার আপডেট হয়েছে।' });
      setEditUser(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'আপডেট করা যায়নি');
    } finally {
      setEditSaving(false);
    }
  }

  function openPermissions(target: ManagedUser) {
    const effective = effectivePermissions(target);
    setPermDraft(
      Object.fromEntries(permissions.map((permission) => [permission.key, effective.has(permission.key)])),
    );
    setPermUser(target);
  }

  async function onSavePermissions() {
    if (!permUser) return;
    setPermSaving(true);

    try {
      const roleKeys = new Set(
        permUser.role.rolePermissions.map((item) => item.permissionKey),
      );
      const overrides: Array<{ permissionKey: string; effect: 'allow' | 'deny' }> = [];

      for (const permission of permissions) {
        const desired = Boolean(permDraft[permission.key]);
        const roleHas = roleKeys.has(permission.key);
        if (desired && !roleHas) {
          overrides.push({ permissionKey: permission.key, effect: 'allow' });
        }
        if (!desired && roleHas) {
          overrides.push({ permissionKey: permission.key, effect: 'deny' });
        }
      }

      await saveUserPermissions(permUser.id, overrides);
      setToast({ message: 'পারমিশন আপডেট হয়েছে।' });
      setPermUser(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'পারমিশন সেভ হয়নি',
        error: true,
      });
    } finally {
      setPermSaving(false);
    }
  }

  async function onResetPassword() {
    if (!passwordUser) return;
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('পাসওয়ার্ড কমপক্ষে ৮ অক্ষর হতে হবে');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('দুইটি পাসওয়ার্ড মিলছে না');
      return;
    }

    setPasswordSaving(true);
    try {
      await resetUserPassword(passwordUser.id, newPassword);
      setToast({ message: 'পাসওয়ার্ড রিসেট হয়েছে — সব পুরনো সেশন বন্ধ হয়েছে।' });
      setPasswordUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'পাসওয়ার্ড রিসেট হয়নি');
    } finally {
      setPasswordSaving(false);
    }
  }

  async function onArchive(target: ManagedUser) {
    if (
      !window.confirm(
        `${target.name}-কে archive করবেন? অ্যাকাউন্টটি বন্ধ হবে; record ও history থেকে যাবে। শুধু Super Admin Archived তালিকায় দেখতে পারবে।`,
      )
    ) {
      return;
    }

    try {
      await deleteUser(target.id);
      setToast({ message: 'ইউজার archive হয়েছে।' });
      setReloadKey((key) => key + 1);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Archive করা যায়নি',
        error: true,
      });
    }
  }

  async function onRestore(target: ManagedUser) {
    try {
      await restoreUser(target.id);
      setToast({ message: `${target.name} আবার চালু হয়েছে।` });
      setReloadKey((key) => key + 1);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Restore করা যায়নি',
        error: true,
      });
    }
  }

  async function onToggleStatus(target: ManagedUser) {
    const next = target.status === 'active' ? 'disabled' : 'active';
    if (
      !window.confirm(
        `${target.name}-কে ${next === 'active' ? 'চালু' : 'বন্ধ'} করবেন?`,
      )
    ) {
      return;
    }

    try {
      await setUserStatus(target.id, next);
      setToast({ message: `ইউজার ${next === 'active' ? 'চালু' : 'বন্ধ'} হয়েছে।` });
      setReloadKey((key) => key + 1);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'স্ট্যাটাস বদলানো যায়নি',
        error: true,
      });
    }
  }

  const total = users.length;
  const adminCount = users.filter((user) =>
    ['super_admin', 'admin'].includes(user.role.name),
  ).length;
  const staffCount = users.filter((user) => user.role.name === 'staff').length;
  const clientCount = users.filter((user) => user.role.name === 'client').length;

  return (
    <>
      <div className="demo-page-head">
        <div>
          <h2>
            {showArchived
              ? t('users.archivedTitle')
              : roleFilter === 'admin'
                ? 'Admin Management'
                : roleFilter === 'staff'
                  ? 'Staff Management'
                  : t('users.allUsers')}
          </h2>
          <p className="demo-page-sub">{t('users.accessControl')}</p>
        </div>
        <div className="demo-actions">
          <button
            className="demo-btn ghost"
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <Icon name="trend-up" size={15} />
            রিফ্রেশ
          </button>
          {isSuperAdmin ? (
            <button
              className="demo-btn ghost"
              type="button"
              onClick={() => setShowArchived((value) => !value)}
            >
              <Icon name="shield" size={15} />
              {showArchived ? t('users.activeUsers') : 'Archived'}
            </button>
          ) : null}
          {!showArchived ? (
            <button className="demo-btn primary" type="button" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={15} />
              {t('addUser')}
            </button>
          ) : null}
        </div>
      </div>

      {!showArchived ? (
        <section className="demo-stat-grid">
          <article className="demo-stat-card">
            <div className="demo-stat-top">
              <div className="demo-stat-icon orange">
                <Icon name="users" size={19} />
              </div>
            </div>
            <p className="demo-stat-label">Total Users</p>
            <p className="demo-stat-value">{total}</p>
            <p className="demo-stat-hint">{t('users.allRoles')}</p>
          </article>
          <article className="demo-stat-card">
            <div className="demo-stat-top">
              <div className="demo-stat-icon blue">
                <Icon name="shield" size={19} />
              </div>
            </div>
            <p className="demo-stat-label">Admin</p>
            <p className="demo-stat-value">{adminCount}</p>
            <p className="demo-stat-hint">Super Admin + Admin</p>
          </article>
          <article className="demo-stat-card">
            <div className="demo-stat-top">
              <div className="demo-stat-icon green">
                <Icon name="users" size={19} />
              </div>
            </div>
            <p className="demo-stat-label">Staff</p>
            <p className="demo-stat-value">{staffCount}</p>
            <p className="demo-stat-hint">{t('users.allAreas')}</p>
          </article>
          <article className="demo-stat-card">
            <div className="demo-stat-top">
              <div className="demo-stat-icon red">
                <Icon name="home" size={19} />
              </div>
            </div>
            <p className="demo-stat-label">Client Users</p>
            <p className="demo-stat-value">{clientCount}</p>
            <p className="demo-stat-hint">Portal access</p>
          </article>
        </section>
      ) : null}

      <article className="demo-card">
        <div className="demo-card-head">
          <div>
            <h3>{showArchived ? 'Archived Users' : 'সব ইউজার'}</h3>
            <p>
              {showArchived
                ? 'শুধু Super Admin এখানে দেখতে ও restore করতে পারবে'
                : 'User ID / ফোন নম্বর দিয়ে খুঁজুন · Admin শুধু নিজের চেয়ে নিচের রোল ম্যানেজ করতে পারবে'}
            </p>
          </div>
          <span className="demo-badge blue">{filteredUsers.length}</span>
        </div>

        {!showArchived ? (
          <div className="demo-toolbar" style={{ marginBottom: 12 }}>
            <div className="demo-search-input" style={{ width: 'min(340px, 100%)' }}>
              <Icon name="search" size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="User ID / ফোন নম্বর খুঁজুন…"
              />
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="live-loading">
            <div className="live-spinner" />
            ইউজার লোড হচ্ছে…
          </div>
        ) : error ? (
          <div className="live-error">{error}</div>
        ) : filteredUsers.length === 0 ? (
          <div className="live-empty">
            {showArchived ? 'কোনো archived ইউজার নেই' : 'কোনো ইউজার পাওয়া যায়নি'}
          </div>
        ) : (
          <div className="demo-table-wrap">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>User ID</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Areas</th>
                  <th>Last Login</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((managedUser) => {
                  const manageable = canManage(managedUser);
                  const isSelf = managedUser.id === actor?.id;
                  return (
                    <tr key={managedUser.id}>
                      <td>
                        <span className="demo-cell-main">{managedUser.name}</span>
                        <span className="demo-cell-sub">
                          {managedUser.loginId ? `@${managedUser.loginId} · ` : ''}
                          {managedUser.mobile}
                        </span>
                      </td>
                      <td className="mono">{managedUser.userCode ?? '—'}</td>
                      <td>
                        <span
                          className={`demo-badge ${ROLE_TONE[managedUser.role.name] ?? 'gray'}`}
                        >
                          {managedUser.role.name.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`demo-badge ${
                            managedUser.status === 'active' ? 'green' : 'gray'
                          }`}
                        >
                          {managedUser.status === 'active' ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        {managedUser.areaScopes.length > 0
                          ? managedUser.areaScopes.map((scope) => scope.area.name).join(', ')
                          : 'All areas'}
                      </td>
                      <td>{formatDateTime(managedUser.lastLoginAt)}</td>
                      <td>
                        <div className="live-actions">
                          {isSelf ? (
                            <span className="demo-badge gray">You</span>
                          ) : showArchived ? (
                            isSuperAdmin ? (
                              <button
                                className="demo-btn primary sm"
                                type="button"
                                onClick={() => onRestore(managedUser)}
                              >
                                <Icon name="check" size={13} />
                                Restore
                              </button>
                            ) : (
                              <span className="live-table-muted">—</span>
                            )
                          ) : manageable ? (
                            <>
                              <button
                                className="demo-btn sm"
                                type="button"
                                onClick={() => openEdit(managedUser)}
                              >
                                <Icon name="edit" size={13} />
                                Edit
                              </button>
                              <button
                                className="demo-btn sm"
                                type="button"
                                onClick={() => openPermissions(managedUser)}
                              >
                                Permissions
                              </button>
                              <button
                                className="demo-btn sm"
                                type="button"
                                onClick={() => {
                                  setPasswordUser(managedUser);
                                  setNewPassword('');
                                  setConfirmPassword('');
                                  setPasswordError('');
                                }}
                              >
                                Password
                              </button>
                              <button
                                className={`demo-btn sm ${
                                  managedUser.status === 'active' ? 'danger' : ''
                                }`}
                                type="button"
                                onClick={() => onToggleStatus(managedUser)}
                              >
                                {managedUser.status === 'active' ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                className="demo-btn danger sm"
                                type="button"
                                onClick={() => onArchive(managedUser)}
                              >
                                Archive
                              </button>
                            </>
                          ) : (
                            <span className="live-table-muted">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <div className="demo-note">
        <strong>নিয়ম:</strong> প্রতিটি ইউজারের একটি unique User ID অটোমেটিক তৈরি হয়।
        Archive করলে record মুছে যায় না — শুধু Super Admin Archived তালিকায় দেখতে
        পাবে। Admin নিজের কাছে নেই এমন permission দিতে পারবে না।
      </div>

      {addOpen ? (
        <div className="live-modal-backdrop" onMouseDown={() => setAddOpen(false)}>
          <div className="live-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="live-modal-head">
              <div>
                <h3>নতুন ইউজার</h3>
                <p>Role অটোমেটিক সেট হবে: {creationRole.replace('_', ' ')} · User ID অটোমেটিক তৈরি হবে</p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setAddOpen(false)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <form onSubmit={onAddUser}>
              <div className="live-form-grid">
                <div className="live-field">
                  <label htmlFor="user-name">নাম *</label>
                  <input
                    id="user-name"
                    value={addForm.name}
                    onChange={(event) =>
                      setAddForm((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                    minLength={2}
                  />
                </div>
                <div className="live-field">
                  <label htmlFor="user-login-id">Login ID *</label>
                  <input
                    id="user-login-id"
                    value={addForm.loginId}
                    onChange={(event) =>
                      setAddForm((current) => ({
                        ...current,
                        loginId: event.target.value,
                      }))
                    }
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9._\-]+"
                    placeholder="যেমন staff01"
                  />
                </div>
                <div className="live-field">
                  <label htmlFor="user-mobile">মোবাইল *</label>
                  <input
                    id="user-mobile"
                    type="tel"
                    value={addForm.mobile}
                    onChange={(event) =>
                      setAddForm((current) => ({ ...current, mobile: event.target.value }))
                    }
                    required
                    pattern="01[0-9]{9}"
                    placeholder="01XXXXXXXXX"
                  />
                </div>
                <div className="live-field">
                  <label htmlFor="user-password">পাসওয়ার্ড *</label>
                  <input
                    id="user-password"
                    type="password"
                    value={addForm.password}
                    onChange={(event) =>
                      setAddForm((current) => ({ ...current, password: event.target.value }))
                    }
                    required
                    minLength={8}
                  />
                </div>
              </div>

              {addError ? (
                <div className="live-error" style={{ marginTop: 14 }}>
                  {addError}
                </div>
              ) : null}

              <div className="live-form-actions">
                <button className="demo-btn" type="button" onClick={() => setAddOpen(false)}>
                  বাতিল
                </button>
                <button className="demo-btn primary" type="submit" disabled={addSubmitting}>
                  <Icon name="check" size={14} />
                  {addSubmitting ? 'তৈরি হচ্ছে…' : 'ইউজার তৈরি করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editUser ? (
        <div className="live-modal-backdrop" onMouseDown={() => setEditUser(null)}>
          <div className="live-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="live-modal-head">
              <div>
                <h3>ইউজার এডিট — {editUser.name}</h3>
                <p>
                  User ID: <strong>{editUser.userCode ?? '—'}</strong> · Role:{' '}
                  {editUser.role.name.replace('_', ' ')}
                </p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setEditUser(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <form onSubmit={onSaveEdit}>
              <div className="live-form-grid">
                <div className="live-field">
                  <label htmlFor="edit-name">নাম *</label>
                  <input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                    minLength={2}
                  />
                </div>
                <div className="live-field">
                  <label htmlFor="edit-login-id">Login ID *</label>
                  <input
                    id="edit-login-id"
                    value={editForm.loginId}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, loginId: event.target.value }))
                    }
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9._\-]+"
                  />
                </div>
                <div className="live-field full">
                  <label htmlFor="edit-mobile">মোবাইল *</label>
                  <input
                    id="edit-mobile"
                    type="tel"
                    value={editForm.mobile}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, mobile: event.target.value }))
                    }
                    required
                    pattern="01[0-9]{9}"
                  />
                </div>
              </div>

              {editError ? (
                <div className="live-error" style={{ marginTop: 14 }}>
                  {editError}
                </div>
              ) : null}

              <div className="live-form-actions">
                <button className="demo-btn" type="button" onClick={() => setEditUser(null)}>
                  বাতিল
                </button>
                <button className="demo-btn primary" type="submit" disabled={editSaving}>
                  <Icon name="check" size={14} />
                  {editSaving ? 'সেভ হচ্ছে…' : 'সেভ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {permUser ? (
        <div className="live-modal-backdrop" onMouseDown={() => setPermUser(null)}>
          <div className="live-modal wide" onMouseDown={(event) => event.stopPropagation()}>
            <div className="live-modal-head">
              <div>
                <h3>পারমিশন — {permUser.name}</h3>
                <p>
                  Role: {permUser.role.name.replace('_', ' ')} · আপনার কাছে নেই এমন
                  permission disabled থাকবে
                </p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setPermUser(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <div className="perm-groups">
              {groups.map(([group, list]) => (
                <section className="perm-group" key={group}>
                  <h4>{GROUP_LABELS[group] ?? group}</h4>
                  {list.map((permission) => {
                    const actorHas = actor?.permissions.includes(permission.key) ?? false;
                    const checked = permDraft[permission.key] ?? false;
                    return (
                      <label
                        className={`perm-item ${actorHas ? '' : 'disabled'}`}
                        key={permission.key}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!actorHas}
                          onChange={(event) =>
                            setPermDraft((current) => ({
                              ...current,
                              [permission.key]: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          <strong>{permission.key}</strong>
                          <small>{permission.description ?? ''}</small>
                        </span>
                      </label>
                    );
                  })}
                </section>
              ))}
            </div>

            <div className="live-form-actions">
              <button className="demo-btn" type="button" onClick={() => setPermUser(null)}>
                বাতিল
              </button>
              <button
                className="demo-btn primary"
                type="button"
                onClick={onSavePermissions}
                disabled={permSaving}
              >
                <Icon name="check" size={14} />
                {permSaving ? 'সেভ হচ্ছে…' : 'পারমিশন সেভ করুন'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {passwordUser ? (
        <div className="live-modal-backdrop" onMouseDown={() => setPasswordUser(null)}>
          <div
            className="live-modal"
            style={{ maxWidth: 460 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="live-modal-head">
              <div>
                <h3>পাসওয়ার্ড রিসেট</h3>
                <p>
                  {passwordUser.name} · {passwordUser.mobile}
                </p>
              </div>
              <button
                className="live-modal-close"
                type="button"
                onClick={() => setPasswordUser(null)}
              >
                <Icon name="close" size={17} />
              </button>
            </div>

            <div className="live-form-grid">
              <div className="live-field full">
                <label htmlFor="reset-pass">নতুন পাসওয়ার্ড *</label>
                <input
                  id="reset-pass"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                />
              </div>
              <div className="live-field full">
                <label htmlFor="reset-pass2">আবার লিখুন *</label>
                <input
                  id="reset-pass2"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                />
              </div>
            </div>

            {passwordError ? (
              <div className="live-error" style={{ marginTop: 14 }}>
                {passwordError}
              </div>
            ) : null}

            <div className="live-form-actions">
              <button className="demo-btn" type="button" onClick={() => setPasswordUser(null)}>
                বাতিল
              </button>
              <button
                className="demo-btn primary"
                type="button"
                onClick={onResetPassword}
                disabled={passwordSaving}
              >
                {passwordSaving ? 'রিসেট হচ্ছে…' : 'পাসওয়ার্ড রিসেট করুন'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`live-toast ${toast.error ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </>
  );
}
