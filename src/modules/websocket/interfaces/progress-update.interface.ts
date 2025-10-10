export interface ProgressUpdate {
  progressPercentage: number; // 0-100
  currentTask: string; // Description of current operation
  estimatedTimeRemaining: number; // in minutes
  currentSection?: string;
  currentSubtopic?: string;
  finalPayload?: any; // Final completion payload with all generated content
  errors?: Array<{
    step: string;
    error: string;
    timestamp: string;
  }>;
}
