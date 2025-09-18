/**
 * Pipeline Stage Interfaces
 * 流水线阶段接口
 */

import { PipelineStageStatus, PipelineStage } from './IRequestContext';

/**
 * Pipeline Stage Interface
 * 流水线阶段接口
 */
export interface IPipelineStage {
  // Basic getters
  getStageName(): string;
  getStartTime(): number;
  getEndTime(): number | undefined;
  getDuration(): number | undefined;
  getStatus(): PipelineStageStatus;
  getError(): string | undefined;
  getData(): any;

  // Setters
  setStartTime(startTime: number): void;
  setEndTime(endTime: number): void;
  setStatus(status: PipelineStageStatus): void;
  setError(error: string): void;
  setData(data: any): void;

  // State management
  markAsStarted(): void;
  markAsCompleted(data?: any): void;
  markAsFailed(error: string): void;

  // Status checks
  isCompleted(): boolean;
  isFailed(): boolean;
  isRunning(): boolean;

  // Data export
  toObject(): PipelineStage;
  clone(): IPipelineStage;
}

/**
 * Pipeline Stage Factory Interface
 * 流水线阶段工厂接口
 */
export interface IPipelineStageFactory {
  createStage(stageName: string): IPipelineStage;
  createStageWithData(stageName: string, data: any): IPipelineStage;
  createStageFromObject(stageObject: PipelineStage): IPipelineStage;
}

/**
 * Pipeline Stage Manager Interface
 * 流水线阶段管理器接口
 */
export interface IPipelineStageManager {
  // Stage management
  addStage(stage: IPipelineStage): void;
  getStage(stageName: string): IPipelineStage | undefined;
  removeStage(stageName: string): boolean;
  updateStage(stageName: string, updates: Partial<IPipelineStage>): boolean;

  // Stage queries
  getAllStages(): IPipelineStage[];
  getStagesByStatus(status: PipelineStageStatus): IPipelineStage[];
  getCompletedStages(): IPipelineStage[];
  getFailedStages(): IPipelineStage[];
  getRunningStages(): IPipelineStage[];

  // Statistics
  getStageStatistics(): {
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
  };

  // Cleanup
  clearAllStages(): void;
}