export type Role = "admin" | "manager" | "rep";

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  phone: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export type LeadStatus = "new" | "contacted" | "qualified" | "lost" | "converted";

export interface Tag {
  id: number;
  name: string;
  color: string;
  lead_count?: number;
}

export interface LeadSource {
  id: number;
  name: string;
  lead_count?: number;
}

export interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  source: number | null;
  source_name: string;
  status: LeadStatus;
  estimated_value: string;
  owner: number;
  owner_name: string;
  tags: number[];
  tag_details: Tag[];
  notes: string;
  converted_contact: number | null;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: number;
  name: string;
  website: string;
  industry: string;
  phone: string;
  address: string;
  owner: number;
  owner_name: string;
  contact_count?: number;
  deal_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  job_title: string;
  company: number | null;
  company_name: string;
  owner: number;
  owner_name: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: number;
  name: string;
  order: number;
  is_won: boolean;
  is_lost: boolean;
  deal_count?: number;
}

export interface Deal {
  id: number;
  title: string;
  value: string;
  stage: number;
  stage_name: string;
  contact: number | null;
  contact_name: string;
  company: number | null;
  company_name: string;
  lead: number | null;
  owner: number;
  owner_name: string;
  expected_close_date: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ActivityType = "call" | "meeting" | "email" | "note";

export interface Activity {
  id: number;
  type: ActivityType;
  subject: string;
  body: string;
  occurred_at: string;
  user: number;
  user_name: string;
  lead: number | null;
  deal: number | null;
  contact: number | null;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  due_at: string | null;
  assigned_to: number;
  assigned_to_name: string;
  created_by: number;
  lead: number | null;
  lead_name: string;
  deal: number | null;
  deal_title: string;
  is_done: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface Notification {
  id: number;
  message: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

export interface SearchHit {
  id: number;
  label: string;
}

export interface SearchResults {
  leads: SearchHit[];
  contacts: SearchHit[];
  companies: SearchHit[];
  deals: SearchHit[];
}

export interface StageSummary {
  stage: number;
  name: string;
  count: number;
  total: string;
}

export interface RepPerformance {
  user: number;
  name: string;
  new_leads: number;
  converted_leads: number;
  won_count: number;
  won_value: string;
  lost_count: number;
  open_count: number;
  open_value: string;
}

export interface DashboardData {
  kpis: {
    new_leads_this_month: number;
    total_leads: number;
    converted_leads: number;
    conversion_rate: number;
    open_deal_value: string;
    open_deal_count: number;
    won_value_this_month: string;
    won_count_this_month: number;
  };
  leads_by_status: { status: LeadStatus; label: string; count: number }[];
  leads_by_source: { source: number | null; name: string; count: number }[];
  deals_by_stage: { stage: number; name: string; is_won: boolean; is_lost: boolean; count: number; value: string }[];
  leaderboard: RepPerformance[] | null;
}

export interface PerformanceData {
  period: { key: string; label: string; start: string; end: string };
  reps: RepPerformance[];
  won_by_month: { month: string; value: string; count: number }[];
}

export interface Attachment {
  id: number;
  filename: string;
  size: number;
  content_type: string;
  uploaded_by: number;
  uploaded_by_name: string;
  lead: number | null;
  deal: number | null;
  contact: number | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  actor: number | null;
  actor_name: string;
  action: "create" | "update" | "delete";
  model: string;
  object_id: string;
  object_repr: string;
  changes: Record<string, unknown>;
  timestamp: string;
}
