import { SetMetadata } from '@nestjs/common';

/**
 * Role-based access metadata. Use together with RolesGuard:
 *
 *   @UseGuards(RolesGuard)
 *   @RequireRoles('super_admin', 'admin', 'staff')
 */
export const ROLES_KEY = 'allowed_roles';

export const RequireRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
