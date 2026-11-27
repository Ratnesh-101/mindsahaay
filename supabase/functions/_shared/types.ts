// ==============================================================================
// Shared Type Definitions for MindSahaay Backend
// ==============================================================================

export type UserRole = "student" | "counsellor" | "moderator" | "institution_admin" | "super_admin";

export type AssessmentInstrument = "phq4" | "phq9" | "gad7";

export type RiskSeverity = "low" | "medium" | "high" | "crisis";

export type RiskTrigger = "phq9_item9" | "chat_crisis" | "lexicon_match" | "manual" | "assessment_escalation";

export interface AssessmentResult {
  instrument: AssessmentInstrument;
  total: number;
  severity: string;
  item9_flag: boolean;
  metadata?: Record<string, any>;
  disclaimer: string;
  crisis?: boolean;
  crisisProtocol?: {
    message: string;
    helplines: {
      teleManas: string;
      teleManasAlt: string;
      kiran: string;
      emergency: string;
    };
  };
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  isCrisis?: boolean;
  createdAt?: string;
}

export interface UserProfile {
  id: string;
  role: UserRole;
  alias: string;
  locale: string;
  institution_id?: string | null;
  avatar_seed?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DPDPExportPayload {
  exportMetadata: {
    platform: string;
    complianceFramework: string;
    exportedAt: string;
    dataSubjectId: string;
    format: string;
  };
  profile: UserProfile | null;
  consents: any[];
  moodEntries: any[];
  assessments: any[];
  journalEntries: Array<{
    id: string;
    ciphertext: string;
    iv: string;
    salt: string;
    created_at: string;
  }>;
  appointments: any[];
  safetyPlans: any[];
  careShares: any[];
  auditLogs: any[];
  encryptedBlobs?: Array<{
    slot: string;
    ciphertext: string;
    iv: string;
    salt: string;
    version: number;
    updated_at: string;
  }>;
  chatSessions?: Array<{
    id: string;
    title: string;
    salt: string;
    key_version: number;
    created_at: string;
    updated_at?: string;
    chat_messages?: any[];
  }>;
  chatMessages?: Array<{
    id: string;
    session_id: string;
    sender_role: string;
    encrypted_content: string;
    iv: string;
    seq: number;
    created_at: string;
  }>;
}
