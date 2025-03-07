// Интерфейсы для описания структуры задачи
export interface TaskHistoryEntry {
  date: string; // Формат YYYY-MM-DD
  status: "done" | "canceled" | "skipped" | "pending";
}

export interface RepeatingTask {
  id: string;
  name: string;
  description: string;
  overdueThresholds: {
    green: number;
    yellow: number;
    red: number;
  };
  history: TaskHistoryEntry[];
  filePath?: string; // Путь к файлу задачи в vault
}

export interface TaskInstance {
  id: string;
  task: RepeatingTask;
  activePeriod: {
    start: string;
    end: string;
  };
  status: "pending" | "done" | "canceled" | "skipped";
}

export function generateInstances(task: RepeatingTask): TaskInstance {
  return null;
}