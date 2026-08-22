export type UserRole = "ADMIN" | "EDITOR";
export type UserStatus = "ACTIVE" | "DISABLED";
export type ContentMode = "MANUAL" | "BULK" | "AUTO_PILOT";
export type IntegrationStatus = "CONNECTED" | "ERROR" | "NOT_CONFIGURED" | "BRIDGE_MISSING" | "PERMISSION_ERROR";
export interface SiteSummary {
    id: string;
    name: string;
    wordpressUrl: string;
    market: string;
    language: string;
    wordpressStatus: IntegrationStatus;
    rankMathStatus: IntegrationStatus;
    gscStatus: IntegrationStatus;
    contentCount: number;
    publishedCount: number;
}
