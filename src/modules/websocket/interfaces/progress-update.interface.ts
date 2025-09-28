export interface ProgressUpdate {
  progressPercentage: number; // 0-100
  currentTask: string; // Description of current operation
  estimatedTimeRemaining: number; // in minutes
  currentSection?: string;
  currentSubtopic?: string;
  errors?: Array<{
    step: string;
    error: string;
    timestamp: string;
  }>;
}
