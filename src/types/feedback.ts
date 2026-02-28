export type FeedbackType = 'feature_request' | 'bug_report';
export type FeedbackStatus = 'pending' | 'planning' | 'planned' | 'approved' | 'rejected' | 'built';

export interface UserFeedback {
  id: string;
  organization_id: string;
  user_id: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  page_url: string | null;
  plan_file_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitFeedbackRequest {
  type: FeedbackType;
  title: string;
  description: string;
  page_url: string;
}
