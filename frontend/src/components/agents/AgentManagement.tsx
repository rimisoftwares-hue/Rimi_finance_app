import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Edit,
  Trash2,
  Plus,
  AlertCircle,
  Building,
  Mail,
  Phone,
  Briefcase,
  Users,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
  Activity,
  Search,
  UserPlus,
} from 'lucide-react';
import apiClient from '../../api/apiClient';
import UserDetailModal from './UserDetailModal';
import AddUserForm from './AddUserForm';
import type { UserData, FinanceCompany } from './UserDetailModal';
import { useAuth } from '../../contexts/AuthContext';
import { CapitalizedInput } from '../common/CapitalizedInput';
import { TableSkeletonRows, TablePagination } from '../common';
import { Button } from '../ui/button';
import { useClientPagination } from '../../hooks/useClientPagination';

const getRoleBadgeClass = (role: string) => {
  switch (role) {
    case 'owner':
      return 'badge-destructive';
    case 'admin':
      return 'badge-warning';
    case 'agent':
      return 'badge-success';
    default:
      return 'badge-default';
  }
};

const formatTimeDisplay = (time: string | null) => {
  if (!time) return 'Any time';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  if (Number.isNaN(hour)) return time;
  return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
};

const formatDate = (dateString?: string | null) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const AgentManagement = () => {
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserData[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [expandedUser, setExpandedUser] = useState<number | string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  const { currentFinance, financeList } = useAuth();
  const [financeCompanies, setFinanceCompanies] = useState<FinanceCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all real users with their details
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await apiClient.get('/auth/allUsers');
      if (response.data.success && Array.isArray(response.data.users)) {
        const usersWithDetails = await Promise.all(
          response.data.users.map(async (u: UserData) => {
            try {
              const staffResponse = await apiClient.get(`/users/${u.id}/staff-details`);
              if (staffResponse.data.success && staffResponse.data.staff_details) {
                return { ...u, staff_details: staffResponse.data.staff_details };
              }
            } catch {
              // Staff details optional
            }
            return u;
          })
        );
        setUsers(usersWithDetails);
      } else {
        setUsers([]);
      }
    } catch (err: unknown) {
      console.error('Error fetching users:', err);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (financeList && financeList.length > 0) {
      setFinanceCompanies(
        financeList.map(f => ({
          id: f.id,
          name: f.name || f.finance_name || 'Finance Company',
          owner_id: f.owner_id,
          phone_number: Array.isArray(f.phone_numbers)
            ? f.phone_numbers[0]
            : f.phone_numbers || f.phone || '',
          phone_numbers: Array.isArray(f.phone_numbers)
            ? f.phone_numbers
            : [f.phone_numbers || f.phone || ''],
          address: f.address || '',
        }))
      );
    } else if (currentFinance?.id) {
      setFinanceCompanies([
        {
          id: currentFinance.id,
          name:
            currentFinance.name ||
            currentFinance.finance_name ||
            'Finance Company',
          address: currentFinance.address || '',
        },
      ]);
    }
  }, [financeList, currentFinance]);

  const activeCompanyName = useMemo(() => {
    return (
      currentFinance?.name ||
      currentFinance?.finance_name ||
      financeCompanies[0]?.name ||
      'Finance Company'
    );
  }, [currentFinance, financeCompanies]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch =
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        Boolean(u.staff_details?.staff_code?.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = filterRole === 'all' || u.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, filterRole]);

  const {
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    paginatedItems,
    startIndex,
    endIndex,
  } = useClientPagination(filteredUsers, {
    initialPageSize: 15,
    resetKey: `${searchQuery}|${filterRole}`,
  });

  const stats = [
    { label: 'Total Users', value: users.length, icon: Users, accent: 'text-primary' },
    {
      label: 'Active Users',
      value: users.filter(u => u.is_active).length,
      icon: Activity,
      accent: 'text-success',
    },
    {
      label: 'Inactive Users',
      value: users.filter(u => !u.is_active).length,
      icon: AlertCircle,
      accent: 'text-destructive',
    },
    {
      label: 'Companies',
      value: financeCompanies.length,
      icon: Building,
      accent: 'text-warning',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="w-full space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">User Management</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage platform users, roles, active statuses, and account invitations
            </p>
          </div>
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <Button
              variant="outline"
              onClick={() => navigate('/invite')}
              className="bg-card hover:bg-muted text-foreground border border-border shadow-xs gap-2"
            >
              <UserPlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Invite
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowAddForm(true)}
              className="bg-card hover:bg-muted text-foreground border border-border shadow-xs gap-2"
            >
              <Plus className="h-4 w-4" /> Add User
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="stat-card flex items-center justify-between animate-count-up"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
                <p className="text-3xl font-bold text-card-foreground mt-1">{stat.value}</p>
              </div>
              <div
                className={`h-12 w-12 rounded-xl bg-secondary flex items-center justify-center ${stat.accent}`}
              >
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          ))}
        </div>

        {/* Users Section */}
        <div className="space-y-6">
          {/* Search & Filter Bar */}
          <div className="glass-card p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <CapitalizedInput
                type="text"
                casing="none"
                placeholder="Search by name, email or ID…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input-field !pl-10 !py-2.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {['all', 'owner', 'admin', 'agent', 'staff'].map(r => (
                <button
                  key={r}
                  onClick={() => setFilterRole(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    filterRole === r
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* User Table */}
          <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-secondary/50">
                    {['User Details', 'Role & Status', 'Login Times', 'Actions'].map(h => (
                      <th
                        key={h}
                        className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3.5 ${
                          h === 'Actions' ? 'text-right' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading && users.length === 0 ? (
                    <TableSkeletonRows columns={4} rows={6} />
                  ) : (
                  paginatedItems.map(user => (
                    <React.Fragment key={user.id}>
                      <tr
                        className={`hover:bg-secondary/40 transition-colors ${
                          expandedUser === user.id ? 'bg-primary/5' : ''
                        }`}
                      >
                        {/* User Details */}
                        <td className="px-4 py-3 text-sm">
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => setSelectedUser(user)}
                          >
                            <div
                              className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background: 'var(--gradient-primary)' }}
                            >
                              <User className="h-5 w-5 text-primary-foreground" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-semibold text-card-foreground truncate">
                                  {user.username}
                                </p>
                                {user.staff_details?.staff_code && (
                                  <span className="text-[11px] font-normal text-muted-foreground">
                                    ({user.staff_details.staff_code})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {user.email}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="h-3 w-3" />
                                {user.phone_no}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Role & Status */}
                        <td className="px-4 py-3 text-sm">
                          <div className="space-y-2">
                            <span className={getRoleBadgeClass(user.role)}>
                              {user.role.toUpperCase()}
                            </span>
                            <div>
                              <span
                                className={
                                  user.is_active ? 'badge-success' : 'badge-destructive'
                                }
                              >
                                {user.is_active ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Login Times */}
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2 text-sm text-card-foreground">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {formatTimeDisplay(user.login_time_from)} –{' '}
                              {formatTimeDisplay(user.login_time_to)}
                            </span>
                          </div>
                          {user.last_login && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Last login: {new Date(user.last_login).toLocaleDateString()}
                            </p>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center justify-end gap-1">
                            {[
                              {
                                icon: expandedUser === user.id ? ChevronUp : ChevronDown,
                                onClick: () =>
                                  setExpandedUser(expandedUser === user.id ? null : user.id),
                                title: 'Toggle details',
                              },
                              {
                                icon: Eye,
                                onClick: () => setSelectedUser(user),
                                title: 'View',
                              },
                              { icon: Edit, onClick: () => {}, title: 'Edit' },
                              {
                                icon: Trash2,
                                onClick: () =>
                                  setUsers(
                                    users.map(u =>
                                      u.id === user.id ? { ...u, is_active: false } : u
                                    )
                                  ),
                                title: 'Deactivate',
                                disabled: !user.is_active,
                              },
                            ].map((action, i) => (
                              <button
                                key={i}
                                onClick={action.onClick}
                                disabled={action.disabled}
                                title={action.title}
                                className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <action.icon className="h-4 w-4" />
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {expandedUser === user.id && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-4 bg-secondary/20 border-t border-border/50"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                  Company Access
                                </h4>
                                <div className="space-y-1.5">
                                  {user.allowed_companies?.length > 0 ? (
                                    user.allowed_companies.map(cid => {
                                      const c = financeCompanies.find(
                                        co => String(co.id) === String(cid)
                                      );
                                      return (
                                        <div
                                          key={cid}
                                          className="flex items-center gap-2 text-sm text-card-foreground"
                                        >
                                          <Building className="h-3 w-3 text-primary" />{' '}
                                          {c ? c.name : activeCompanyName}
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <span className="text-sm text-muted-foreground italic">
                                      No companies
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                  Staff Details
                                </h4>
                                {user.staff_details ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm text-card-foreground">
                                      <Briefcase className="h-3 w-3 text-primary" />
                                      {user.staff_details.staff_name} (
                                      {user.staff_details.staff_code})
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Exp: {user.staff_details.experience_years} yrs ·{' '}
                                      {user.staff_details.education_qualification}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground italic">
                                    No staff details
                                  </span>
                                )}
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                  Account Info
                                </h4>
                                <p className="text-sm text-card-foreground">
                                  Created: {formatDate(user.created_at)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  ID: {user.staff_details?.staff_code || user.id}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                  )}
                </tbody>
              </table>

              {!isLoading && filteredUsers.length === 0 && (
                <div className="px-6 py-16 text-center">
                  <div className="h-14 w-14 mx-auto bg-secondary rounded-2xl flex items-center justify-center mb-4">
                    <Users className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-semibold text-card-foreground mb-1">
                    No users found
                  </h3>
                  <p className="text-sm text-muted-foreground mb-5">
                    {searchQuery
                      ? 'Try a different search term'
                      : 'Get started by inviting or creating your first user'}
                  </p>
                  {!searchQuery && (
                    <div className="flex items-center justify-center gap-3">
                      <Button
                        variant="outline"
                        onClick={() => navigate('/invite?mode=direct')}
                      >
                        <UserPlus className="h-4 w-4 mr-1.5" /> Invite User
                      </Button>
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="btn-primary inline-flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" /> Create First User
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Floating Add Button */}
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-floating md:hidden"
          title="Add User"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Modals */}
      {showAddForm && (
        <AddUserForm
          onClose={() => setShowAddForm(false)}
          financeCompanies={financeCompanies}
          onSubmit={() => {
            setShowAddForm(false);
            fetchUsers();
          }}
          onSwitchToInvite={preloadedUser => {
            setShowAddForm(false);
            if (preloadedUser?.phone_no) {
              navigate(
                `/invite?mode=direct&searchMode=phone&query=${encodeURIComponent(preloadedUser.phone_no)}`
              );
            } else if (preloadedUser?.email) {
              navigate(
                `/invite?mode=direct&searchMode=email&query=${encodeURIComponent(preloadedUser.email)}`
              );
            } else {
              navigate('/invite?mode=direct');
            }
          }}
        />
      )}

      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          financeCompanies={financeCompanies}
        />
      )}
    </div>
  );
};

export default AgentManagement;
