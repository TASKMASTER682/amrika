/**
 * Centralized role definitions for ExamOS.
 * Using a single source of truth avoids typos in the dozens of
 * `authorize(...)` call sites across route files.
 */

export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  CONTENT_MANAGER: 'Content Manager',
  SUPPORT: 'Support',
  USER: 'User',
};

export const ALL_ROLES = Object.values(ROLES);

// Roles that can access the admin panel at all
export const STAFF_ROLES = [ROLES.SUPER_ADMIN, ROLES.CONTENT_MANAGER, ROLES.SUPPORT];

// Content Manager + Super Admin can manage questions/tests/content
export const CONTENT_ROLES = [ROLES.SUPER_ADMIN, ROLES.CONTENT_MANAGER];

// Support + Super Admin can manage users, attempts, orders
export const SUPPORT_ROLES = [ROLES.SUPER_ADMIN, ROLES.SUPPORT];

// Only Super Admin can touch billing/revenue/roles config
export const FINANCE_ROLES = [ROLES.SUPER_ADMIN];

