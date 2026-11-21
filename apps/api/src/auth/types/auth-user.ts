export interface AuthUser {
  id: string;
  tenantId: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
  roleLevel: number;
  permissions: string[];
  areaIds: string[];
}
