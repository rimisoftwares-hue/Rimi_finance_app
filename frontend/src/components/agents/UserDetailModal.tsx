import React from 'react';
import { User, Building, Clock, Mail, Phone, Shield, Activity, TrendingUp, Calendar, CreditCard, Sun, Moon, X } from 'lucide-react';

interface UserData {
  id: number | string;
  email: string;
  username: string;
  phone_no: string;
  role: 'owner' | 'admin' | 'agent' | 'staff' | string;
  allowed_companies: (number | string)[];
  login_time_from: string | null;
  login_time_to: string | null;
  is_active: boolean | number;
  created_at: string;
  last_login: string | null;
  staff_details?: {
    id: string;
    finance_id: number | string;
    staff_name: string;
    staff_code: string;
    father_spouse_name: string;
    experience_years: number;
    education_qualification: string;
    photo: string | null;
    joining_date: string;
  };
}

interface FinanceCompany {
  id: number | string;
  name: string;
  owner_id?: number | string;
  phone_number?: string | string[];
  phone_numbers?: string[];
  address?: string;
}

const formatTime = (time: string | null) => {
  if (!time) return 'Not set';
  const [hours, minutes] = time.split(':');
  return `${parseInt(hours) % 12 || 12}:${minutes} ${parseInt(hours) >= 12 ? 'PM' : 'AM'}`;
};

const getRoleBadgeClass = (role: string) => {
  switch (role) {
    case 'owner': return 'badge-destructive';
    case 'admin': return 'badge-warning';
    case 'agent': return 'badge-success';
    default: return 'badge-default';
  }
};

const UserDetailModal = ({ user, onClose, financeCompanies }: {
  user: UserData;
  onClose: () => void;
  financeCompanies: FinanceCompany[];
}) => {
  return (
    <div className="fixed inset-0 bg-foreground/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-border">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-5 flex justify-between items-center rounded-t-2xl">
          <div>
            <h3 className="text-2xl font-bold text-card-foreground">User Details</h3>
            <p className="text-sm text-muted-foreground mt-1">{user.username} · {user.staff_details?.staff_code}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-secondary transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Profile header */}
          <div className="flex items-start gap-6">
            <div className="h-20 w-20 flex-shrink-0 rounded-2xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
              <User className="h-10 w-10 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-card-foreground">{user.username}</h2>
                  <p className="text-muted-foreground">{user.email}</p>
                </div>
                <span className={`${getRoleBadgeClass(user.role)} px-4 py-1.5 text-sm`}>
                  {user.role.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                {[
                  { icon: Phone, text: user.phone_no },
                  { icon: Calendar, text: `Joined ${new Date(user.created_at).toLocaleDateString()}` },
                  { icon: Activity, text: user.is_active ? 'Active' : 'Inactive' },
                  { icon: Clock, text: `Last: ${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}` },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <item.icon className="h-4 w-4 text-primary" />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Login Time */}
          <div>
            <h3 className="text-base font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Login Time Restrictions
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Login From', value: formatTime(user.login_time_from), icon: Sun },
                { label: 'Login To', value: formatTime(user.login_time_to), icon: Moon },
              ].map((item, i) => (
                <div key={i} className="stat-card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</span>
                    <item.icon className="h-4 w-4 text-warning" />
                  </div>
                  <p className="text-xl font-bold text-card-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Company Access */}
          <div>
            <h3 className="text-base font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" /> Company Access
            </h3>
            <div className="glass-card p-5">
              {user.role === 'owner' ? (
                <div className="flex items-center gap-3">
                  <Shield className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-semibold text-card-foreground">Full System Access</p>
                    <p className="text-sm text-muted-foreground">Access to all companies and features</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {user.allowed_companies?.map(companyId => {
                    const company = financeCompanies.find(c => c.id === companyId);
                    return company ? (
                      <div key={companyId} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-card-foreground text-sm">{company.name}</p>
                          <p className="text-xs text-muted-foreground">{company.address}</p>
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Staff Details */}
          {user.staff_details && (
            <div>
              <h3 className="text-base font-semibold text-card-foreground mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" /> Staff Details
              </h3>
              <div className="glass-card p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                  {[
                    { label: 'Staff Name', value: user.staff_details.staff_name },
                    { label: 'Staff Code', value: user.staff_details.staff_code },
                    { label: 'Father/Spouse', value: user.staff_details.father_spouse_name || 'N/A' },
                    { label: 'Experience', value: `${user.staff_details.experience_years} years` },
                    { label: 'Education', value: user.staff_details.education_qualification || 'N/A' },
                    { label: 'Joining Date', value: new Date(user.staff_details.joining_date).toLocaleDateString() },
                  ].map((item, i) => (
                    <div key={i}>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{item.label}</p>
                      <p className="font-medium text-card-foreground text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Statistics */}
          <div>
            <h3 className="text-base font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Statistics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Companies', value: user.allowed_companies?.length || 0 },
                { label: 'Status', value: user.is_active ? 'Active' : 'Inactive' },
                { label: 'Role', value: user.role === 'owner' ? 'Full Access' : user.role === 'admin' ? 'Administrator' : user.role === 'agent' ? 'Field Agent' : 'Staff' },
                { label: 'Since', value: new Date(user.created_at).getFullYear() },
              ].map((item, i) => (
                <div key={i} className="stat-card p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  <p className="text-lg font-bold text-card-foreground mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="btn-primary">Close</button>
        </div>
      </div>
    </div>
  );
};

export default UserDetailModal;
export type { UserData, FinanceCompany };
