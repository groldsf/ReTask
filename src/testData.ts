import { RepeatingTask, TaskInstance } from './RepeatingTask';

// Базовые тестовые задачи
const dailyTask: RepeatingTask = {
  id: 'daily-1',
  name: 'Ежедневная проверка',
  description: 'Проверка задач на день',
  overdueThresholds: { green: 60, yellow: 120, red: 180 },
  history: [
    { date: '2024-03-20', status: 'done' },
    { date: '2024-03-21', status: 'skipped' }
  ],
  filePath: 'RepeatingTasks/Daily.md'
};

const weeklyTask: RepeatingTask = {
  id: 'weekly-1',
  name: 'Еженедельный отчет',
  description: 'Подготовка отчета за неделю',
  overdueThresholds: { green: 1440, yellow: 2880, red: 4320 },
  history: [],
  filePath: 'RepeatingTasks/Weekly.md'
};

// Генерация тестовых инстансов
const taskInstances: TaskInstance[] = [
  // Активные инстансы
  {
    id: 'instance-1',
    task: dailyTask,
    activePeriod: {
      start: '2024-03-25T09:00:00',
      end: '2024-03-25T10:00:00'
    },
    status: 'pending'
  },
  {
    id: 'instance-2',
    task: dailyTask,
    activePeriod: {
      start: '2024-03-24T09:00:00',
      end: '2024-03-24T10:00:00'
    },
    status: 'done'
  },
  // Просроченные инстансы
  {
    id: 'instance-3',
    task: weeklyTask,
    activePeriod: {
      start: '2024-03-18T10:00:00',
      end: '2024-03-18T12:00:00'
    },
    status: 'canceled'
  },
  {
    id: 'instance-4',
    task: weeklyTask,
    activePeriod: {
      start: '2024-03-11T10:00:00',
      end: '2024-03-11T12:00:00'
    },
    status: 'skipped'
  },
  // Разные статусы
  {
    id: 'instance-5',
    task: {
      ...dailyTask,
      id: 'daily-2',
      name: 'Вечерняя проверка'
    },
    activePeriod: {
      start: '2024-03-25T18:00:00',
      end: '2024-03-25T19:00:00'
    },
    status: 'pending'
  },
  // Задача без истории
  {
    id: 'instance-6',
    task: {
      ...weeklyTask,
      id: 'weekly-2',
      name: 'Новая недельная задача',
      history: []
    },
    activePeriod: {
      start: '2024-03-26T10:00:00',
      end: '2024-03-26T12:00:00'
    },
    status: 'pending'
  }
];

export default taskInstances;