export interface MaintenanceTask {
  site_id: string;
  task_type: string;
  description: string;
  scheduled_at: string;
  priority: string;
}

export interface MaintenanceRequest {
  site_ids: string[];
}

export interface MaintenanceResponse {
  tasks: MaintenanceTask[];
  total: number;
}
