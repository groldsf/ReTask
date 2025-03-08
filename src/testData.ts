import { getEndDate, RepeatingTask, TaskInstance } from "./models/RepeatingTask";

// Текущая дата как точка отсчета
const now = new Date();

// Тестовые задачи с датами относительно текущего времени
const dailyTask: RepeatingTask = {
    id: "task-001",
    name: "Ежедневная зарядка",
    description: "Сделать 10 отжиманий",
    startTime: new Date(now), // Начало сегодня
    duration: { days: 0, hours: 1, minutes: 0, seconds: 0 },
    overdueThresholds: { green: 60, yellow: 120, red: 180 },
    filePath: "Tasks/DailyWorkout.md",
};

const weeklyTask: RepeatingTask = {
    id: "task-002",
    name: "Еженедельная уборка",
    description: "Пропылесосить квартиру",
    startTime: new Date(now), // Начало сегодня
    duration: { days: 0, hours: 2, minutes: 30, seconds: 0 },
    overdueThresholds: { green: 1440, yellow: 2880, red: 4320 },
    filePath: "Tasks/WeeklyCleanup.md",
};

const oneTimeTask: RepeatingTask = {
    id: "task-003",
    name: "Подготовить отчет",
    description: "Составить отчет за месяц",
    startTime: new Date(now), // Начало сегодня
    duration: { days: 1, hours: 0, minutes: 0, seconds: 0 },
    overdueThresholds: { green: 720, yellow: 1440, red: 2160 },
};

// Массив экземпляров задач
export const taskInstances: TaskInstance[] = [
    // Экземпляры для dailyTask
    {
        id: "instance-001-1",
        task: dailyTask,
        activePeriod: {
            start: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 часа назад
            end: getEndDate(new Date(now.getTime() - 2 * 60 * 60 * 1000), dailyTask.duration), // 1 час назад
        },
        status: "done", // Выполнено, просрочка: yellow (120 мин > 60 мин)
    },
    {
        id: "instance-001-2",
        task: dailyTask,
        activePeriod: {
            start: new Date(now), // Сейчас
            end: getEndDate(new Date(now), dailyTask.duration), // Через 1 час
        },
        status: "pending", // В процессе, просрочка: green (0 мин)
    },
    {
        id: "instance-001-3",
        task: dailyTask,
        activePeriod: {
            start: new Date(now.getTime() - 4 * 60 * 60 * 1000), // 4 часа назад
            end: getEndDate(new Date(now.getTime() - 4 * 60 * 60 * 1000), dailyTask.duration), // 3 часа назад
        },
        status: "skipped", // Пропущено, просрочка: red (180 мин > 120 мин)
    },

    // Экземпляры для weeklyTask
    {
        id: "instance-002-1",
        task: weeklyTask,
        activePeriod: {
            start: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 дня назад
            end: getEndDate(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), weeklyTask.duration), // 2 дня назад + 2.5 часа
        },
        status: "pending", // В процессе, просрочка: yellow (2880 мин > 1440 мин)
    },
    {
        id: "instance-002-2",
        task: weeklyTask,
        activePeriod: {
            start: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 дней назад
            end: getEndDate(new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), weeklyTask.duration), // 5 дней назад + 2.5 часа
        },
        status: "canceled", // Отменено, просрочка: red (7200 мин > 4320 мин)
    },

    // Экземпляр для oneTimeTask
    {
        id: "instance-003-1",
        task: oneTimeTask,
        activePeriod: {
            start: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 дня назад
            end: getEndDate(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), oneTimeTask.duration), // 1 день назад
        },
        status: "pending", // В процессе, просрочка: red (2880 мин > 2160 мин)
    },
    {
        id: "instance-003-2",
        task: oneTimeTask,
        activePeriod: {
            start: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // Завтра
            end: getEndDate(new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), oneTimeTask.duration), // Послезавтра
        },
        status: "pending", // В будущем, просрочка: green (отрицательное время)
    },
];