import { pgEnum } from "drizzle-orm/pg-core";
import {
  ACCOUNT_SUBTYPES,
  ACCOUNT_TYPES,
  AUDIT_ACTIONS,
  DELIVERY_CHANNELS,
  DELIVERY_STATUSES,
  FINANCIAL_ACCOUNT_KINDS,
  MFS_PROVIDERS,
  NOTIFICATION_SEVERITIES,
  PARTY_TYPES,
  PRODUCT_KINDS,
  ROLES,
  STOCK_DIRECTIONS,
  STOCK_MOVEMENT_TYPES,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "@hishabai/shared";

/**
 * Postgres enums generated from the shared vocabulary, so the database and the
 * TypeScript domain cannot drift apart without a compile error.
 */
export const roleEnum = pgEnum("role", ROLES);
export const transactionTypeEnum = pgEnum("transaction_type", TRANSACTION_TYPES);
export const transactionStatusEnum = pgEnum("transaction_status", TRANSACTION_STATUSES);
export const transactionSourceEnum = pgEnum("transaction_source", TRANSACTION_SOURCES);
export const accountTypeEnum = pgEnum("account_type", ACCOUNT_TYPES);
export const accountSubtypeEnum = pgEnum("account_subtype", ACCOUNT_SUBTYPES);
export const financialAccountKindEnum = pgEnum(
  "financial_account_kind",
  FINANCIAL_ACCOUNT_KINDS,
);
export const mfsProviderEnum = pgEnum("mfs_provider", MFS_PROVIDERS);
export const partyTypeEnum = pgEnum("party_type", PARTY_TYPES);
export const productKindEnum = pgEnum("product_kind", PRODUCT_KINDS);
export const stockDirectionEnum = pgEnum("stock_direction", STOCK_DIRECTIONS);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", STOCK_MOVEMENT_TYPES);
export const auditActionEnum = pgEnum("audit_action", AUDIT_ACTIONS);
export const deliveryChannelEnum = pgEnum("delivery_channel", DELIVERY_CHANNELS);
export const deliveryStatusEnum = pgEnum("delivery_status", DELIVERY_STATUSES);
export const notificationSeverityEnum = pgEnum(
  "notification_severity",
  NOTIFICATION_SEVERITIES,
);
