// Интерфейсы для описания структуры задачи
export interface TaskHistoryEntry {
  date: string; // Формат YYYY-MM-DD
  status: "done" | "canceled" | "skipped" | "pending";
}

export interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export interface RepeatingTask {
  id: string;
  name: string;
  description: string;

  //
  startTime: Date;
  duration: Duration;
  //
  overdueThresholds: {
    green: number;
    yellow: number;
    red: number;
  };
  filePath?: string; // Путь к файлу задачи в vault
}

export interface TaskInstance {
  id: string;
  task: RepeatingTask;
  activePeriod: {
    start: Date;
    end: Date;
  };
  status: "pending" | "done" | "canceled" | "skipped";
}

export function getEndDate(startDate: Date, duration: Duration): Date {
  const endDate = new Date(startDate); // Создаем копию даты начала

  // Прибавляем дни
  endDate.setDate(startDate.getDate() + duration.days);

  // Прибавляем часы
  endDate.setHours(startDate.getHours() + duration.hours);

  // Прибавляем минуты
  endDate.setMinutes(startDate.getMinutes() + duration.minutes);

  // Прибавляем секунды
  endDate.setSeconds(startDate.getSeconds() + duration.seconds);

  return endDate;
}